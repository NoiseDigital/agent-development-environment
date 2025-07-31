# Copyright 2025 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import os
import json
import asyncio
import base64
import warnings

from pathlib import Path
from dotenv import load_dotenv

from google.genai.types import (
    Part,
    Content,
    Blob,
    AudioTranscriptionConfig,
    
)

from google.adk.runners import InMemoryRunner, Runner
from google.adk.agents import LiveRequestQueue
from google.adk.agents.run_config import RunConfig
from google.adk.sessions import DatabaseSessionService

from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from google_search_agent.agent import root_agent

warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")

# Database Set Up

db_name = "test_sessions"
db_url = f"sqlite:///./{db_name}.db"

APP_NAME = "ADK Streaming example"

load_dotenv()

try:
    session_service = DatabaseSessionService(db_url=db_url)
    print(f"DEBUG: Python SQLiteSessionService initialized. Database is {db_url}")
except Exception as e:
    print(f"Error initializing Python SQLiteSessionService: {e}")

#
# ADK Streaming
#

async def get_or_create_session(user_id, session_id):
    """Gets a session if it exists or creates a new one"""
    existing_sessions = await session_service.list_sessions(
        app_name=APP_NAME,
        user_id=user_id,
    )
    
    print(f"DEBUG: Existing Sessions: {existing_sessions}")
    print(f"DEBUG: Current Session ID: {session_id}")
    print(f"DEBUG: All session IDs: {[session.id for session in existing_sessions.sessions]}")
    
    if not existing_sessions or session_id is None or session_id not in [session.id for session in existing_sessions.sessions]:
        print(f"DEBUG: session id - {session_id} - not found!")
        new_session = await session_service.create_session(
            app_name=APP_NAME,
            user_id=user_id
        )
        session = new_session
        print(f"DEBUG: Set new session id: {session_id}")
    else:
        session = await session_service.get_session(
            app_name=APP_NAME,
            user_id=user_id,
            session_id=session_id
        )
    return session
               

async def start_agent_session(user_id, session_id, is_audio=False):
    """Starts an agent session"""
    
    runner = Runner(
        app_name = APP_NAME,
        agent=root_agent,
        session_service=session_service
    )

    # Create a Session
    
    session = await get_or_create_session(user_id, session_id)

    # Set response modality
    modality = "AUDIO" if is_audio else "TEXT"
    run_config = RunConfig(
        response_modalities=[modality], 
        input_audio_transcription=AudioTranscriptionConfig(), 
        output_audio_transcription=AudioTranscriptionConfig()
    )

    # Create a LiveRequestQueue for this session
    live_request_queue = LiveRequestQueue()

    # Start agent session
    live_events = runner.run_live(
        session=session,
        live_request_queue=live_request_queue,
        run_config=run_config,
    )    
    
    ## TODO: Remove when AUDIO history bug is fixed
    if is_audio:
        print(f"DEBUG: Priming session {session.id} for audio mode.")
        # This message is not displayed to the user but primes the agent.
        prime_content = Content(role="user", parts=[Part.from_text(text="Hello! Let's continue!")])
        live_request_queue.send_content(content=prime_content)
    ## END TODO
        
    return live_events, live_request_queue, session


async def agent_to_client_messaging(websocket, live_events):
    """Agent to client communication"""
    while True:
        async for event in live_events:

            # If the turn complete or interrupted, send it
            if event.turn_complete or event.interrupted:
                message = {
                    "turn_complete": event.turn_complete,
                    "interrupted": event.interrupted,
                }
                await websocket.send_text(json.dumps(message))
                print(f"[AGENT TO CLIENT]: {message}")
                continue

            # Read the Content and its first Part
            part: Part = (
                event.content and event.content.parts and event.content.parts[0]
            )
            if not part:
                continue

            # If it's audio, send Base64 encoded audio data
            is_audio = part.inline_data and part.inline_data.mime_type.startswith("audio/pcm")
            if is_audio:
                audio_data = part.inline_data and part.inline_data.data
                if audio_data:
                    message = {
                        "mime_type": "audio/pcm",
                        "data": base64.b64encode(audio_data).decode("ascii")
                    }
                    await websocket.send_text(json.dumps(message))
                    print(f"[AGENT TO CLIENT]: audio/pcm: {len(audio_data)} bytes.")
                    continue

            # If it's text and a partial text, send it
            if part.text and event.partial:
                message = {
                    "mime_type": "text/plain",
                    "data": part.text
                }
                await websocket.send_text(json.dumps(message))
                print(f"[AGENT TO CLIENT]: text/plain: {message}")


async def client_to_agent_messaging(websocket, live_request_queue):
    """Client to agent communication"""
    while True:
        # Decode JSON message
        message_json = await websocket.receive_text()
        message = json.loads(message_json)
        mime_type = message["mime_type"]
        data = message["data"]

        # Send the message to the agent
        if mime_type == "text/plain":
            # Send a text message
            content = Content(role="user", parts=[Part.from_text(text=data)])
            live_request_queue.send_content(content=content)
            print(f"[CLIENT TO AGENT]: {data}")
        elif mime_type == "audio/pcm":
            # Send an audio data
            decoded_data = base64.b64decode(data)
            live_request_queue.send_realtime(Blob(data=decoded_data, mime_type=mime_type))
        else:
            raise ValueError(f"Mime type not supported: {mime_type}")


#
# FastAPI web app
#

app = FastAPI()

STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def root():
    """Serves the index.html"""
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: int,
    is_audio: str,
    session_id: str | None = None
):
    """Client websocket endpoint with robust cleanup logic."""
    await websocket.accept()
    user_id_str = str(user_id)
    print(
        f"Client #{user_id_str} connected, audio mode: {is_audio}, "
        f"requested session_id: {session_id}"
    )

    # Start agent session and get all necessary objects
    live_events, live_request_queue, session = await start_agent_session(
        user_id_str, session_id, is_audio == "true"
    )

    # Immediately send the session_id to the client so it can save it
    session_created_message = {"type": "session_created", "session_id": session.id}
    await websocket.send_text(json.dumps(session_created_message))
    print(f"Sent session confirmation to client: {session.id}")

    # Create the background tasks for communication
    agent_to_client_task = asyncio.create_task(
        agent_to_client_messaging(websocket, live_events)
    )
    client_to_agent_task = asyncio.create_task(
        client_to_agent_messaging(websocket, live_request_queue)
    )
    tasks = [agent_to_client_task, client_to_agent_task]
    
    try:
        # Wait for either task to complete (e.g., on disconnect) or fail
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    finally:
        # --- This is the critical cleanup block ---
        print(f"Cleaning up resources for session {session.id}...")

        live_request_queue.close()

        for task in tasks:
            task.cancel()

        # 3. Wait for the tasks to acknowledge the cancellation.
        await asyncio.gather(*tasks, return_exceptions=True)

        print(f"Client #{user_id_str} disconnected and resources cleaned up.")

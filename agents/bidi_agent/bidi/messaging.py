import time
import os
import base64
import json

from agent import root_agent
from dotenv import load_dotenv

from google.genai.types import (
    Part,
    Content,
    Blob,
)

from google.adk.runners import InMemoryRunner, Runner
from google.adk.agents import LiveRequestQueue
from google.adk.agents.run_config import RunConfig
from google.adk.artifacts import GcsArtifactService
from google.adk.sessions import VertexAiSessionService
#
# ADK Streaming
#

# Load Gemini API Key
load_dotenv()

APP_NAME = "projects/nd-agentspace-sbx/locations/us-central1/reasoningEngines/8348011247563702272"

gcs_bucket_name_py = "nd-agent-engine-artifacts-sbx"

try:
    gcs_service = GcsArtifactService(bucket_name=gcs_bucket_name_py)
    print(
        f"Python GcsArtifactService initialized for bucket: {gcs_bucket_name_py}")
except Exception as e:
    print(f"Error initializing Python GcsArtifactService: {e}")

try:
    vertex_ai_session_service = VertexAiSessionService(project=os.environ["GOOGLE_CLOUD_PROJECT"],
                                                       location=os.environ["GOOGLE_CLOUD_LOCATION"],
                                                       agent_engine_id="8348011247563702272")
    print(f"Python VertexAiSessionService initialized.")
except Exception as e:
    print(f"Error initializing Python VertexAiSessionService: {e}")


def now():
    return time.time()

async def start_agent_session(user_id, is_audio=False):
    """Starts an agent session"""

    print(f"[DEBUG] Creating Runner at {now()}")
    # runner = InMemoryRunner(
    #     app_name=APP_NAME,
    #     agent=root_agent,
    # )
    runner = Runner(
        app_name=APP_NAME,
        agent=root_agent,
        artifact_service=gcs_service,
        session_service=vertex_ai_session_service
    )
    print(f"[DEBUG] Runner created at {now()}")

    print(f"[DEBUG] Creating session at {now()}")
    session = await runner.session_service.create_session(
        app_name=APP_NAME,
        user_id=user_id,
    )
    print(f"[DEBUG] Session created at {now()}")

    # Set response modality
    modality = "AUDIO" if is_audio else "TEXT"
    run_config = RunConfig(response_modalities=[modality])

    # Create a LiveRequestQueue for this session
    live_request_queue = LiveRequestQueue()

    print(f"[DEBUG] Starting run_live at {now()}")
    live_events = runner.run_live(
        session=session,
        live_request_queue=live_request_queue,
        run_config=run_config,
    )
    print(f"[DEBUG] run_live started at {now()}")
    return live_events, live_request_queue


async def agent_to_client_messaging(websocket, live_events):
    """Agent to client communication"""
    try:
        while True:
            async for event in live_events:
                t0 = now()
                print(f"[DEBUG] Received event at {t0}")
                # If the turn complete or interrupted, send it
                if event.turn_complete or event.interrupted:
                    message = {
                        "turn_complete": event.turn_complete,
                        "interrupted": event.interrupted,
                    }
                    await websocket.send_text(json.dumps(message))
                    print(f"[AGENT TO CLIENT]: {message}")
                    print(f"[DEBUG] Sent event to client at {now()} (turn_complete/interrupted)")
                    continue

                # Read the Content and its first Part
                part: Part = (
                    event.content and event.content.parts and event.content.parts[0]
                )
                if not part:
                    continue

                # If it's audio, send Base64 encoded audio data
                is_audio = part.inline_data and part.inline_data.mime_type.startswith(
                    "audio/pcm")
                if is_audio:
                    audio_data = part.inline_data and part.inline_data.data
                    if audio_data:
                        message = {
                            "mime_type": "audio/pcm",
                            "data": base64.b64encode(audio_data).decode("ascii")
                        }
                        await websocket.send_text(json.dumps(message))
                        print(f"[AGENT TO CLIENT]: audio/pcm: {len(audio_data)} bytes.")
                        print(f"[DEBUG] Sent event to client at {now()} (audio)")
                        continue

                # If it's text and a parial text, send it
                if part.text and event.partial:
                    message = {
                        "mime_type": "text/plain",
                        "data": part.text
                    }
                    await websocket.send_text(json.dumps(message))
                    print(f"[AGENT TO CLIENT]: text/plain: {message}")
                    print(f"[DEBUG] Sent event to client at {now()} (text)")
    except Exception as e:
        print(f"Exception in agent_to_client_messaging: {e}")


async def client_to_agent_messaging(websocket, live_request_queue):
    """Client to agent communication"""
    try:
        while True:
            print(f"[DEBUG] Waiting for client message at {now()}")
            message_json = await websocket.receive_text()
            print(f"[DEBUG] Received client message at {now()}")
            message = json.loads(message_json)
            mime_type = message["mime_type"]
            data = message["data"]

            # Send the message to the agent
            if mime_type == "text/plain":
                # Send a text message
                content = Content(role="user", parts=[Part.from_text(text=data)])
                live_request_queue.send_content(content=content)
                print(f"[CLIENT TO AGENT]: {data}")
                print(f"[DEBUG] Sent client text to agent at {now()}")
            elif mime_type == "audio/pcm":
                # Send an audio data
                decoded_data = base64.b64decode(data)
                live_request_queue.send_realtime(
                    Blob(data=decoded_data, mime_type=mime_type))
                print(f"[DEBUG] Sent client audio to agent at {now()}")
            else:
                raise ValueError(f"Mime type not supported: {mime_type}")
    except Exception as e:
        print(f"Exception in client_to_agent_messaging: {e}")

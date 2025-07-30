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
import asyncio
import warnings


from pathlib import Path


from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from bidi.messaging import (
    start_agent_session,
    agent_to_client_messaging,
    client_to_agent_messaging,
)

warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")
#
# FastAPI web app
#

app = FastAPI()

# Use absolute path for static directory for Cloud Run compatibility
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def root():
    """Serves the index.html"""
    return FileResponse(STATIC_DIR / "index.html")


@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str, is_audio: str = "false"):
    """Client websocket endpoint"""
    await websocket.accept()
    print(f"Client #{user_id} connected, audio mode: {is_audio}")
    
    user_id_str = str(user_id)
    live_events, live_request_queue = await start_agent_session(user_id_str, is_audio == "true")
    
    agent_to_client_task = asyncio.create_task(
        agent_to_client_messaging(websocket, live_events)
    )
    client_to_agent_task = asyncio.create_task(
        client_to_agent_messaging(websocket, live_request_queue)
    )
    
    tasks = [agent_to_client_task, client_to_agent_task]
    done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_EXCEPTION)
    for task in pending:
        task.cancel()
    live_request_queue.close()
    
    print(f"Client #{user_id} disconnected")

if __name__ == "__main__":
    import uvicorn
    host = os.environ.get("APP_HOST", "0.0.0.0")
    port = int(os.environ.get("APP_PORT", 8080))
    uvicorn.run("main:app", host=host, port=port, reload=False)

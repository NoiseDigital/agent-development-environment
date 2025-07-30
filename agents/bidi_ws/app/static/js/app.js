/**
* Copyright 2025 Google LLC
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

/**
 * app.js: JS code for the adk-streaming sample app.
 */

/**
 * WebSocket handling
 */

// Connect the server with a WebSocket connection
// Random user ID
let userId = localStorage.getItem("userId");
if (!userId) {
  userId = Math.random().toString().substring(10);
  localStorage.setItem("userId", userId);
}
// Retrive session id if it exists
let appSessionId = localStorage.getItem("appSessionId");

let websocket = null;
let is_audio = false;

// const ws_url =
//   "ws://" + window.location.host + "/ws/" + sessionId;

// Get DOM elements
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("message");
const messagesDiv = document.getElementById("messages");
let currentMessageId = null;

// WebSocket handlers
// function connectWebsocket() {
//   // Connect websocket

//   // Close any existing connection before creating a new one
//   if (websocket && websocket.readyState !== WebSocket.CLOSED) {
//     // Prevent the auto-reconnect handler from firing during a manual mode switch.
//     websocket.onclose = null;
//     websocket.close();
//   }

//   let url = `ws://${window.location.host}/ws/${userId}?is_audio=${is_audio}`;
//   if (appSessionId) {
//     url += `&session_id=${appSessionId}`
//   }

//   console.log("Connecting to:", url);
//   websocket = new WebSocket(url);

//   // Handle connection open
//   websocket.onopen = function () {
//     // Connection opened messages
//     console.log("WebSocket connection opened.");
//     document.getElementById("messages").textContent = "Connection opened";

//     // Enable the Send button
//     document.getElementById("sendButton").disabled = false;
//     addSubmitHandler();
//   };

//   // Handle incoming messages
//   websocket.onmessage = function (event) {
//     // Parse the incoming message
//     const message_from_server = JSON.parse(event.data);
//     console.log("[AGENT TO CLIENT] ", message_from_server);

//     // Handle the session confirmation message from the server.
//     if (message_from_server.type === "session_created") {
//       const newSessionId = message_from_server.session_id;
//       if (appSessionId !== newSessionId) {
//         console.log("Session ID updated by server:", newSessionId);
//         appSessionId = newSessionId;
//         localStorage.setItem("appSessionId", appSessionId);
//       }
//       return; // This is a control message, not for display.
//     }

//     // Check if the turn is complete
//     // if turn complete, add new message
//     if (
//       message_from_server.turn_complete &&
//       message_from_server.turn_complete == true
//     ) {
//       currentMessageId = null;
//       return;
//     }

//     // Check for interrupt message
//     if (
//       message_from_server.interrupted &&
//       message_from_server.interrupted === true
//     ) {
//       // Stop audio playback if it's playing
//       if (audioPlayerNode) {
//         audioPlayerNode.port.postMessage({ command: "endOfAudio" });
//       }
//       return;
//     }

//     // If it's audio, play it
//     if (message_from_server.mime_type == "audio/pcm" && audioPlayerNode) {
//       audioPlayerNode.port.postMessage(base64ToArray(message_from_server.data));
//     }

//     // If it's a text, print it
//     if (message_from_server.mime_type == "text/plain") {
//       // add a new message for a new turn
//       if (currentMessageId == null) {
//         currentMessageId = Math.random().toString(36).substring(7);
//         const message = document.createElement("p");
//         message.id = currentMessageId;
//         // Append the message element to the messagesDiv
//         messagesDiv.appendChild(message);
//       }

//       // Add message text to the existing message element
//       const message = document.getElementById(currentMessageId);
//       message.textContent += message_from_server.data;

//       // Scroll down to the bottom of the messagesDiv
//       messagesDiv.scrollTop = messagesDiv.scrollHeight;
//     }
//   };

//   // Handle connection close
//   websocket.onclose = function () {
//     console.log("WebSocket connection closed.");
//     document.getElementById("sendButton").disabled = true;
//     document.getElementById("messages").textContent = "Connection closed";
//     setTimeout(function () {
//       console.log("Reconnecting...");
//       connectWebsocket();
//     }, 5000);
//   };

//   websocket.onerror = function (e) {
//     console.log("WebSocket error: ", e);
//   };
// }
// connectWebsocket();

function connectWebsocket() {
  // This inner function contains all the logic for opening a new connection
  // and setting up its event handlers.
  const openSocket = () => {
    // Build the URL with the correct user ID, session ID, and audio mode.
    let url = `ws://${window.location.host}/ws/${userId}?is_audio=${is_audio}`;
    if (appSessionId) {
      url += `&session_id=${appSessionId}`;
    }
    console.log("Connecting to:", url);

    // Create the new WebSocket object
    websocket = new WebSocket(url);

    // This handler runs when the connection is successfully established.
    websocket.onopen = function () {
      console.log("WebSocket connection opened.");
      document.getElementById("messages").textContent = "Connection opened";
      document.getElementById("sendButton").disabled = false;
      addSubmitHandler();
    };

    // This handler runs for every message received from the server.
    websocket.onmessage = function (event) {
      const message_from_server = JSON.parse(event.data);
      console.log("[AGENT TO CLIENT] ", message_from_server);

      // Handle the session confirmation message from the server.
      if (message_from_server.type === "session_created") {
        const newSessionId = message_from_server.session_id;
        if (appSessionId !== newSessionId) {
          console.log("Session ID updated by server:", newSessionId);
          appSessionId = newSessionId;
          localStorage.setItem("appSessionId", appSessionId);
        }
        return; // This is a control message, not for display.
      }

      // --- Rest of the message handling logic ---
      if (
        message_from_server.turn_complete &&
        message_from_server.turn_complete === true
      ) {
        currentMessageId = null;
        return;
      }
      if (
        message_from_server.interrupted &&
        message_from_server.interrupted === true
      ) {
        if (audioPlayerNode) {
          audioPlayerNode.port.postMessage({ command: "endOfAudio" });
        }
        return;
      }
      if (message_from_server.mime_type == "audio/pcm" && audioPlayerNode) {
        audioPlayerNode.port.postMessage(
          base64ToArray(message_from_server.data)
        );
      }
      if (message_from_server.mime_type == "text/plain") {
        if (currentMessageId == null) {
          currentMessageId = Math.random().toString(36).substring(7);
          const message = document.createElement("p");
          message.id = currentMessageId;
          messagesDiv.appendChild(message);
        }
        const message = document.getElementById(currentMessageId);
        message.textContent += message_from_server.data;
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }
    };

    // This handler is for UNEXPECTED disconnections.
    websocket.onclose = function () {
      console.log("WebSocket connection closed unexpectedly. Reconnecting in 5s...");
      document.getElementById("sendButton").disabled = true;
      document.getElementById("messages").textContent = "Connection closed";
      setTimeout(connectWebsocket, 5000);
    };

    // This handler runs if there's a connection error.
    websocket.onerror = function (e) {
      console.log("WebSocket error: ", e);
    };
  };

  // --- Main Logic ---
  // This is the entry point for connecting or reconnecting.
  // First, check if a connection already exists and needs to be closed.
  // if (websocket && websocket.readyState !== WebSocket.CLOSED) {
  //   // A connection exists. We need to close it before opening a new one.
  //   // We temporarily override its onclose handler. This onclose is for a PLANNED reconnection.
  //   websocket.onclose = () => {
  //     console.log("Old connection closed deliberately.");
  //     openSocket(); // Open the new socket only AFTER the old one has closed.
  //   };
  //   websocket.close();
  // } else {
  //   // No connection exists, so just open a new one. This runs on initial page load.
  //   openSocket();
  // }

  if (websocket && websocket.readyState !== WebSocket.CLOSED) {
    console.log("Closing old connection...");
    // We don't want any of the old handlers firing, especially onclose.
    websocket.onclose = null;
    websocket.close();

    // Artificially wait for 100 milliseconds before opening the new socket.
    setTimeout(() => {
      console.log("Waited 100ms, now trying to open the new socket.");
      openSocket();
    }, 100);
  } else {
    // If no connection exists, open one directly.
    openSocket();
  }
}

// Call the function once on initial page load.
connectWebsocket();

// Add submit handler to the form
function addSubmitHandler() {
  messageForm.onsubmit = function (e) {
    e.preventDefault();
    const message = messageInput.value;
    if (message) {
      const p = document.createElement("p");
      p.textContent = "> " + message;
      messagesDiv.appendChild(p);
      messageInput.value = "";
      sendMessage({
        mime_type: "text/plain",
        data: message,
      });
      console.log("[CLIENT TO AGENT] " + message);
    }
    return false;
  };
}

// Send a message to the server as a JSON string
function sendMessage(message) {
  if (websocket && websocket.readyState == WebSocket.OPEN) {
    const messageJson = JSON.stringify(message);
    websocket.send(messageJson);
  }
}

// Decode Base64 data to Array
function base64ToArray(base64) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Audio handling
 */

let audioPlayerNode;
let audioPlayerContext;
let audioRecorderNode;
let audioRecorderContext;
let micStream;

// Audio buffering for 0.2s intervals
let audioBuffer = [];
let bufferTimer = null;

// Import the audio worklets
import { startAudioPlayerWorklet } from "./audio-player.js";
import { startAudioRecorderWorklet } from "./audio-recorder.js";

// Start audio
// function startAudio() {
//   // Start audio output
//   startAudioPlayerWorklet().then(([node, ctx]) => {
//     audioPlayerNode = node;
//     audioPlayerContext = ctx;
//   });
//   // Start audio input
//   startAudioRecorderWorklet(audioRecorderHandler).then(
//     ([node, ctx, stream]) => {
//       audioRecorderNode = node;
//       audioRecorderContext = ctx;
//       micStream = stream;
//     }
//   );
// }

async function startAudio() {
  // Use Promise.all to wait for both async operations to complete
  await Promise.all([
    startAudioPlayerWorklet().then(([node, ctx]) => {
      audioPlayerNode = node;
      audioPlayerContext = ctx;
    }),
    startAudioRecorderWorklet(audioRecorderHandler).then(
      ([node, ctx, stream]) => {
        audioRecorderNode = node;
        audioRecorderContext = ctx;
        micStream = stream;
      }
    ),
  ]);
}

// Start the audio only when the user clicked the button
// (due to the gesture requirement for the Web Audio API)
const startAudioButton = document.getElementById("startAudioButton");
startAudioButton.addEventListener("click", async () => {
  startAudioButton.disabled = true;
  await startAudio();
  is_audio = true;
  connectWebsocket(); // reconnect with the audio mode
});

// Audio recorder handler
function audioRecorderHandler(pcmData) {
  // Add audio data to buffer
  audioBuffer.push(new Uint8Array(pcmData));
  
  // Start timer if not already running
  if (!bufferTimer) {
    bufferTimer = setInterval(sendBufferedAudio, 200); // 0.2 seconds
  }
}

// Send buffered audio data every 0.2 seconds
function sendBufferedAudio() {
  if (audioBuffer.length === 0) {
    return;
  }
  
  // Calculate total length
  let totalLength = 0;
  for (const chunk of audioBuffer) {
    totalLength += chunk.length;
  }
  
  // Combine all chunks into a single buffer
  const combinedBuffer = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of audioBuffer) {
    combinedBuffer.set(chunk, offset);
    offset += chunk.length;
  }
  
  // Send the combined audio data
  sendMessage({
    mime_type: "audio/pcm",
    data: arrayBufferToBase64(combinedBuffer.buffer),
  });
  console.log("[CLIENT TO AGENT] sent %s bytes", combinedBuffer.byteLength);
  
  // Clear the buffer
  audioBuffer = [];
}

// Stop audio recording and cleanup
function stopAudioRecording() {
  if (bufferTimer) {
    clearInterval(bufferTimer);
    bufferTimer = null;
  }
  
  // Send any remaining buffered audio
  if (audioBuffer.length > 0) {
    sendBufferedAudio();
  }
}

// Encode an array buffer with Base64
function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}
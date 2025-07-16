#!/bin/bash

# This script sends a JSON-RPC request to the Media Performance Agent server.

# Default server details
HOST="localhost"
PORT="8080"
SERVER_URL="http://${HOST}:${PORT}/"

# Default query message
QUERY_TEXT="How is overall campaign performance?"

# You can optionally pass the query text as an argument
if [ -n "$1" ]; then
    QUERY_TEXT="$1"
fi

# Generate a simple unique ID for the message
# In a real application, you might use a more robust UUID generation
MESSAGE_ID="msg-$(date +%s%N)" # Uses current timestamp + nanoseconds for uniqueness

echo "Sending query to ${SERVER_URL}..."
echo "Query: '${QUERY_TEXT}'"
echo "Message ID: '${MESSAGE_ID}'"
echo ""

# The cURL command with the JSON-RPC payload
curl -X POST \
     -H "Content-Type: application/json" \
     -d @- "${SERVER_URL}" <<EOF
{
  "jsonrpc": "2.0",
  "method": "message/stream",
  "params": {
    "message": {
      "messageId": "${MESSAGE_ID}",
      "role": "user",
      "parts": [
        {
          "text": "${QUERY_TEXT}"
        }
      ]
    }
  },
  "id": 1
}
EOF

echo ""
echo "Request sent. Check server logs for response."
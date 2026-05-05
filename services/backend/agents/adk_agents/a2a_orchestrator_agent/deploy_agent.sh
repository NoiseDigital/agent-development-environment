#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

echo "--- Deploying agent-a2a-orchestrator to Google Cloud Run ---"
echo "Source: Current directory"
echo "Region: us-central1"
echo "Authentication: Unauthenticated access allowed"
echo "Internal Port: 8080"
echo ""

# The deployment command you provided
gcloud run deploy agent-a2a-orchestrator \
  --source . \
  --region=us-central1 \
  --allow-unauthenticated \
  --port=8080

echo ""
echo "Deployment initiated. Please check your Google Cloud console for status."
echo "IMPORTANT: The AgentCard 'url' in your Python code MUST be updated manually"
echo "           to the actual public Cloud Run URL for inter-agent communication."
echo "           (e.g., https://agent-a2a-orchestrator-HASH.us-central1.run.app/)"
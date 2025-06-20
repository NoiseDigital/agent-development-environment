# Working on Agents?

Work directly in the agents/ directory. 

- run `command_placeholder` to generate a new agent subdirectory within agents/
- Use helpful ADK cli tools like `adk server` and `adk web agents/` for a live testing environment of your Agent functionality
- Run the deploy.py script in your agents directory to push the agent to Agent Engine
    - Note the Resource ID of your Agent Engine instance, and add it to your utils/constants.py file for when you want to update a deployed Agent Engine instance. 

Your Agent is now built and deployed to a cloud environment, where the runtime is fully managed. The Agent can always be tested locally, but is now accessible to remote endpoints, meaning it is much easier to build into a web application. 


# Adding Agent to Agentspace?

Agentspace supports hosting deployed Agent Engine instances. Once an Agent is deployed to Agent Engine, the following commands can manage Agentspace integration.


- Add Agent Engine Agent to Agentspace
```curl
curl -X POST \
-H "Authorization: Bearer $(gcloud auth print-access-token)" \
-H "Content-Type: application/json" \
-H "X-Goog-User-Project: {GOOGLE_CLOUD_PROJECT}" \
"https://discoveryengine.googleapis.com/v1alpha/projects/{GOOGLE_CLOUD_PROJECT}/locations/{AGENTSPACE_APP_LOCATION}/collections/default_collection/engines/{AGENTSPACE_APP_ID}/assistants/default_assistant/agents" \
-d '{
"displayName": "Timesheet Agent",
"description": "Agent to help users populate and submit their timesheets.",
"icon": {
"uri": "PUBLIC_URI"
},
"adk_agent_definition": {
"tool_settings": {
"tool_description": "Agent to help users populate and submit their timesheets by sourcing active work from Asana and Outlook, and submitting it to Intacct."
},
"provisioned_reasoning_engine": {
"reasoning_engine":
"projects/{GOOGLE_CLOUD_PROJECT}/locations/{AGENT_ENGINE_LOCATION}/reasoningEngines/{AGENT_ENGINE_ID}
"
},
}
}'
```

- Get Agents in Agentspace
```curl
curl -X GET -H "Authorization: Bearer $(gcloud auth print-access-token)" \
-H "Content-Type: application/json" \
-H "X-Goog-User-Project: {GOOGLE_CLOUD_PROJECT}" \
"https://discoveryengine.googleapis.com/v1alpha/projects/{GOOGLE_CLOUD_PROJECT}/locations/{AGENTSPACE_APP_LOCATION}/collections/default_collection/engines/{AGENTSPACE_APP_ID}/assistants/default_assistant/agents"
```

- Update Agent in Agentspace
```curl
curl -X PATCH \
-H "Authorization: Bearer $(gcloud auth print-access-token)" \
-H "Content-Type: application/json" \
-H "X-Goog-User-Project: {GOOGLE_CLOUD_PROJECT}" \
"https://discoveryengine.googleapis.com/v1alpha/projects/{GOOGLE_CLOUD_PROJECT}/locations/{AGENTSPACE_APP_LOCATION}/collections/default_collection/engines/{AGENTSPACE_APP_ID}/assistants/default_assistant/agents/{AGENTSPACE_AGENT_ID}" \
-d '{
"displayName": "DISPLAY NAME",
"description": "DISPLAY DESCRIPTION",
"icon": {
"uri": "PUBLIC_URI"
},
"adk_agent_definition": {
"tool_settings": {
"tool_description": "DESCRIPTION OF AGENT GOALS, USED FOR GENERATING INTRO IN CHAT SESSION"
},
"provisioned_reasoning_engine": {
"reasoning_engine":
"projects/{GOOGLE_CLOUD_PROJECT}/locations/{AGENT_ENGINE_LOCATION}/reasoningEngines/{AGENT_ENGINE_ID}"
}
}
}'
```

- Delete Agent in Agentspace
```curl
curl -X DELETE \
-H "Authorization: Bearer $(gcloud auth print-access-token)" \
-H "Content-Type: application/json" \
-H "X-Goog-User-Project: {GOOGLE_CLOUD_PROJECT}" \
"https://discoveryengine.googleapis.com/v1alpha/projects/{GOOGLE_CLOUD_PROJECT}/locations/{AGENTSPACE_APP_LOCATION}/collections/default_collection/engines/{AGENTSPACE_APP_ID}/assistants/default_assistant/agents/{AGENTSPACE_AGENT_ID}"
```

# Working on Web App? 

## Local Server

- Run `uvicorn main:app` to start up a local server for FastAPI
- Go to http://127.0.0.1:8000/docs to test API via swagger

## Cloud Run Deployment

- Cloud Build triggers are setup to deploy when main/ has changes on remote
- Redeploy image with gcloud builds submit --tag us-central1-docker.pkg.dev/{GOOGLE_CLOUD_PROJECT}/fastapi-repo/agent-engine-service:latest .
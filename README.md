# Working on Agents?

Work directly in the agents/ directory. 

- Use helpful ADK cli tools like `adk server` and `adk web agents/` for a live testing environment of your Agent functionality

## Deployment
### Deploying to Agent Engine
- Run the deploy.py script in your agents directory to push the agent to Agent Engine
    - Note the Resource ID of your Agent Engine instance, and add it to your utils/constants.py file for when you want to update a deployed Agent Engine instance. 
- Your Agent is now built and deployed to a cloud environment, where the runtime is fully managed. The Agent can always be tested locally, but is now accessible to remote endpoints, meaning it is much easier to build into a web application.

### Deploying to Cloud Run [from source]
#### ADK
There is a streamlined ADK command for deploying an agent to cloud run. While it is fast, it is not flexible.

An example of this can be found in the `math_agent`.

- Run the following command from your agent's directory to deploy your agent to a Cloud Run instance. Some pro's to this are that the ADK Web UI are accessible through the Cloud Run URL. As well, there is more flexibilty in orchestrating containers. 
```curl
adk deploy cloud_run \
    --project=$GOOGLE_CLOUD_PROJECT \
    --region=$GOOGLE_CLOUD_LOCATION \
    --service_name=$SERVICE_NAME \
    --app_name=$APP_NAME \
    --with_ui \
    $AGENT_PATH
```
#### gcloud
More setup is required, but for more flexibility, opt for gcloud to deploy an Agent.
An example of this can be found in the `media_performance_agent`, where the agent uses an unpickleable method to access the MCP Toolbox. It cannot be deployed through the adk command as no extra packages can be defined. 

For deploying one cloud run service for one agent
```curl
agents/
├── agent_1_name/
├────── agent_1_name/    # Directory for agent code
│       ├── __init__.py
│       └── agent.py    
├────── main.py            # FastAPI application entry point
├────── requirements.txt   # Python dependencies
└────── Dockerfile         # Container build instructions
```

For deploying one cloud run service for multiple agents (not recommended)
```curl
agents/
├── agent_1_name/
│   ├── __init__.py
│   └── agent.py
├── agent_2_name/
│   ├── __init__.py
│   └── agent.py    
├── main.py            # FastAPI application entry point
├── requirements.txt   # Python dependencies
└── Dockerfile         # Container build instructions
```


### Integrating Agent to Agentspace?

Agentspace supports hosting deployed Agent Engine instances. Once an Agent is deployed to Agent Engine, the following commands can manage Agentspace integration.

Example for Timesheet Agent:

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
                "projects/{GOOGLE_CLOUD_PROJECT}/locations/{AGENT_ENGINE_LOCATION}/reasoningEngines/{AGENT_ENGINE_ID}"
                },
            }
        }'
```

- List Agents in Agentspace
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
--------------------

# Working on Tools? 
## MCP Servers
### Guide: Build and Deploy a Remote MCP Server to Google Cloud Run in Under 10 Minutes
- https://cloud.google.com/blog/topics/developers-practitioners/build-and-deploy-a-remote-mcp-server-to-google-cloud-run-in-under-10-minutes

### Run MCP Server Locally
- Navigate to tool folder, run server
- Point Agent's MCPToolset URL to local address
```python
from google.adk.agents.llm_agent import LlmAgent
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset
from google.adk.tools.mcp_tool.mcp_session_manager import SseConnectionParams

# Local URL (after running cd tools/mcp-on-cloudrun python server.py)
MCP_SERVER_URL = "http://0.0.0.0:8080/sse"

# NOTE: Must set errlog=None to deploy to Agent Engine
tools = MCPToolset(
    connection_params=SseConnectionParams(
        url=MCP_SERVER_URL
    ),
    errlog=None
)

root_agent = LlmAgent(
    model='gemini-2.0-flash',
    name='math_agent',
    instruction="""
        You do math with tools
      """,
    tools=[tools],
)
```

### Deploy MCP Server to Cloud Run [from source]
```curl
cd tools/mcp/$TOOL_NAME && gcloud run deploy mcp-$TOOL_NAME --no-allow-unauthenticated --region=$REGION --source .
```

### Use MCP Server Tool in ADK Agent
```python
from google.adk.agents.llm_agent import LlmAgent
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset
from google.adk.tools.mcp_tool.mcp_session_manager import SseConnectionParams

# Remote URL (deployed Cloud Run MCP Toolbox)
MCP_SERVER_URL = "https://{CLOUD_RUN_URL}.us-central1.run.app/sse"

# NOTE: Must set errlog=None to deploy to Agent Engine
tools = MCPToolset(
    connection_params=SseConnectionParams(
        url=MCP_SERVER_URL
    ),
    errlog=None
)

root_agent = LlmAgent(
    model='gemini-2.0-flash',
    name='math_agent',
    instruction="""
        You do math with tools
      """,
    tools=[tools],
)
```

## MCP Toolbox
### Guide: Deploy MCP Toolbox to Cloud Run
https://googleapis.github.io/genai-toolbox/how-to/deploy_toolbox/

### Run MCP Toolbox Server locally
- `cd tools/mcp/mcp-toolbox && ./toolbox --tools-file "tools.yaml" --port 8080`
NOTE: Cannot deploy agent to Agent Engine with toolbox-core library as MCP handler (pickling issue)

### Deploy MCP Toolbox to Cloud Run [container image]
- cd to tools/mcp-toolbox
- Update deployed tools secret: `gcloud secrets versions add tools --data-file=tools.yaml`
- Add image to env variable: `export IMAGE=us-central1-docker.pkg.dev/database-toolbox/toolbox/toolbox:latest`
- Redeploy Cloud Run service: 
```curl
gcloud run deploy mcp-toolbox \
    --image $IMAGE \
    --service-account toolbox-identity \
    --region us-central1 \
    --set-secrets "/app/tools.yaml=tools:latest" \
    --args="--tools-file=/app/tools.yaml","--address=0.0.0.0","--port=8080"
```

### Use MCP Toolbox Tool in ADK Agent
```python
from google.adk.agents import Agent
from toolbox_core import ToolboxSyncClient

# Remote URL (deployed Cloud Run MCP Toolbox)
TOOLBOX_ENDPOINT = "https://{CLOUD_RUN_URL}.us-central1.run.app"

toolbox = ToolboxSyncClient(TOOLBOX_ENDPOINT)
tools = toolbox.load_toolset(TOOLSET_NAME_IN_YAML)

root_agent = Agent(
    name="mcp_toolbox_agent",
    model="gemini-2.0-flash",
    description="Agent that uses MCP Toolbox tools.",
    instruction="You are a helpful agent who uses tools.",
    tools=tools,
)
```
--------------------

# Working on Web App?
This repo contains a FastAPI app to list and query all Agent Engine instances.

## Local Server

- Run `uvicorn main:app` to start up a local server for FastAPI
- Go to `http://127.0.0.1:8000/docs` to test API via swagger

## Cloud Run Deployment

- Cloud Build triggers are setup to deploy when main/ has changes on remote
- Redeploy image with gcloud builds submit --tag us-central1-docker.pkg.dev/{GOOGLE_CLOUD_PROJECT}/fastapi-repo/agent-engine-service:latest .
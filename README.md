# Working on Agents?

Work directly in the agents/ directory. 

- run `command_placeholder` to generate a new agent subdirectory within agents/
- Use helpful ADK cli tools like `adk server` and `adk web agents/` for a live testing environment of your Agent functionality
- Run the deploy.py script in your agents directory to push the agent to Agent Engine
    - Note the Resource ID of your Agent Engine instance, and add it to your utils/constants.py file for when you want to update a deployed Agent Engine instance. 

Your Agent is now built and deployed to a cloud environment, where the runtime is fully managed. The Agent can always be tested locally, but is now accessible to remote endpoints, meaning it is much easier to build into a web application. 


# Working on Web App? 

## Local Server

- Run `uvicorn main:app` to start up a local server for FastAPI
- Go to http://127.0.0.1:8000/docs to test API via swagger

## Cloud Run Deployment

- Cloud Build triggers are setup to deploy when main/ has changes on remote
- Redeploy image with gcloud builds submit --tag us-central1-docker.pkg.dev/nd-agentspace-sbx/fastapi-repo/agent-engine-service:latest .
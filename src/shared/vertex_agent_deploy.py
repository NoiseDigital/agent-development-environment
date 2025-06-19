from vertexai.preview.reasoning_engines import AdkApp

def deploy_or_update_agent(
    root_agent,
    requirements,
    display_name,
    description,
    gcs_dir_name,
    extra_packages,
    env_vars,
    resource_engine_id,
    project_id,
    location,
    staging_bucket,
):
    import vertexai
    from vertexai import agent_engines

    vertexai.init(
        project=project_id,
        location=location,
        staging_bucket=staging_bucket,
    )

    action = input(
        "Type 'deploy' to deploy a new agent or 'update' to update an existing agent: "
    ).strip().lower()
    if action not in ("deploy", "update"):
        print("Invalid action. Exiting.")
        return

    if action == "deploy":
        print("Deploying agent to Vertex AI Agent Engine...")
        app = AdkApp(agent=root_agent, enable_tracing=True)
        remote_agent = agent_engines.create(
            agent_engine=app,
            requirements=requirements,
            display_name=display_name,
            description=description,
            gcs_dir_name=gcs_dir_name,
            extra_packages=extra_packages,
            env_vars=env_vars,
        )
        print("Deployment complete.")
        print(f"Agent resource name: {remote_agent.resource_name}")
    elif action == "update":
        if not resource_engine_id:
            print("RESOURCE_ENGINE_ID variable is not set. Cannot update agent.")
            print("If this is your first deployment, you must deploy first to create a new agent.")
            print("Run this script again and choose 'deploy' to deploy a new agent. After deployment, save the printed resource name as RESOURCE_ENGINE_ID for future updates.")
            return
        print(f"Updating agent {resource_engine_id} on Vertex AI Agent Engine...")
        agent_engines.update(
            resource_name=resource_engine_id,
            agent_engine=root_agent,
            requirements=requirements,
            display_name=display_name,
            description=description,
            gcs_dir_name=gcs_dir_name,
            extra_packages=extra_packages,
            env_vars=env_vars,
        )
        print("Update complete.")

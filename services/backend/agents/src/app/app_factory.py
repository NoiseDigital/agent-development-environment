from fastapi import FastAPI
from services.backend.agents.src.app.routes import router


def create_app():
    app = FastAPI()
    app.include_router(router)
    return app

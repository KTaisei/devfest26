import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api.routes import router
from .core.config import settings
from .core.store import initialize_store
from .services.retention import purge_expired_locations


@asynccontextmanager
async def lifespan(app):
    config = settings()
    if config.firebase_project_id:
        import firebase_admin

        if not firebase_admin._apps:
            firebase_admin.initialize_app(options={"projectId": config.firebase_project_id})
    initialize_store()

    async def cleanup():
        while True:
            try:
                await asyncio.to_thread(purge_expired_locations)
            except Exception:
                logging.getLogger(__name__).exception("Location retention cleanup failed")
            await asyncio.sleep(60)

    task = asyncio.create_task(cleanup())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(title="TASUKU Simulation API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings().cors_origins.split(","),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(router)

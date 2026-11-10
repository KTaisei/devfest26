import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api.routes import router
from .core.config import settings
from .core.store import initialize_store
from .core.firebase import initialize_firebase
from .services.retention import purge_expired_locations
from .services.matching_engine import expire_offers
from .services.real_assistance import expire as expire_real_assistance


@asynccontextmanager
async def lifespan(app):
    initialize_firebase()
    initialize_store()

    async def cleanup():
        while True:
            try:
                await asyncio.to_thread(purge_expired_locations)
                await asyncio.to_thread(expire_offers)
                await asyncio.to_thread(expire_real_assistance)
            except Exception:
                logging.getLogger(__name__).exception("Simulation maintenance failed")
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

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.core.exceptions import (
    ApiError,
    api_error_handler,
    validation_error_handler,
    http_exception_handler,
    global_exception_handler,
)
from app.events.publisher import connect_producer, disconnect_producer
from app.api.routes import health, auth, users, addresses, sellers, internal


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Kafka is optional: events are fire-and-forget
    try:
        await connect_producer()
    except Exception:
        pass
    yield
    await disconnect_producer()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Muni User Service",
        description="User, address-book & seller-trust microservice for the MUNI e-commerce platform",
        version="1.0.0",
        lifespan=lifespan,
    )

    # CORS
    origins = settings.cors_origins_list
    if origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    # Health routes mounted at root /
    app.include_router(health.router)

    # API routes mounted under /api/v1
    app.include_router(auth.router, prefix="/api/v1")
    app.include_router(users.router, prefix="/api/v1")
    app.include_router(addresses.router, prefix="/api/v1")
    app.include_router(sellers.router, prefix="/api/v1")
    app.include_router(internal.router, prefix="/api/v1")

    # Exception Handlers
    app.add_exception_handler(ApiError, api_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(Exception, global_exception_handler)

    return app


app = create_app()

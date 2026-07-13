"""FastAPI entrypoint. CORS locked to the frontend origin; generic error
responses to clients, details to server logs only (SECURITY.md §7).
"""

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from app.checks import router as checks_router
from app.config import settings
from app.debate import router as debate_router
from app.limits import limiter
from app.rooms import router as rooms_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("app")

app = FastAPI(title="Debate Night API", docs_url=None, redoc_url=None, openapi_url=None)
app.state.limiter = limiter

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.exception_handler(RateLimitExceeded)
def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    logger.warning("rate limit hit: path=%s ip=%s", request.url.path, request.client.host)
    return JSONResponse(status_code=429, content={"detail": "Too many requests"})


@app.exception_handler(Exception)
def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled error: path=%s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True}


app.include_router(rooms_router)
app.include_router(debate_router)
app.include_router(checks_router)

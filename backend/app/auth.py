"""Resolve the authenticated Supabase user from the request JWT.

Identity always comes from the verified JWT, never from the request body
(SECURITY.md §6).
"""

import logging

import httpx
from fastapi import Header, HTTPException

from app.config import settings

logger = logging.getLogger("app.auth")


def get_current_user_id(authorization: str = Header(default="")) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.removeprefix("Bearer ")
    try:
        resp = httpx.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={
                "apikey": settings.supabase_service_role_key,
                "Authorization": f"Bearer {token}",
            },
            timeout=10,
        )
    except httpx.HTTPError:
        logger.warning("auth verification request failed")
        raise HTTPException(status_code=503, detail="Auth unavailable") from None
    if resp.status_code != 200:
        logger.warning("auth failure: status=%s", resp.status_code)
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = resp.json().get("id")
    if not user_id:
        logger.warning("auth failure: no user id in response")
        raise HTTPException(status_code=401, detail="Not authenticated")
    return str(user_id)

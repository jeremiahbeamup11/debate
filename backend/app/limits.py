"""Rate limiting (SECURITY.md §3). Keyed on client IP; every endpoint gets the
default limit, sensitive endpoints add stricter per-route limits.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])

"""OpenAPI / Swagger — show Bearer JWT lock icons on protected HTTP routes."""

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

# HTTP routes that stay open (no lock in Swagger). WebSockets are not listed here —
# they skip JWT middleware entirely and do not require Bearer auth.
_PUBLIC_OPENAPI = {
    ("get", "/"),
    ("get", "/health"),
    ("get", "/info"),
    ("post", "/api/v1/login"),
    ("post", "/api/v1/login/"),
    ("post", "/api/v1/auth/refresh"),
    ("post", "/api/v1/auth/refresh/"),
    ("post", "/api/v1/auth/logout"),
    ("post", "/api/v1/auth/logout/"),
    ("get", "/api/v1/machines/verify"),
    ("get", "/api/v1/machines"),
    ("get", "/api/v1/machines/"),
}


def _is_public_openapi_route(path: str, method: str) -> bool:
    m = method.lower()
    if (m, path) in _PUBLIC_OPENAPI:
        return True
    alt = path.rstrip("/") if path != "/" else path
    return (m, alt) in _PUBLIC_OPENAPI or (m, alt + "/") in _PUBLIC_OPENAPI


def configure_openapi_jwt(app: FastAPI) -> None:
    """Register Bearer JWT in Swagger UI (Authorize button + lock per endpoint)."""

    def custom_openapi():
        if app.openapi_schema:
            return app.openapi_schema

        schema = get_openapi(
            title=app.title,
            version=app.version,
            description=app.description,
            routes=app.routes,
        )

        schema.setdefault("components", {})
        schema["components"]["securitySchemes"] = {
            "BearerAuth": {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "JWT",
                "description": (
                    "1) Call POST /api/v1/login/ and copy access_token. "
                    "2) Click Authorize and paste the token once. "
                    "3) All locked endpoints work — no need to paste again per endpoint. "
                    "WebSocket endpoints do not use JWT."
                ),
            }
        }

        for path, path_item in schema.get("paths", {}).items():
            for method, operation in path_item.items():
                if method == "parameters" or not isinstance(operation, dict):
                    continue
                if _is_public_openapi_route(path, method):
                    operation["security"] = []
                else:
                    operation["security"] = [{"BearerAuth": []}]

        app.openapi_schema = schema
        return app.openapi_schema

    app.openapi = custom_openapi

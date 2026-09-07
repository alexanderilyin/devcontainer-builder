"""Self-hosted OAuth2 authorization-code and OpenID Connect endpoints."""

import secrets
import time
from urllib.parse import urlencode, urlparse

from fastapi import APIRouter, Form, HTTPException, Request
from fastapi.responses import RedirectResponse

from security import create_token, decode_token, public_jwk
from users import get_user, get_user_by_username, verify_user_password

router = APIRouter(tags=["oauth"])

_codes: dict[str, dict[str, object]] = {}
_CODE_TTL_SECONDS = 300


def issuer_for(request: Request) -> str:
    return str(request.base_url).rstrip("/")


def _validate_redirect_uri(redirect_uri: str) -> None:
    parsed = urlparse(redirect_uri)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(400, "redirect_uri must be an absolute HTTP(S) URL")


def _claims_for(user_id: str, username: str, scope: str, token_type: str) -> dict[str, str]:
    return {"sub": user_id, "preferred_username": username, "scope": scope, "token_type": token_type}


@router.get("/oauth/authorize")
def authorize(
    request: Request,
    client_id: str,
    redirect_uri: str,
    response_type: str,
    scope: str = "",
    state: str | None = None,
    username: str | None = None,
    password: str | None = None,
) -> RedirectResponse:
    if response_type != "code":
        raise HTTPException(400, "response_type must be code")
    if not client_id:
        raise HTTPException(400, "client_id is required")
    _validate_redirect_uri(redirect_uri)
    user = get_user_by_username(username or "")
    if user is None or password is None or not verify_user_password(user, password):
        raise HTTPException(401, "invalid user credentials")

    code = secrets.token_urlsafe(32)
    _codes[code] = {
        "user_id": user.id,
        "username": user.username,
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": scope,
        "expires_at": time.time() + _CODE_TTL_SECONDS,
    }
    params = {"code": code}
    if state is not None:
        params["state"] = state
    separator = "&" if "?" in redirect_uri else "?"
    return RedirectResponse(f"{redirect_uri}{separator}{urlencode(params)}", status_code=302)


@router.post("/oauth/token")
def token(
    request: Request,
    grant_type: str = Form(...),
    code: str = Form(...),
    client_id: str = Form(...),
    redirect_uri: str = Form(...),
) -> dict[str, object]:
    if grant_type != "authorization_code":
        raise HTTPException(400, "grant_type must be authorization_code")
    details = _codes.pop(code, None)
    if details is None or float(details["expires_at"]) < time.time():
        raise HTTPException(400, "invalid or expired authorization code")
    if details["client_id"] != client_id or details["redirect_uri"] != redirect_uri:
        raise HTTPException(400, "authorization request does not match")

    user_id = str(details["user_id"])
    username = str(details["username"])
    scope = str(details["scope"])
    issuer = issuer_for(request)
    access_token = create_token(_claims_for(user_id, username, scope, "access"), issuer)
    response: dict[str, object] = {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": 3600,
        "scope": scope,
    }
    if "openid" in scope.split():
        response["id_token"] = create_token(_claims_for(user_id, username, scope, "id"), issuer)
    return response


@router.get("/.well-known/openid-configuration")
def discovery(request: Request) -> dict[str, object]:
    issuer = issuer_for(request)
    return {
        "issuer": issuer,
        "authorization_endpoint": f"{issuer}/oauth/authorize",
        "token_endpoint": f"{issuer}/oauth/token",
        "userinfo_endpoint": f"{issuer}/oauth/userinfo",
        "jwks_uri": f"{issuer}/oauth/jwks",
        "response_types_supported": ["code"],
        "subject_types_supported": ["public"],
        "id_token_signing_alg_values_supported": ["RS256"],
        "scopes_supported": ["openid", "profile"],
    }


@router.get("/oauth/jwks")
def jwks() -> dict[str, list[dict[str, str]]]:
    return {"keys": [public_jwk()]}


@router.get("/oauth/userinfo")
def userinfo(request: Request) -> dict[str, str]:
    authorization = request.headers.get("authorization", "")
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "bearer token required")
    claims = decode_token(authorization[7:].strip(), issuer_for(request))
    if claims is None:
        raise HTTPException(401, "invalid bearer token")
    try:
        user = get_user(str(claims.get("sub")))
    except HTTPException as error:
        raise HTTPException(401, "token subject is no longer valid") from error
    return {"sub": user.id, "preferred_username": user.username, "name": user.username}
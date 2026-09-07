"""Small protected endpoints demonstrating five real auth schemes."""

from fastapi import APIRouter, Depends, Form, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBasic, HTTPBasicCredentials, HTTPBearer

from oauth import issuer_for
from security import create_token, decode_token
from users import get_user, get_user_by_api_key, get_user_by_username, verify_user_password

router = APIRouter(prefix="/auth", tags=["auth"])
basic = HTTPBasic(auto_error=False)
bearer = HTTPBearer(auto_error=False)


def identity(user) -> dict[str, str]:
    return {"id": user.id, "username": user.username}


def bearer_identity(request: Request, credentials: HTTPAuthorizationCredentials | None) -> dict[str, str]:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bearer token required", {"WWW-Authenticate": "Bearer"})
    claims = decode_token(credentials.credentials, issuer_for(request))
    if claims is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid bearer token", {"WWW-Authenticate": "Bearer"})
    try:
        return identity(get_user(str(claims.get("sub"))))
    except HTTPException as error:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token subject is no longer valid", {"WWW-Authenticate": "Bearer"}) from error


@router.post("/token")
def issue_bearer_token(request: Request, username: str = Form(...), password: str = Form(...)) -> dict[str, object]:
    user = get_user_by_username(username)
    if user is None or not user.bearer_enabled or not verify_user_password(user, password):
        raise HTTPException(401, "invalid bearer credentials")
    return {
        "access_token": create_token({"sub": user.id, "preferred_username": user.username, "scope": "", "token_type": "access"}, issuer_for(request)),
        "token_type": "bearer",
        "expires_in": 3600,
    }


@router.get("/api-key/whoami")
def api_key_whoami(request: Request) -> dict[str, str]:
    user = get_user_by_api_key(request.headers.get("x-api-key", ""))
    if user is None:
        raise HTTPException(401, "invalid API key")
    return identity(user)


@router.get("/basic/whoami")
def basic_whoami(credentials: HTTPBasicCredentials | None = Depends(basic)) -> dict[str, str]:
    user = get_user_by_username(credentials.username) if credentials else None
    if user is None or credentials is None or not verify_user_password(user, credentials.password):
        raise HTTPException(401, "invalid basic credentials", {"WWW-Authenticate": "Basic"})
    return identity(user)


@router.get("/bearer/whoami")
def bearer_whoami(request: Request, credentials=Depends(bearer)) -> dict[str, str]:
    return bearer_identity(request, credentials)


@router.get("/oauth2/whoami")
def oauth2_whoami(request: Request, credentials=Depends(bearer)) -> dict[str, str]:
    return bearer_identity(request, credentials)


@router.get("/openid/whoami")
def openid_whoami(request: Request, credentials=Depends(bearer)) -> dict[str, str]:
    return bearer_identity(request, credentials)
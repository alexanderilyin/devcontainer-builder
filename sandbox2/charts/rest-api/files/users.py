"""In-memory users and credentials for the auth fixture."""

import secrets

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from security import hash_password, verify_password

router = APIRouter(prefix="/users", tags=["users"])


class UserCreate(BaseModel):
    username: str = Field(min_length=1)
    password: str | None = None
    api_key_enabled: bool = False
    bearer_enabled: bool = False


class UserUpdate(BaseModel):
    username: str = Field(min_length=1)
    password: str | None = None
    api_key_enabled: bool | None = None
    rotate_api_key: bool = False
    bearer_enabled: bool | None = None


class UserPublic(BaseModel):
    id: str
    username: str
    api_key_enabled: bool
    bearer_enabled: bool


class CreatedUser(UserPublic):
    api_key: str | None = None


class RotatedApiKey(UserPublic):
    api_key: str


class UserRecord:
    def __init__(self, user_id: str, created: UserCreate):
        self.id = user_id
        self.username = created.username
        self.password_hash = hash_password(created.password) if created.password else None
        self.api_key = secrets.token_urlsafe(32) if created.api_key_enabled else None
        self.bearer_enabled = created.bearer_enabled

    def public(self) -> UserPublic:
        return UserPublic(id=self.id, username=self.username, api_key_enabled=self.api_key is not None, bearer_enabled=self.bearer_enabled)


_users: dict[str, UserRecord] = {}
_next_id = 1


def get_user(user_id: str) -> UserRecord:
    if user_id not in _users:
        raise HTTPException(404, "user not found")
    return _users[user_id]


def get_user_by_username(username: str) -> UserRecord | None:
    return next((user for user in _users.values() if user.username == username), None)


def get_user_by_api_key(api_key: str) -> UserRecord | None:
    return next((user for user in _users.values() if user.api_key == api_key), None)


def verify_user_password(user: UserRecord, password: str) -> bool:
    return user.password_hash is not None and verify_password(password, user.password_hash)


def issue_api_key(user: UserRecord) -> str:
    user.api_key = secrets.token_urlsafe(32)
    return user.api_key


@router.post("/", status_code=201)
def create_user(created: UserCreate) -> CreatedUser:
    global _next_id
    if get_user_by_username(created.username):
        raise HTTPException(409, "username already exists")
    user = UserRecord(f"user-{_next_id}", created)
    _next_id += 1
    _users[user.id] = user
    return CreatedUser(**user.public().model_dump(), api_key=user.api_key)


@router.get("/")
def list_users() -> list[UserPublic]:
    return [user.public() for user in _users.values()]


@router.get("/{user_id}")
def read_user(user_id: str) -> UserPublic:
    return get_user(user_id).public()


@router.put("/{user_id}")
def update_user(user_id: str, update: UserUpdate) -> UserPublic:
    user = get_user(user_id)
    other = get_user_by_username(update.username)
    if other and other.id != user_id:
        raise HTTPException(409, "username already exists")
    user.username = update.username
    if update.password is not None:
        user.password_hash = hash_password(update.password)
    if update.api_key_enabled is True and user.api_key is None:
        issue_api_key(user)
    elif update.api_key_enabled is False:
        user.api_key = None
    if update.rotate_api_key:
        issue_api_key(user)
    if update.bearer_enabled is not None:
        user.bearer_enabled = update.bearer_enabled
    return user.public()


@router.post("/{user_id}/api-key", response_model=RotatedApiKey)
def rotate_user_api_key(user_id: str) -> RotatedApiKey:
    user = get_user(user_id)
    return RotatedApiKey(**user.public().model_dump(), api_key=issue_api_key(user))


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: str) -> None:
    del _users[get_user(user_id).id]

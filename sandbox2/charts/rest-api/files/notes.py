"""In-memory notes CRUD - see ../../../features/rest/notes.feature."""

import itertools

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/notes", tags=["notes"])


class NoteIn(BaseModel):
    title: str
    body: str


class Note(NoteIn):
    id: str


# In-memory only, deliberately - disposable test fixture, not something
# that needs to survive a pod restart (same reasoning as main.py's
# health state).
_notes: dict[str, Note] = {}
_ids = itertools.count(1)


@router.post("/", status_code=201)
def create_note(note: NoteIn) -> Note:
    created = Note(id=f"note-{next(_ids)}", **note.model_dump())
    _notes[created.id] = created
    return created


@router.get("/")
def list_notes() -> list[Note]:
    return list(_notes.values())


@router.get("/{note_id}")
def get_note(note_id: str) -> Note:
    if note_id not in _notes:
        raise HTTPException(404, "note not found")
    return _notes[note_id]


@router.put("/{note_id}")
def update_note(note_id: str, note: NoteIn) -> Note:
    if note_id not in _notes:
        raise HTTPException(404, "note not found")
    updated = Note(id=note_id, **note.model_dump())
    _notes[note_id] = updated
    return updated


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: str) -> None:
    if note_id not in _notes:
        raise HTTPException(404, "note not found")
    del _notes[note_id]

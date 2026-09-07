"""Real file upload/download CRUD - see ../../../features/rest/files.feature.

Uploaded bytes are written to /data (a real, writable emptyDir volume -
see ../templates/deployment.yaml - distinct from the read-only
ConfigMap-mounted /app this module itself lives in).
"""

import os
import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

router = APIRouter(prefix="/files", tags=["files"])

_DATA_DIR = "/data"


class FileMetadata(BaseModel):
    id: str
    filename: str
    size: int
    content_type: str | None


# In-memory metadata index only - the real bytes are what actually lives
# on disk under _DATA_DIR; this just tracks which id maps to which
# filename/content_type (not derivable from the on-disk bytes alone).
_index: dict[str, FileMetadata] = {}


@router.post("/", status_code=201)
async def upload_file(file: UploadFile = File(...)) -> FileMetadata:
    contents = await file.read()
    file_id = uuid.uuid4().hex[:8]
    with open(os.path.join(_DATA_DIR, file_id), "wb") as f:
        f.write(contents)
    metadata = FileMetadata(id=file_id, filename=file.filename or file_id, size=len(contents), content_type=file.content_type)
    _index[file_id] = metadata
    return metadata


@router.get("/")
def list_files() -> list[FileMetadata]:
    return list(_index.values())


@router.get("/{file_id}")
def get_file_metadata(file_id: str) -> FileMetadata:
    if file_id not in _index:
        raise HTTPException(404, "file not found")
    return _index[file_id]


# Metadata and content are separate representations - this answers "what
# is this", the sibling below answers "give me the actual bytes".
@router.get("/{file_id}/download")
def download_file(file_id: str) -> Response:
    if file_id not in _index:
        raise HTTPException(404, "file not found")
    metadata = _index[file_id]
    with open(os.path.join(_DATA_DIR, file_id), "rb") as f:
        contents = f.read()
    return Response(
        content=contents,
        media_type=metadata.content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{metadata.filename}"'},
    )


@router.delete("/{file_id}", status_code=204)
def delete_file(file_id: str) -> None:
    if file_id not in _index:
        raise HTTPException(404, "file not found")
    os.remove(os.path.join(_DATA_DIR, file_id))
    del _index[file_id]

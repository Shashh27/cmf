from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

# Base schemas
class GeneralFolderBase(BaseModel):
    folder_name: str
    parent_id: Optional[int] = None

class GeneralDocumentBase(BaseModel):
    file_name: str
    url: str
    version: float
    general_folder_id: int
    parent_id: Optional[int] = None

# Response schemas
class GeneralFolder(GeneralFolderBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class GeneralDocument(GeneralDocumentBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Create schemas
class GeneralFolderCreate(GeneralFolderBase):
    pass

class GeneralDocumentCreate(GeneralDocumentBase):
    pass

# Update schemas
class GeneralFolderUpdate(BaseModel):
    folder_name: Optional[str] = None
    parent_id: Optional[int] = None

class GeneralDocumentUpdate(BaseModel):
    file_name: Optional[str] = None
    url: Optional[str] = None
    general_folder_id: Optional[int] = None

# Response with nested data
class GeneralFolderWithChildren(GeneralFolder):
    children: List["GeneralFolderWithChildren"] = []
    documents: List[GeneralDocument] = []

class GeneralDocumentWithVersions(GeneralDocument):
    versions: List[GeneralDocument] = []

# Forward references for recursive schemas
GeneralFolderWithChildren.model_rebuild()
GeneralDocumentWithVersions.model_rebuild()

# Folder tree response
class FolderTreeResponse(BaseModel):
    id: int
    folder_name: str
    parent_id: Optional[int] = None
    children: List["FolderTreeResponse"] = []
    document_count: int = 0

FolderTreeResponse.model_rebuild()

# Document version response
class DocumentVersionResponse(BaseModel):
    id: int
    file_name: str
    url: str
    version: float
    created_at: datetime
    parent_id: Optional[int] = None
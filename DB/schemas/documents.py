from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

# Base schemas
class GeneralFolderBase(BaseModel):
    folder_name: str
    parent_id: Optional[int] = None
    user_id: int

class GeneralDocumentBase(BaseModel):
    file_name: str
    url: str
    version: float
    general_folder_id: int
    parent_id: Optional[int] = None
    user_id: int

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
    user_id: int

class GeneralDocumentUpdate(BaseModel):
    file_name: Optional[str] = None
    url: Optional[str] = None
    general_folder_id: Optional[int] = None
    user_id: int

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

# Machine Folder schemas
class MachineFolderBase(BaseModel):
    folder_name: str
    machine_id: int
    parent_id: Optional[int] = None
    user_id: int

class MachineDocumentBase(BaseModel):
    document_name: str
    document_url: str
    version: float
    machine_folder_id: Optional[int] = None
    machine_id: Optional[int] = None
    parent_id: Optional[int] = None
    document_type: Optional[str] = None
    user_id: int

# Machine Folder Response schemas
class MachineFolder(MachineFolderBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class MachineDocument(MachineDocumentBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Machine Folder Create schemas
class MachineFolderCreate(MachineFolderBase):
    pass

class MachineDocumentCreate(MachineDocumentBase):
    pass

# Machine Folder Update schemas
class MachineFolderUpdate(BaseModel):
    folder_name: Optional[str] = None
    machine_id: Optional[int] = None
    parent_id: Optional[int] = None
    user_id: int

class MachineDocumentUpdate(BaseModel):
    document_name: Optional[str] = None
    document_url: Optional[str] = None
    machine_folder_id: Optional[int] = None
    machine_id: Optional[int] = None
    document_type: Optional[str] = None
    user_id: int

# Machine Folder Response with nested data
class MachineFolderWithChildren(MachineFolder):
    children: List["MachineFolderWithChildren"] = []
    machine_documents: List[MachineDocument] = []

class MachineDocumentWithVersions(MachineDocument):
    versions: List[MachineDocument] = []

# Machine Folder tree response
class MachineFolderTreeResponse(BaseModel):
    id: int
    folder_name: str
    machine_id: int
    parent_id: Optional[int] = None
    children: List["MachineFolderTreeResponse"] = []
    document_count: int = 0

# Machine Document version response
class MachineDocumentVersionResponse(BaseModel):
    id: int
    document_name: str
    document_url: str
    version: float
    created_at: datetime
    parent_id: Optional[int] = None

# Machine with folders response (for tree structure)
class MachineWithFolders(BaseModel):
    id: int
    machine_name: str
    machine_code: Optional[str] = None
    folders: List[MachineFolderTreeResponse] = []

# Common Folder schemas
class CommonFolderBase(BaseModel):
    folder_name: str
    parent_id: Optional[int] = None
    user_id: int

class CommonDocumentBase(BaseModel):
    document_name: str
    document_url: str
    version: float
    folder_id: Optional[int] = None
    parent_id: Optional[int] = None
    user_id: int

# Common Folder Response schemas
class CommonFolder(CommonFolderBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class CommonDocument(CommonDocumentBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Common Folder Create schemas
class CommonFolderCreate(CommonFolderBase):
    pass

class CommonDocumentCreate(CommonDocumentBase):
    pass

# Common Folder Update schemas
class CommonFolderUpdate(BaseModel):
    folder_name: Optional[str] = None
    parent_id: Optional[int] = None
    user_id: int

class CommonDocumentUpdate(BaseModel):
    document_name: Optional[str] = None
    document_url: Optional[str] = None
    folder_id: Optional[int] = None
    user_id: int

# Common Folder Response with nested data
class CommonFolderWithChildren(CommonFolder):
    children: List["CommonFolderWithChildren"] = []
    documents: List[CommonDocument] = []

class CommonDocumentWithVersions(CommonDocument):
    versions: List[CommonDocument] = []

# Common Folder tree response
class CommonFolderTreeResponse(BaseModel):
    id: int
    folder_name: str
    parent_id: Optional[int] = None
    children: List["CommonFolderTreeResponse"] = []
    document_count: int = 0

# Common Document version response
class CommonDocumentVersionResponse(BaseModel):
    id: int
    document_name: str
    document_url: str
    version: float
    created_at: datetime
    parent_id: Optional[int] = None

# Forward references for recursive schemas
MachineFolderWithChildren.model_rebuild()
MachineDocumentWithVersions.model_rebuild()
MachineFolderTreeResponse.model_rebuild()
CommonFolderWithChildren.model_rebuild()
CommonDocumentWithVersions.model_rebuild()
CommonFolderTreeResponse.model_rebuild()

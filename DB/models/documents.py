from sqlalchemy import Column, Integer, String, ForeignKey, Float, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime, timezone, timedelta
from DB.database import Base
from DB.models.access_control import AccessUser

# IST timezone (UTC+5:30)
IST = timezone(timedelta(hours=5, minutes=30))

# Function to get current IST time
def get_ist_time():
    return datetime.now(IST)

class GeneralFolder(Base):
    __tablename__ = "general_folders"
    __table_args__ = {'schema': 'documents'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    folder_name = Column(String(255), nullable=False)
    parent_id = Column(Integer, ForeignKey("documents.general_folders.id"), nullable=True)
    created_at = Column(DateTime(timezone=False), default=get_ist_time)
    updated_at = Column(DateTime(timezone=False), default=get_ist_time, onupdate=get_ist_time)
    user_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)

    # Relationship with user
    user = relationship("AccessUser")

    # Self-referential relationship for parent-child folder relationships
    parent = relationship("GeneralFolder", remote_side=[id], back_populates="children")
    children = relationship("GeneralFolder", back_populates="parent")
    
    # Relationship with documents
    documents = relationship("GeneralDocument", back_populates="folder")

class GeneralDocument(Base):
    __tablename__ = "general_documents"
    __table_args__ = {'schema': 'documents'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    general_folder_id = Column(Integer, ForeignKey("documents.general_folders.id"), nullable=False)
    file_name = Column(String(255), nullable=False)
    url = Column(String(500), nullable=False)
    version = Column(Float, nullable=False, default=1.0)
    parent_id = Column(Integer, ForeignKey("documents.general_documents.id"), nullable=True)
    created_at = Column(DateTime(timezone=False), default=get_ist_time)
    updated_at = Column(DateTime(timezone=False), default=get_ist_time, onupdate=get_ist_time)
    user_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)

    # Relationship with user
    user = relationship("AccessUser")

    # Relationship with folder
    folder = relationship("GeneralFolder", back_populates="documents")
    
    # Self-referential relationship for document versions
    parent = relationship("GeneralDocument", remote_side=[id], back_populates="versions")
    versions = relationship("GeneralDocument", back_populates="parent")

class MachineFolder(Base):
    __tablename__ = "machine_folders"
    __table_args__ = {'schema': 'documents'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    folder_name = Column(String(255), nullable=False)
    machine_id = Column(Integer, ForeignKey("configuration.machines.id"), nullable=False)
    parent_id = Column(Integer, ForeignKey("documents.machine_folders.id"), nullable=True)
    created_at = Column(DateTime(timezone=False), default=get_ist_time)
    updated_at = Column(DateTime(timezone=False), default=get_ist_time, onupdate=get_ist_time)
    user_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)

    # Relationship with user
    user = relationship("AccessUser")

    # Self-referential relationship for parent-child folder relationships
    parent = relationship("MachineFolder", remote_side=[id], back_populates="children")
    children = relationship("MachineFolder", back_populates="parent")
    
    # Relationship with machine documents
    machine_documents = relationship("MachineDocument", back_populates="folder")

class MachineDocument(Base):
    __tablename__ = "machine_documents"
    __table_args__ = {'schema': 'documents'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    machine_folder_id = Column(Integer, ForeignKey("documents.machine_folders.id"), nullable=True)
    machine_id = Column(Integer, ForeignKey("configuration.machines.id"), nullable=True)
    document_name = Column(String(255), nullable=False)
    document_url = Column(String(500), nullable=False)
    version = Column(Float, nullable=False, default=1.0)
    parent_id = Column(Integer, ForeignKey("documents.machine_documents.id"), nullable=True)
    document_type = Column(String(50), nullable=True)  # e.g., 'maintenance', 'technical', 'manual', None for general
    created_at = Column(DateTime(timezone=False), default=get_ist_time)
    updated_at = Column(DateTime(timezone=False), default=get_ist_time, onupdate=get_ist_time)
    user_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)

    # Relationship with user
    user = relationship("AccessUser")

    # Relationship with folder
    folder = relationship("MachineFolder", back_populates="machine_documents")
    
    # Self-referential relationship for document versions
    parent = relationship("MachineDocument", remote_side=[id], back_populates="versions")
    versions = relationship("MachineDocument", back_populates="parent")

class CommonFolder(Base):
    __tablename__ = "common_folders"
    __table_args__ = {'schema': 'documents'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    folder_name = Column(String(255), nullable=False)
    parent_id = Column(Integer, ForeignKey("documents.common_folders.id"), nullable=True)
    created_at = Column(DateTime(timezone=False), default=get_ist_time)
    updated_at = Column(DateTime(timezone=False), default=get_ist_time, onupdate=get_ist_time)
    user_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)

    # Relationship with user
    user = relationship("AccessUser")

    # Self-referential relationship for parent-child folder relationships
    parent = relationship("CommonFolder", remote_side=[id], back_populates="children")
    children = relationship("CommonFolder", back_populates="parent")
    
    # Relationship with documents
    documents = relationship("CommonDocument", back_populates="folder")

class CommonDocument(Base):
    __tablename__ = "common_documents"
    __table_args__ = {'schema': 'documents'}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    folder_id = Column(Integer, ForeignKey("documents.common_folders.id"), nullable=True)
    document_name = Column(String(255), nullable=False)
    document_url = Column(String(500), nullable=False)
    version = Column(Float, nullable=False, default=1.0)
    parent_id = Column(Integer, ForeignKey("documents.common_documents.id"), nullable=True)
    created_at = Column(DateTime(timezone=False), default=get_ist_time)
    updated_at = Column(DateTime(timezone=False), default=get_ist_time, onupdate=get_ist_time)
    user_id = Column(Integer, ForeignKey("accesscontrol.access_users.id"), nullable=False)

    # Relationship with user
    user = relationship("AccessUser")

    # Relationship with folder
    folder = relationship("CommonFolder", back_populates="documents")
    
    # Self-referential relationship for document versions
    parent = relationship("CommonDocument", remote_side=[id], back_populates="versions")
    versions = relationship("CommonDocument", back_populates="parent")

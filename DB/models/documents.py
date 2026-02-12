from sqlalchemy import Column, Integer, String, ForeignKey, Float, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime, timezone, timedelta
from DB.database import Base

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

    # Relationship with folder
    folder = relationship("GeneralFolder", back_populates="documents")
    
    # Self-referential relationship for document versions
    parent = relationship("GeneralDocument", remote_side=[id], back_populates="versions")
    versions = relationship("GeneralDocument", back_populates="parent")
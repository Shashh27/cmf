from sqlalchemy import Column, Integer, String, DateTime, func
from ..database import Base

class AccessUser(Base):
    __tablename__ = "access_users"
    __table_args__ = {'schema': 'accesscontrol'}

    id = Column(Integer, primary_key=True, index=True)
    user_name = Column(String, unique=True, nullable=False)
    gmail = Column(String, unique=True, nullable=False)
    role = Column(String, nullable=False)
    center = Column(String)
    group = Column(String)
    password = Column(String, nullable=False)
    createdAt = Column(DateTime, default=func.now())
    updatedAt = Column(DateTime, default=func.now(), onupdate=func.now())

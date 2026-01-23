from sqlalchemy import Column, Integer
from sqlalchemy.types import JSON
from base import Base

class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, index=True)
    data = Column(JSON)
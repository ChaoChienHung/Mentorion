import os

from core.config import settings
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

os.makedirs(settings.DATABASE, exist_ok=True)
DATABASE_URL = f"sqlite:///{settings.DATABASE}/app.db"

engine = create_engine(
  DATABASE_URL,
  connect_args={"check_same_thread": False},
  echo=True
  )

SessionLocal = sessionmaker(
  autocommit=False,
  autoflush=False,
  bind=engine
  )
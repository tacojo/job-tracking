"""One-time migration: recreate application_documents table with new schema.

Run from project root if you have an existing DB with the old schema:
  cd backend && python -m scripts.migrate_application_documents

This drops and recreates the table. Any existing document rows will be lost.
"""

import sys
from pathlib import Path

backend = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend))

from app.db import engine
from app.models.application_document import ApplicationDocument


def main():
    ApplicationDocument.__table__.drop(engine, checkfirst=True)
    ApplicationDocument.__table__.create(engine)
    print("application_documents table recreated.")


if __name__ == "__main__":
    main()

from __future__ import annotations

import atexit
import os
import shutil
import tempfile

# Isolate all pytest runs into a fresh temporary vault directory BEFORE
# backend.app.core.config or backend.app.db.session are imported, so tests
# never mutate Mentorion-Vault/app.db or data/app.db and remain deterministic.
_TEST_VAULT_DIR = tempfile.mkdtemp(prefix="mentorion_pytest_vault_")
os.environ["MENTORION_VAULT_DIR"] = _TEST_VAULT_DIR
os.environ.setdefault("MENTORION_LOG_TARGET", "console")


def _cleanup_test_vault() -> None:
    shutil.rmtree(_TEST_VAULT_DIR, ignore_errors=True)


atexit.register(_cleanup_test_vault)

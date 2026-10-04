"""Read-only check of the exact public company staging Studio CTA."""
import os
import subprocess
from pathlib import Path

if os.environ.get("NPQ_OWNER_OPERATION_ENVIRONMENT") != "staging":
    raise SystemExit("Use npq owner-operation run --environment staging")
raise SystemExit(subprocess.call(["node", str(Path(__file__).with_suffix(".cjs"))]))

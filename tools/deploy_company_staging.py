"""Build, validate and deploy only the existing company staging Hosting target."""
import argparse
import os
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("--firebase-cli", required=True)
args = parser.parse_args()
if os.environ.get("NPQ_OWNER_OPERATION_ENVIRONMENT") != "staging":
    parser.error("requires npq owner-operation staging execution")
root = Path(__file__).resolve().parents[1]
cli = Path(args.firebase_cli).resolve()
if not cli.is_relative_to(Path("/tmp")) or not cli.is_file():
    parser.error("use the session-local Firebase CLI in /tmp")
for command in (["npm", "run", "build:firebase:staging"],
                ["npm", "run", "check:firebase:staging"]):
    subprocess.run(command, cwd=root, check=True)
raise SystemExit(subprocess.call([str(cli), "deploy", "--project", "npq-staging",
    "--config", "firebase.json", "--only", "hosting:company", "--non-interactive"], cwd=root))

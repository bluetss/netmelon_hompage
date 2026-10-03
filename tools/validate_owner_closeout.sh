#!/usr/bin/env bash
set -euo pipefail
[[ $# -eq 2 ]] || { echo "usage: $0 BASE_SHA HEAD_SHA" >&2; exit 2; }
base_sha="$1"; head_sha="$2"
cd "$(git rev-parse --show-toplevel)"
[[ "$(git rev-parse HEAD)" == "${head_sha}" ]]
bash tools/verify_no_secrets.sh
gitleaks dir . --config=.gitleaks.toml --gitleaks-ignore-path=.gitleaksignore --redact --no-banner
git diff --check "${base_sha}...${head_sha}"
npm run check
test -s index.html
test -s privacy.html
test -s terms.html
python3 -m json.tool privacy.json >/dev/null
python3 -m json.tool terms_of_service.json >/dev/null
python3 -m json.tool data-deletion.json >/dev/null

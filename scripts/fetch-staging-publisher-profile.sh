#!/usr/bin/env bash
set -euo pipefail
[[ "${NPQ_OWNER_OPERATION_ENVIRONMENT:-}" == staging ]] || exit 2
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PUBLISHER_PROFILE_API_BASE='https://naepopquiz-flask-server-dev-651248008951.us-central1.run.app'
export PUBLISHER_PROFILE_JSON_PATH="${repo_root}/data/publisher-legal-profile.json"
unset PUBLISHER_PROFILE_PUBLIC_URL PUBLISHER_PROFILE_BEARER_TOKEN
exec node "${repo_root}/scripts/fetch-publisher-profile.mjs"

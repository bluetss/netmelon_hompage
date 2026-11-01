#!/usr/bin/env bash
set -euo pipefail

mode="${1:-}"
if [[ "$mode" != "" && "$mode" != "--check-only" && "$mode" != "--with-api" ]]; then
  echo "usage: $0 [--check-only|--with-api]" >&2
  exit 2
fi

if [[ "$mode" == "--with-api" && -z "${COMPANY_PUBLIC_INTAKE_API_BASE:-}" ]]; then
  echo "COMPANY_PUBLIC_INTAKE_API_BASE is required for --with-api" >&2
  exit 2
fi

if [[ "$mode" != "--with-api" ]]; then
  unset COMPANY_PUBLIC_INTAKE_API_BASE || true
fi

npm run build:firebase:staging
npm run check:firebase:staging
npm run check
bash tools/verify_no_secrets.sh

if [[ "$mode" == "--check-only" ]]; then
  exit 0
fi

echo "Company staging-equivalent preview: http://127.0.0.1:4174"
exec firebase emulators:start --only hosting --project npq-staging --config firebase.json

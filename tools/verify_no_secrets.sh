#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(git -C "${script_dir}/.." rev-parse --show-toplevel)"
cd "${repo_root}"

found=0
while IFS= read -r path; do
  case "${path}" in
    *firebase-adminsdk*.json|*service-account*.json|*service_account*.json|credentials.json|*/credentials.json|client_secret*.json|*/client_secret*.json|*.pem|*.p12|*.pfx|id_rsa|*/id_rsa|*/.refresh_token|keys/openai*|keys/gemini*|*/keys/openai*|*/keys/gemini*)
      echo "forbidden credential path is tracked: ${path}" >&2
      found=1
      ;;
  esac
done < <(git ls-files)

if (( found != 0 )); then
  exit 1
fi

echo "forbidden secret path gate passed"

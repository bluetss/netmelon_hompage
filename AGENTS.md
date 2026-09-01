# AGENTS.md

## Scope

This file applies repo-wide to the Netmelon public homepage.

## Core Rules

- Keep the site static unless a runtime change is explicitly requested.
- Never commit credentials, cookies, access tokens, private keys, or raw user data.
- Preserve Korean and English public-source parity.
- Use a short task branch and pull request; do not deploy from a development branch.
- Do not add a worker, job, scheduler, queue, or external workload.

## Collaboration Files

Changes to `.github/*`, `.gitleaks.toml`, `.gitleaksignore`,
`.pre-commit-config.yaml`, `.gitignore`, `tools/verify_no_secrets.sh`, and
`AGENTS.md` are allowed for development governance.

## Validation

Run `bash tools/verify_no_secrets.sh`, `npm run check`, and
`git diff --check`.

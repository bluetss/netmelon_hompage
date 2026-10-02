# AGENTS.md

## Scope

This file applies repo-wide to the Netmelon public homepage.

- Creator Supply 문제와 `Conversation Content Producer(PD)` closed preview의 exact CTA mapping은 `data/careers.ko.json`, `data/company-open-problems.ko.json`, 생성된 문제·채용 페이지, `scripts/problem-intake.js`, `scripts/check-site-release.mjs`, `AGENTS.md` 수정을 허용한다. 사용자가 명시적으로 요청한 `npq-staging`의 `company` Hosting 배포와 `app-dev.naepopquiz.com` 미리보기 확인은 허용하되 공개 CMS 상태, production 배포와 외부 지원 접수는 변경하지 않는다.

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

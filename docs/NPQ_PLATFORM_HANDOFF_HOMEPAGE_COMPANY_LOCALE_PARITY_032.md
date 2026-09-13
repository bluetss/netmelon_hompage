# NPQ-PLATFORM Handoff

- Task ID: `HOMEPAGE-COMPANY-LOCALE-PARITY-032`
- Owner session: `npq_homepage`
- Handoff status: `READY`

## Components

| Repository | Branch | Exact remote head | PR |
| --- | --- | --- | --- |
| company_homepage | session/npq-homepage | SELF | none |

The unchanged company preview integration baseline is
`integration/company-homepage-preview` at
`5fc4197ec53cb74645cc54ba808818ace2a4be7d`. The unchanged production baseline is
`main` at `491723d5f487eaabc8f98cd8c9af8f89beb6b96c`; production publication is not
part of this handoff.

## Changes

- Replaced ambiguous relative company navigation with locale-safe root-relative
  Korean and `/en/...` routes, including page-equivalent language switching.
- Marked the app-homepage CTA for environment-aware assembly. Staging artifacts
  now target `https://npq-landing-dev.web.app/`; production source retains the
  production hostname pending DNS and TLS readiness.
- Restored English Careers generation and aligned the English Careers, IR, and
  Open Problems surfaces with the Korean functional structure. English IR and
  proposal forms now submit an explicit `en` locale and use localized status copy.
- Added recursive staging assembly for English Open Problems detail pages and
  depth-correct runtime-config injection for every generated intake form.
- Added separate Korean and English company-site privacy notices and linked them
  from company footers and collection forms. App terms and the remaining app legal
  set remain owned by the app landing site.
- Added release regressions for locale route containment, app CTA assembly,
  Careers/IR/Open Problems structure, company privacy links, retention disclosure,
  nested English staging pages, and runtime scripts.

## Documentation Updates

- `README.md`: documents locale-safe routing, active Careers generation,
  environment-specific app CTA assembly, company/app legal separation, and the
  one-year company-intake retention production stop condition.
- `company-privacy.html` and `en/company-privacy.html`: provide the matching
  Korean/English company-site intake privacy notice for preview review.
- Generated HTML was refreshed with `npm run build` followed by
  `npm run build:english:review-open-problems`.
- No server schema, API, database schema, or deployment runbook changed because
  this task changes only static company-site routing, rendering, and preview
  assembly. The existing intake API contract and production deployment boundary
  remain unchanged.

## Validation

- `npm run build` — passed; Korean source-backed pages and eight Open Problems
  detail pages regenerated.
- `npm run build:english:review-open-problems` — passed; non-indexed English review
  pages and eight details regenerated.
- `npm run build:firebase:staging` — passed; staging artifact built with the app
  CTA bound to `https://npq-landing-dev.web.app/`.
- `npm run check` — passed: `[site-release-check] passed`.
- `npm run check:firebase:staging` — passed: `Firebase company staging artifact
  is valid (71 files).`
- `bash tools/verify_no_secrets.sh` — passed: `forbidden secret path gate passed`.
- `git diff --check` — passed with no output.
- Local Firebase Hosting read-only smoke at `http://127.0.0.1:5000` returned HTTP
  200 for `/`, `/en`, `/en/problems`, `/en/careers`, `/en/ir`,
  `/en/problems/content-rights`, `/company-privacy`, and
  `/en/company-privacy`; HTML inspection verified locale-safe navigation,
  staging app CTA, depth-correct runtime config, and English intake forms.
- Real intake submission was not run because it writes external data and the local
  artifact intentionally reported `Public intake: disabled`.
- Verified implementation commit SHA:
  `d58e76f03a4bf140e695cba7f8a8d5edfe8bd71c`.

## Integration Order

1. Verify `company_homepage/session/npq-homepage` at `SELF` and read this handoff
   from that exact remote head.
2. Integrate the task commits ending at
   `d58e76f03a4bf140e695cba7f8a8d5edfe8bd71c` only into
   `integration/company-homepage-preview`.
3. Build the staging artifact with the approved
   `COMPANY_PUBLIC_INTAKE_API_BASE`, rerun both repository checks, and perform
   read-only route smoke checks.
4. Deploy only to Firebase Hosting target `npq-company-dev` after the platform
   preview release gate succeeds.

## Operational Actions

- The local Firebase Hosting emulator remains a non-production preview only.
- Platform must supply the approved isolated public-intake API base during the
  staging build if form submission is to be tested.
- Before production, the intake owner must establish and evidence deletion that
  matches the disclosed one-year retention period, then obtain legal-content and
  company-publication approval.
- No deployment, IAM, traffic, database write, legal publication, PR creation, or
  `main` merge is performed by this handoff.

## Approval Boundaries

- Company homepage integration targets only
  `integration/company-homepage-preview`; any `main` merge or production
  publication requires separate explicit approval.
- The company privacy pages are review drafts until approved and published through
  the company preview/release process. They do not publish or replace app legal
  documents in Studio CMS.
- Real IR or Open Problems submission creates external records and requires a
  separately approved smoke-data procedure.

## Stop Conditions

- Stop if the exact remote session head differs from `SELF`, the worktree is
  dirty, the upstream is missing, or this handoff is absent from the remote head.
- Stop if integration targets company homepage `main` rather than the preview
  branch, or if any build, release, route, or secret check fails.
- Stop production publication until the one-year deletion operation and legal
  review are evidenced, and until `naepopquiz.com` DNS/TLS is ready.
- Stop form testing when the isolated intake base is absent or an actual submission
  has not been approved.

## Rollback

- Revert the task commits with normal reviewed revert commits on the preview lane;
  do not reset or force-push shared branches.
- For Firebase staging, redeploy the previously verified
  `npq-company-dev` Hosting version and recheck crawler-blocking headers and the
  release manifest.
- A company privacy rollback must also remove or disable the related public intake
  forms so the site does not collect information without an applicable notice.

## Propagation

- Platform may propagate this exact task only to the registered
  `company_homepage` preview integration lane after exact-head verification.
- Do not propagate it to company homepage `main`, server, app, Studio, app
  homepage, web contract, word DB, control plane, or unrelated session branches.
- If the preview branch advances first, re-inspect ancestry and rerun validation;
  never overwrite or force-update the other work.

## Git Closeout

- `company_homepage`: local HEAD `SELF`; remote HEAD `SELF`; branch
  `session/npq-homepage`; worktree clean after handoff commit; upstream
  `origin/session/npq-homepage`; handoff included at the exact remote head.
- Push result: non-force push to the registered session branch only. No force push
  is used, and no unrelated or user-owned changes are staged.

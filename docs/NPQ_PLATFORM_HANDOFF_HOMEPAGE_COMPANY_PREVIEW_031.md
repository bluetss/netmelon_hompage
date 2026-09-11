# NPQ-PLATFORM Handoff

- Task ID: `HOMEPAGE-COMPANY-PREVIEW-031`
- Owner session: `npq_homepage`
- Handoff status: `READY`

## Components

| Repository | Branch | Exact remote head | PR |
| --- | --- | --- | --- |
| company_homepage | session/npq-homepage | SELF | none |

The unchanged integration baseline is
`integration/company-homepage-preview` at
`6d5e4e564d2c70dd0be853e796e0ca0631491f71`. It already contains implementation
commit `061fbc9bbe766190ce71d6c72e828d9fc7f0011e`. The unchanged production
baseline is `main` at `491723d5f487eaabc8f98cd8c9af8f89beb6b96c`; production publication is not
part of this handoff.

## Changes

- Added the static Korean and English company surfaces, shared site shell, company
  source injection, announcements, careers, and problem-centered collaboration
  pages.
- Added CMS snapshot/fetch/generation support for Company Source, company assets,
  announcements, Open Problems, English review content, and the shared Publisher
  Legal Profile without exposing administrator-only data.
- Added Firebase Hosting staging assembly and validation for `npq-company-dev`,
  including crawler blocking, cache-control and security headers, and explicit
  public-intake runtime configuration.
- Connected IR and Open Problems forms to the isolated public-intake service when
  `COMPANY_PUBLIC_INTAKE_API_BASE` is supplied. The build remains fail-closed for
  invalid non-HTTPS values.
- Preserved the company-homepage publication boundary: routine integration targets
  `integration/company-homepage-preview`, not `main`.

## Documentation Updates

- `README.md`: documents the static build, CMS snapshot inputs, English review
  flow, and Firebase staging commands.
- `docs/company-source-build.md`: documents Company Source, asset, announcement,
  Open Problems, Publisher Legal Profile, English review, and public-intake build
  contracts.
- `docs/COMPANY_WEBSITE_RELEASE_POLICY.md`: records the preview Hosting target,
  environment separation, release order, headers, rollback, and production
  approval boundary.
- `docs/NPQ_PLATFORM_HANDOFF_HOMEPAGE_COMPANY_PREVIEW_031.md`: supplies this
  canonical task handoff required for platform integration.
- Generated public pages and CMS snapshots are produced by the repository scripts;
  the validation build command is
  `COMPANY_PUBLIC_INTAKE_API_BASE=https://npq-public-intake-dwg6e75nqq-uc.a.run.app npm run build:firebase:staging`.
  No server schema, API reference, or database schema document changed because this
  component consumes existing public HTTP projections and remains a static site.

## Validation

- `bash tools/verify_no_secrets.sh` — passed: `forbidden secret path gate passed`.
- `npm run check` — passed all JavaScript syntax checks and
  `[site-release-check] passed`.
- `COMPANY_PUBLIC_INTAKE_API_BASE=https://npq-public-intake-dwg6e75nqq-uc.a.run.app npm run build:firebase:staging`
  — passed and produced the staging `dist/` artifact.
- `COMPANY_PUBLIC_INTAKE_API_BASE=https://npq-public-intake-dwg6e75nqq-uc.a.run.app npm run check:firebase:staging`
  — passed: `Firebase company staging artifact is valid (60 files)`.
- `git diff --check` — passed with no output.
- Post-deployment read-only smoke on `https://npq-company-dev.web.app` verified the
  release manifest, runtime API injection, unique form API binding, nine Korean and
  English routes returning HTTP 200, staging security headers, and HTTP 200 CORS
  preflight for `/web-cms/public/company-open-problem-proposals` and `/ir/requests`.
- Implementation validation commit SHA:
  `061fbc9bbe766190ce71d6c72e828d9fc7f0011e`. Final handoff validation commit SHA:
  `SELF`, resolved by the platform verifier to the exact pushed remote head; the
  final commit changes only this handoff document.

## Integration Order

1. Verify `company_homepage/session/npq-homepage` at `SELF` and read this handoff
   from that exact remote head.
2. Confirm implementation commit `061fbc9bbe766190ce71d6c72e828d9fc7f0011e`
   remains an ancestor of `integration/company-homepage-preview`.
3. Integrate only any remaining handoff delta into
   `integration/company-homepage-preview`; do not target company homepage `main`.
4. Re-run the repository validation commands at the resulting preview head before
   any later Hosting release.

## Operational Actions

- Prior approved staging action: Firebase Hosting site `npq-company-dev` was
  released from preview commit `6d5e4e564d2c70dd0be853e796e0ca0631491f71`
  with `COMPANY_PUBLIC_INTAKE_API_BASE` configured, then verified read-only.
- No deployment, migration, IAM, traffic, signing, database write, legal-document
  publication, PR creation, or `main` merge is performed by this closeout.

## Approval Boundaries

- Any company homepage `main` merge or public production publication requires the
  separate company-publication approval and exact-SHA flow.
- Legal drafts, English Open Problems, or legal documents must not be treated as
  published solely because static preview pages exist. Review, approval, and CMS
  publication remain separate authorized actions.
- Real IR or Open Problems form submission creates external data and requires an
  explicitly approved smoke-data procedure; CORS preflight alone is non-mutating.

## Stop Conditions

- Stop if the remote `session/npq-homepage` head differs from `SELF`, the worktree
  is dirty, the upstream is missing, or this handoff is absent from the exact
  remote head.
- Stop if `061fbc9bbe766190ce71d6c72e828d9fc7f0011e` is no longer an ancestor of
  the preview branch, or if integration would target company homepage `main`.
- Stop a staging release if the release manifest is dirty/unknown, reports
  `publicIntakeConfigured=false`, points to another Hosting site, or any required
  validation fails.
- Stop publication when legal/CMS approval evidence is incomplete or a public
  projection returns an unexpected lifecycle state.

## Rollback

- For Git integration, revert the task or handoff commit on the preview branch with
  a normal reviewed revert; do not reset or force-push shared branches.
- For Firebase staging, release the previously verified Hosting version for
  `npq-company-dev`, then confirm the release manifest, crawler-blocking headers,
  and form configuration. Do not use this staging rollback as production approval.
- CMS source and legal publication rollback remains owned by the corresponding CMS
  lifecycle and is not performed by static Hosting rollback.

## Propagation

- Platform may propagate the verified result only to the registered
  `company_homepage` preview integration lane after exact-head verification.
- Do not propagate this task to `company_homepage/main`, unrelated session
  branches, server, app, Studio, app homepage, web contract, word DB, or control
  plane as dependency baselines have no task delta here.
- If another session changes the preview head first, re-inspect ancestry and rerun
  validation instead of overwriting or force-updating that work.

## Git Closeout

- `company_homepage`: local HEAD `SELF`; remote HEAD `SELF`; branch
  `session/npq-homepage`; worktree clean after commit; upstream
  `origin/session/npq-homepage`; handoff included at the exact remote head.
- Push result: non-force push to the registered `company_homepage` session branch
  only. No force push was used. No unrelated or user-owned changes were staged.

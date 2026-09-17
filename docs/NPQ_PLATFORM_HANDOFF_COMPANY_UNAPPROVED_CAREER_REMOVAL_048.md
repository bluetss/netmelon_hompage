# NPQ-PLATFORM Handoff

- Task ID: `COMPANY-UNAPPROVED-CAREER-REMOVAL-048`
- Owner session: `npq_homepage`
- Handoff status: `READY`

## Components

| Repository | Branch | Exact remote head | PR |
| --- | --- | --- | --- |
| company_homepage | session/npq-homepage | SELF | none |

## Changes

- Removes the unapproved `Founding Conversation Learning Scientist` review
  role from Korean and English career snapshots and generated career pages.
- Removes that role's Korean and English Open Problems CTA mapping while
  preserving the approved `Founding Growth & Creator Partnerships` review role
  and its `paid-learner-growth` and `creator-supply` links.
- Adds fail-closed release assertions so the removed role cannot reappear in
  either locale's career or Open Problems output without an intentional source
  and gate change.

## Documentation Updates

- `README.md`: clarifies that `closed` is only a lifecycle state and does not
  constitute review approval; unapproved roles must be absent from snapshots,
  generated pages, and problem mappings.
- Generated Korean and English HTML was refreshed with the repository build
  commands recorded below. No shared design-system or schema document changed
  because this task removes one unapproved content record without changing the
  content model.

## Validation

- `PATH=/home/seungwoo/actions-runner/externals/node24/bin:$PATH npm run check`
  — PASS; JavaScript syntax and site release checks passed.
- `PATH=/home/seungwoo/actions-runner/externals/node24/bin:$PATH npm run
  preview:staging:check` — PASS; Firebase staging artifact contains 76 valid
  files and the release checks passed.
- `bash tools/verify_no_secrets.sh` — PASS.
- `git diff --check` — PASS.
- Explicit `rg` absence gate across career snapshots, KO/EN career output,
  KO/EN Open Problems lists, and detail directories — PASS.
- Windows Chrome headless visual review — PASS: English Careers shows exactly
  one review role; English Open Problems retains the shared layout without the
  removed position link.
- Validation commit SHA: `SELF`. The handoff-only successor does not change
  runtime output.

## Integration Order

1. Integrate `company_homepage` into the company preview integration flow.
2. Rebuild the staging artifact and review Careers/Open Problems before any
   preview deployment.

## Operational Actions

- None performed. Local staging-equivalent artifacts and screenshots were
  generated, but no hosting deployment, CMS mutation, traffic change, or
  production action occurred.

## Approval Boundaries

- Company staging deployment remains a separate approved preview action.
- Production publication and any future addition of a career role require
  explicit content approval and the existing company release gates.

## Stop Conditions

- Stop if the unapproved role reappears in any locale, generated page, or
  Open Problems link.
- Stop if the approved growth role disappears, release checks fail, the remote
  branch moves unexpectedly, or integration targets production rather than the
  company preview flow.

## Rollback

- Revert the scoped code commit and this handoff with new non-force commits if
  the removal itself is shown to be incorrect. Do not restore the role without
  explicit approval.

## Propagation

- Platform may propagate only from the exact pushed company homepage owner
  head and only through the separate company preview integration flow.
- App landing experiment work remains on
  `experiment/app-landing-layout-abc` and is not a component of this task.

## Git Closeout

- `company_homepage`: local HEAD `SELF`; remote HEAD `SELF`; branch
  `session/npq-homepage`; upstream `origin/session/npq-homepage`; clean after
  the handoff commit; non-force push required and used.
- No reset, clean, stash, rebase, or force push was used.

# NPQ-PLATFORM Handoff

- Task ID: `COMPANY-PROBLEM-CAREER-PREVIEW-042`
- Owner session: `npq_homepage`
- Handoff status: `READY`

## Components

| Repository | Branch | Exact remote head | PR |
| --- | --- | --- | --- |
| company_homepage | session/npq-homepage | SELF | none |

Unchanged dependency baseline: company preview integration branch
`5fc4197ec53cb74645cc54ba808818ace2a4be7d`.

## Changes

- Extended the review-only linked-career visibility gate from the company staging
  hostname to `localhost` and `127.0.0.1` Firebase Emulator hosts.
- Kept closed/review career links hidden on production and all unknown hosts.
- Added release assertions for all three allowed preview hosts and the closed-link
  selector.

## Documentation Updates

- `README.md`: records that closed career links connected to Open Problems are
  visible only on the company staging site and local Emulator hosts.
- No API, schema, CMS data, legal text, or telemetry contract changed.
- No generator command was required for the source change.

## Validation

- `npm run check` passed with `[site-release-check] passed`.
- `npm run preview:staging:check` passed: 71-file Firebase staging artifact,
  release check, and forbidden-secret-path gate.
- Node syntax checks passed for `scripts/problem-intake.js` and
  `scripts/check-site-release.mjs`.
- `git diff --check` passed before the implementation commit.
- Local integration inspection verified the two career mappings exist for
  `consumer-marketplace-growth` and `learning-content-lead`; the linked roles are
  `Founding Growth & Creator Partnerships` and
  `Founding Conversation Learning Scientist`.
- Verified implementation SHA:
  `848294c26fd613ff36ecd27c062a30c23de884f4`.

## Integration Order

1. Integrate `848294c26fd613ff36ecd27c062a30c23de884f4` into
   `integration/company-homepage-preview` with the pending homepage preview work.
2. Regenerate the company site and staging artifact.
3. Run `npm run preview:staging:check`.
4. Start `npm run preview:staging` and verify both mapped links at `/problems`.

## Operational Actions

- Only local build and Emulator verification is authorized by this handoff.
- No staging deployment, CMS write, database mutation, production action, main
  merge, or traffic change occurred.

## Approval Boundaries

- Platform owns preview-branch integration and company staging deployment.
- Opening either closed role publicly requires HR approval and a status change to
  `open`; this preview visibility change is not publication approval.

## Stop Conditions

- Stop if a closed role is visible on production or an unknown hostname, either
  mapped preview link is absent on localhost/staging, or branch integration drops
  the HR mappings.

## Rollback

- Revert through a normal reviewed revert commit; never reset or force-push.
- Stopping the Emulator removes the only immediate runtime effect.

## Propagation

- Propagate only through `integration/company-homepage-preview`.
- Do not propagate to app homepage, server, Studio, app, web contract, word DB,
  control plane, main, or production.

## Git Closeout

- `company_homepage`: branch `session/npq-homepage`, exact remote head `SELF`,
  clean after handoff commit, upstream equality verified, non-force push.
- No unrelated or user-owned changes were staged or rewritten.

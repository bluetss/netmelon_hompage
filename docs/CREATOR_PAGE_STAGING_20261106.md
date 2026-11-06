# Creator page staging — 2026-11-06

- Implementation: `9ed9edcb899f2868b7d890854ddb034d6e1f842e`.
- Preview integration: `4a369a99ea851b4a835a1382af838a3c9e3ea4f4`, PR https://github.com/bluetss/netmelon_hompage/pull/32. Production branch unchanged.
- Routes: `https://company-dev.netmelonai.com/creators`, `/en/creators`. Korean/English global navigation includes the creator destination.
- Existing materials, multilingual support, shadowing/quiz, room assignments/monitoring, channel management/subscriptions, external promotional links, latest announcements on historical public content, and NPQ channel ownership transfer are explained. The announcement diagram is labelled illustrative.
- Existing Studio CTA resolves to `https://app-dev.naepopquiz.com/studio`; partnership contact uses the existing public company email. No new submission backend, marketing consent, tracker, analytics event, entitlement grant or remote product mutation.

## Verification

- `npm run build`, `npm run check`, `bash tools/verify_no_secrets.sh`, `git diff --check`: PASS.
- `npm run build:firebase:staging` and `npm run check:firebase:staging`: PASS, 94 public files.
- Session-owned Windows Chrome, locally built staging artifact: Korean/English at 390/1440px PASS; eight sections, one creator menu entry, mobile menu expansion, Studio URLs, four FAQ disclosures, no horizontal overflow. Desktop/mobile screenshots inspected. Uses existing Windows Chrome, no Linux browser fallback.
- Official `npq owner-operation run --repo company_homepage --adapter tools/deploy_company_staging.py --phase deploy --environment staging`: COMPLETED, source `4a369a99ea851b4a835a1382af838a3c9e3ea4f4`. Hosting `npq-company-dev` only. Cloud Build submissions 0, Server deployments 0.
- Deployed Hosting reads: `/creators`, `/en/creators`, `/`, `/en/`, `/release-manifest.json` HTTP200; creator menus, staging Studio links and X-Robots-Tag noindex verified. Manifest exact source matches, sourceDirty=false.
- Deployed custom-domain Windows Chrome smoke: Korean/English at 390/1440px PASS, same menu/Studio/sections/FAQ/overflow checks as local. Owned temporary inspection tab closed; existing session tabs and login preserved.
- Predecessor source was `c8350b544943f7383e1028be13e023a840439095`, preserved in ancestry. Existing public intake disabled state preserved.

Runtime learning, purchases, channel transfers and email delivery were not executed by this static page change.

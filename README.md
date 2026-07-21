# Netmelon company homepage

This repository deploys the Netmelon company site for `netmelonai.com`.

## Role

- Company introduction
- Product summaries for Naepopquiz App and Naepopquiz Studio
- Careers
- IR request flow
- Company announcements

Canonical app install, support, privacy, terms, subscription, and account/data deletion pages belong to `naepopquiz.com`, not this company site.

The company site policy is governed by the shared web-system source of truth at `/home/seungwoo/myworks/dev/npq_web_system/content-model/corporate-source-policy.md`. Use that document before changing IA, Studio Web CMS ownership, common/site-specific content boundaries, header, footer, page ownership, localization exposure, or release checks.

The company site footer must not link to app-facing privacy, terms, subscription, refund, account deletion, or data deletion routes. It should also not duplicate the global header navigation; keep it minimal unless a company-specific legal notice is created.

The company site header and footer shell is shared through `partials/site-header.html`, `partials/site-footer.html`, `partials/site-shell-script.html`, `styles/site-shell.css`, and `scripts/site-shell.js`. Page-level files must not redefine shared header, navigation, brand, mobile menu, download menu, footer, footer-row, or shell menu behavior.

The global company header exposes company introduction, product introduction, careers, IR, and company announcements. Company announcements live on `announcement.html` and generated `announcements/{slug}.html` detail pages.

## Shared system

The shared web-system source of truth is:

```text
/home/seungwoo/myworks/dev/npq_web_system
```

Use it for design-system policy, site architecture, route ownership, content model, SEO, localization, legal routes, analytics, security, and release checklists. The company site should not keep separate local copies of shared policy documents such as `DESIGN_SYSTEM.md`, `WEB_SYSTEM.md`, or `SITE_ARCHITECTURE.md`; the local `styles/design-system.css` file is a generated token output.

## Localization status

Korean pages are the canonical public pages. English pages under `en/` stay `noindex,nofollow` and are excluded from `sitemap.xml` until the English copy is reviewed and approved for publication.

## Environment config

Production HTML must not hard-code dev or staging API URLs.

- Build-time company source injection uses `data/company-source.ko.json` by default for reproducible local/static builds. Direct script runs may override it with `COMPANY_SOURCE_API_BASE` or `COMPANY_SOURCE_JSON_PATH`.
- CMS-driven company announcements can be fetched with `COMPANY_PUBLIC_ANNOUNCEMENTS_URL`, which writes `data/company-announcements.ko.json` before static generation.
- CMS-driven company Assets use `COMPANY_ASSETS_API_BASE` to fetch both `/company/assets-v2/public-manifest` and `/company/assets-v2/public-site-bindings`. The combined build snapshot is written to `data/company-assets.{locale}.json`.
- Instead of `COMPANY_ASSETS_API_BASE`, releases may set both `COMPANY_PUBLIC_ASSETS_URL` and `COMPANY_PUBLIC_ASSET_BINDINGS_URL` explicitly.
- Asset fetch overrides are `COMPANY_ASSETS_SITE_ID`, `COMPANY_ASSETS_LOCALE`, `COMPANY_ASSETS_JSON_PATH`, and optional `COMPANY_ASSETS_BEARER_TOKEN`.
- Set `COMPANY_ANNOUNCEMENTS_MIN_PUBLISHED=1` when a release is expected to contain at least one published company announcement. The build fails if the public snapshot is empty.
- Optional announcement fetch overrides:
  - `COMPANY_ANNOUNCEMENTS_JSON_PATH`: output path for the fetched snapshot.
  - `COMPANY_ANNOUNCEMENTS_BEARER_TOKEN`: bearer token for a protected snapshot endpoint.
- Runtime careers Firebase override uses `window.__NPQ_CAREERS_FIREBASE_CONFIG__` or `window.CompanySourceConfig.careersFirebaseConfig`.
- IR forms use `window.__NPQ_IR_API_BASE__` only when explicitly injected.

Production CMS-driven releases should use a published Company Source snapshot. The committed `data/company-source.ko.json` is the current published public snapshot used for local and GitHub Pages static builds.

## Commands

```bash
npm run build
npm run build:with-cms
npm run build:with-cms:require-announcement
npm run check
```

`npm run build` syncs the shared site shell, then regenerates `index.html`, `company.html`, `careers.html`, `announcement.html`, and generated company announcement detail pages from local snapshot files. It injects the published Asset binding snapshot when `data/company-assets.ko.json` exists and otherwise keeps the controlled template fallback. `npm run build:with-cms` first fetches Company Source, company announcements, the public Asset manifest, and public Site Asset Bindings, then runs the static build. `npm run build:with-cms:require-announcement` does the same but fails if the fetched public announcement snapshot has zero published announcements. `npm run check` also verifies manifest v2, exact purpose/variant resolution, disclosure, duplicate references, and final product screenshot order before deployment.

Company announcement CMS release example:

```bash
COMPANY_PUBLIC_ANNOUNCEMENTS_URL="https://your-api.example.com/company/public-announcements" \
npm run build:with-cms

COMPANY_PUBLIC_ANNOUNCEMENTS_URL="https://your-api.example.com/company/public-announcements" \
npm run build:with-cms:require-announcement

npm run check
```

Use `build:with-cms:require-announcement` after publishing a company announcement in Studio CMS. If it fails with an empty snapshot error, the problem is the publish/snapshot/API path, not the static page UI.

Company Asset release example:

```bash
COMPANY_SOURCE_API_BASE="https://your-api.example.com" \
COMPANY_ASSETS_API_BASE="https://your-api.example.com" \
COMPANY_PUBLIC_ANNOUNCEMENTS_URL="https://your-api.example.com/company/public-announcements" \
npm run build:with-cms

npm run check
```

Publishing an Asset only adds it to the reusable site manifest. The actual homepage order is published separately from Studio `홈페이지 관리 CMS > 회사 홈페이지 미디어 구성`.

GitHub Actions runs the same `npm run check` command on pushes to `main` and pull requests.

Local implementation details for Company Source build-time injection are documented in [docs/company-source-build.md](docs/company-source-build.md).

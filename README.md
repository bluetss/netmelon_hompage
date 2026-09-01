# Netmelon company homepage

This repository deploys the Netmelon company site for `netmelonai.com`.

All company-site changes are built and reviewed first on Firebase Hosting site
`npq-company-dev`. Do not change the GitHub Pages production site or its deployment
branch before explicit final approval. See
[the company website release policy](docs/COMPANY_WEBSITE_RELEASE_POLICY.md).

## Role

- Company introduction
- Product summaries for Naepopquiz App and Naepopquiz Studio
- Problem-centered collaboration
- IR request flow
- Company announcements

Canonical app install, support, privacy, terms, subscription, and account/data deletion pages belong to `naepopquiz.com`, not this company site.

The company site policy is governed by the shared web-system source of truth at `/home/seungwoo/myworks/dev/npq_web_system/content-model/corporate-source-policy.md`. Use that document before changing IA, Studio Web CMS ownership, common/site-specific content boundaries, header, footer, page ownership, localization exposure, or release checks.

The company site footer must not link to app-facing privacy, terms, subscription, refund, account deletion, or data deletion routes. It should also not duplicate the global header navigation; keep it minimal unless a company-specific legal notice is created.

The company site header and footer shell is shared through `partials/site-header.html`, `partials/site-footer.html`, `partials/site-shell-script.html`, `styles/site-shell.css`, and `scripts/site-shell.js`. Page-level files must not redefine shared header, navigation, brand, mobile menu, download menu, footer, footer-row, or shell menu behavior.

The global company header exposes company introduction, product introduction, open problems, IR, and company announcements. `problems.html` is the problem-centered collaboration surface. The former `careers.html`, `careers.template.html`, and `en/careers.html` remain archived for direct historical access, but builds, global navigation, and the sitemap must not modify or expose them. Company announcements live on `announcement.html` and generated `announcements/{slug}.html` detail pages.

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
- CMS-driven open problems use `COMPANY_PUBLIC_OPEN_PROBLEMS_URL` or `COMPANY_OPEN_PROBLEMS_API_BASE` to fetch `/web-cms/public/company-open-problems?locale=ko`, writing the published snapshot to `data/company-open-problems.ko.json`.
- CMS-driven company Assets use `COMPANY_ASSETS_API_BASE` to fetch both `/company/assets-v2/public-manifest` and `/company/assets-v2/public-site-bindings`. The combined build snapshot is written to `data/company-assets.{locale}.json`.
- Instead of `COMPANY_ASSETS_API_BASE`, releases may set both `COMPANY_PUBLIC_ASSETS_URL` and `COMPANY_PUBLIC_ASSET_BINDINGS_URL` explicitly.
- Asset fetch overrides are `COMPANY_ASSETS_SITE_ID`, `COMPANY_ASSETS_LOCALE`, `COMPANY_ASSETS_JSON_PATH`, and optional `COMPANY_ASSETS_BEARER_TOKEN`.
- Set `COMPANY_ANNOUNCEMENTS_MIN_PUBLISHED=1` when a release is expected to contain at least one published company announcement. The build fails if the public snapshot is empty.
- Optional announcement fetch overrides:
  - `COMPANY_ANNOUNCEMENTS_JSON_PATH`: output path for the fetched snapshot.
  - `COMPANY_ANNOUNCEMENTS_BEARER_TOKEN`: bearer token for a protected snapshot endpoint.
- Shared Publisher Legal Profile uses `PUBLISHER_PROFILE_API_BASE` or `PUBLISHER_PROFILE_PUBLIC_URL` to fetch `/web-cms/public/publisher-profile?publisherId=netmelon`. `PUBLISHER_PROFILE_JSON_PATH` overrides the build snapshot path and `PUBLISHER_PROFILE_BEARER_TOKEN` is available only when the public projection is protected.
- `data/publisher-legal-profile.json` is the current verified static public snapshot for reproducible local builds. It is not a second CMS editing source; `build:with-cms` replaces it with the published shared profile before the static build.
- The archived careers page retains its former runtime configuration for direct historical access only. New builds and public navigation do not depend on it.
- IR and open-problem forms prefer one explicitly injected `window.__NPQ_PUBLIC_INTAKE_API_BASE__`. `window.__NPQ_IR_API_BASE__` and `window.__NPQ_COMPANY_API_BASE__` remain compatibility overrides. Static problem generation uses `COMPANY_OPEN_PROBLEMS_INTAKE_API_BASE`; production cutover must point it at the dedicated max-instance-one public-intake service before the core POST routes are disabled.

Production CMS-driven releases should use a published Company Source snapshot. The committed `data/company-source.ko.json` is the current published public snapshot used for local and GitHub Pages static builds.

## Commands

```bash
npm run build
npm run build:with-cms
npm run build:with-cms:require-announcement
npm run check
```

`npm run build` syncs the shared site shell, then regenerates `index.html`, `company.html`, `problems.html`, `announcement.html`, and generated company announcement detail pages from local snapshot files. It does not rewrite the archived careers files. It injects the published Asset binding snapshot when `data/company-assets.ko.json` exists and otherwise keeps the controlled template fallback, then injects the shared Publisher Legal Profile into every company Footer. `npm run build:with-cms` first fetches Company Source, company announcements, open problems, the public Asset manifest, public Site Asset Bindings, and the published Publisher Legal Profile, then runs the static build. `npm run build:with-cms:require-announcement` does the same but fails if the fetched public announcement snapshot has zero published announcements. `npm run check` also verifies manifest v2, exact purpose/variant resolution, disclosure, duplicate references, final product screenshot order, and exact KO/EN Footer profile/version binding before deployment.

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
PUBLISHER_PROFILE_API_BASE="https://your-api.example.com" \
COMPANY_PUBLIC_ANNOUNCEMENTS_URL="https://your-api.example.com/company/public-announcements" \
npm run build:with-cms

npm run check
```

Publishing an Asset only adds it to the reusable site manifest. The actual homepage order is published separately from Studio `홈페이지 관리 CMS > 회사 홈페이지 미디어 구성`.

GitHub Actions runs the same `npm run check` command on pushes to `main` and pull requests.

Local implementation details for Company Source build-time injection are documented in [docs/company-source-build.md](docs/company-source-build.md).

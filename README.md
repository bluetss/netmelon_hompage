# Netmelon company homepage

This repository deploys the Netmelon company site for `netmelonai.com`.

All company-site changes are built and reviewed first on Firebase Hosting site
`npq-company-dev`. Do not change the GitHub Pages production site or its deployment
branch before explicit final approval. See
[the company website release policy](docs/COMPANY_WEBSITE_RELEASE_POLICY.md).

로컬에서도 Firebase Hosting의 `cleanUrls`, trailing-slash, header 규칙을 동일하게
검증한다. 단순 파일 서버 대신 다음 명령을 사용한다.

```bash
# 제출 API를 호출하지 않는 안전한 UI·라우팅 미리보기
npm run preview:staging

# staging 공개 인입 API까지 연결하는 미리보기
COMPANY_PUBLIC_INTAKE_API_BASE=https://<approved-staging-public-intake> \
  npm run preview:staging:api
```

두 모드 모두 `http://127.0.0.1:4174`에서 `/problems`, `/careers` 같은 실제
확장자 없는 경로를 제공한다. `preview:staging:api`는 승인된 staging HTTPS 주소가
없으면 fail-closed하며 production API나 비밀 값을 기본값으로 사용하지 않는다.
명시적으로 검토 승인을 받은 `closed` 상태 채용 공고와 Open Problems 연결만
`company-dev.netmelonai.com`, Firebase Preview channel, `localhost`, `127.0.0.1`에서 표시한다. `closed` 상태 자체는
검토 승인을 의미하지 않으며, 승인되지 않은 공고는 locale별 snapshot과 생성 페이지,
문제 연결에서 모두 제외한다. production에서는 모든 `closed` 공고를 숨긴다.

세션 Preview용 Firebase 산출물은 검증할 정확한 커밋을 40자리 SHA로 명시한다.
이는 관리형 실행 환경에서 빌드 프로세스의 `git` 호출이 제한되더라도 릴리스
매니페스트가 검증 대상을 잃지 않게 한다.

```bash
COMPANY_SOURCE_COMMIT=<exact-40-character-git-sha> \
COMPANY_PUBLIC_INTAKE_API_BASE=https://<approved-staging-public-intake> \
COMPANY_APP_LANDING_ORIGIN=https://npq-landing-dev--<preview-channel>.web.app \
npm run build:firebase:staging
```

## Role

- Company introduction
- Product summaries for Naepopquiz App and Naepopquiz Studio
- Problem-centered collaboration
- IR request flow
- Company announcements

Canonical app install, support, terms, subscription, and account/data deletion pages belong to `naepopquiz.com`, not this company site. The company site exposes only the privacy-policy entry needed beside its own IR, recruiting, and Open Problems collection surfaces; it does not duplicate the app terms set.

The company site policy is governed by the shared web-system source of truth at `/home/seungwoo/myworks/dev/npq_web_system/content-model/corporate-source-policy.md`. Use that document before changing IA, Studio Web CMS ownership, common/site-specific content boundaries, header, footer, page ownership, localization exposure, or release checks.

The company site footer must not link to app-facing terms, subscription, refund, account deletion, or data deletion routes. It exposes one privacy-policy entry for company-site collection surfaces and must not duplicate the global header navigation.

`company-privacy.html` and `en/company-privacy.html` are the company-site intake notice, separate from the app privacy policy. Their one-year retention statement is a production stop condition: the intake owner must operate and evidence matching deletion before production publication.

The company site header and footer shell is shared through `partials/site-header.html`, `partials/site-footer.html`, `partials/site-shell-script.html`, `styles/site-shell.css`, and `scripts/site-shell.js`. Page-level files must not redefine shared header, navigation, brand, mobile menu, download menu, footer, footer-row, or shell menu behavior.

The global company header exposes company introduction, product introduction, open problems, careers, IR, and company announcements. `problems.html` is the problem-centered collaboration surface. English navigation uses root-relative `/en/...` routes so Firebase clean URLs cannot resolve links back into the Korean root. Company announcements live on `announcement.html` and generated `announcements/{slug}.html` detail pages.

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
- Careers remains a public navigation surface. The English build preserves its list/filter, privacy, and hiring-process structure while showing an explicit empty state until reviewed English openings are published.
- IR and open-problem forms prefer one explicitly injected `window.__NPQ_PUBLIC_INTAKE_API_BASE__`. `window.__NPQ_IR_API_BASE__` and `window.__NPQ_COMPANY_API_BASE__` remain compatibility overrides. Static problem generation uses `COMPANY_OPEN_PROBLEMS_INTAKE_API_BASE`; production cutover must point it at the dedicated max-instance-one public-intake service before the core POST routes are disabled.
- Firebase staging builds replace links marked with `data-app-homepage-link` with `https://app-dev.naepopquiz.com/`. A session review build may set `COMPANY_APP_LANDING_ORIGIN` only to that staging custom domain or one of its Firebase Preview channel origins so the company and app reviews remain linked without changing either live channel. Production source keeps the canonical `https://naepopquiz.com/` target; production deployment must wait for its DNS and TLS readiness.

Production CMS-driven releases should use a published Company Source snapshot. The committed `data/company-source.ko.json` is the current published public snapshot used for local and GitHub Pages static builds.

## Commands

```bash
npm run build
npm run build:with-cms
npm run build:with-cms:require-announcement
npm run check
```

`npm run build` syncs the shared site shell, then regenerates the Korean source-backed pages and detail pages. `npm run build:english` regenerates English home, company, careers, IR, announcements, and published Open Problems pages. `npm run build:english:review-open-problems` is the explicit non-indexed preview path for the reviewed English draft snapshot. The release check verifies locale-safe navigation, the environment-aware app CTA, English Careers/IR/Open Problems functional structure, and exact KO/EN Footer profile/version binding.

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

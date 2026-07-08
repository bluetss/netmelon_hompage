# Netmelon site architecture

This repository is part of a three-site structure:

```text
Netmelon company site
  netmelonai.com
    - Company introduction, product introduction, careers, IR, notices
    - Official publisher and corporate information for Netmelon

Naepopquiz app site
  naepopquiz.com
    - App install links and app-store compliance pages
    - Privacy policy, terms, account/data deletion, support/contact information
    - Published by Netmelon

Naepopquiz Studio
  studio.naepopquiz.com
    - Content production and operation tool for Naepopquiz App
    - Creates and manages learning content used by the app
```

## Site ownership

| Site | Domain | Local project | Recommended hosting | Role |
| --- | --- | --- | --- | --- |
| Company | `netmelonai.com` | `~/myworks/dev/netmelon_hompage` | GitHub Pages | Company, products, careers, IR, notices |
| App | `naepopquiz.com` | `~/myworks/dev/naepopquiz_hompage` | Firebase Hosting | Install, app policy, app-store compliance pages |
| Studio | `studio.naepopquiz.com` | `~/myworks/dev/naepopquiz_studio` | Firebase Hosting | App content production and operations tool |

The source of truth for the app homepage is `~/myworks/dev/naepopquiz_hompage`.
Do not keep app homepage source files inside the company homepage project.

## Brand hierarchy

The domains are separate, so the hierarchy is expressed through content, navigation, footer links, and structured data:

- `netmelonai.com` is the parent company and publisher entity.
- `naepopquiz.com` is the official app-support homepage for the Naepopquiz mobile app.
- `studio.naepopquiz.com` is the internal/product operations tool that produces content for the Naepopquiz app.
- Company pages should introduce Netmelon, its products, hiring, IR, and notices.
- Company product sections should link to the app homepage and Studio when users need product-specific details.
- App pages should identify Netmelon as publisher and link back to `netmelonai.com`.
- Studio pages should identify Netmelon as operator/publisher and should not be treated as the main app marketing site.

## Site responsibilities

### `netmelonai.com`

Use the company site for:

- Company introduction and official company profile
- Product introduction for Naepopquiz App and Naepopquiz Studio
- Careers and open roles
- IR information and IR request flows
- Notices and public announcements
- Publisher identity and official company contact channels

### `naepopquiz.com`

Use the app homepage for:

- App Store and Google Play install links
- App screenshots and basic app description required for users and reviewers
- Privacy policy
- Terms of service
- Account and data deletion guidance
- Support/contact information required by app stores and platform review

This site should stay focused on app distribution, app trust, and app-store compliance. Company-level content should link back to `netmelonai.com`.

### `studio.naepopquiz.com`

Use Studio for:

- Producing and editing learning content used by Naepopquiz App
- Managing app content operations
- Supporting internal or authorized workflows for content creation

Studio is not the primary company homepage and not the primary app install/support homepage.

## SEO rules

- Each site owns its own canonical URLs.
- Use `hreflang` only between equivalent language pages on the same site.
  - `https://netmelonai.com/` <-> `https://netmelonai.com/en/`
  - `https://naepopquiz.com/` <-> `https://naepopquiz.com/en/`
  - `https://studio.naepopquiz.com/` <-> `https://studio.naepopquiz.com/en/` if Studio has a public English landing page.
- Do not duplicate full app policy/support content on `netmelonai.com`; keep app-store compliance pages on `naepopquiz.com`.
- Do not duplicate Studio operational UI documentation on `netmelonai.com`; keep company-site Studio content as a product summary.
- `Organization` structured data belongs on `netmelonai.com`.
- `SoftwareApplication` or `MobileApplication` structured data belongs on `naepopquiz.com`.
- `WebApplication` or `SoftwareApplication` structured data belongs on `studio.naepopquiz.com` if Studio has public indexable pages.

## Firebase hosting targets

Production Firebase project:

```text
Project: naepopquiz
  Hosting target app    -> naepopquiz.com
  Hosting target studio -> studio.naepopquiz.com
```

Staging Firebase project:

```text
Project: npq-staging
  Hosting target app    -> app-dev.naepopquiz.com or Firebase preview channels
  Hosting target studio -> studio-dev.naepopquiz.com or Firebase preview channels
```

Firebase config should use deploy targets instead of hard-coded site IDs in app and Studio projects, so the same config can deploy to staging or production safely.

## Deployment policy

- `netmelonai.com`: deploy company-only files from the company repository to GitHub Pages.
- `naepopquiz.com`: deploy the app site from the app project to Firebase Hosting.
- `studio.naepopquiz.com`: build the Studio Vite app and deploy `dist` to Firebase Hosting.
- Production deploys should happen from a protected branch or release tag.
- Pull requests should use Firebase Hosting preview channels for app and Studio when possible.

## Implementation sequence

Build and clean up the public sites in this order:

1. `netmelonai.com` company site
   - Establish the parent brand, company profile, product summaries, careers, IR, notices, and official contact routes first.
   - Product sections should link users to `naepopquiz.com` and `studio.naepopquiz.com` instead of operating as full app landing or support pages.
   - App Store and Google Play direct-install promotion should be secondary on the company site and primary on `naepopquiz.com`.
2. `naepopquiz.com` app landing and support site
   - Move app install, screenshots, subscription, support, privacy, terms, refund guidance, and account/data deletion flows into the app site as the canonical app-facing location.
   - Align App Store Connect and Google Play Console URLs with the app site before app submission or major metadata updates.
3. `studio.naepopquiz.com` Studio entry
   - Keep Studio focused on authenticated content production and operations.
   - Public Studio pages should explain the product only at a high level and should route access through paid subscriber entitlement checks.

## Design system policy

The Naepopquiz app design system is the source of truth for shared brand and product UI tokens.

Source of truth:

```text
~/myworks/dev/naepopquiz_app/application/lib/utils/design_system.dart
```

Shared website token output:

```text
netmelon_hompage/styles/design-system.css
```

Operational guide:

```text
~/myworks/dev/npq_web_system/design/DESIGN_SYSTEM.md
```

Sync command from the company homepage repository:

```bash
node scripts/sync-design-system-css.mjs
```

Rules:

- Do not create independent primary colors, surface colors, text colors, button radius, card radius, or elevation systems in company, app landing, or Studio sites.
- App tokens in `design_system.dart` should be mapped to web CSS variables under the `--npq-*` namespace.
- Website CSS files may define local aliases such as `--primary`, `--surface`, or `--career-primary`, but those aliases should point back to `--npq-*` tokens.
- Site-specific layouts, sections, and marketing composition may differ by domain, but foundational tokens should remain shared.
- When `design_system.dart` changes, regenerate website tokens and review company homepage, app landing, and Studio UI together.
- The app landing site and Studio should adopt the same generated token file or an equivalent generated package before public launch.

## Shared web system policy

Design tokens only cover the visual foundation. The three-site system also needs shared structural rules for routes, content models, page templates, metadata, legal routes, localization, analytics, and release governance.

Operational guide:

```text
~/myworks/dev/npq_web_system/README.md
```

Shared structures:

- IA and URL registry
- Content model
- Page templates
- SEO and metadata schema
- Legal and policy route registry
- Korean-first localization matrix
- Analytics event taxonomy
- Security policy and security release checks
- Release and governance checklist

Rules:

- Create or update the route inventory before adding public pages.
- Use the same content model for repeated page types across the company site, app landing site, and Studio.
- Keep canonical app policy and support pages on `naepopquiz.com`.
- Keep corporate, careers, IR, and notices pages on `netmelonai.com`.
- Keep private Studio operational routes authenticated and non-indexable.
- Apply shared security policy before launching private Studio routes, admin routes, paid entitlement, Firebase data access, or production analytics.
- Review localization, app-store metadata, legal routes, analytics events, and release checklist items together when public claims or product behavior change.

## Homepage operations policy

The homepage system should be operated as three separate products with explicit responsibilities, not as one mixed website.

### Operating principles

- Keep corporate trust content on `netmelonai.com`.
- Keep app install, support, and app-store compliance content on `naepopquiz.com`.
- Keep content production and operational workflows on `studio.naepopquiz.com`.
- Treat `naepopquiz.com` as the official landing and support site for the mobile app.
- Do not copy the same policy pages across domains. Link to the canonical page instead.
- When app behavior changes, review the app homepage, App Store metadata, Google Play Data safety form, privacy policy, terms, and in-app disclosures together.
- Keep Korean and English pages structurally equivalent where both languages exist.

### `netmelonai.com` operating policy

The company site should optimize for corporate credibility and stakeholder communication.

Required content:

- Company overview
- Product summaries for Naepopquiz App and Naepopquiz Studio
- Careers information
- IR information or IR contact flow
- Notices and public announcements
- Official company contact and publisher identity
- Links to `naepopquiz.com` for app install/support/policy details
- Links to `studio.naepopquiz.com` only where Studio is introduced as a product or operating system

Avoid:

- Full copies of app privacy, terms, or account deletion pages
- Store-review-specific content that belongs on `naepopquiz.com`
- Studio workflow documentation that belongs in the Studio product

### `naepopquiz.com` operating policy

The app site should optimize for app installation, user trust, app-store review, and platform compliance.

Required content:

- App Store install link
- Google Play install link
- Official App Store and Google Play badges, used according to each platform's badge guidelines
- App screenshots or preview images that match the current app experience
- Short app description for users and reviewers
- Privacy policy
- Terms of service
- Account deletion guidance
- Data deletion guidance
- Support/contact information
- Publisher/operator link back to `netmelonai.com`

Policy requirements:

- The privacy policy URL submitted to App Store Connect and Google Play Console should point to this site.
- The support URL submitted to App Store Connect should point to this site.
- The Google Play account deletion web URL should point to a public page on this site if the app supports account creation.
- Privacy policy, app-store metadata, Google Play Data safety answers, and in-app disclosures must describe the same data collection and usage behavior.
- Policy pages must be publicly accessible without login, geofencing, or PDF-only delivery.

Avoid:

- Corporate IR, recruiting, and notice content that belongs on `netmelonai.com`
- Studio product operations content
- Marketing claims that are not reflected in the current released app

### `studio.naepopquiz.com` operating policy

Studio should optimize for content production and app operations.

Required content:

- Sign-in or access-controlled entry when the Studio is not public
- Clear product identity as Naepopquiz Studio
- Netmelon operator/publisher identity
- Links to `netmelonai.com` for company information
- Links to `naepopquiz.com` when users need app-facing policy or support information
- Clear notice that Studio access is available only to users with an active paid Naepopquiz subscription

Avoid:

- Treating Studio as the main public app landing site
- Duplicating app install and app-store compliance pages
- Indexing private operational screens

## Korea legal compliance policy

This section is an operating checklist for Korean law and platform policy alignment. It is not a substitute for legal counsel, but homepage content should be drafted to satisfy these constraints by default.

### Baseline compliance

- Keep the official company identity, business contact, privacy policy, terms, support contact, and data deletion routes easy to find.
- Any form that collects personal information must have a collection notice that states purpose, collected items, retention period, and whether consent is required or optional.
- Optional consents must be separated from required consents.
- Marketing consent must be separated from service terms and privacy consent.
- If personal data is processed by vendors such as Firebase, Google, Apple, analytics providers, email providers, or customer support tools, disclose the processing delegation in the privacy policy.
- If personal data is transferred, stored, or accessed outside Korea, disclose cross-border transfer details in the privacy policy where required.
- If the app may be used by children under 14, provide a separate legal guardian consent and child-friendly notice flow before collecting child personal information.
- If location data is not collected, state that clearly. If location data is introduced later, review location-based service registration, consent, retention, and notice duties before launch.

### `netmelonai.com` careers policy

Careers pages should be written as real hiring notices, not as generic recruiting marketing.

Required content:

- Role title and team
- Employment type
- Main responsibilities
- Required and preferred qualifications
- Hiring process
- Work location or remote policy
- Hiring contact or application route
- Applicant privacy notice
- Hiring document retention, return, and deletion policy
- Equal opportunity and non-discrimination statement

Rules:

- Do not post false or merely promotional job advertisements.
- Do not change advertised hiring terms to the applicant's disadvantage without a legitimate reason.
- Do not collect application data that is not necessary for the role.
- Do not request or require appearance, height, weight, place of origin, marital status, property status, or family education, job, or property details.
- Do not use unnecessary gender, age, marital status, or physical condition requirements.
- Keep interview assignments scoped to evaluation. Do not require applicants to transfer intellectual property in hiring submissions.
- After hiring, employment terms such as wage, working hours, holidays, and paid leave should be provided in writing or electronic document form.

### `netmelonai.com` IR policy

The public IR page should provide company information and an investor inquiry route, not a public securities offering.

Allowed public content:

- Company overview
- Product and market summary
- Business model summary
- Conservative operating metrics, if verified
- Press, notices, and official updates
- Investor inquiry form or contact route

Restricted public content:

- Public investment terms, share price, valuation, allocation, or fundraising amount
- Language such as "invest now", "guaranteed return", "fixed return", or "expected multiple"
- Unverified revenue, user, growth, or market share claims
- Forward-looking financial projections stated as certain outcomes
- Materials that could be read as an invitation to 50 or more investors to acquire securities

IR workflow:

- Keep detailed investment materials in a controlled process, such as direct inquiry, NDA, data room, or counsel-reviewed investor communication.
- Label any forward-looking statements as uncertain and based on assumptions.
- Review all fundraising pages or decks with counsel before publication if they include investment terms or securities-related language.

### `naepopquiz.com` in-app purchase and subscription policy

Naepopquiz App will use App Store and Google Play in-app purchase only. The app homepage should not operate as a direct web checkout for digital subscription access.

Required content:

- Subscription product name
- Paid features and included services
- Price and billing cycle, or a clear statement that current price is shown in the App Store or Google Play purchase sheet
- Auto-renewal notice
- Free trial or introductory offer terms, if any
- How to manage or cancel a subscription
- Refund route through App Store or Google Play
- What happens to app access and Studio access after cancellation, expiry, refund, billing failure, or account deletion
- Customer support route for billing and access issues

Rules:

- In-app pricing and homepage descriptions must match the platform purchase UI.
- Do not lead users inside the app to a non-platform payment method for digital app features.
- Explain in the app and on `naepopquiz.com` that subscription management and refunds are handled through App Store or Google Play.
- If paid content is digital content that starts immediately, make refund and cancellation limitations clear before purchase where required.
- If marketing push notifications promote subscription offers, collect explicit opt-in and provide an opt-out path.

### `studio.naepopquiz.com` paid subscriber access policy

Studio should be treated as a subscriber-only companion web service for Naepopquiz App, not as a separately sold product unless that business model changes.

Access rules:

- Studio access requires a valid Naepopquiz paid subscription.
- Subscription entitlement must be verified server-side using App Store or Google Play receipts, purchase tokens, or server notifications.
- Studio must not trust client-side subscription state alone.
- Access should be revoked or limited when the subscription expires, is cancelled, is refunded, fails billing recovery, or the account is deleted.
- App account identity and Studio account identity must map to the same user entitlement model.

Required policy content:

- Studio access is included with an active Naepopquiz paid subscription.
- Studio access may stop when the subscription is no longer valid.
- Content created in Studio is used to support Naepopquiz App learning content workflows.
- Data retention after subscription expiry or account deletion must be stated.
- Account deletion and data deletion flows must cover both app data and Studio data.
- Studio operational screens should remain non-indexable and access-controlled.

## Operational risk and governance policy

These policies apply across the company site, app homepage, and Studio. They should be reviewed before public launch, app submission, paid subscription launch, and major policy changes.

### Incident response policy

Maintain an incident response process for privacy, security, billing, and service availability incidents.

Required process:

- Assign an incident owner and backup owner.
- Keep an internal contact path for engineering, legal/policy, customer support, and executive decision making.
- Triage incidents by affected users, affected data, severity, and whether paid access or Studio data is affected.
- Preserve logs and evidence needed to understand the incident.
- Contain the incident before publishing user-facing explanations.
- Prepare user notices when personal data, billing access, account access, or Studio content may be affected.
- Keep a support route for affected users.
- Record the timeline, user impact, root cause, response, and follow-up actions.

For personal data incidents, notices should be prepared to cover:

- Affected personal data items
- When and how the incident happened
- What users can do to reduce harm
- Netmelon's response and remedy process
- Contact team for damage reports or questions
- Regulator or authority notification requirements, if applicable

### Accessibility policy

Public pages and critical account flows should be designed and tested for accessibility.

Required scope:

- `netmelonai.com` public pages
- `naepopquiz.com` install, support, privacy, terms, deletion, subscription, and refund pages
- `studio.naepopquiz.com` sign-in, subscription/access error, account, and content-management critical flows

Baseline requirements:

- Use semantic HTML and correct heading order.
- Provide text alternatives for meaningful images.
- Keep color contrast readable.
- Make all essential controls keyboard accessible.
- Provide visible focus states.
- Label form fields and error messages clearly.
- Do not rely on color alone to convey meaning.
- Avoid text embedded in images when the text is essential.
- Set the correct page language with `html lang`.
- Test critical pages with keyboard navigation and at least one screen reader or accessibility audit tool before launch.

Target standard:

- Aim for WCAG 2.2 Level AA for public pages and critical paid-access flows where practical.

### Content rights policy

Studio creates and manages learning content used by Naepopquiz App. Terms must clearly define content rights before users create or upload content.

Required terms:

- Whether users retain copyright in content they create.
- What license users grant Netmelon to store, process, edit, display, distribute, and use Studio-created content in Naepopquiz App.
- Whether content may be used for app quality improvement, recommendation, moderation, analytics, or model training.
- Whether content can be shared publicly, only privately, or only within the user's own account.
- What happens to created content after subscription expiry, refund, account deletion, or data deletion request.
- Rules prohibiting unauthorized use of third-party copyrighted works, personal information, illegal content, harmful content, or infringing materials.
- A takedown or infringement report contact route.
- A moderation and removal right for content that violates law, policy, third-party rights, or app safety standards.

Default operating rule:

- Do not use user-created Studio content outside the scope disclosed in the terms and privacy policy.

### Policy change management

Privacy policy, terms, subscription policy, refund guidance, account deletion, data deletion, careers notices, and IR disclaimers must be versioned.

Required fields:

- Policy title
- Version or effective date
- Last updated date
- Owner
- Summary of material changes
- Previous version archive, when practical

Rules:

- Material changes to privacy, account, billing, subscription, refund, or Studio access terms should be announced before or at the time they become effective.
- App Store Connect, Play Console, homepage pages, in-app policy links, and Studio links must point to the current effective versions.
- Do not publish an English policy page until the English page reflects the current Korean source for required legal, billing, subscription, and account terms.

### Consent and audit log policy

Keep reliable records for user consent and policy acknowledgments.

Log when applicable:

- Terms agreement
- Privacy policy consent or acknowledgment
- Optional marketing consent
- Marketing push notification consent
- Subscription purchase, renewal, cancellation, refund, billing failure, and entitlement state
- Studio access entitlement grant and revocation
- Account deletion and data deletion requests
- Legal guardian consent for users under 14, if applicable

Rules:

- Store consent records with timestamp, user/account ID, policy version, channel, locale, and consent status.
- Consent withdrawal must be as easy to process operationally as consent collection.
- Retention of consent and billing logs must be described in internal policy and aligned with legal/accounting/support needs.
- Access to consent and entitlement logs should be restricted to authorized operators.

### Global expansion legal review

Korean law is the default compliance baseline. Before actively targeting users outside Korea, review additional regional requirements.

Review triggers:

- Launching paid acquisition campaigns outside Korea
- Adding English as a primary acquisition channel
- Listing app store metadata for additional target countries
- Collecting data from users in the European Union, United Kingdom, California, or other regulated jurisdictions at meaningful scale
- Targeting or knowingly serving children outside Korea
- Adding third-party advertising, tracking, attribution, or cross-context behavioral analytics

Potential review areas:

- GDPR or UK GDPR for EU/UK users
- CCPA/CPRA for California users
- COPPA for US children under 13
- Country-specific consumer protection, subscription renewal, cancellation, and refund rules
- Local app store compliance disclosures

Rule:

- Do not treat the English site alone as a decision to target all global jurisdictions. Target countries should be decided explicitly before marketing, paid acquisition, or localized store expansion.

## App release synchronization policy

Any release that changes app behavior, data handling, account behavior, or user-facing claims should update all relevant public surfaces together.

Review this checklist before app submission or production homepage deployment:

- App homepage description still matches the released app.
- App screenshots match the current app UI and supported locales.
- Privacy policy reflects current data collection, usage, sharing, retention, and deletion behavior.
- Terms of service match the current account, subscription, payment, and content rules.
- Account deletion and data deletion instructions are still accurate.
- In-app purchase and subscription descriptions match App Store Connect, Play Console, and in-app purchase UI.
- Studio access rules match the current subscription entitlement implementation.
- Studio content rights, retention, and deletion terms match the current product behavior.
- Marketing consent, marketing push notification consent, and opt-out flows are still accurate.
- Required consent, policy acknowledgment, and subscription entitlement logs are being captured.
- Incident response contacts and user-facing support routes are current.
- Critical public and account pages pass basic accessibility checks.
- Careers pages do not collect prohibited applicant information and include applicant privacy/retention notices.
- IR pages do not publicly present investment terms or securities offering language without counsel review.
- Policy version, effective date, last updated date, and prior-version archive status are reviewed.
- Korean and English pages are updated together when required content changes.
- App Store and Google Play Korean/English metadata match the corresponding homepage language pages.
- App Store metadata and support URL match `naepopquiz.com`.
- Google Play privacy policy URL and Data safety form match `naepopquiz.com`.
- Store badges are official, current, localized where appropriate, and not visually modified.
- Korean and English pages contain equivalent required policy information.
- Canonical URLs, sitemap, robots.txt, and structured data are updated when URLs change.

## Korean-first localization policy

Korean is the source language for the three-site system. English pages should be managed as maintained localized versions, not as partial machine-translated copies.

### URL policy

Use Korean as the default root and English under `/en/`:

```text
netmelonai.com/          -> Korean company site
netmelonai.com/en/       -> English company site
netmelonai.com/company.html    -> Korean company overview and notices
netmelonai.com/en/company.html -> English company overview and notices

naepopquiz.com/          -> Korean app site
naepopquiz.com/en/       -> English app site

studio.naepopquiz.com/   -> Korean Studio entry or sign-in
studio.naepopquiz.com/en/ -> English public Studio landing page, only if needed
```

Rules:

- Use distinct URLs for each language version.
- Do not use URL query parameters such as `?lang=en` as the primary localization structure.
- Do not automatically redirect users based only on IP address, browser language, or inferred region.
- Provide visible language switch links between equivalent Korean and English pages.
- Use `html lang="ko"` on Korean pages and `html lang="en"` on English pages.
- Keep each page mostly in one language. Do not translate only the navigation while leaving the main content in another language.

### Page coverage

Required bilingual pages:

- Home
- Company overview
- Product overview
- App install page
- Privacy policy
- Terms of service
- Account deletion
- Data deletion
- Support/contact
- Subscription, cancellation, and refund information

Recommended bilingual pages:

- Careers
- IR summary
- Major notices that affect users, investors, app review, privacy, terms, billing, or service availability

Optional bilingual pages:

- General company news
- Minor notices
- Internal operating documentation

### Hreflang and canonical policy

Each localized page pair must have reciprocal `hreflang` links and a self canonical URL.

Example for a Korean page:

```html
<link rel="canonical" href="https://netmelonai.com/careers.html">
<link rel="alternate" hreflang="ko" href="https://netmelonai.com/careers.html">
<link rel="alternate" hreflang="en" href="https://netmelonai.com/en/careers.html">
<link rel="alternate" hreflang="x-default" href="https://netmelonai.com/careers.html">
```

Example for the English equivalent:

```html
<link rel="canonical" href="https://netmelonai.com/en/careers.html">
<link rel="alternate" hreflang="ko" href="https://netmelonai.com/careers.html">
<link rel="alternate" hreflang="en" href="https://netmelonai.com/en/careers.html">
<link rel="alternate" hreflang="x-default" href="https://netmelonai.com/careers.html">
```

Rules:

- `hreflang` links must use fully qualified HTTPS URLs.
- Each language page must list itself and the matching alternate language page.
- If a Korean page has no English equivalent, do not point `hreflang="en"` to a non-equivalent page.
- If an English page is not maintained to the same required-policy level, keep it unpublished or mark it non-indexable until complete.
- Canonical URLs must point to the same-language canonical page, not always to the Korean page.
- Sitemaps should include both Korean and English URLs when both are indexable.

### Translation workflow

Use Korean pages as the source of truth:

- Draft and approve required content in Korean first.
- Translate English pages from the approved Korean source.
- Review English pages for legal, billing, store-review, and product accuracy before publishing.
- When Korean source pages change, mark the English equivalent as needing review until it is updated.
- Do not rely on raw machine translation for legal, privacy, billing, subscription, careers, or IR pages.
- Maintain a page inventory with `ko_url`, `en_url`, `owner`, `last_reviewed`, and `translation_status`.

### Store localization synchronization

`naepopquiz.com` English pages must stay consistent with App Store Connect and Play Console English metadata.

Rules:

- Korean app homepage copy should match Korean store metadata.
- English app homepage copy should match English store metadata.
- Subscription names, benefits, price/billing descriptions, cancellation instructions, and refund routes must match app store purchase UI and localized store listings.
- Screenshots and preview assets should be localized when text in the screenshot is material to the user's decision.
- If the English app homepage is incomplete, do not submit it as a support or privacy URL for English store metadata.

## SEO, localization, and performance policy

- Use descriptive, stable URLs for each site.
- Keep each page's canonical URL on its own domain.
- Use reciprocal `hreflang` links for equivalent localized pages.
- Use `/en/` subdirectories for English versions unless a future domain strategy explicitly changes this policy.
- Do not use automatic language redirects as the only discovery path for localized pages.
- Use JSON-LD structured data where appropriate:
  - `Organization` for `netmelonai.com`
  - `MobileApplication` or `SoftwareApplication` for `naepopquiz.com`
  - `WebApplication` or `SoftwareApplication` for public Studio pages
- Structured data must match visible page content.
- Submit and maintain separate sitemaps for each domain.
- Track each domain separately in Google Search Console.
- Target Core Web Vitals thresholds:
  - Largest Contentful Paint under 2.5 seconds
  - Interaction to Next Paint under 200 milliseconds
  - Cumulative Layout Shift under 0.1
- Keep app landing pages lightweight because store reviewers, users, and search crawlers all use them as trust signals.

## Firebase hosting policy

- Use Firebase Hosting deploy targets for `naepopquiz.com` and `studio.naepopquiz.com`.
- Do not hard-code Hosting site IDs into reusable config when a deploy target can be used.
- Keep staging and production Firebase projects separate.
- Use Firebase preview channels for app and Studio pull requests where practical.
- Production deployments should require an explicit production command and should not be the default local command.
- Custom domains should be configured in Firebase Hosting for app and Studio, while `netmelonai.com` remains on GitHub Pages unless the company site hosting strategy changes.

## Reference standards

These external standards should be checked when policy, store metadata, or homepage requirements change:

- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple auto-renewable subscriptions: https://developer.apple.com/app-store/subscriptions/
- Apple App Store marketing guidelines: https://developer.apple.com/app-store/marketing/guidelines/
- Google Play User Data policy: https://support.google.com/googleplay/android-developer/answer/10144311
- Google Play payments policy: https://support.google.com/googleplay/android-developer/answer/9858738
- Google Play subscriptions: https://support.google.com/googleplay/android-developer/answer/140504
- Google Play badge guidelines: https://play.google.com/intl/en_us/badges/
- Firebase Hosting multisites and deploy targets: https://firebase.google.com/docs/hosting/multisites
- Google SEO Starter Guide: https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- Google multilingual and multi-regional site management: https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites
- Google localized versions and `hreflang`: https://developers.google.com/search/docs/specialty/international/localized-versions
- Google canonical URL guidance: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- Google structured data introduction: https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data
- Google Core Web Vitals: https://developers.google.com/search/docs/appearance/core-web-vitals
- Android App Links: https://developer.android.com/training/app-links
- MDN HTML `lang` attribute: https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/lang
- W3C WCAG 2.2: https://www.w3.org/TR/WCAG22/
- Apple App Store Connect localization: https://developer.apple.com/help/app-store-connect/manage-app-information/localize-app-information/
- Google Play app translation and localization: https://support.google.com/googleplay/android-developer/answer/9844778
- Korea Personal Information Protection Act: https://www.law.go.kr/LSW/lsInfoP.do?lsId=011357
- Korea Information and Communications Network Act: https://www.law.go.kr/LSW/lsInfoP.do?lsId=000030
- Korea E-Commerce Consumer Protection Act: https://www.law.go.kr/LSW/lsInfoP.do?lsId=009318
- Korea Location Information Act: https://www.law.go.kr/LSW/lsInfoP.do?lsId=009882
- Korea Act on Regulation of Terms and Conditions: https://www.law.go.kr/LSW/lsInfoP.do?lsId=000667
- Korea Act on the Prohibition of Discrimination against Persons with Disabilities: https://www.law.go.kr/LSW/lsInfoP.do?lsId=010420
- Korea Copyright Act: https://www.law.go.kr/LSW/lsInfoP.do?lsId=000798
- Korea Fair Hiring Procedure Act: https://www.law.go.kr/LSW/lsInfoP.do?lsId=011990
- Korea Gender Equal Employment Act: https://www.law.go.kr/LSW/lsInfoP.do?lsId=000130
- Korea Age Discrimination in Employment Act: https://www.law.go.kr/LSW/lsInfoP.do?lsId=000121
- Korea Labor Standards Act: https://www.law.go.kr/LSW/lsInfoP.do?lsId=001872
- Korea Financial Investment Services and Capital Markets Act: https://www.law.go.kr/LSW/lsInfoP.do?lsId=010513
- EU GDPR: https://eur-lex.europa.eu/eli/reg/2016/679/oj
- California Privacy Protection Agency regulations: https://cppa.ca.gov/regulations/
- FTC Children's Online Privacy Protection Rule: https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa

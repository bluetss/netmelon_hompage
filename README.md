# Netmelon company homepage

This repository deploys the Netmelon company site for `netmelonai.com`.

## Role

- Company introduction
- Product summaries for Naepopquiz App and Naepopquiz Studio
- Careers
- IR request flow
- Company notices

Canonical app install, support, privacy, terms, subscription, and account/data deletion pages belong to `naepopquiz.com`, not this company site.

## Shared system

The shared web-system source of truth is:

```text
/home/seungwoo/myworks/dev/npq_web_system
```

Use it for route ownership, content model, SEO, localization, legal routes, analytics, security, and release checklists.

## Environment config

Production HTML must not hard-code dev or staging API URLs.

- Build-time company source injection requires `COMPANY_SOURCE_API_BASE` or `COMPANY_SOURCE_JSON_PATH`.
- Runtime company/careers source loading uses `window.CompanySourceConfig.apiBase` only when explicitly injected.
- Runtime careers Firebase override uses `window.__NPQ_CAREERS_FIREBASE_CONFIG__` or `window.CompanySourceConfig.careersFirebaseConfig`.
- IR forms use `window.__NPQ_IR_API_BASE__` only when explicitly injected.

If these values are not injected, the public pages fall back to static content or show a contact-by-email message.

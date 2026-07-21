#!/usr/bin/env node
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const COMPANY_SOURCE_PATH = process.env.COMPANY_SOURCE_EN_JSON_PATH ||
  path.join(ROOT, "data", "company-source.en.json");
const ANNOUNCEMENTS_PATH = process.env.COMPANY_ANNOUNCEMENTS_EN_JSON_PATH ||
  path.join(ROOT, "data", "company-announcements.en.json");
const OUTPUT_DIR = process.env.COMPANY_ENGLISH_OUTPUT_DIR ||
  path.join(ROOT, "en");
const ANNOUNCEMENT_DETAIL_DIR = process.env.COMPANY_ENGLISH_ANNOUNCEMENT_DETAIL_DIR ||
  path.join(OUTPUT_DIR, "announcements");
const INDEXABLE = /^(1|true|yes)$/i.test(String(process.env.COMPANY_ENGLISH_INDEXABLE || "").trim());

const SITE_URL = "https://netmelonai.com/";
const EN_SITE_URL = `${SITE_URL}en/`;
const CONTACT_EMAIL = "netmelon@netmelonai.com";
const OG_IMAGE_URL = `${SITE_URL}images/og-cover.png`;
const LOGO_URL = `${SITE_URL}images/logo.png`;
const ORGANIZATION_ID = `${SITE_URL}#organization`;
const WEBSITE_ID = `${SITE_URL}#website`;
const GENERATED_COMMENT = "Company English pages generated from CMS public English snapshots";

const htmlEscape = (value, quote = false) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', quote ? "&quot;" : '"');

const plainText = (value) => String(value ?? "")
  .replace(/\s+/g, " ")
  .trim();

const textWithBreaks = (value) => String(value ?? "")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => htmlEscape(line))
  .join("<br>");

const escapeScriptJson = (value) => JSON.stringify(value)
  .replaceAll("<", "\\u003c")
  .replaceAll(">", "\\u003e")
  .replaceAll("&", "\\u0026")
  .replaceAll("\u2028", "\\u2028")
  .replaceAll("\u2029", "\\u2029");

function pageUrl(pathName = "") {
  return new URL(pathName, EN_SITE_URL).toString();
}

function siteAsset(pathName) {
  return new URL(pathName, SITE_URL).toString();
}

function localAsset(pathName) {
  return `../${pathName}`;
}

function assertEnglishText(label, value) {
  const text = plainText(value);
  if (!text) throw new Error(`Missing English text: ${label}`);
  if (/[가-힣]/.test(text)) {
    throw new Error(`${label} contains Korean text. English generated pages must not use Korean fallback content.`);
  }
  return text;
}

function assertSource(source) {
  if (!source || typeof source !== "object") {
    throw new Error("Company English source must be a JSON object.");
  }
  if (source.locale !== "en") {
    throw new Error(`Company English source locale must be en. Received: ${source.locale || "missing"}`);
  }
  if (source.isDefault === true) {
    throw new Error("Company English source isDefault=true. Publish reviewed English CMS snapshot first.");
  }
  const identity = source.identity || {};
  const required = [
    ["identity.brandSignatureMessage", renderHeroLines(identity).length],
    ["identity.freedomStatement", identity.freedomStatement],
    ["identity.mission", identity.mission],
    ["identity.vision", identity.vision],
    ["identity.appIntroTitle", identity.appIntroTitle],
    ["identity.appIntroBody", identity.appIntroBody],
    ["identity.studioIntroTitle", identity.studioIntroTitle],
    ["identity.studioIntroBody", identity.studioIntroBody],
    ["identity.recruitingOneLiner", identity.recruitingOneLiner],
    ["identity.announcementEmptyTitle", identity.announcementEmptyTitle],
    ["identity.announcementEmptyBody", identity.announcementEmptyBody],
  ];
  const missing = required.filter(([, value]) => !value).map(([label]) => label);
  if (missing.length) {
    throw new Error(`Company English source is missing required fields: ${missing.join(", ")}`);
  }
  for (const [label, value] of required) {
    if (typeof value === "string") assertEnglishText(label, value);
  }

  const coreValues = normalizeCoreValues(source.coreValues);
  if (!coreValues.length) throw new Error("Company English source is missing coreValues.");
  for (const value of coreValues) {
    assertEnglishText(`coreValues.${value.key}.title`, value.title);
    assertEnglishText(`coreValues.${value.key}.body`, value.body);
  }
}

function normalizeHeroLines(identity) {
  const raw = Array.isArray(identity?.brandSignatureMessage?.lines)
    ? identity.brandSignatureMessage.lines
    : [];
  return raw
    .map((line, lineIndex) => {
      const segments = Array.isArray(line?.segments) ? line.segments : [];
      return {
        order: Number.isFinite(Number(line?.order)) ? Number(line.order) : lineIndex + 1,
        segments: segments
          .map((segment, segmentIndex) => ({
            text: String(segment?.text || "").trim(),
            order: Number.isFinite(Number(segment?.order)) ? Number(segment.order) : segmentIndex + 1,
          }))
          .filter((segment) => segment.text)
          .sort((a, b) => a.order - b.order),
      };
    })
    .filter((line) => line.segments.length > 0)
    .sort((a, b) => a.order - b.order);
}

function renderHeroLines(identity) {
  return normalizeHeroLines(identity).map((line) => {
    const inner = line.segments.map((segment) => htmlEscape(segment.text)).join("");
    return `            <span class="hero-line">${inner}</span>`;
  }).join("\n");
}

function normalizeCoreValues(values) {
  const raw = Array.isArray(values) ? values : [];
  return raw
    .map((value, index) => ({
      key: String(value?.key || `core_value_${index + 1}`).trim(),
      title: String(value?.title || "").trim(),
      body: String(value?.body || "").trim(),
      order: Number.isFinite(Number(value?.order)) ? Number(value.order) : index + 1,
    }))
    .filter((value) => value.title && value.body)
    .sort((a, b) => a.order - b.order);
}

function normalizeAnnouncements(payload) {
  const raw = Array.isArray(payload?.announcements) ? payload.announcements : [];
  if (payload?.locale && payload.locale !== "en") {
    throw new Error(`Company English announcement snapshot locale must be en. Received: ${payload.locale}`);
  }
  return raw
    .map((item, index) => ({
      entryId: String(item?.entryId || item?.id || index + 1).trim(),
      announcementType: String(item?.announcementType || item?.type || "").trim(),
      title: String(item?.title || "").trim(),
      slug: String(item?.slug || "").trim(),
      summary: plainText(item?.summary || item?.body || ""),
      body: String(item?.body || "").trim(),
      publishedAt: String(item?.publishedAt || item?.date || "").trim(),
      effectiveDate: String(item?.effectiveDate || "").trim(),
      status: String(item?.status || "published").trim(),
      order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index + 1,
    }))
    .filter((item) => item.status === "published")
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.order - b.order);
}

function validateAnnouncements(announcements) {
  const invalid = announcements.filter((item) => (
    !item.entryId ||
    !item.title ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug) ||
    !item.summary ||
    !item.body ||
    !/^\d{4}-\d{2}-\d{2}$/.test(item.publishedAt) ||
    /[가-힣]/.test(`${item.title} ${item.summary} ${item.body}`)
  ));
  if (invalid.length) {
    throw new Error("English company announcements require entryId, English title, kebab-case slug, English summary/body, and YYYY-MM-DD publishedAt.");
  }
}

function robotsMeta() {
  return INDEXABLE ? "index,follow" : "noindex,nofollow";
}

function renderHead({ title, description, canonicalPath, schema = null, assetPrefix = "../", sourceVersionId = "unknown" }) {
  const canonicalUrl = pageUrl(canonicalPath);
  return [
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<meta name="description" content="${htmlEscape(description, true)}">`,
    `<meta name="robots" content="${robotsMeta()}">`,
    '<meta name="theme-color" content="#f4f0e8">',
    `<link rel="canonical" href="${htmlEscape(canonicalUrl, true)}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Netmelon">',
    `<meta property="og:title" content="${htmlEscape(title, true)}">`,
    `<meta property="og:description" content="${htmlEscape(description, true)}">`,
    `<meta property="og:url" content="${htmlEscape(canonicalUrl, true)}">`,
    `<meta property="og:image" content="${OG_IMAGE_URL}">`,
    '<meta property="og:locale" content="en_US">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${htmlEscape(title, true)}">`,
    `<meta name="twitter:description" content="${htmlEscape(description, true)}">`,
    `<meta name="twitter:image" content="${OG_IMAGE_URL}">`,
    `<link rel="icon" href="${assetPrefix}favicon.ico" sizes="any">`,
    `<link rel="apple-touch-icon" sizes="180x180" href="${assetPrefix}images/apple-touch-icon.png">`,
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&amp;family=Plus+Jakarta+Sans:wght@500;700;800&amp;display=swap" rel="stylesheet">',
    `<link rel="stylesheet" href="${assetPrefix}styles/company.css">`,
    `<!-- ${GENERATED_COMMENT}: sourceVersionId=${htmlEscape(sourceVersionId)} -->`,
    `<title>${htmlEscape(title)}</title>`,
    schema ? `<script type="application/ld+json">${escapeScriptJson(schema)}</script>` : "",
  ].filter(Boolean).join("\n  ");
}

function renderHeader(active, { hrefPrefix = "", assetPrefix = "../" } = {}) {
  const nav = [
    ["company", "company.html", "About"],
    ["product", "index.html#naepopquiz-app", "Products"],
    ["careers", "careers.html", "Careers"],
    ["ir", "ir.html", "IR"],
    ["announcement", "announcement.html", "Company announcements"],
  ];
  const koreanHrefByActive = {
    product: `${assetPrefix}index.html`,
    company: `${assetPrefix}company.html`,
    careers: `${assetPrefix}careers.html`,
    ir: `${assetPrefix}ir.html`,
    announcement: `${assetPrefix}announcement.html`,
  };
  const koreanHref = koreanHrefByActive[active] || `${assetPrefix}index.html`;
  return [
    '<header class="site-header" id="top">',
    '    <div class="shell">',
    `      <a class="brand" href="${hrefPrefix}index.html">`,
    `        <img src="${assetPrefix}images/logo.png" alt="Netmelon logo" width="36" height="36">`,
    '        <span>Netmelon</span>',
    '      </a>',
    '      <div class="mobile-actions">',
    '        <div class="download-menu">',
    '          <button class="download-toggle" type="button" aria-expanded="false" aria-controls="download-menu" aria-label="Open app download menu">App download</button>',
    '          <div class="download-dropdown" id="download-menu">',
    '            <a href="https://play.google.com/store/apps/details?id=com.netmelon.naepopquiz" target="_blank" rel="noopener noreferrer">Google Play</a>',
    '            <a href="https://apple.co/4ez9nji" target="_blank" rel="noopener noreferrer">App Store</a>',
    '          </div>',
    '        </div>',
    '        <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="primary-navigation" aria-label="Open menu">',
    '          <span></span>',
    '          <span></span>',
    '          <span></span>',
    '        </button>',
    '      </div>',
    '      <nav class="site-nav" id="primary-navigation" aria-label="Primary">',
    ...nav.map(([key, href, label]) => `        <a${key === active ? ' class="is-current"' : ""} href="${hrefPrefix}${href}">${label}</a>`),
    `        <a class="lang-link" href="${koreanHref}" lang="ko">KOREAN</a>`,
    '      </nav>',
    '    </div>',
    '  </header>',
  ].join("\n");
}

function renderFooter({ assetPrefix = "../" } = {}) {
  return [
    '<footer class="site-footer">',
    '    <div class="shell footer-row">',
    '      <p>© 2026 Netmelon. All rights reserved.</p>',
    '    </div>',
    '  </footer>',
    `  <script src="${assetPrefix}scripts/site-shell.js" defer></script>`,
  ].join("\n");
}

function organizationSchema(source) {
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    "name": "Netmelon",
    "url": SITE_URL,
    "logo": LOGO_URL,
    "image": OG_IMAGE_URL,
    "description": plainText(source.identity.mission),
    "email": CONTACT_EMAIL,
    "sameAs": [
      "https://naepopquiz.com/",
      "https://studio.naepopquiz.com/",
      "https://play.google.com/store/apps/details?id=com.netmelon.naepopquiz",
      "https://apple.co/4ez9nji",
    ],
  };
}

function pageSchema(source, { type, id, name, description, pathName }) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationSchema(source),
      {
        "@type": type,
        "@id": `${pageUrl(pathName)}#webpage`,
        "url": pageUrl(pathName),
        "name": name,
        "description": description,
        "inLanguage": "en-US",
        "isPartOf": { "@id": WEBSITE_ID },
        "about": { "@id": ORGANIZATION_ID },
        "breadcrumb": {
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": EN_SITE_URL },
            ...(id === "home" ? [] : [{ "@type": "ListItem", "position": 2, "name": name.replace(/^Netmelon \| /, ""), "item": pageUrl(pathName) }]),
          ],
        },
      },
    ],
  };
}

function pageShell({ lang = "en", bodyClass = "", head, headerActive, main, hrefPrefix = "", assetPrefix = "../" }) {
  return [
    "<!DOCTYPE html>",
    `<html lang="${lang}">`,
    "<head>",
    `  ${head}`,
    "</head>",
    `<body${bodyClass ? ` class="${bodyClass}"` : ""}>`,
    `  ${renderHeader(headerActive, { hrefPrefix, assetPrefix })}`,
    "",
    main,
    "",
    `  ${renderFooter({ assetPrefix })}`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function renderHomePage(source) {
  const identity = source.identity;
  const description = plainText(identity.appIntroBody || identity.mission);
  const schema = pageSchema(source, {
    type: "WebSite",
    id: "home",
    name: "Netmelon",
    description,
    pathName: "",
  });
  const head = renderHead({
    title: "Netmelon",
    description,
    canonicalPath: "",
    schema,
    sourceVersionId: source.sourceVersionId,
  });

  const main = [
    "  <main>",
    '    <section class="hero hero-motto" id="company">',
    '      <div class="shell">',
    '        <div class="hero-motto-copy">',
    `          <h1 id="home-hero-lines">\n${renderHeroLines(identity)}\n          </h1>`,
    "        </div>",
    "      </div>",
    "    </section>",
    "",
    '    <section class="story-scroll">',
    '      <article class="story-section magnetic-section app-panel" id="naepopquiz-app">',
    '        <div class="story-content">',
    `          <h2 id="home-app-title">${textWithBreaks(identity.appIntroTitle)}</h2>`,
    `          <p id="home-app-copy">${textWithBreaks(identity.appIntroBody)}</p>`,
    '          <a class="story-link" href="https://naepopquiz.com/" target="_blank" rel="noopener noreferrer">Open app homepage</a>',
    '          <div class="app-shotcase" aria-label="Naepopquiz app screens">',
    '            <div class="app-shot-track">',
    '              <!-- __COMPANY_ASSET_PRODUCT_SHOTS_START__ -->',
    '              <!-- __COMPANY_ASSET_PRODUCT_SHOTS_END__ -->',
    "            </div>",
    "          </div>",
    "        </div>",
    "      </article>",
    "",
    '      <article class="story-section magnetic-section studio-panel" id="naepopquiz-studio">',
    '        <div class="story-content">',
    `          <h2 id="home-studio-title">${textWithBreaks(identity.studioIntroTitle)}</h2>`,
    `          <p id="home-studio-copy">${textWithBreaks(identity.studioIntroBody)}</p>`,
    '          <a class="story-link studio-cta" href="https://studio.naepopquiz.com/" target="_blank" rel="noopener noreferrer">Open Studio</a>',
    '          <div class="studio-shotcase" aria-label="Naepopquiz Studio screens">',
    '            <div class="studio-shot-track">',
    '              <!-- __COMPANY_ASSET_STUDIO_SHOTS_START__ -->',
    '              <!-- __COMPANY_ASSET_STUDIO_SHOTS_END__ -->',
    "            </div>",
    "          </div>",
    "        </div>",
    "      </article>",
    "",
    '      <div class="story-end-spacer" aria-hidden="true"></div>',
    "    </section>",
    "  </main>",
  ].join("\n");
  return pageShell({ head, headerActive: "product", main });
}

function renderCoreValues(values) {
  return normalizeCoreValues(values).map((value) => [
    '            <article class="company-core-value-card">',
    `              <span>#${value.order}</span>`,
    `              <h3>${htmlEscape(value.title)}</h3>`,
    `              <p>${htmlEscape(value.body)}</p>`,
    "            </article>",
  ].join("\n")).join("\n");
}

function renderCompanyPage(source) {
  const identity = source.identity;
  const description = plainText(identity.mission);
  const schema = pageSchema(source, {
    type: "AboutPage",
    id: "company",
    name: "Netmelon | About",
    description,
    pathName: "company.html",
  });
  const head = renderHead({
    title: "Netmelon | About",
    description,
    canonicalPath: "company.html",
    schema,
    sourceVersionId: source.sourceVersionId,
  });

  const main = [
    "  <main>",
    '    <section class="hero hero-motto" id="company">',
    '      <div class="shell">',
    '        <div class="hero-motto-copy">',
    `          <h1 id="company-freedom-statement" class="company-freedom-statement">${textWithBreaks(identity.freedomStatement)}</h1>`,
    "        </div>",
    "      </div>",
    "    </section>",
    "",
    '    <section class="story-scroll" aria-label="Company overview">',
    '      <article class="story-section magnetic-section app-panel company-mission-panel" id="team-mission">',
    '        <div class="story-content">',
    '          <p class="story-kicker">Mission</p>',
    '          <h2 class="story-title" id="company-mission-title">Why we exist</h2>',
    `          <p id="company-detail-mission">${textWithBreaks(identity.mission)}</p>`,
    "        </div>",
    "      </article>",
    "",
    '      <article class="story-section magnetic-section studio-panel company-vision-panel" id="team-vision">',
    '        <div class="story-content">',
    '          <p class="story-kicker">Vision</p>',
    '          <h2 class="story-title" id="company-vision-title">The world we want to build</h2>',
    `          <p id="company-detail-vision">${textWithBreaks(identity.vision)}</p>`,
    "        </div>",
    "      </article>",
    "",
    '      <article class="story-section magnetic-section company-values-panel" id="core-values">',
    '        <div class="story-content company-core-value-content">',
    '          <p class="story-kicker">Core Values</p>',
    '          <h2 class="story-title" id="company-core-values-title">How we work</h2>',
    `          <div class="company-core-value-grid">\n${renderCoreValues(source.coreValues)}\n          </div>`,
    "        </div>",
    "      </article>",
    "",
    '      <article class="story-section magnetic-section career-panel company-history-panel" id="history">',
    '        <div class="story-content">',
    '          <p class="story-kicker">History</p>',
    '          <h2 class="story-title" id="company-history-title">Netmelon growth record</h2>',
    '          <ol class="company-history-list" aria-label="Netmelon history">',
    "            <li>",
    '              <span class="year">2021</span>',
    '              <div class="history-events"><p>Netmelon founded</p></div>',
    "            </li>",
    "            <li>",
    '              <span class="year">2025</span>',
    '              <div class="history-events"><p>Naepopquiz app launched</p></div>',
    "            </li>",
    "            <li>",
    '              <span class="year">2026</span>',
    '              <div class="history-events"><p>Naepopquiz paid subscription transition</p><p>Naepopquiz Studio launched</p></div>',
    "            </li>",
    "          </ol>",
    "        </div>",
    "      </article>",
    "",
    '      <div class="story-end-spacer" aria-hidden="true"></div>',
    "    </section>",
    "  </main>",
  ].join("\n");
  return pageShell({ head, headerActive: "company", main });
}

function renderCareersPage(source) {
  const identity = source.identity;
  const description = plainText(identity.recruitingOneLiner);
  const schema = pageSchema(source, {
    type: "WebPage",
    id: "careers",
    name: "Netmelon | Careers",
    description,
    pathName: "careers.html",
  });
  const head = renderHead({
    title: "Netmelon | Careers",
    description,
    canonicalPath: "careers.html",
    schema,
    sourceVersionId: source.sourceVersionId,
  });
  const main = [
    '  <main class="careers-main">',
    '    <section class="careers-hero" aria-label="Careers">',
    '      <div class="shell careers-hero-grid">',
    '        <div class="careers-hero-copy">',
    '          <p class="story-kicker">Careers</p>',
    `          <h1 id="hero-headline">${htmlEscape(description)}</h1>`,
    '          <p id="hero-intro"></p>',
    "        </div>",
    "      </div>",
    "    </section>",
    "  </main>",
  ].join("\n");
  return pageShell({ head, headerActive: "careers", main });
}

function renderIrPage(source) {
  const identity = source.identity;
  const description = plainText(identity.irOneLiner || "IR materials are shared after request review.");
  const schema = pageSchema(source, {
    type: "WebPage",
    id: "ir",
    name: "Netmelon | IR",
    description,
    pathName: "ir.html",
  });
  const head = renderHead({
    title: "Netmelon | IR",
    description,
    canonicalPath: "ir.html",
    schema,
    sourceVersionId: source.sourceVersionId,
  });
  const main = [
    '  <main class="ir-main">',
    '    <section class="ir-flow" aria-label="IR request overview">',
    '      <article class="ir-slide ir-hero-slide" id="ir-overview">',
    '        <div class="ir-slide-inner ir-hero-grid">',
    '          <div class="ir-hero-copy">',
    '            <p class="ir-kicker">Investor Relations</p>',
    `            <h1 class="ir-title">${htmlEscape(description)}</h1>`,
    '            <p class="ir-subtitle">Public IR materials are shared only after request review.</p>',
    '            <div class="ir-hero-cta">',
    '              <a class="button primary" href="mailto:netmelon@netmelonai.com?subject=%5BIR%20Request%5D">Request IR materials</a>',
    "            </div>",
    "          </div>",
    "        </div>",
    "      </article>",
    "    </section>",
    "  </main>",
  ].join("\n");
  return pageShell({ head, headerActive: "ir", main });
}

function renderAnnouncementList(announcements, source) {
  const identity = source.identity;
  if (announcements.length === 0) {
    return [
      '<section class="story-scroll announcement-empty-scroll" aria-label="Company announcement status">',
      '      <article class="story-section magnetic-section app-panel announcement-empty-panel" id="announcements">',
      '        <div class="story-content announcement-empty-content">',
      '          <p class="story-kicker">Notice</p>',
      `          <h1 class="story-title" id="announcement-empty-title">${htmlEscape(identity.announcementEmptyTitle)}</h1>`,
      `          <p>${htmlEscape(identity.announcementEmptyBody)}</p>`,
      "        </div>",
      "      </article>",
      '      <div class="story-end-spacer" aria-hidden="true"></div>',
      "    </section>",
    ].join("\n");
  }
  const rows = announcements.map((item) => [
    '          <li class="announcement-item">',
    `            <a href="announcements/${htmlEscape(item.slug, true)}.html">`,
    '              <span class="announcement-item-date">',
    `                <time datetime="${htmlEscape(item.publishedAt, true)}">${htmlEscape(item.publishedAt.replaceAll("-", "."))}</time>`,
    "              </span>",
    '              <span class="announcement-item-copy">',
    `                <strong>${htmlEscape(item.title)}</strong>`,
    `                <span class="announcement-item-summary">${htmlEscape(item.summary)}</span>`,
    "              </span>",
    '              <span class="announcement-item-arrow" aria-hidden="true">→</span>',
    "            </a>",
    "          </li>",
  ].join("\n")).join("\n");
  return [
    '<section class="announcement-section" aria-labelledby="announcement-list-title">',
    '      <div class="shell announcement-layout">',
    '        <header class="announcement-section-header">',
    '          <div class="announcement-section-copy">',
    '            <p class="story-kicker">Notice</p>',
    '            <h1 class="story-title" id="announcement-list-title">Company announcements</h1>',
    "          </div>",
    `          <span class="announcement-count">${announcements.length} record${announcements.length === 1 ? "" : "s"}</span>`,
    "        </header>",
    '        <ol class="announcement-list" id="announcements">',
    rows,
    "        </ol>",
    "      </div>",
    "    </section>",
  ].join("\n");
}

function renderAnnouncementPage(source, announcements) {
  const description = announcements.length
    ? "Official company announcements from Netmelon."
    : plainText(source.identity.announcementEmptyBody);
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      organizationSchema(source),
      {
        "@type": "CollectionPage",
        "@id": `${pageUrl("announcement.html")}#webpage`,
        "url": pageUrl("announcement.html"),
        "name": "Netmelon | Company announcements",
        "description": description,
        "inLanguage": "en-US",
        "isPartOf": { "@id": WEBSITE_ID },
        "about": { "@id": ORGANIZATION_ID },
      },
      {
        "@type": "ItemList",
        "@id": `${pageUrl("announcement.html")}#announcements`,
        "name": "Netmelon company announcements",
        "numberOfItems": announcements.length,
        "itemListElement": announcements.map((item, index) => ({
          "@type": "ListItem",
          "position": index + 1,
          "url": pageUrl(`announcements/${encodeURIComponent(item.slug)}.html`),
          "name": item.title,
        })),
      },
    ],
  };
  const head = renderHead({
    title: "Netmelon | Company announcements",
    description,
    canonicalPath: "announcement.html",
    schema,
    sourceVersionId: source.sourceVersionId,
  });
  const main = [
    '  <main class="announcement-main">',
    `    ${renderAnnouncementList(announcements, source)}`,
    "  </main>",
  ].join("\n");
  return pageShell({ head, headerActive: "announcement", main });
}

function renderAnnouncementDetailPage(source, item) {
  const description = plainText(item.summary);
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      organizationSchema(source),
      {
        "@type": "Article",
        "@id": `${pageUrl(`announcements/${encodeURIComponent(item.slug)}.html`)}#article`,
        "headline": item.title,
        "description": item.summary,
        "datePublished": item.publishedAt,
        "inLanguage": "en-US",
        "publisher": { "@id": ORGANIZATION_ID },
      },
    ],
  };
  const head = renderHead({
    title: `Netmelon | ${item.title}`,
    description,
    canonicalPath: `announcements/${item.slug}.html`,
    schema,
    assetPrefix: "../../",
    sourceVersionId: source.sourceVersionId,
  });
  const paragraphs = String(item.body || item.summary)
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((block) => `          <p>${block.split("\n").map((line) => htmlEscape(line.trim())).filter(Boolean).join("<br>")}</p>`)
    .join("\n");
  const main = [
    '  <main class="announcement-main">',
    '    <article class="announcement-detail">',
    '      <div class="shell announcement-detail-layout">',
    '        <header class="announcement-detail-header">',
    '          <div class="announcement-detail-eyebrow">',
    '            <span>Notice</span>',
    '            <a class="announcement-back-link" href="../announcement.html">Back to list</a>',
    "          </div>",
    '          <div class="announcement-detail-meta">',
    `            <time datetime="${htmlEscape(item.publishedAt, true)}">${htmlEscape(item.publishedAt)}</time>`,
    item.effectiveDate ? `            <span>Effective ${htmlEscape(item.effectiveDate)}</span>` : "",
    "          </div>",
    `          <h1>${htmlEscape(item.title)}</h1>`,
    `          <p>${htmlEscape(item.summary)}</p>`,
    "        </header>",
    '        <div class="announcement-detail-body">',
    paragraphs,
    "        </div>",
    "      </div>",
    "    </article>",
    "  </main>",
  ].filter(Boolean).join("\n");
  return pageShell({
    head,
    headerActive: "announcement",
    main,
    hrefPrefix: "../",
    assetPrefix: "../../",
  });
}

async function cleanupStaleEnglishAnnouncementDetails(announcements) {
  await mkdir(ANNOUNCEMENT_DETAIL_DIR, { recursive: true });
  const expected = new Set(announcements.map((item) => `${item.slug}.html`));
  const entries = await readdir(ANNOUNCEMENT_DETAIL_DIR, { withFileTypes: true }).catch(() => []);
  const stale = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html") && !expected.has(entry.name))
    .map((entry) => entry.name);
  await Promise.all(stale.map((fileName) => unlink(path.join(ANNOUNCEMENT_DETAIL_DIR, fileName))));
}

async function readAnnouncementsIfPresent() {
  try {
    return JSON.parse(await readFile(ANNOUNCEMENTS_PATH, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { site: "company", locale: "en", entryType: "company_announcement", announcements: [] };
    }
    throw error;
  }
}

async function main() {
  const source = JSON.parse(await readFile(COMPANY_SOURCE_PATH, "utf8"));
  assertSource(source);

  const announcementsPayload = await readAnnouncementsIfPresent();
  const announcements = normalizeAnnouncements(announcementsPayload);
  validateAnnouncements(announcements);

  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(ANNOUNCEMENT_DETAIL_DIR, { recursive: true });
  await Promise.all([
    writeFile(path.join(OUTPUT_DIR, "index.html"), renderHomePage(source), "utf8"),
    writeFile(path.join(OUTPUT_DIR, "company.html"), renderCompanyPage(source), "utf8"),
    writeFile(path.join(OUTPUT_DIR, "careers.html"), renderCareersPage(source), "utf8"),
    writeFile(path.join(OUTPUT_DIR, "ir.html"), renderIrPage(source), "utf8"),
    writeFile(path.join(OUTPUT_DIR, "announcement.html"), renderAnnouncementPage(source, announcements), "utf8"),
    cleanupStaleEnglishAnnouncementDetails(announcements),
  ]);
  await Promise.all(announcements.map((item) => (
    writeFile(path.join(ANNOUNCEMENT_DETAIL_DIR, `${item.slug}.html`), renderAnnouncementDetailPage(source, item), "utf8")
  )));
  console.log(`Generated English company pages in ${path.relative(ROOT, OUTPUT_DIR)}`);
}

main().catch((error) => {
  console.error("[company-english-build]", error);
  process.exit(1);
});

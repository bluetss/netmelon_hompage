#!/usr/bin/env node
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const DATA_PATH = process.env.COMPANY_ANNOUNCEMENTS_JSON_PATH ||
  path.join(ROOT, "data", "company-announcements.ko.json");
const COMPANY_SOURCE_PATH = process.env.COMPANY_SOURCE_JSON_PATH ||
  path.join(ROOT, "data", "company-source.ko.json");
const TEMPLATE_PATH = process.env.COMPANY_ANNOUNCEMENTS_TEMPLATE ||
  path.join(ROOT, "announcement.template.html");
const DETAIL_TEMPLATE_PATH = process.env.COMPANY_ANNOUNCEMENT_DETAIL_TEMPLATE ||
  path.join(ROOT, "announcement-detail.template.html");
const OUTPUT_PATH = process.env.COMPANY_ANNOUNCEMENTS_OUTPUT ||
  path.join(ROOT, "announcement.html");
const DETAIL_OUTPUT_DIR = process.env.COMPANY_ANNOUNCEMENT_DETAIL_DIR ||
  path.join(ROOT, "announcements");

const SITE_URL = "https://netmelonai.com/";
const PAGE_URL = `${SITE_URL}announcement.html`;
const ORGANIZATION_ID = `${SITE_URL}#organization`;
const WEBSITE_ID = `${SITE_URL}#website`;
const OG_IMAGE_URL = `${SITE_URL}images/og-cover.png`;
const LOGO_URL = `${SITE_URL}images/logo.png`;

const htmlEscape = (value, quote = false) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', quote ? "&quot;" : '"');

const plainText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const escapeScriptJson = (value) => JSON.stringify(value)
  .replaceAll("<", "\\u003c")
  .replaceAll(">", "\\u003e")
  .replaceAll("&", "\\u0026")
  .replaceAll("\u2028", "\\u2028")
  .replaceAll("\u2029", "\\u2029");

const announcementTypes = new Set([
  "legal_notice",
  "governance_notice",
  "privacy_notice",
  "administrative_notice",
]);

const truncate = (value, maxLength) => {
  const text = plainText(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
};

function replaceOnce(source, marker, value) {
  if (!source.includes(marker)) throw new Error(`Missing build marker: ${marker}`);
  return source.replace(marker, value);
}

function normalizeAnnouncements(payload) {
  const raw = Array.isArray(payload) ? payload : payload?.announcements;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item, index) => {
      const announcementType = String(item?.announcementType || item?.type || "").trim();
      const title = String(item?.title || "").trim();
      const slug = String(item?.slug || "").trim();
      const publishedAt = String(item?.publishedAt || item?.date || "").trim();
      const effectiveDate = String(item?.effectiveDate || "").trim();
      const summary = plainText(item?.summary || item?.body || "");
      const body = String(item?.body || "").trim();
      const status = String(item?.status || "published").trim();

      return {
        entryId: String(item?.entryId || item?.id || index + 1).trim(),
        announcementType,
        title,
        slug,
        summary,
        body,
        publishedAt,
        effectiveDate,
        status,
        order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index + 1,
      };
    })
    .filter((item) => item.status === "published")
    .sort((a, b) => {
      const dateOrder = b.publishedAt.localeCompare(a.publishedAt);
      return dateOrder || a.order - b.order;
    });
}

function validateAnnouncements(announcements) {
  const invalid = announcements.filter((item) => (
    !item.entryId ||
    !announcementTypes.has(item.announcementType) ||
    !item.title ||
    !item.slug ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug) ||
    !item.summary ||
    !item.body ||
    !/^\d{4}-\d{2}-\d{2}$/.test(item.publishedAt)
  ));
  if (invalid.length > 0) {
    throw new Error("Company announcements require entryId, allowed announcementType, title, kebab-case slug, summary, body, and YYYY-MM-DD publishedAt.");
  }

  const slugs = announcements.map((item) => item.slug);
  const duplicatedSlugs = slugs.filter((slug, index) => slugs.indexOf(slug) !== index);
  if (duplicatedSlugs.length > 0) {
    throw new Error(`Company announcements have duplicated slug(s): ${[...new Set(duplicatedSlugs)].join(", ")}`);
  }

  const ids = announcements.map((item) => item.entryId);
  const duplicatedIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicatedIds.length > 0) {
    throw new Error(`Company announcements have duplicated entryId(s): ${[...new Set(duplicatedIds)].join(", ")}`);
  }
}

function normalizeAnnouncementEmptyState(companySource) {
  const identity = companySource && typeof companySource === "object" && companySource.identity && typeof companySource.identity === "object"
    ? companySource.identity
    : {};
  const title = plainText(identity.announcementEmptyTitle || identity.companyAnnouncementEmptyTitle || "");
  const body = plainText(identity.announcementEmptyBody || identity.companyAnnouncementEmptyBody || "");
  if (!title || !body) {
    throw new Error("Company Source identity requires announcementEmptyTitle and announcementEmptyBody.");
  }

  return {
    title,
    body,
  };
}

function buildMetaComment(announcements) {
  const generatedAt = new Date().toISOString();
  return `<!-- Company announcements generated at build time: count=${announcements.length}, generatedAt=${generatedAt} -->`;
}

function buildSchema(announcements) {
  const organization = {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    "name": "Netmelon",
    "alternateName": "네트멜론",
    "url": SITE_URL,
    "logo": LOGO_URL,
    "image": OG_IMAGE_URL,
    "email": "netmelon@netmelonai.com",
  };

  return {
    "@context": "https://schema.org",
    "@graph": [
      organization,
      {
        "@type": "CollectionPage",
        "@id": `${PAGE_URL}#webpage`,
        "url": PAGE_URL,
        "name": "네트멜론 | 회사 공고",
        "description": "네트멜론 공고 페이지입니다.",
        "inLanguage": "ko-KR",
        "isPartOf": { "@id": WEBSITE_ID },
        "about": { "@id": ORGANIZATION_ID },
        "breadcrumb": {
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "홈", "item": SITE_URL },
            { "@type": "ListItem", "position": 2, "name": "회사 공고", "item": PAGE_URL },
          ],
        },
      },
      {
        "@type": "ItemList",
        "@id": `${PAGE_URL}#announcements`,
        "name": "네트멜론 회사 공고",
        "numberOfItems": announcements.length,
        "itemListElement": announcements.map((item, index) => ({
          "@type": "ListItem",
          "position": index + 1,
          "url": `${SITE_URL}announcements/${encodeURIComponent(item.slug)}.html`,
          "name": item.title,
        })),
      },
    ],
  };
}

function renderAnnouncementContent(announcements, emptyState) {
  if (announcements.length === 0) {
    return [
      '<section class="story-scroll announcement-empty-scroll" aria-label="회사 공고 상태">',
      '      <article class="story-section magnetic-section app-panel announcement-empty-panel" id="announcements">',
      '        <div class="story-content announcement-empty-content">',
      '          <p class="story-kicker">Notice</p>',
      `          <h2 class="story-title" id="announcement-empty-title">${htmlEscape(emptyState.title)}</h2>`,
      `          <p>${htmlEscape(emptyState.body)}</p>`,
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
    item.summary ? `                <span class="announcement-item-summary">${htmlEscape(item.summary)}</span>` : "",
    "              </span>",
    '              <span class="announcement-item-arrow" aria-hidden="true">→</span>',
    "            </a>",
    "          </li>",
  ].filter(Boolean).join("\n")).join("\n");

  return [
    '<section class="announcement-section" aria-labelledby="announcement-list-title">',
    '      <div class="shell announcement-layout">',
    '        <header class="announcement-section-header">',
    '          <div class="announcement-section-copy">',
    '            <p class="story-kicker">Notice</p>',
    '            <h1 class="story-title" id="announcement-list-title">회사 공고</h1>',
    '            <p>네트멜론의 주요 공고를 확인할 수 있습니다.</p>',
    "          </div>",
    `          <span class="announcement-count">총 ${announcements.length}건</span>`,
    "        </header>",
    '        <ol class="announcement-list" id="announcements">',
    rows,
    "        </ol>",
    "      </div>",
    "    </section>",
  ].join("\n");
}

function renderBodyBlocks(item) {
  const source = item.body || item.summary;
  const blocks = String(source).replace(/\r\n/g, "\n").trim().split(/\n{2,}/);

  return blocks.map((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) return "";

    if (lines.every((line) => /^[-*]\s+/.test(line))) {
      const items = lines.map((line) => `            <li>${htmlEscape(line.replace(/^[-*]\s+/, ""))}</li>`).join("\n");
      return [
        "          <ul>",
        items,
        "          </ul>",
      ].join("\n");
    }

    const paragraph = lines.map((line) => htmlEscape(line)).join("<br>");
    return `          <p>${paragraph}</p>`;
  }).filter(Boolean).join("\n\n");
}

function renderDetailSchema(item) {
  const pageUrl = `${SITE_URL}announcements/${encodeURIComponent(item.slug)}.html`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORGANIZATION_ID,
        "name": "Netmelon",
        "alternateName": "네트멜론",
        "url": SITE_URL,
        "logo": LOGO_URL,
        "image": OG_IMAGE_URL,
        "email": "netmelon@netmelonai.com",
      },
      {
        "@type": "Article",
        "@id": `${pageUrl}#article`,
        "headline": item.title,
        "description": item.summary,
        "datePublished": item.publishedAt,
        "inLanguage": "ko-KR",
        "publisher": { "@id": ORGANIZATION_ID },
        "mainEntityOfPage": { "@id": `${pageUrl}#webpage` },
      },
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#webpage`,
        "url": pageUrl,
        "name": `네트멜론 | ${item.title}`,
        "description": item.summary,
        "inLanguage": "ko-KR",
        "isPartOf": { "@id": WEBSITE_ID },
        "breadcrumb": {
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "홈", "item": SITE_URL },
            { "@type": "ListItem", "position": 2, "name": "회사 공고", "item": PAGE_URL },
            { "@type": "ListItem", "position": 3, "name": item.title, "item": pageUrl },
          ],
        },
      },
    ],
  };
}

function renderDetailHeader(headerTemplate) {
  return headerTemplate
    .replaceAll("__SITE_HEADER_BRAND_HREF__", "../index.html")
    .replaceAll("__SITE_NAV_PRODUCT_HREF__", "../index.html#naepopquiz-app")
    .replaceAll("__SITE_NAV_COMPANY_CLASS__", "")
    .replaceAll("__SITE_NAV_CAREERS_CLASS__", "")
    .replaceAll("__SITE_NAV_IR_CLASS__", "")
    .replaceAll("__SITE_NAV_ANNOUNCEMENT_CLASS__", ' class="is-current"')
    .replaceAll("__SITE_NAV_ENGLISH_HREF__", "../en/announcement.html")
    .replaceAll('src="images/', 'src="../images/')
    .replaceAll('href="company.html"', 'href="../company.html"')
    .replaceAll('href="careers.html"', 'href="../careers.html"')
    .replaceAll('href="ir.html"', 'href="../ir.html"')
    .replaceAll('href="announcement.html"', 'href="../announcement.html"');
}

function renderDetailPage(detailTemplate, shellPartials, item) {
  const pageUrl = `${SITE_URL}announcements/${encodeURIComponent(item.slug)}.html`;
  const pageTitle = `네트멜론 | ${item.title}`;
  const effectiveDate = item.effectiveDate
    ? `<span>시행일 ${htmlEscape(item.effectiveDate)}</span>`
    : "";
  const metaDescription = htmlEscape(truncate(item.summary, 160), true);

  let output = detailTemplate;
  output = output.replaceAll("__COMPANY_ANNOUNCEMENT_META_DESCRIPTION__", metaDescription);
  output = output.replaceAll("__COMPANY_ANNOUNCEMENT_CANONICAL_URL__", htmlEscape(pageUrl, true));
  output = output.replaceAll("__COMPANY_ANNOUNCEMENT_PAGE_TITLE__", htmlEscape(pageTitle, true));
  output = replaceOnce(output, "<!-- __COMPANY_ANNOUNCEMENT_DETAIL_BUILD_META__ -->", buildMetaComment([item]));
  output = replaceOnce(output, "<!-- __COMPANY_ANNOUNCEMENT_DETAIL_SCHEMA__ -->", escapeScriptJson(renderDetailSchema(item)));
  output = output.replaceAll("__COMPANY_ANNOUNCEMENT_TITLE__", htmlEscape(item.title));
  output = output.replaceAll("__COMPANY_ANNOUNCEMENT_PUBLISHED_AT__", htmlEscape(item.publishedAt, true));
  output = replaceOnce(output, "<!-- __COMPANY_ANNOUNCEMENT_EFFECTIVE_DATE__ -->", effectiveDate);
  output = output.replaceAll("__COMPANY_ANNOUNCEMENT_SUMMARY__", htmlEscape(item.summary));
  output = replaceOnce(output, "<!-- __COMPANY_ANNOUNCEMENT_BODY__ -->", renderBodyBlocks(item));
  output = replaceOnce(output, "<!-- __SITE_HEADER__ -->", renderDetailHeader(shellPartials.header).split("\n").map((line) => `  ${line}`).join("\n"));
  output = replaceOnce(output, "<!-- __SITE_FOOTER__ -->", shellPartials.footer.split("\n").map((line) => `  ${line}`).join("\n"));
  output = replaceOnce(output, "<!-- __SITE_SHELL_SCRIPT__ -->", '  <script src="../scripts/site-shell.js" defer></script>');
  return output;
}

async function cleanupStaleDetailPages(announcements) {
  await mkdir(DETAIL_OUTPUT_DIR, { recursive: true });
  const expectedFiles = new Set(announcements.map((item) => `${item.slug}.html`));
  const entries = await readdir(DETAIL_OUTPUT_DIR, { withFileTypes: true });
  const staleFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html") && !expectedFiles.has(entry.name))
    .map((entry) => entry.name);

  await Promise.all(staleFiles.map((fileName) => unlink(path.join(DETAIL_OUTPUT_DIR, fileName))));
  if (staleFiles.length > 0) {
    console.log(`Removed stale company announcement detail page(s): ${staleFiles.join(", ")}`);
  }
}

async function main() {
  const [template, detailTemplate, header, footer, rawData, rawCompanySource] = await Promise.all([
    readFile(TEMPLATE_PATH, "utf8"),
    readFile(DETAIL_TEMPLATE_PATH, "utf8"),
    readFile(path.join(ROOT, "partials", "site-header.html"), "utf8"),
    readFile(path.join(ROOT, "partials", "site-footer.html"), "utf8"),
    readFile(DATA_PATH, "utf8"),
    readFile(COMPANY_SOURCE_PATH, "utf8"),
  ]);
  const shellPartials = {
    header: header.trim(),
    footer: footer.trim(),
  };
  const payload = JSON.parse(rawData);
  const companySource = JSON.parse(rawCompanySource);
  const announcements = normalizeAnnouncements(payload);
  const emptyState = normalizeAnnouncementEmptyState(companySource);
  validateAnnouncements(announcements);

  let output = template;
  output = replaceOnce(output, "<!-- __COMPANY_ANNOUNCEMENTS_BUILD_META__ -->", buildMetaComment(announcements));
  output = replaceOnce(output, "<!-- __COMPANY_ANNOUNCEMENTS_CONTENT__ -->", renderAnnouncementContent(announcements, emptyState));
  output = replaceOnce(output, "<!-- __COMPANY_ANNOUNCEMENTS_SCHEMA__ -->", escapeScriptJson(buildSchema(announcements)));

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, output, "utf8");
  await cleanupStaleDetailPages(announcements);
  await Promise.all(announcements.map((item) => {
    const detailOutputPath = path.join(DETAIL_OUTPUT_DIR, `${item.slug}.html`);
    return writeFile(detailOutputPath, renderDetailPage(detailTemplate, shellPartials, item), "utf8");
  }));
  console.log(`Generated ${path.relative(ROOT, OUTPUT_PATH)} from ${path.relative(ROOT, DATA_PATH)}`);
}

main().catch((error) => {
  console.error("[company-announcements-build]", error);
  process.exit(1);
});

#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const CUSTOM_TEMPLATE_PATH = process.env.COMPANY_SOURCE_TEMPLATE || "";
const CUSTOM_OUTPUT_PATH = process.env.COMPANY_SOURCE_OUTPUT || "";
const HAS_CUSTOM_TARGET = Boolean(CUSTOM_TEMPLATE_PATH || CUSTOM_OUTPUT_PATH);
const TEMPLATE_PATH = CUSTOM_TEMPLATE_PATH || path.join(ROOT, "index.template.html");
const OUTPUT_PATH = CUSTOM_OUTPUT_PATH || path.join(ROOT, "index.html");
const API_BASE = String(
  process.env.COMPANY_SOURCE_API_BASE ||
  process.env.VITE_API_BASE ||
  ""
).replace(/\/+$/, "");
const JSON_PATH = String(process.env.COMPANY_SOURCE_JSON_PATH || "").trim();
const CAREERS_JSON_PATH = String(
  process.env.COMPANY_CAREERS_JSON_PATH || path.join(ROOT, "data", "careers.ko.json"),
).trim();
const ALLOW_UNPUBLISHED_SOURCE = /^(1|true|yes)$/i.test(
  String(process.env.COMPANY_SOURCE_ALLOW_UNPUBLISHED || "").trim(),
);

const SITE_URL = "https://netmelonai.com/";
const ORGANIZATION_ID = `${SITE_URL}#organization`;
const WEBSITE_ID = `${SITE_URL}#website`;
const CONTACT_EMAIL = "netmelon@netmelonai.com";
const OG_IMAGE_URL = `${SITE_URL}images/og-cover.png`;
const LOGO_URL = `${SITE_URL}images/logo.png`;

const htmlEscape = (value, quote = false) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', quote ? "&quot;" : '"');

const renderTextWithBreaks = (value) => String(value ?? "")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => htmlEscape(line))
  .join("<br>");

const buildMetaComment = (data) =>
  `<!-- Company Source injected at build time: sourceVersionId=${htmlEscape(data.sourceVersionId || "unknown")}, version=${htmlEscape(data.version || "unknown")}, publishedAt=${htmlEscape(data.publishedAt || "unknown")} -->`;

const escapeScriptJson = (value) => JSON.stringify(value)
  .replaceAll("<", "\\u003c")
  .replaceAll(">", "\\u003e")
  .replaceAll("&", "\\u0026")
  .replaceAll("\u2028", "\\u2028")
  .replaceAll("\u2029", "\\u2029");

const removeEmpty = (value) => {
  if (Array.isArray(value)) {
    const next = value.map(removeEmpty).filter((item) => item !== undefined);
    return next.length ? next : undefined;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, removeEmpty(item)])
      .filter(([, item]) => item !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }

  if (value === "" || value === null || value === undefined) return undefined;
  return value;
};

const plainText = (value) => String(value ?? "")
  .replace(/\s+/g, " ")
  .trim();

const sitePageUrl = (pathName = "") => new URL(pathName, SITE_URL).toString();

function normalizeSignatureLines(identity) {
  const signature = identity?.brandSignatureMessage || {};
  const raw = Array.isArray(signature.lines) ? signature.lines : [];
  const lines = raw
    .map((line, lineIndex) => {
      const segments = Array.isArray(line?.segments) ? line.segments : [];
      return {
        order: Number.isFinite(Number(line?.order)) ? Number(line.order) : lineIndex + 1,
        segments: segments
          .map((segment, segmentIndex) => ({
            text: String(segment?.text || "").trim(),
            emphasis: segment?.emphasis === true,
            order: Number.isFinite(Number(segment?.order)) ? Number(segment.order) : segmentIndex + 1,
          }))
          .filter((segment) => segment.text)
          .sort((a, b) => a.order - b.order),
      };
    })
    .filter((line) => line.segments.length > 0)
    .sort((a, b) => a.order - b.order);

  if (lines.length > 0) return lines;

  const legacy = Array.isArray(identity?.homepageHeroLines) ? identity.homepageHeroLines : [];
  return legacy
    .map((line, index) => ({
      order: Number.isFinite(Number(line?.order)) ? Number(line.order) : index + 1,
      segments: [{ text: String(line?.text || "").trim(), emphasis: line?.emphasis === true, order: 1 }],
    }))
    .filter((line) => line.segments[0].text)
    .sort((a, b) => a.order - b.order);
}

function renderHeroLines(identity) {
  const lines = normalizeSignatureLines(identity);
  if (!lines.length) throw new Error("Company Source brandSignatureMessage.lines is empty.");

  return lines.map((line) => {
    const inner = line.segments.map((segment) => {
      const text = htmlEscape(segment.text);
      return segment.emphasis ? `<span class="hero-emphasis">${text}</span>` : text;
    }).join("");
    return `            <span class="hero-line">${inner}</span>`;
  }).join("\n");
}

function normalizeCoreValues(values) {
  const raw = Array.isArray(values) ? values : [];
  return raw
    .map((item, index) => ({
      key: String(item?.key || item?.title || `core_value_${index + 1}`).trim(),
      title: String(item?.title || "").trim(),
      body: String(item?.body || "").trim(),
      order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index + 1,
    }))
    .filter((item) => item.title && item.body)
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({ ...item, order: index + 1 }));
}

function renderCompanyCoreValueCards(values) {
  return normalizeCoreValues(values).map((value) => [
    '            <article class="company-core-value-card">',
    `              <span>#${value.order}</span>`,
    `              <h3>${htmlEscape(value.title)}</h3>`,
    `              <p>${htmlEscape(value.body)}</p>`,
    "            </article>",
  ].join("\n")).join("\n");
}

function normalizeCareerJobs(payload) {
  const raw = Array.isArray(payload) ? payload : payload?.jobs;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((job, index) => ({
      id: String(job?.id || job?.num || index + 1).trim(),
      title: String(job?.title || "").trim(),
      team: String(job?.team || "").trim(),
      employmentType: String(job?.employmentType || "").trim(),
      location: String(job?.location || "Seoul, KR").trim(),
      mission: String(job?.mission || "").trim(),
      responsibilities: Array.isArray(job?.responsibilities) ? job.responsibilities.map(plainText).filter(Boolean) : [],
      requirements: Array.isArray(job?.requirements) ? job.requirements.map(plainText).filter(Boolean) : [],
      preferred: Array.isArray(job?.preferred) ? job.preferred.map(plainText).filter(Boolean) : [],
      priority: String(job?.priority || "").trim(),
      order: Number.isFinite(Number(job?.num)) ? Number(job.num) : index + 1,
    }))
    .filter((job) => job.id && job.title && job.mission)
    .sort((a, b) => a.order - b.order);
}

function normalizeCareersData(payload) {
  return {
    headline: String(payload?.headline || "").trim(),
    updatedDate: String(payload?.updatedDate || "").trim(),
    jobs: normalizeCareerJobs(payload),
  };
}

function mapEmploymentType(value) {
  if (/정규|full/i.test(value)) return "FULL_TIME";
  if (/계약|contract/i.test(value)) return "CONTRACTOR";
  if (/인턴|intern/i.test(value)) return "INTERN";
  if (/파트|part/i.test(value)) return "PART_TIME";
  return "";
}

function parseJobLocation(value) {
  const text = String(value || "").trim();
  const [rawCity, rawCountry] = text.split(",").map((item) => item.trim());
  return {
    "@type": "Place",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": rawCity || "Seoul",
      "addressCountry": rawCountry || "KR",
    },
  };
}

function buildOrganizationNode(data) {
  const identity = data.identity || {};
  return removeEmpty({
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    "name": String(identity.companyName || "Netmelon").trim(),
    "alternateName": String(identity.koreanName || "네트멜론").trim(),
    "url": SITE_URL,
    "logo": LOGO_URL,
    "image": OG_IMAGE_URL,
    "description": plainText(identity.mission),
    "email": CONTACT_EMAIL,
    "sameAs": [
      "https://naepopquiz.com/",
      "https://studio.naepopquiz.com/",
      "https://play.google.com/store/apps/details?id=com.netmelon.naepopquiz",
      "https://apple.co/4ez9nji",
    ],
    "contactPoint": [
      {
        "@type": "ContactPoint",
        "contactType": "customer support",
        "email": CONTACT_EMAIL,
        "url": SITE_URL,
        "availableLanguage": ["ko"],
      },
    ],
  });
}

function buildBreadcrumb(items) {
  return {
    "@type": "BreadcrumbList",
    "itemListElement": items.map((item, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": item.name,
      "item": item.url,
    })),
  };
}

function buildHomeSchema(data) {
  const identity = data.identity || {};
  const mission = plainText(identity.mission);
  const organization = buildOrganizationNode(data);

  return {
    "@context": "https://schema.org",
    "@graph": [
      organization,
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        "name": "Netmelon",
        "url": SITE_URL,
        "inLanguage": "ko-KR",
        "publisher": { "@id": ORGANIZATION_ID },
      },
      {
        "@type": "WebPage",
        "@id": sitePageUrl("#webpage"),
        "url": SITE_URL,
        "name": "네트멜론 | 언어 학습 기술 기업",
        "description": mission,
        "inLanguage": "ko-KR",
        "isPartOf": { "@id": WEBSITE_ID },
        "about": { "@id": ORGANIZATION_ID },
        "primaryImageOfPage": { "@type": "ImageObject", "url": OG_IMAGE_URL },
      },
      {
        "@type": "SoftwareApplication",
        "@id": "https://naepopquiz.com/#app",
        "name": "내팝퀴즈",
        "url": "https://naepopquiz.com/",
        "applicationCategory": "EducationalApplication",
        "operatingSystem": "iOS, Android",
        "publisher": { "@id": ORGANIZATION_ID },
      },
      {
        "@type": "WebApplication",
        "@id": "https://studio.naepopquiz.com/#studio",
        "name": "내팝퀴즈 스튜디오",
        "url": "https://studio.naepopquiz.com/",
        "applicationCategory": "EducationalApplication",
        "publisher": { "@id": ORGANIZATION_ID },
      },
      {
        "@type": "FAQPage",
        "@id": sitePageUrl("#faq"),
        "inLanguage": "ko-KR",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "네트멜론은 어떤 회사인가요?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": mission,
            },
          },
          {
            "@type": "Question",
            "name": "내팝퀴즈와 네트멜론의 관계는 무엇인가요?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "네트멜론은 내팝퀴즈 앱과 내팝퀴즈 스튜디오를 기획, 운영, 퍼블리싱하는 회사입니다.",
            },
          },
          {
            "@type": "Question",
            "name": "공식 사이트는 어떻게 구분되나요?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "회사 홈페이지는 netmelonai.com, 앱 랜딩 사이트는 naepopquiz.com, 스튜디오는 studio.naepopquiz.com에서 제공합니다.",
            },
          },
        ],
      },
    ].map(removeEmpty),
  };
}

function buildCompanySchema(data) {
  const identity = data.identity || {};
  const description = [identity.mission, identity.vision].map(plainText).filter(Boolean).join(" ");
  const pageUrl = sitePageUrl("company.html");

  return {
    "@context": "https://schema.org",
    "@graph": [
      buildOrganizationNode(data),
      {
        "@type": "AboutPage",
        "@id": `${pageUrl}#webpage`,
        "url": pageUrl,
        "name": "네트멜론 | 회사소개",
        "description": description,
        "inLanguage": "ko-KR",
        "isPartOf": { "@id": WEBSITE_ID },
        "about": { "@id": ORGANIZATION_ID },
        "breadcrumb": buildBreadcrumb([
          { name: "홈", url: SITE_URL },
          { name: "회사소개", url: pageUrl },
        ]),
      },
    ].map(removeEmpty),
  };
}

function buildCareersSchema(data, careers) {
  const pageUrl = sitePageUrl("careers.html");
  const updatedDate = /^\d{4}-\d{2}-\d{2}$/.test(careers.updatedDate)
    ? careers.updatedDate
    : new Date().toISOString().slice(0, 10);
  const organization = buildOrganizationNode(data);
  delete organization.description;
  const jobs = careers.jobs.map((job) => removeEmpty({
    "@type": "JobPosting",
    "@id": `${pageUrl}?job_id=${encodeURIComponent(job.id)}#job`,
    "title": job.title,
    "description": [job.mission, ...job.responsibilities, ...job.requirements].map(plainText).filter(Boolean).join("\n"),
    "identifier": {
      "@type": "PropertyValue",
      "name": "Netmelon",
      "value": job.id,
    },
    "datePosted": updatedDate,
    "employmentType": mapEmploymentType(job.employmentType),
    "hiringOrganization": { "@id": ORGANIZATION_ID },
    "jobLocation": parseJobLocation(job.location),
    "directApply": true,
    "url": `${pageUrl}?job_id=${encodeURIComponent(job.id)}`,
  }));

  return {
    "@context": "https://schema.org",
    "@graph": [
      organization,
      {
        "@type": "CollectionPage",
        "@id": `${pageUrl}#webpage`,
        "url": pageUrl,
        "name": "네트멜론 채용",
        "description": careers.headline || plainText(data.identity?.recruitingOneLiner),
        "inLanguage": "ko-KR",
        "isPartOf": { "@id": WEBSITE_ID },
        "about": { "@id": ORGANIZATION_ID },
        "breadcrumb": buildBreadcrumb([
          { name: "홈", url: SITE_URL },
          { name: "채용", url: pageUrl },
        ]),
      },
      {
        "@type": "ItemList",
        "@id": `${pageUrl}#jobs`,
        "name": "네트멜론 채용 공고",
        "numberOfItems": jobs.length,
        "itemListElement": jobs.map((job, index) => ({
          "@type": "ListItem",
          "position": index + 1,
          "item": { "@id": job["@id"] },
        })),
      },
      ...jobs,
    ].map(removeEmpty),
  };
}

function replaceOnce(source, marker, value) {
  if (!source.includes(marker)) throw new Error(`Missing build marker: ${marker}`);
  return source.replace(marker, value);
}

function updateMetaContent(source, selectorStart, content) {
  if (!content) return source;
  const escaped = htmlEscape(content, true);
  const pattern = new RegExp(`(<${selectorStart} content=")[^"]*(">)`, "i");
  return source.replace(pattern, `$1${escaped}$2`);
}

function assertNoForbiddenTokens(output, pageKey) {
  const forbidden = [
    "__COMPANY_SOURCE_",
    "loadPublicCompanySource",
    "fetchCompanyPublicSource",
    "company/public-source fallback used",
    "company public source API base",
  ];
  const found = forbidden.filter((token) => output.includes(token));
  if (found.length) {
    throw new Error(`${pageKey} output still contains forbidden token(s): ${found.join(", ")}`);
  }
}

async function loadCompanySource() {
  if (JSON_PATH) {
    return JSON.parse(await readFile(JSON_PATH, "utf8"));
  }

  if (!API_BASE) {
    throw new Error("Set COMPANY_SOURCE_API_BASE or COMPANY_SOURCE_JSON_PATH before injecting Company Source.");
  }

  const response = await fetch(`${API_BASE}/company/public-source`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Company Source fetch failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function loadCareersData() {
  const payload = JSON.parse(await readFile(CAREERS_JSON_PATH, "utf8"));
  const careers = normalizeCareersData(payload);
  validateCareersData(careers);
  return careers;
}

function validateCompanySource(data) {
  const identity = data?.identity || {};
  const required = [
    ["identity.brandSignatureMessage.lines", normalizeSignatureLines(identity).length],
    ["identity.freedomStatement", String(identity.freedomStatement || "").trim()],
    ["identity.mission", String(identity.mission || "").trim()],
    ["identity.vision", String(identity.vision || "").trim()],
    ["identity.appIntroTitle", String(identity.appIntroTitle || identity.campaignMessage || "").trim()],
    ["identity.appIntroBody", String(identity.appIntroBody || identity.companyIntroBody || "").trim()],
    ["identity.studioIntroTitle", String(identity.studioIntroTitle || "").trim()],
    ["identity.studioIntroBody", String(identity.studioIntroBody || "").trim()],
    ["identity.recruitingOneLiner", String(identity.recruitingOneLiner || "").trim()],
    ["coreValues", normalizeCoreValues(data?.coreValues).length],
  ];

  const missing = required.filter(([, value]) => !value).map(([label]) => label);
  if (missing.length) {
    throw new Error(`Company Source is missing required fields: ${missing.join(", ")}`);
  }

  const provenance = [
    ["sourceVersionId", String(data?.sourceVersionId || "").trim()],
    ["version", String(data?.version || "").trim()],
    ["publishedAt", String(data?.publishedAt || "").trim()],
    ["publishedBy", String(data?.publishedBy || "").trim()],
  ];
  const missingProvenance = provenance.filter(([, value]) => !value).map(([label]) => label);
  const isDefaultSource = data?.isDefault === true;

  if ((isDefaultSource || missingProvenance.length) && !ALLOW_UNPUBLISHED_SOURCE) {
    const reasons = [
      isDefaultSource ? "backend returned isDefault=true" : "",
      missingProvenance.length ? `missing provenance: ${missingProvenance.join(", ")}` : "",
    ].filter(Boolean);
    throw new Error(
      `Company Source is not a published public source (${reasons.join("; ")}). ` +
      "Publish a Corporate Source version before production injection, or set COMPANY_SOURCE_ALLOW_UNPUBLISHED=1 only for local development.",
    );
  }

  if ((isDefaultSource || missingProvenance.length) && ALLOW_UNPUBLISHED_SOURCE) {
    console.warn("[company-source-build] unpublished/default source allowed for local development only");
  }
}

function validateCareersData(careers) {
  if (!careers.headline) {
    throw new Error("Careers data is missing headline.");
  }

  if (!careers.jobs.length) {
    throw new Error("Careers data is missing jobs.");
  }

  const duplicatedIds = careers.jobs
    .map((job) => job.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);
  if (duplicatedIds.length) {
    throw new Error(`Careers data has duplicated job id(s): ${[...new Set(duplicatedIds)].join(", ")}`);
  }
}

function injectIndex(template, data) {
  const identity = data.identity;
  const mission = String(identity.mission || "").trim();
  const description = mission || String(identity.brandSignatureMessage?.plainText || "").trim();
  const companyName = String(identity.koreanName || identity.companyName || "네트멜론").trim();
  const title = `${companyName} | 언어 학습 기술 기업`;

  let output = template;
  output = replaceOnce(output, "<!-- __COMPANY_SOURCE_HOME_HERO_LINES__ -->", `\n${renderHeroLines(identity)}\n          `);
  output = replaceOnce(output, "<!-- __COMPANY_SOURCE_APP_TITLE__ -->", renderTextWithBreaks(identity.appIntroTitle || identity.campaignMessage));
  output = replaceOnce(output, "<!-- __COMPANY_SOURCE_APP_COPY__ -->", renderTextWithBreaks(identity.appIntroBody || identity.companyIntroBody));
  output = replaceOnce(output, "<!-- __COMPANY_SOURCE_STUDIO_TITLE__ -->", renderTextWithBreaks(identity.studioIntroTitle));
  output = replaceOnce(output, "<!-- __COMPANY_SOURCE_STUDIO_COPY__ -->", renderTextWithBreaks(identity.studioIntroBody));
  output = replaceOnce(output, "<!-- __COMPANY_SOURCE_BUILD_META__ -->", buildMetaComment(data));
  output = replaceOnce(output, "<!-- __COMPANY_SOURCE_HOME_SCHEMA__ -->", escapeScriptJson(buildHomeSchema(data)));

  output = updateMetaContent(output, 'meta name="description"', description);
  output = updateMetaContent(output, 'meta property="og:description"', description);
  output = updateMetaContent(output, 'meta name="twitter:title"', title);
  output = updateMetaContent(output, 'meta name="twitter:description"', description);
  output = output.replace(/<title>[^<]*<\/title>/i, `<title>${htmlEscape(title)}</title>`);

  return output;
}

function injectCompany(template, data) {
  const identity = data.identity;
  const freedomStatement = String(identity.freedomStatement || "").trim();
  const mission = String(identity.mission || "").trim();
  const vision = String(identity.vision || "").trim();
  const description = [mission, vision].filter(Boolean).join(" ");

  let output = template;
  output = replaceOnce(output, "<!-- __COMPANY_SOURCE_BUILD_META__ -->", buildMetaComment(data));
  output = replaceOnce(output, "<!-- __COMPANY_SOURCE_COMPANY_FREEDOM_STATEMENT__ -->", renderTextWithBreaks(freedomStatement));
  output = replaceOnce(output, "<!-- __COMPANY_SOURCE_COMPANY_MISSION__ -->", renderTextWithBreaks(mission));
  output = replaceOnce(output, "<!-- __COMPANY_SOURCE_COMPANY_VISION__ -->", renderTextWithBreaks(vision));
  output = replaceOnce(output, "<!-- __COMPANY_SOURCE_COMPANY_CORE_VALUES__ -->", `\n${renderCompanyCoreValueCards(data.coreValues)}\n          `);
  output = replaceOnce(output, "<!-- __COMPANY_SOURCE_COMPANY_SCHEMA__ -->", escapeScriptJson(buildCompanySchema(data)));
  output = updateMetaContent(output, 'meta name="description"', description);
  output = updateMetaContent(output, 'meta property="og:description"', description);
  output = updateMetaContent(output, 'meta name="twitter:description"', description);
  return output;
}

function injectCareers(template, data, careers) {
  const identity = data.identity;
  const headline = careers?.headline || String(identity.recruitingOneLiner || "").trim();
  const careersData = {
    sourceVersionId: data.sourceVersionId || "",
    version: data.version || "",
    publishedAt: data.publishedAt || "",
    recruitingOneLiner: headline,
  };

  let output = template;
  output = replaceOnce(output, "<!-- __COMPANY_SOURCE_BUILD_META__ -->", buildMetaComment(data));
  output = replaceOnce(output, "<!-- __COMPANY_SOURCE_CAREERS_HEADLINE__ -->", htmlEscape(careersData.recruitingOneLiner));
  output = replaceOnce(output, "<!-- __COMPANY_SOURCE_CAREERS_INTRO__ -->", "");
  output = replaceOnce(output, "<!-- __COMPANY_SOURCE_CAREERS_DATA__ -->", escapeScriptJson(careersData));
  output = replaceOnce(output, "<!-- __COMPANY_SOURCE_CAREERS_SCHEMA__ -->", escapeScriptJson(buildCareersSchema(data, careers || { headline, updatedDate: "", jobs: [] })));
  output = updateMetaContent(output, 'meta name="description"', careersData.recruitingOneLiner);
  output = updateMetaContent(output, 'meta property="og:description"', careersData.recruitingOneLiner);
  output = updateMetaContent(output, 'meta name="twitter:description"', careersData.recruitingOneLiner);
  return output;
}

const DEFAULT_PAGES = [
  {
    key: "index",
    templatePath: path.join(ROOT, "index.template.html"),
    outputPath: path.join(ROOT, "index.html"),
    inject: injectIndex,
  },
  {
    key: "company",
    templatePath: path.join(ROOT, "company.template.html"),
    outputPath: path.join(ROOT, "company.html"),
    inject: injectCompany,
  },
  {
    key: "careers",
    templatePath: path.join(ROOT, "careers.template.html"),
    outputPath: path.join(ROOT, "careers.html"),
    inject: injectCareers,
  },
];

const CUSTOM_PAGES = [
  {
    key: "index",
    templatePath: TEMPLATE_PATH,
    outputPath: OUTPUT_PATH,
    inject: injectIndex,
  },
];

async function main() {
  const data = await loadCompanySource();
  validateCompanySource(data);
  const careers = HAS_CUSTOM_TARGET
    ? { headline: "", updatedDate: "", jobs: [] }
    : await loadCareersData();

  const pages = HAS_CUSTOM_TARGET ? CUSTOM_PAGES : DEFAULT_PAGES;
  for (const page of pages) {
    const template = await readFile(page.templatePath, "utf8");
    const output = page.inject(template, data, careers);
    assertNoForbiddenTokens(output, page.key);
    await writeFile(page.outputPath, output, "utf8");
    console.log(`Injected Company Source ${data.version || "unknown"} into ${page.outputPath}`);
  }
}

main().catch((error) => {
  console.error("[company-source-build]", error);
  process.exit(1);
});

#!/usr/bin/env node
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const SOURCE_LOCALE = String(process.env.COMPANY_SOURCE_LOCALE || "ko").trim().toLowerCase();
const SOURCE_URL = String(process.env.COMPANY_PUBLIC_SOURCE_URL || process.env.COMPANY_SOURCE_API_URL || "").trim();
const API_BASE = String(process.env.COMPANY_SOURCE_API_BASE || process.env.VITE_API_BASE || "").replace(/\/+$/, "");
const OUTPUT_PATH = process.env.COMPANY_SOURCE_JSON_PATH ||
  path.join(ROOT, "data", `company-source.${SOURCE_LOCALE}.json`);
const BASE_JSON_PATH = process.env.COMPANY_SOURCE_BASE_JSON_PATH ||
  path.join(ROOT, "data", "company-source.ko.json");
const BEARER_TOKEN = process.env.COMPANY_SOURCE_BEARER_TOKEN || "";
const ALLOW_HANGUL = /^(1|true|yes)$/i.test(String(process.env.COMPANY_SOURCE_ALLOW_HANGUL || "").trim());

const SUPPORTED_LOCALES = new Set(["ko", "en"]);
const PUBLISHABLE_FIELD_STATUSES = new Set(["reviewed", "published"]);

const clean = (value) => String(value ?? "").trim();

function buildSourceUrl() {
  const url = SOURCE_URL ? new URL(SOURCE_URL) : new URL(`${API_BASE}/company/public-source`);
  if (SOURCE_LOCALE !== "ko") {
    url.searchParams.set("locale", SOURCE_LOCALE);
  }
  return url;
}

function unique(values) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function routePublishedAt(route) {
  return clean(route?.publishedAt || route?.updatedAt || "");
}

function latestTimestamp(routes, fallback = "") {
  return unique(routes.map(routePublishedAt).concat(clean(fallback))).sort().at(-1) || "";
}

function assertSupportedLocale() {
  if (!SUPPORTED_LOCALES.has(SOURCE_LOCALE)) {
    throw new Error(`Unsupported company source locale: ${SOURCE_LOCALE}`);
  }
}

function assertNoHangulInPublicEnglish(label, value) {
  if (ALLOW_HANGUL) return;
  if (/[가-힣]/.test(clean(value))) {
    throw new Error(`${label} contains Korean text. Public English source must not use Korean fallback content.`);
  }
}

function validateKoreanPublicSource(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Company Source payload must be a JSON object.");
  }
  if (!payload.identity || typeof payload.identity !== "object") {
    throw new Error("Company Source payload is missing identity.");
  }
  if (!Array.isArray(payload.coreValues)) {
    throw new Error("Company Source payload is missing coreValues.");
  }
  return payload;
}

function buildFieldMap(localizedPayload) {
  const routes = Array.isArray(localizedPayload?.routes) ? localizedPayload.routes : [];
  if (localizedPayload?.isDefault === true || routes.length === 0) {
    throw new Error("Company English public source has no published routes.");
  }

  const fields = new Map();
  for (const route of routes) {
    if (clean(route?.locale) !== "en") continue;
    const routeFields = Array.isArray(route?.fields) ? route.fields : [];
    for (const field of routeFields) {
      const fieldPath = clean(field?.fieldPath);
      const targetText = clean(field?.targetText);
      const status = clean(field?.status);
      if (!fieldPath || !targetText) continue;
      if (!PUBLISHABLE_FIELD_STATUSES.has(status)) {
        throw new Error(`English field ${fieldPath} is not reviewed or published: ${status || "missing status"}`);
      }
      fields.set(fieldPath, targetText);
    }
  }
  return fields;
}

function requiredField(fields, fieldPath) {
  const value = clean(fields.get(fieldPath));
  if (!value) {
    throw new Error(`Company English public source is missing required field: ${fieldPath}`);
  }
  assertNoHangulInPublicEnglish(fieldPath, value);
  return value;
}

function optionalField(fields, fieldPath) {
  const value = clean(fields.get(fieldPath));
  if (value) assertNoHangulInPublicEnglish(fieldPath, value);
  return value;
}

function brandSignatureMessageFromPlainText(value) {
  const lines = clean(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) {
    throw new Error("Company English brand signature is empty.");
  }
  return {
    lines: lines.map((line, index) => ({
      order: index + 1,
      segments: [
        {
          text: line,
          order: 1,
        },
      ],
    })),
  };
}

function transformEnglishPublicSource(localizedPayload, baseSource) {
  if (!localizedPayload || typeof localizedPayload !== "object") {
    throw new Error("Company English public source must be a JSON object.");
  }
  if (clean(localizedPayload.locale) !== "en") {
    throw new Error(`Company English public source locale must be en. Received: ${clean(localizedPayload.locale) || "missing"}`);
  }

  const routes = Array.isArray(localizedPayload.routes) ? localizedPayload.routes : [];
  const fields = buildFieldMap(localizedPayload);
  const baseIdentity = baseSource?.identity || {};
  const baseCoreValues = Array.isArray(baseSource?.coreValues) ? baseSource.coreValues : [];

  const coreValues = baseCoreValues.map((value, index) => {
    const key = clean(value?.key || `core_value_${index + 1}`);
    return {
      key,
      title: requiredField(fields, `coreValues.${key}.title`),
      body: requiredField(fields, `coreValues.${key}.body`),
      order: Number.isFinite(Number(value?.order)) ? Number(value.order) : index + 1,
    };
  });

  const sourceVersionIds = unique(routes.map((route) => route?.sourceVersionId));
  const publishedBy = unique(routes.map((route) => route?.publishedBy).concat(localizedPayload.updatedBy || ""))[0] || "studio_cms";
  const publishedAt = latestTimestamp(routes, localizedPayload.updatedAt);

  if (!sourceVersionIds.length) {
    throw new Error("Company English public source is missing sourceVersionId.");
  }
  if (!publishedAt) {
    throw new Error("Company English public source is missing publishedAt or updatedAt.");
  }

  return {
    sourceVersionId: sourceVersionIds.join("+"),
    version: `en:${sourceVersionIds.join("+")}`,
    publishedAt,
    publishedBy,
    locale: "en",
    sourceLocale: "ko",
    isDefault: false,
    identity: {
      companyName: "Netmelon",
      companyNameKo: "Netmelon",
      email: clean(baseIdentity.email || "netmelon@netmelonai.com"),
      brandSignatureMessage: brandSignatureMessageFromPlainText(
        requiredField(fields, "identity.brandSignatureMessage.plainText"),
      ),
      freedomStatement: requiredField(fields, "identity.freedomStatement"),
      mission: requiredField(fields, "identity.mission"),
      vision: requiredField(fields, "identity.vision"),
      companyIntroTitle: optionalField(fields, "identity.companyIntroTitle"),
      companyIntroBody: optionalField(fields, "identity.companyIntroBody"),
      appIntroTitle: requiredField(fields, "identity.appIntroTitle"),
      appIntroBody: requiredField(fields, "identity.appIntroBody"),
      studioIntroTitle: requiredField(fields, "identity.studioIntroTitle"),
      studioIntroBody: requiredField(fields, "identity.studioIntroBody"),
      recruitingOneLiner: requiredField(fields, "identity.recruitingOneLiner"),
      irOneLiner: optionalField(fields, "identity.irOneLiner"),
      announcementEmptyTitle: requiredField(fields, "identity.announcementEmptyTitle"),
      announcementEmptyBody: requiredField(fields, "identity.announcementEmptyBody"),
    },
    coreValues,
  };
}

async function fetchJson() {
  const requestUrl = buildSourceUrl();
  const headers = BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {};
  const response = await fetch(requestUrl, { headers });
  if (!response.ok) {
    throw new Error(`Company Source fetch failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function writeJson(payload) {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  const tmpPath = `${OUTPUT_PATH}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tmpPath, OUTPUT_PATH);
  console.log(`Fetched company ${SOURCE_LOCALE} source to ${path.relative(ROOT, OUTPUT_PATH)}`);
}

async function main() {
  assertSupportedLocale();
  if (!SOURCE_URL && !API_BASE) {
    throw new Error("Set COMPANY_PUBLIC_SOURCE_URL or COMPANY_SOURCE_API_BASE to fetch Company Source.");
  }

  const payload = await fetchJson();
  if (SOURCE_LOCALE === "ko") {
    await writeJson(validateKoreanPublicSource(payload));
    return;
  }

  const baseSource = validateKoreanPublicSource(JSON.parse(await readFile(BASE_JSON_PATH, "utf8")));
  await writeJson(transformEnglishPublicSource(payload, baseSource));
}

main().catch((error) => {
  console.error("[company-source-fetch]", error);
  process.exit(1);
});

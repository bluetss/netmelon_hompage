#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const clean = (value) => String(value ?? "").trim();

const SEED_PATH = process.env.COMPANY_TRANSLATIONS_SEED_PATH ||
  path.join(ROOT, "data", "company-translations.en.seed.json");
const API_BASE = String(
  process.env.COMPANY_TRANSLATIONS_API_BASE ||
  process.env.COMPANY_SOURCE_API_BASE ||
  process.env.VITE_API_BASE ||
  "",
).replace(/\/+$/, "");
const API_PATH = String(process.env.COMPANY_TRANSLATIONS_API_PATH || "/company/source/translations").trim();
const BEARER_TOKEN = String(
  process.env.COMPANY_TRANSLATIONS_BEARER_TOKEN ||
  process.env.COMPANY_SOURCE_BEARER_TOKEN ||
  "",
).trim();
const IMPORT_STATUS = clean(process.env.COMPANY_TRANSLATIONS_IMPORT_STATUS || "");
const DRY_RUN = /^(1|true|yes)$/i.test(String(process.env.COMPANY_TRANSLATIONS_DRY_RUN || "").trim());
const ALLOW_UNAUTHENTICATED = /^(1|true|yes)$/i.test(
  String(process.env.COMPANY_TRANSLATIONS_ALLOW_UNAUTHENTICATED || "").trim(),
);

const ALLOWED_IMPORT_STATUSES = new Set(["machine_draft", "human_draft", "in_review", "reviewed", "stale"]);

function assertNoKorean(label, value) {
  if (/[가-힣]/.test(clean(value))) {
    throw new Error(`${label} contains Korean text. English translation seed must not use Korean fallback copy.`);
  }
}

function assertRecord(record, index) {
  const label = `records[${index}]`;
  const required = [
    "translationId",
    "routeId",
    "sourceLocale",
    "targetLocale",
    "sourceVersionId",
    "sourceHash",
    "translationStatus",
  ];

  for (const key of required) {
    if (!clean(record?.[key])) throw new Error(`${label}.${key} is required.`);
  }
  if (record.sourceLocale !== "ko") throw new Error(`${label}.sourceLocale must be ko.`);
  if (record.targetLocale !== "en") throw new Error(`${label}.targetLocale must be en.`);
  if (!/^sha256:[a-f0-9]{64}$/.test(clean(record.sourceHash))) {
    throw new Error(`${label}.sourceHash must be a sha256 digest.`);
  }
  if (record.translationStatus === "published") {
    throw new Error(`${label}.translationStatus must not be published during seed import.`);
  }
  if (!Array.isArray(record.fields) || record.fields.length === 0) {
    throw new Error(`${label}.fields must contain at least one field.`);
  }

  record.fields.forEach((field, fieldIndex) => {
    const fieldLabel = `${label}.fields[${fieldIndex}]`;
    if (!clean(field?.fieldPath)) throw new Error(`${fieldLabel}.fieldPath is required.`);
    if (!clean(field?.sourceText)) throw new Error(`${fieldLabel}.sourceText is required.`);
    if (!clean(field?.targetText)) throw new Error(`${fieldLabel}.targetText is required.`);
    assertNoKorean(`${fieldLabel}.targetText`, field.targetText);
  });
}

function validateSeed(seed) {
  if (!seed || typeof seed !== "object") {
    throw new Error("Company translation seed must be a JSON object.");
  }
  if (seed.sourceLocale !== "ko") throw new Error("Company translation seed sourceLocale must be ko.");
  if (seed.targetLocale !== "en") throw new Error("Company translation seed targetLocale must be en.");
  if (!Array.isArray(seed.records) || seed.records.length === 0) {
    throw new Error("Company translation seed must contain records.");
  }
  seed.records.forEach(assertRecord);
  return seed;
}

function recordForImport(record) {
  if (!IMPORT_STATUS) return record;
  if (!ALLOWED_IMPORT_STATUSES.has(IMPORT_STATUS)) {
    throw new Error(`Unsupported COMPANY_TRANSLATIONS_IMPORT_STATUS: ${IMPORT_STATUS}`);
  }
  return {
    ...record,
    translationStatus: IMPORT_STATUS,
    fields: record.fields.map((field) => ({
      ...field,
      status: IMPORT_STATUS === "reviewed" ? "reviewed" : field.status,
    })),
  };
}

function endpointUrl(translationId = "") {
  if (!API_BASE) {
    throw new Error("Set COMPANY_TRANSLATIONS_API_BASE, COMPANY_SOURCE_API_BASE, or VITE_API_BASE before importing.");
  }
  const basePath = API_PATH.startsWith("/") ? API_PATH : `/${API_PATH}`;
  const suffix = translationId ? `/${encodeURIComponent(translationId)}` : "";
  return `${API_BASE}${basePath}${suffix}`;
}

async function requestJson(method, url, payload) {
  const headers = {
    "Content-Type": "application/json",
  };
  if (BEARER_TOKEN) headers.Authorization = `Bearer ${BEARER_TOKEN}`;

  const response = await fetch(url, {
    method,
    headers,
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body: parsed,
  };
}

function patchPayload(record) {
  return {
    sourceVersionId: record.sourceVersionId,
    sourceHash: record.sourceHash,
    translationStatus: record.translationStatus,
    translationOwner: record.translationOwner,
    reviewOwner: record.reviewOwner,
    fields: record.fields,
  };
}

async function importRecord(record) {
  const createUrl = endpointUrl();
  const createResult = await requestJson("POST", createUrl, record);
  if (createResult.ok) {
    return { action: "created", status: createResult.status };
  }
  if (createResult.status !== 409) {
    throw new Error(`${record.translationId} create failed: ${createResult.status} ${createResult.statusText}`);
  }

  const updateUrl = endpointUrl(record.translationId);
  const updateResult = await requestJson("PATCH", updateUrl, patchPayload(record));
  if (!updateResult.ok) {
    throw new Error(`${record.translationId} update failed: ${updateResult.status} ${updateResult.statusText}`);
  }
  return { action: "updated", status: updateResult.status };
}

async function main() {
  const seed = validateSeed(JSON.parse(await readFile(SEED_PATH, "utf8")));
  const records = seed.records.map(recordForImport);
  if (DRY_RUN) {
    console.log(`Dry run: validated ${records.length} English translation seed record(s).`);
    records.forEach((record) => {
      console.log(`- ${record.translationId} ${record.routeId} fields=${record.fields.length}`);
    });
    return;
  }

  if (!BEARER_TOKEN && !ALLOW_UNAUTHENTICATED) {
    throw new Error("Set COMPANY_TRANSLATIONS_BEARER_TOKEN before importing, or set COMPANY_TRANSLATIONS_ALLOW_UNAUTHENTICATED=1 for a trusted local API.");
  }

  const results = [];
  for (const record of records) {
    const result = await importRecord(record);
    results.push({ record, result });
    console.log(`${result.action}: ${record.translationId} (${record.routeId})`);
  }

  const created = results.filter((item) => item.result.action === "created").length;
  const updated = results.filter((item) => item.result.action === "updated").length;
  console.log(`Imported ${results.length} English translation record(s): created=${created}, updated=${updated}`);
}

main().catch((error) => {
  console.error("[company-english-translation-import]", error);
  process.exit(1);
});

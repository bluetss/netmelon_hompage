#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const clean = (value) => String(value ?? "").trim();

const SEED_PATH = process.env.COMPANY_TRANSLATIONS_SEED_PATH ||
  path.join(ROOT, "data", "company-translations.en.seed.json");
const PROJECT_ID = process.env.COMPANY_TRANSLATIONS_FIRESTORE_PROJECT || process.env.GCLOUD_PROJECT || "npq-staging";
const COLLECTION = process.env.COMPANY_TRANSLATIONS_FIRESTORE_COLLECTION || "web_cms_translations";
const UPDATED_BY = process.env.COMPANY_TRANSLATIONS_UPDATED_BY || "netmelondev@gmail.com";
const IMPORT_STATUS = clean(process.env.COMPANY_TRANSLATIONS_IMPORT_STATUS || "");
const FIREBASE_TOOLS_CONFIG = process.env.FIREBASE_TOOLS_CONFIG ||
  path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
const FIREBASE_CLI_CLIENT_ID = process.env.FIREBASE_CLI_CLIENT_ID ||
  "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const FIREBASE_CLI_CLIENT_SECRET = process.env.FIREBASE_CLI_CLIENT_SECRET || "j9iVZfS8kkCEFUPaAeJV0sAi";
const ACCESS_TOKEN = process.env.GOOGLE_OAUTH_ACCESS_TOKEN || "";
const DRY_RUN = /^(1|true|yes)$/i.test(String(process.env.COMPANY_TRANSLATIONS_DRY_RUN || "").trim());

const ALLOWED_IMPORT_STATUSES = new Set(["machine_draft", "human_draft", "in_review", "reviewed", "stale"]);

function assertNoKorean(label, value) {
  if (/[가-힣]/.test(clean(value))) {
    throw new Error(`${label} contains Korean text. English translation seed must not use Korean fallback copy.`);
  }
}

function validateSeed(seed) {
  if (!seed || typeof seed !== "object") throw new Error("Company translation seed must be a JSON object.");
  if (seed.sourceLocale !== "ko") throw new Error("Company translation seed sourceLocale must be ko.");
  if (seed.targetLocale !== "en") throw new Error("Company translation seed targetLocale must be en.");
  if (!Array.isArray(seed.records) || seed.records.length === 0) {
    throw new Error("Company translation seed must contain records.");
  }

  seed.records.forEach((record, index) => {
    const label = `records[${index}]`;
    for (const key of ["translationId", "routeId", "sourceLocale", "targetLocale", "sourceVersionId", "sourceHash", "translationStatus"]) {
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
  });

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

function firestoreValue(value) {
  if (value == null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, firestoreValue(child)])),
      },
    };
  }
  return { stringValue: String(value) };
}

function firestoreDocument(payload) {
  return {
    fields: Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, firestoreValue(value)])),
  };
}

async function firebaseCliAccessToken() {
  if (ACCESS_TOKEN) return ACCESS_TOKEN;

  const config = JSON.parse(await readFile(FIREBASE_TOOLS_CONFIG, "utf8"));
  const refreshToken = clean(config?.tokens?.refresh_token);
  if (!refreshToken) {
    throw new Error("Firebase Tools refresh token is missing. Set GOOGLE_OAUTH_ACCESS_TOKEN or FIREBASE_TOOLS_CONFIG.");
  }

  const body = new URLSearchParams({
    client_id: FIREBASE_CLI_CLIENT_ID,
    client_secret: FIREBASE_CLI_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(`Google OAuth token refresh failed: ${response.status} ${JSON.stringify(payload?.error || payload)}`);
  }
  return payload.access_token;
}

function documentUrl(translationId) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(PROJECT_ID)}/databases/(default)/documents/${COLLECTION}/${encodeURIComponent(translationId)}`;
}

async function firestoreJson(method, url, token, payload = null) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: payload ? JSON.stringify(payload) : undefined,
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

async function documentExists(token, translationId) {
  const response = await firestoreJson("GET", documentUrl(translationId), token);
  if (response.ok) return true;
  if (response.status === 404) return false;
  throw new Error(`${translationId} lookup failed: ${response.status} ${JSON.stringify(response.body?.error || response.body)}`);
}

function updateMaskUrl(baseUrl, fieldNames) {
  const url = new URL(baseUrl);
  fieldNames.forEach((field) => url.searchParams.append("updateMask.fieldPaths", field));
  return url.toString();
}

async function writeRecord(token, record) {
  const exists = await documentExists(token, record.translationId);
  const now = new Date();
  const payload = {
    translationId: record.translationId,
    siteId: "company",
    routeId: record.routeId,
    sourceLocale: record.sourceLocale,
    targetLocale: record.targetLocale,
    sourceVersionId: record.sourceVersionId,
    sourceHash: record.sourceHash,
    translationStatus: record.translationStatus,
    translationOwner: record.translationOwner || null,
    reviewOwner: record.reviewOwner || null,
    fields: record.fields,
    updatedAt: now,
    updatedBy: UPDATED_BY,
  };
  if (!exists) {
    payload.createdAt = now;
    payload.createdBy = UPDATED_BY;
  }
  if (record.translationStatus === "reviewed") {
    payload.reviewedAt = now;
    payload.reviewedBy = UPDATED_BY;
  }

  const url = updateMaskUrl(documentUrl(record.translationId), Object.keys(payload));
  const response = await firestoreJson("PATCH", url, token, firestoreDocument(payload));
  if (!response.ok) {
    throw new Error(`${record.translationId} Firestore write failed: ${response.status} ${JSON.stringify(response.body?.error || response.body)}`);
  }
  return exists ? "updated" : "created";
}

async function main() {
  const seed = validateSeed(JSON.parse(await readFile(SEED_PATH, "utf8")));
  const records = seed.records.map(recordForImport);
  if (DRY_RUN) {
    console.log(`Dry run: validated ${records.length} English translation seed record(s) for Firestore import.`);
    return;
  }

  const token = await firebaseCliAccessToken();
  let created = 0;
  let updated = 0;
  for (const record of records) {
    const action = await writeRecord(token, record);
    if (action === "created") created += 1;
    else updated += 1;
    console.log(`${action}: ${record.translationId} (${record.routeId})`);
  }
  console.log(`Imported ${created + updated} English translation record(s) to Firestore: created=${created}, updated=${updated}`);
}

main().catch((error) => {
  console.error("[company-english-translation-firestore-import]", error);
  process.exit(1);
});

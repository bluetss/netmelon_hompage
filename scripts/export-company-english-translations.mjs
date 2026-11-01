#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const KO_SOURCE_PATH = process.env.COMPANY_SOURCE_KO_JSON_PATH ||
  path.join(ROOT, "data", "company-source.ko.json");
const EN_SOURCE_PATH = process.env.COMPANY_SOURCE_EN_JSON_PATH ||
  path.join(ROOT, "data", "company-source.en.json");
const OUTPUT_PATH = process.env.COMPANY_ENGLISH_TRANSLATIONS_OUTPUT ||
  path.join(ROOT, "data", "company-translations.en.seed.json");

const TRANSLATION_STATUS = process.env.COMPANY_ENGLISH_TRANSLATION_STATUS || "human_draft";
const TRANSLATION_OWNER = process.env.COMPANY_ENGLISH_TRANSLATION_OWNER || "localization";

const ROUTES = [
  {
    routeId: "company.home",
    reviewOwner: "company",
    fields: [
      "identity.brandSignatureMessage.plainText",
      "identity.appIntroTitle",
      "identity.appIntroBody",
      "identity.studioIntroTitle",
      "identity.studioIntroBody",
    ],
  },
  {
    routeId: "company.overview",
    reviewOwner: "company",
    fields: [
      "identity.brandSignatureMessage.plainText",
      "identity.companyIntroTitle",
      "identity.companyIntroBody",
      "identity.mission",
      "identity.vision",
      "identity.freedomStatement",
      "coreValues.*.title",
      "coreValues.*.body",
    ],
  },
  {
    routeId: "company.careers",
    reviewOwner: "people",
    fields: [
      "identity.recruitingOneLiner",
    ],
  },
  {
    routeId: "company.ir",
    reviewOwner: "finance",
    fields: [
      "identity.irOneLiner",
    ],
  },
  {
    routeId: "company.announcements",
    reviewOwner: "company_legal_finance",
    fields: [
      "identity.announcementEmptyTitle",
      "identity.announcementEmptyBody",
    ],
  },
];

const clean = (value) => String(value ?? "").trim();

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function safeTranslationId(routeId, targetLocale, sourceVersionId) {
  const base = `${routeId}_${targetLocale}_${sourceVersionId}`
    .toLowerCase()
    .replace(/[./]/g, "_")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base.startsWith("tr_") ? base.slice(0, 180) : `tr_${base}`.slice(0, 180);
}

function brandSignaturePlainText(source) {
  const explicit = clean(source?.identity?.brandSignatureMessage?.plainText);
  if (explicit) return explicit;

  const lines = Array.isArray(source?.identity?.brandSignatureMessage?.lines)
    ? source.identity.brandSignatureMessage.lines
    : [];

  return lines
    .slice()
    .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))
    .map((line) => {
      const segments = Array.isArray(line?.segments) ? line.segments : [];
      return segments
        .slice()
        .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))
        .map((segment) => clean(segment?.text))
        .filter(Boolean)
        .join("");
    })
    .filter(Boolean)
    .join("\n");
}

function getPath(source, fieldPath) {
  if (fieldPath === "identity.brandSignatureMessage.plainText") return brandSignaturePlainText(source);

  const parts = fieldPath.split(".");
  let cursor = source;
  for (const part of parts) {
    if (!cursor || typeof cursor !== "object") return "";
    cursor = cursor[part];
  }
  return clean(cursor);
}

function coreValueFields(koSource, enSource, suffix) {
  const koValues = Array.isArray(koSource?.coreValues) ? koSource.coreValues : [];
  const enValues = Array.isArray(enSource?.coreValues) ? enSource.coreValues : [];
  const enByKey = new Map(enValues.map((value) => [clean(value?.key), value]));

  return koValues.map((koValue) => {
    const key = clean(koValue?.key);
    const enValue = enByKey.get(key);
    return {
      fieldPath: `coreValues.${key}.${suffix}`,
      sourceText: clean(koValue?.[suffix]),
      targetText: clean(enValue?.[suffix]),
      status: TRANSLATION_STATUS,
    };
  });
}

function buildRouteFields(route, koSource, enSource) {
  const fields = [];
  for (const fieldPath of route.fields) {
    if (fieldPath === "coreValues.*.title") {
      fields.push(...coreValueFields(koSource, enSource, "title"));
      continue;
    }
    if (fieldPath === "coreValues.*.body") {
      fields.push(...coreValueFields(koSource, enSource, "body"));
      continue;
    }

    fields.push({
      fieldPath,
      sourceText: getPath(koSource, fieldPath),
      targetText: getPath(enSource, fieldPath),
      status: TRANSLATION_STATUS,
    });
  }

  return fields.filter((field) => field.sourceText);
}

function validateRecord(record) {
  const missing = record.fields.filter((field) => !field.sourceText || !field.targetText);
  if (missing.length > 0) {
    throw new Error(`${record.routeId} has incomplete translation field(s): ${missing.map((field) => field.fieldPath).join(", ")}`);
  }
  const koreanTargets = record.fields.filter((field) => /[가-힣]/.test(field.targetText));
  if (koreanTargets.length > 0) {
    throw new Error(`${record.routeId} has Korean text in English target field(s): ${koreanTargets.map((field) => field.fieldPath).join(", ")}`);
  }
}

function buildRecord(route, koSource, enSource) {
  const sourceVersionId = clean(koSource?.sourceVersionId);
  if (!sourceVersionId) throw new Error("Korean company source is missing sourceVersionId.");

  const sourceFields = buildRouteFields(route, koSource, koSource);
  const targetFields = buildRouteFields(route, koSource, enSource);
  const sourceHash = sha256(JSON.stringify({ routeId: route.routeId, sourceVersionId, fields: sourceFields }));
  const record = {
    translationId: safeTranslationId(route.routeId, "en", sourceVersionId),
    routeId: route.routeId,
    sourceLocale: "ko",
    targetLocale: "en",
    sourceVersionId,
    sourceHash,
    translationStatus: TRANSLATION_STATUS,
    translationOwner: TRANSLATION_OWNER,
    reviewOwner: route.reviewOwner,
    fields: targetFields,
  };
  validateRecord(record);
  return record;
}

async function main() {
  const [koSource, enSource] = await Promise.all([
    readFile(KO_SOURCE_PATH, "utf8").then(JSON.parse),
    readFile(EN_SOURCE_PATH, "utf8").then(JSON.parse),
  ]);

  if (enSource?.locale !== "en") {
    throw new Error("English company source seed must have locale=en.");
  }

  const records = ROUTES.map((route) => buildRecord(route, koSource, enSource));
  const payload = {
    generatedAt: new Date().toISOString(),
    purpose: "Seed payload for Studio Web CMS company English localization records.",
    apiPath: "/company/source/translations",
    sourceVersionId: clean(koSource.sourceVersionId),
    sourceLocale: "ko",
    targetLocale: "en",
    translationStatus: TRANSLATION_STATUS,
    records,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  const tmpPath = `${OUTPUT_PATH}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tmpPath, OUTPUT_PATH);
  console.log(`Exported ${records.length} English translation seed record(s) to ${path.relative(ROOT, OUTPUT_PATH)}`);
}

main().catch((error) => {
  console.error("[company-english-translation-export]", error);
  process.exit(1);
});

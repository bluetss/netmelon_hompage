#!/usr/bin/env node
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const SOURCE_URL = process.env.COMPANY_PUBLIC_ANNOUNCEMENTS_URL ||
  process.env.COMPANY_ANNOUNCEMENTS_API_URL;
const ANNOUNCEMENTS_LOCALE = String(process.env.COMPANY_ANNOUNCEMENTS_LOCALE || "ko").trim().toLowerCase();
const OUTPUT_PATH = process.env.COMPANY_ANNOUNCEMENTS_JSON_PATH ||
  path.join(ROOT, "data", `company-announcements.${ANNOUNCEMENTS_LOCALE}.json`);
const BEARER_TOKEN = process.env.COMPANY_ANNOUNCEMENTS_BEARER_TOKEN || "";
const MIN_PUBLISHED = Number.parseInt(process.env.COMPANY_ANNOUNCEMENTS_MIN_PUBLISHED || "0", 10);
const SUPPORTED_LOCALES = new Set(["ko", "en"]);

const allowedAnnouncementTypes = new Set([
  "legal_notice",
  "governance_notice",
  "privacy_notice",
  "administrative_notice",
]);

const plainText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

function validateAnnouncement(announcement, index) {
  const entryId = String(announcement?.entryId || announcement?.id || "").trim();
  const announcementType = String(announcement?.announcementType || announcement?.type || "").trim();
  const title = String(announcement?.title || "").trim();
  const slug = String(announcement?.slug || "").trim();
  const summary = plainText(announcement?.summary || announcement?.body || "");
  const body = String(announcement?.body || "").trim();
  const publishedAt = String(announcement?.publishedAt || announcement?.date || "").trim();
  const status = String(announcement?.status || "published").trim();

  if (status !== "published") {
    throw new Error(`Public announcement snapshot includes non-published record at index ${index}: ${status}`);
  }
  if (!entryId) throw new Error(`Public announcement at index ${index} is missing entryId.`);
  if (!allowedAnnouncementTypes.has(announcementType)) {
    throw new Error(`Public announcement ${entryId} has unsupported announcementType: ${announcementType}`);
  }
  if (!title) throw new Error(`Public announcement ${entryId} is missing title.`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`Public announcement ${entryId} has invalid slug: ${slug}`);
  }
  if (!summary) throw new Error(`Public announcement ${entryId} is missing summary.`);
  if (!body) throw new Error(`Public announcement ${entryId} is missing body.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)) {
    throw new Error(`Public announcement ${entryId} has invalid publishedAt: ${publishedAt}`);
  }
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Company announcement payload must be a JSON object.");
  }

  const announcements = Array.isArray(payload.announcements) ? payload.announcements : [];
  const normalized = {
    site: String(payload.site || "company"),
    locale: String(payload.locale || "ko"),
    entryType: String(payload.entryType || "company_announcement"),
    generatedAt: payload.generatedAt || new Date().toISOString(),
    announcements,
  };

  if (normalized.site !== "company") {
    throw new Error(`Company announcement snapshot site must be company. Received: ${normalized.site}`);
  }
  if (normalized.locale !== ANNOUNCEMENTS_LOCALE) {
    throw new Error(`Company announcement snapshot locale must be ${ANNOUNCEMENTS_LOCALE} for the current route. Received: ${normalized.locale}`);
  }
  if (normalized.entryType !== "company_announcement") {
    throw new Error(`Company announcement snapshot entryType must be company_announcement. Received: ${normalized.entryType}`);
  }

  normalized.announcements.forEach(validateAnnouncement);

  const ids = normalized.announcements.map((announcement) => String(announcement?.entryId || announcement?.id || "").trim());
  const duplicatedIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicatedIds.length > 0) {
    throw new Error(`Company announcement snapshot has duplicated entryId(s): ${[...new Set(duplicatedIds)].join(", ")}`);
  }

  const slugs = normalized.announcements.map((announcement) => String(announcement?.slug || "").trim());
  const duplicatedSlugs = slugs.filter((slug, index) => slugs.indexOf(slug) !== index);
  if (duplicatedSlugs.length > 0) {
    throw new Error(`Company announcement snapshot has duplicated slug(s): ${[...new Set(duplicatedSlugs)].join(", ")}`);
  }

  if (Number.isFinite(MIN_PUBLISHED) && MIN_PUBLISHED > 0 && normalized.announcements.length < MIN_PUBLISHED) {
    throw new Error(`Company announcement snapshot has ${normalized.announcements.length} published record(s), expected at least ${MIN_PUBLISHED}.`);
  }

  return normalized;
}

async function main() {
  if (!SUPPORTED_LOCALES.has(ANNOUNCEMENTS_LOCALE)) {
    throw new Error(`Unsupported company announcement locale: ${ANNOUNCEMENTS_LOCALE}`);
  }
  if (!SOURCE_URL) {
    throw new Error("Set COMPANY_PUBLIC_ANNOUNCEMENTS_URL to fetch the published company announcement snapshot.");
  }

  const requestUrl = new URL(SOURCE_URL);
  requestUrl.searchParams.set("locale", ANNOUNCEMENTS_LOCALE);
  const headers = BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {};
  const response = await fetch(requestUrl, { headers });
  if (!response.ok) {
    throw new Error(`Company announcement snapshot fetch failed: ${response.status} ${response.statusText}`);
  }

  const payload = normalizePayload(await response.json());
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  const tmpPath = `${OUTPUT_PATH}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tmpPath, OUTPUT_PATH);
  console.log(`Fetched company announcements to ${path.relative(ROOT, OUTPUT_PATH)}`);
}

main().catch((error) => {
  console.error("[company-announcements-fetch]", error);
  process.exit(1);
});

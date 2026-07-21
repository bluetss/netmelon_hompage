#!/usr/bin/env node
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const SITE_ID = String(process.env.COMPANY_ASSETS_SITE_ID || "company").trim().toLowerCase();
const LOCALE = String(process.env.COMPANY_ASSETS_LOCALE || "ko").trim().toLowerCase();
const API_BASE = String(process.env.COMPANY_ASSETS_API_BASE || process.env.VITE_API_BASE || "").replace(/\/+$/, "");
const MANIFEST_URL = String(process.env.COMPANY_PUBLIC_ASSETS_URL || process.env.COMPANY_ASSETS_API_URL || "").trim();
const BINDINGS_URL = String(process.env.COMPANY_PUBLIC_ASSET_BINDINGS_URL || "").trim();
const OUTPUT_PATH = process.env.COMPANY_ASSETS_JSON_PATH || path.join(ROOT, "data", `company-assets.${LOCALE}.json`);
const BEARER_TOKEN = process.env.COMPANY_ASSETS_BEARER_TOKEN || "";
const ALLOW_HANGUL = /^(1|true|yes)$/i.test(String(process.env.COMPANY_ASSETS_ALLOW_HANGUL || "").trim());

const supportedSites = new Set(["company", "app", "studio"]);
const supportedLocales = new Set(["ko", "en"]);
const publicDisclosureLevels = new Set(["public", "controlled_public"]);
const clean = (value) => String(value ?? "").trim();

function assertInputs() {
  if (!supportedSites.has(SITE_ID)) throw new Error(`Unsupported company asset siteId: ${SITE_ID}`);
  if (!supportedLocales.has(LOCALE)) throw new Error(`Unsupported company asset locale: ${LOCALE}`);
  if (!API_BASE && (!MANIFEST_URL || !BINDINGS_URL)) {
    throw new Error("Set COMPANY_ASSETS_API_BASE, or both public manifest and binding URLs.");
  }
}

function endpoint(explicitUrl, route) {
  const url = new URL(explicitUrl || `${API_BASE}${route}`);
  url.searchParams.set("siteId", SITE_ID);
  url.searchParams.set("locale", LOCALE);
  return url;
}

function assertNoDevelopmentUrl(label, value) {
  const text = clean(value);
  if (!text) return;
  if (/figma\.com/i.test(text) && /api/i.test(text)) throw new Error(`${label} uses a temporary Figma API URL.`);
  if (/localhost|127\.0\.0\.1|dev\.netmelonai\.com|dev\.naepopquiz\.com|studio-dev\.naepopquiz\.com/i.test(text)) {
    throw new Error(`${label} uses a development URL.`);
  }
}

function assertNoHangul(label, value) {
  if (ALLOW_HANGUL || LOCALE !== "en") return;
  if (/[가-힣]/.test(clean(value))) throw new Error(`${label} contains Korean text.`);
}

function normalizeDerivative(derivative, assetId, index) {
  const derivativeId = clean(derivative?.derivativeId);
  const purpose = clean(derivative?.purpose);
  const variant = clean(derivative?.variant || "default");
  const publicUrl = clean(derivative?.publicUrl);
  const fallbackPath = clean(derivative?.fallbackPath);
  if (!derivativeId || !purpose) throw new Error(`Asset ${assetId} derivative ${index} is incomplete.`);
  if (!publicUrl && !fallbackPath) throw new Error(`Asset ${assetId} derivative ${derivativeId} has no public delivery location.`);
  assertNoDevelopmentUrl(`${assetId}.${derivativeId}.publicUrl`, publicUrl);
  assertNoDevelopmentUrl(`${assetId}.${derivativeId}.fallbackPath`, fallbackPath);
  return {
    derivativeId,
    purpose,
    variant,
    locale: clean(derivative?.locale || "shared"),
    format: clean(derivative?.format),
    width: derivative?.width || undefined,
    height: derivative?.height || undefined,
    publicUrl: publicUrl || undefined,
    fallbackPath: fallbackPath || undefined,
    checksumSha256: clean(derivative?.checksumSha256) || undefined,
  };
}

function normalizeManifest(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Company asset manifest must be an object.");
  if (clean(payload.schemaVersion) !== "asset-manifest.v2") throw new Error("Company asset manifest must use asset-manifest.v2.");
  if (clean(payload.siteId) !== SITE_ID || clean(payload.locale) !== LOCALE) throw new Error("Company asset manifest target does not match the build target.");
  const sourceById = payload.assetsById && typeof payload.assetsById === "object" ? payload.assetsById : {};
  const assetIds = Array.isArray(payload.assetIds) ? payload.assetIds.map(clean).filter(Boolean) : Object.keys(sourceById);
  const assets = assetIds.map((assetId) => {
    const source = sourceById[assetId];
    if (!source || typeof source !== "object") throw new Error(`Manifest is missing asset ${assetId}.`);
    const disclosureLevel = clean(source.disclosureLevel || "public");
    const title = clean(source.title);
    const altText = clean(source.altText);
    if (!title || !altText) throw new Error(`Asset ${assetId} is missing localized title or alt text.`);
    if (!publicDisclosureLevels.has(disclosureLevel)) throw new Error(`Asset ${assetId} is not public.`);
    assertNoHangul(`${assetId}.title`, title);
    assertNoHangul(`${assetId}.altText`, altText);
    const derivatives = Array.isArray(source.derivatives)
      ? source.derivatives.map((derivative, index) => normalizeDerivative(derivative, assetId, index))
      : [];
    if (!derivatives.length) throw new Error(`Asset ${assetId} has no published derivatives.`);
    return {
      assetId,
      assetVersion: source.assetVersion || 0,
      assetType: clean(source.assetType),
      product: clean(source.product || "shared"),
      locale: clean(source.locale || "shared"),
      title,
      altText,
      disclosureLevel,
      usageTargets: Array.isArray(source.usageTargets) ? source.usageTargets.map(clean).filter(Boolean) : [],
      derivatives,
      // Compatibility projection for existing release checks.
      derivative: derivatives[0],
      source: source.source && typeof source.source === "object" ? source.source : {},
    };
  });
  return {
    schemaVersion: "asset-manifest.v2",
    siteId: SITE_ID,
    locale: LOCALE,
    generatedAt: payload.generatedAt || null,
    publishedAt: payload.publishedAt || null,
    publishedBy: clean(payload.publishedBy),
    assetIds,
    assets,
    assetsById: Object.fromEntries(assets.map((asset) => [asset.assetId, asset])),
  };
}

function normalizeBindings(payload, manifest) {
  if (!payload || typeof payload !== "object") throw new Error("Company asset bindings must be an object.");
  if (clean(payload.siteId) !== SITE_ID || clean(payload.locale) !== LOCALE) throw new Error("Company asset binding target does not match the build target.");
  const status = clean(payload.status || "unpublished");
  const slots = payload.slots && typeof payload.slots === "object" ? payload.slots : {};
  const normalizedSlots = {};
  for (const [slotId, rawReferences] of Object.entries(slots)) {
    if (!Array.isArray(rawReferences)) throw new Error(`Asset binding slot ${slotId} must be an array.`);
    normalizedSlots[slotId] = rawReferences.map((reference, index) => {
      const assetId = clean(reference?.assetId);
      const purpose = clean(reference?.purpose);
      const variant = clean(reference?.variant || "default");
      const asset = manifest.assetsById[assetId];
      if (!asset) throw new Error(`Slot ${slotId}[${index}] references unpublished asset ${assetId}.`);
      const matches = asset.derivatives.filter((derivative) => derivative.purpose === purpose && derivative.variant === variant);
      if (matches.length !== 1) throw new Error(`Slot ${slotId}[${index}] cannot resolve ${assetId} ${purpose}/${variant}.`);
      return { assetId, purpose, variant };
    });
  }
  return {
    schemaVersion: "asset-bindings.v1",
    status,
    draftVersion: Number(payload.draftVersion || 0),
    publicVersion: Number(payload.publicVersion || 0),
    publishedAt: payload.publishedAt || null,
    publishedBy: clean(payload.publishedBy),
    slots: normalizedSlots,
  };
}

async function fetchJson(url) {
  const headers = BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {};
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Company asset fetch failed: ${response.status} ${response.statusText} (${url})`);
  return response.json();
}

async function writeJson(payload) {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  const tmpPath = `${OUTPUT_PATH}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tmpPath, OUTPUT_PATH);
  console.log(`Fetched company ${LOCALE} asset manifest and bindings to ${path.relative(ROOT, OUTPUT_PATH)}`);
}

async function main() {
  assertInputs();
  const [manifestPayload, bindingPayload] = await Promise.all([
    fetchJson(endpoint(MANIFEST_URL, "/company/assets-v2/public-manifest")),
    fetchJson(endpoint(BINDINGS_URL, "/company/assets-v2/public-site-bindings")),
  ]);
  const manifest = normalizeManifest(manifestPayload);
  const bindings = normalizeBindings(bindingPayload, manifest);
  await writeJson({ ...manifest, bindings, slots: bindings.slots });
}

main().catch((error) => {
  console.error("[company-assets-fetch]", error);
  process.exit(1);
});

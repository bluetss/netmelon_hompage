#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMPANY_ASSET_RENDER_SLOTS } from "./company-asset-slots.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const LOCALE = String(process.env.COMPANY_ASSETS_LOCALE || "ko").trim().toLowerCase();
const INPUT_PATH = process.env.COMPANY_ASSETS_JSON_PATH || path.join(ROOT, "data", `company-assets.${LOCALE}.json`);
const TARGET_PATH = process.env.COMPANY_ASSETS_TARGET || path.join(ROOT, "index.html");
const FALLBACK_PREFIX = String(process.env.COMPANY_ASSETS_FALLBACK_PREFIX || "");
const clean = (value) => String(value ?? "").trim();
const escapeHtml = (value) => clean(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function resolveSlot(payload, slot) {
  if (payload?.bindings?.status !== "published") return null;
  const references = payload?.slots?.[slot.slotId];
  if (!Array.isArray(references)) return [];
  const assetsById = payload.assetsById && typeof payload.assetsById === "object" ? payload.assetsById : {};
  return references.map((reference, index) => {
    const asset = assetsById[clean(reference?.assetId)];
    if (!asset) throw new Error(`${slot.label} ${index + 1} references a missing Asset.`);
    if (!slot.products.includes(clean(asset.product))) {
      throw new Error(`${slot.slotId} cannot use product ${clean(asset.product) || "unknown"} Asset ${asset.assetId}.`);
    }
    const purpose = clean(reference?.purpose);
    const variant = clean(reference?.variant || "default");
    if (purpose !== slot.purpose || variant !== slot.variant) {
      throw new Error(`${slot.slotId} requires ${slot.purpose}/${slot.variant}, received ${purpose}/${variant}.`);
    }
    const matches = (asset.derivatives || []).filter((derivative) => (
      derivative.purpose === purpose
      && derivative.variant === variant
      && (derivative.locale === "shared" || derivative.locale === LOCALE)
    ));
    if (matches.length !== 1) throw new Error(`${slot.label} ${asset.assetId} does not resolve exactly one derivative.`);
    const derivative = matches[0];
    const publicUrl = clean(derivative.publicUrl);
    const fallbackPath = clean(derivative.fallbackPath);
    const src = publicUrl || (fallbackPath ? `${FALLBACK_PREFIX}${fallbackPath}` : "");
    if (!src) throw new Error(`${slot.label} ${asset.assetId} has no delivery URL.`);
    return {
      src,
      alt: clean(asset.altText),
      assetId: asset.assetId,
      width: Number(derivative.width) || null,
      height: Number(derivative.height) || null,
    };
  });
}

function renderSlot(slot, shots) {
  const body = shots.map((shot, index) => [
    `${slot.indent}<figure class="${slot.figureClass} ${slot.indexedClassPrefix}-${index + 1}" data-asset-id="${escapeHtml(shot.assetId)}">`,
    `${slot.indent}  <img src="${escapeHtml(shot.src)}" alt="${escapeHtml(shot.alt)}"${shot.width ? ` width="${shot.width}"` : ""}${shot.height ? ` height="${shot.height}"` : ""} loading="lazy" decoding="async">`,
    `${slot.indent}</figure>`,
  ].join("\n")).join("\n");
  return `${slot.startMarker}\n${body}${body ? "\n" : ""}${slot.indent}${slot.endMarker}`;
}

function replaceSlot(html, slot, shots) {
  const startIndex = html.indexOf(slot.startMarker);
  const endIndex = html.indexOf(slot.endMarker, startIndex + slot.startMarker.length);
  if (startIndex < 0 || endIndex < 0) throw new Error(`${slot.slotId} markers are missing in ${TARGET_PATH}`);
  return `${html.slice(0, startIndex)}${renderSlot(slot, shots)}${html.slice(endIndex + slot.endMarker.length)}`;
}

async function main() {
  let payload;
  try {
    payload = JSON.parse(await readFile(INPUT_PATH, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      console.log(`Company asset snapshot not found; keeping template fallback in ${path.relative(ROOT, TARGET_PATH)}`);
      return;
    }
    throw error;
  }
  const resolvedSlots = COMPANY_ASSET_RENDER_SLOTS.map((slot) => ({
    slot,
    shots: resolveSlot(payload, slot),
  }));
  if (resolvedSlots.some(({ shots }) => shots === null)) {
    console.log(`Company asset bindings are unpublished; keeping template fallback in ${path.relative(ROOT, TARGET_PATH)}`);
    return;
  }

  let output = await readFile(TARGET_PATH, "utf8");
  for (const { slot, shots } of resolvedSlots) {
    output = replaceSlot(output, slot, shots);
  }
  await writeFile(TARGET_PATH, output, "utf8");
  const summary = resolvedSlots.map(({ slot, shots }) => `${slot.slotId}=${shots.length}`).join(", ");
  console.log(`Injected company CMS media slots into ${path.relative(ROOT, TARGET_PATH)} (${summary})`);
}

main().catch((error) => {
  console.error("[company-assets-inject]", error);
  process.exit(1);
});

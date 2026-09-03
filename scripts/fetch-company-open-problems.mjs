#!/usr/bin/env node
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const API_BASE = String(process.env.COMPANY_OPEN_PROBLEMS_API_BASE || process.env.COMPANY_SOURCE_API_BASE || process.env.VITE_API_BASE || "").replace(/\/+$/, "");
const SOURCE_URL = String(process.env.COMPANY_PUBLIC_OPEN_PROBLEMS_URL || process.env.COMPANY_OPEN_PROBLEMS_PUBLIC_URL || "").trim();
const OUTPUT_PATH = process.env.COMPANY_OPEN_PROBLEMS_JSON_PATH || path.join(ROOT, "data", "company-open-problems.ko.json");

function buildUrl() {
  if (SOURCE_URL) return new URL(SOURCE_URL);
  if (!API_BASE) throw new Error("Set COMPANY_PUBLIC_OPEN_PROBLEMS_URL or COMPANY_OPEN_PROBLEMS_API_BASE.");
  const url = new URL(API_BASE + "/web-cms/public/company-open-problems");
  url.searchParams.set("locale", "ko");
  return url;
}

async function main() {
  const response = await fetch(buildUrl(), { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Company Open Problems fetch failed: " + response.status + " " + response.statusText);
  const payload = await response.json();
  if (payload?.schemaId !== "npq.company_open_problems.v1" || payload?.siteId !== "company" || payload?.locale !== "ko" || payload?.lifecycleStatus !== "published") {
    throw new Error("Company Open Problems public snapshot has an invalid schema, target, locale, or lifecycle.");
  }
  if (!payload?.sourceVersionId || !payload?.sourceHash) throw new Error("Company Open Problems public snapshot is missing version provenance.");
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  const tmpPath = OUTPUT_PATH + ".tmp";
  await writeFile(tmpPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  await rename(tmpPath, OUTPUT_PATH);
  console.log("Fetched Company Open Problems " + payload.sourceVersionId + " to " + path.relative(ROOT, OUTPUT_PATH));
}

main().catch((error) => {
  console.error("[company-open-problems-fetch]", error);
  process.exit(1);
});

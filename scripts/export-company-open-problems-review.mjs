#!/usr/bin/env node
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_BASE = String(process.env.COMPANY_OPEN_PROBLEMS_API_BASE || process.env.COMPANY_SOURCE_API_BASE || "").replace(/\/+$/, "");
const TOKEN = String(process.env.COMPANY_OPEN_PROBLEMS_BEARER_TOKEN || process.env.COMPANY_SOURCE_BEARER_TOKEN || "").trim();
const OUTPUT = process.env.COMPANY_OPEN_PROBLEMS_REVIEW_JSON_PATH || path.join(ROOT, "data", "company-open-problems.en.review.json");
if (!API_BASE) throw new Error("Set COMPANY_OPEN_PROBLEMS_API_BASE or COMPANY_SOURCE_API_BASE.");
if (!TOKEN) throw new Error("Set COMPANY_OPEN_PROBLEMS_BEARER_TOKEN or COMPANY_SOURCE_BEARER_TOKEN.");

const response = await fetch(`${API_BASE}/web-cms/company/open-problems/source?locale=en`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
  signal: AbortSignal.timeout(15000),
});
if (!response.ok) throw new Error(`English Open Problems review export failed: ${response.status} ${response.statusText}`);
const payload = await response.json();
if (payload?.schemaId !== "npq.company_open_problems.v1" || payload?.siteId !== "company" || payload?.locale !== "en" || payload?.lifecycleStatus !== "draft") {
  throw new Error("English Open Problems review source has an invalid schema, target, locale, or lifecycle.");
}
if (/[가-힣]/.test(JSON.stringify(payload))) throw new Error("English Open Problems review source contains Korean fallback text.");
await mkdir(path.dirname(OUTPUT), { recursive: true });
const temporary = `${OUTPUT}.tmp`;
await writeFile(temporary, JSON.stringify(payload, null, 2) + "\n", "utf8");
await rename(temporary, OUTPUT);
console.log(`Exported English Open Problems review draftVersion=${Number(payload.draftVersion || 0)} to ${path.relative(ROOT, OUTPUT)}`);

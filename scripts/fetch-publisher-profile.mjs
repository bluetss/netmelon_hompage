#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePublisherProfile } from "./publisher-profile.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const API_BASE = String(process.env.PUBLISHER_PROFILE_API_BASE || process.env.COMPANY_SOURCE_API_BASE || "").replace(/\/+$/, "");
const SOURCE_URL = String(process.env.PUBLISHER_PROFILE_PUBLIC_URL || "").trim();
const OUTPUT_PATH = process.env.PUBLISHER_PROFILE_JSON_PATH || path.join(ROOT, "data", "publisher-legal-profile.json");
const BEARER_TOKEN = String(process.env.PUBLISHER_PROFILE_BEARER_TOKEN || "").trim();

function buildUrl() {
  if (SOURCE_URL) return new URL(SOURCE_URL);
  if (!API_BASE) throw new Error("Set PUBLISHER_PROFILE_PUBLIC_URL or PUBLISHER_PROFILE_API_BASE.");
  const url = new URL(`${API_BASE}/web-cms/public/publisher-profile`);
  url.searchParams.set("publisherId", "netmelon");
  return url;
}

async function main() {
  const headers = BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {};
  const response = await fetch(buildUrl(), { headers });
  if (!response.ok) throw new Error(`Publisher Legal Profile fetch failed: ${response.status} ${response.statusText}`);
  const profile = normalizePublisherProfile(await response.json());
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  const tmpPath = `${OUTPUT_PATH}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  await rename(tmpPath, OUTPUT_PATH);
  console.log(`Fetched Publisher Legal Profile ${profile.sourceVersionId} to ${path.relative(ROOT, OUTPUT_PATH)}`);
}

main().catch((error) => {
  console.error("[publisher-profile-fetch]", error);
  process.exit(1);
});

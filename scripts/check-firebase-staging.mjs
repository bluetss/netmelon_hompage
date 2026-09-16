#!/usr/bin/env node
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const expectedApiBase = String(process.env.COMPANY_PUBLIC_INTAKE_API_BASE || "").trim().replace(/\/+$/, "");
const expectedAppLandingOrigin = String(
  process.env.COMPANY_APP_LANDING_ORIGIN || "https://npq-landing-dev.web.app",
).trim().replace(/\/+$/, "");
const forbiddenCoreApi = "https://naepopquiz-flask-server-djbccwoo6a-uc.a.run.app";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function walk(directory, prefix = "") {
  const entries = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const relativePath = path.posix.join(prefix, item.name);
    if (item.isDirectory()) entries.push(...await walk(path.join(directory, item.name), relativePath));
    else entries.push(relativePath);
  }
  return entries;
}

assert((await stat(DIST)).isDirectory(), "dist/ is missing.");
const files = await walk(DIST);
for (const forbidden of ["CNAME", "firebase.json", ".firebaserc", "package.json"]) {
  assert(!files.includes(forbidden), `${forbidden} must not be deployed.`);
}
assert(!files.some((name) => name.endsWith(".template.html")), "Templates must not be deployed.");
assert(!files.some((name) => name.startsWith("scripts/") && ![
  "scripts/problem-intake.js",
  "scripts/ir-intake.js",
  "scripts/runtime-config.js",
  "scripts/site-shell.js",
].includes(name)), "Build or CMS scripts must not be deployed.");
assert(!files.some((name) => name.startsWith("data/") && name !== "data/careers.ko.json"), "CMS source data must not be deployed.");
assert(files.includes("sitemap.xml"), "staging artifact must include the generated sitemap.");
const sitemap = await readFile(path.join(DIST, "sitemap.xml"), "utf8");
const problemUrls = sitemap.match(/<loc>https:\/\/netmelonai\.com\/problems\/[^<]+<\/loc>/g) || [];
assert(problemUrls.length === 9, "staging sitemap must contain the nine canonical problem detail URLs.");

const robots = await readFile(path.join(DIST, "robots.txt"), "utf8");
assert(robots === "User-agent: *\nDisallow: /\n", "staging robots.txt must block all crawling.");

const runtimeConfig = await readFile(path.join(DIST, "scripts", "runtime-config.js"), "utf8");
assert(runtimeConfig.includes(JSON.stringify(expectedApiBase)), "runtime config does not match the expected intake API.");

for (const relativePath of files.filter((name) => name.endsWith(".html") || name.endsWith(".js"))) {
  const source = await readFile(path.join(DIST, relativePath), "utf8");
  assert(!source.includes(forbiddenCoreApi), `${relativePath} contains the core production API.`);
}

for (const relativePath of files.filter((name) => name.endsWith(".html"))) {
  const source = await readFile(path.join(DIST, relativePath), "utf8");
  if (!source.includes('id="ir-request-form"') && !source.includes('class="problem-application-form"')) continue;
  const prefix = "../".repeat(relativePath.split("/").length - 1);
  assert(source.includes(`<script src="${prefix}scripts/runtime-config.js"></script>`), `${relativePath} intake form is missing runtime config.`);
}

const manifest = JSON.parse(await readFile(path.join(DIST, "release-manifest.json"), "utf8"));
assert(manifest.schemaId === "npq.company_site_release.v1", "release manifest schema is invalid.");
assert(manifest.environment === "staging", "release manifest must target staging.");
assert(manifest.hostingSite === "npq-company-dev", "release manifest has the wrong hosting site.");
assert(manifest.publicIntakeConfigured === Boolean(expectedApiBase), "release manifest intake state is inconsistent.");
assert(manifest.origins?.company === "https://npq-company-dev.web.app", "release manifest company origin is invalid.");
assert(manifest.origins?.appLanding === expectedAppLandingOrigin, "release manifest app landing origin is invalid.");
assert(manifest.origins?.studio === "https://studio-dev.naepopquiz.com", "release manifest Studio origin is invalid.");

for (const relativePath of files.filter((name) => name.endsWith(".html") || name.endsWith(".js"))) {
  const source = await readFile(path.join(DIST, relativePath), "utf8");
  assert(!source.includes('href="https://studio.naepopquiz.com'), `${relativePath} contains a production Studio navigation link.`);
}

console.log(`Firebase company staging artifact is valid (${files.length} files).`);

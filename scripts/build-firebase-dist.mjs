#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const environment = String(process.env.COMPANY_SITE_ENV || "staging").trim();
const rawApiBase = String(process.env.COMPANY_PUBLIC_INTAKE_API_BASE || "").trim();
const apiBase = rawApiBase.replace(/\/+$/, "");
const appLandingOverride = String(process.env.COMPANY_APP_LANDING_ORIGIN || "").trim().replace(/\/+$/, "");
const WEB_ORIGINS_BY_ENVIRONMENT = Object.freeze({
  staging: Object.freeze({
    company: "https://npq-company-dev.web.app",
    appLanding: "https://npq-landing-dev.web.app",
    studio: "https://studio-dev.naepopquiz.com",
  }),
});
const webOrigins = WEB_ORIGINS_BY_ENVIRONMENT[environment];

if (environment !== "staging") {
  throw new Error("Firebase company build only supports COMPANY_SITE_ENV=staging.");
}
if (!webOrigins) throw new Error(`No web origin matrix is registered for ${environment}.`);
if (appLandingOverride && !/^https:\/\/npq-landing-dev(?:--[a-z0-9-]+)?\.web\.app$/.test(appLandingOverride)) {
  throw new Error("COMPANY_APP_LANDING_ORIGIN must be the staging app site or one of its Firebase Preview channels.");
}
const resolvedWebOrigins = Object.freeze({
  ...webOrigins,
  appLanding: appLandingOverride || webOrigins.appLanding,
});
if (apiBase && !/^https:\/\/[^/]+(?:\/[^?#]*)?$/.test(apiBase)) {
  throw new Error("COMPANY_PUBLIC_INTAKE_API_BASE must be an absolute HTTPS URL.");
}

const topLevelFiles = [
  "announcement.html",
  "app-ads.txt",
  "careers.html",
  "company-privacy.html",
  "company.html",
  "data-deletion.html",
  "data-deletion.json",
  "favicon.ico",
  "google0b0380466173a565.html",
  "index.html",
  "install.html",
  "ir.html",
  "naver06243b8eb7a75493dc79247ee6d73c01.html",
  "privacy.html",
  "privacy.json",
  "problems.html",
  "terms.html",
  "terms_of_service.json",
  "translations.json",
];
const htmlDirectories = ["announcements", "en", "problems"];
const runtimeScripts = ["ir-intake.js", "problem-intake.js", "site-shell.js"];

async function copyFile(relativePath) {
  const source = path.join(ROOT, relativePath);
  const target = path.join(DIST, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target);
}

async function copyHtmlDirectory(directory) {
  const names = await readdir(path.join(ROOT, directory), { withFileTypes: true });
  for (const item of names) {
    if (item.isFile() && item.name.endsWith(".html")) {
      await copyFile(path.join(directory, item.name));
    } else if (item.isDirectory()) {
      await copyHtmlDirectory(path.join(directory, item.name));
    }
  }
}

async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
  } catch {
    return {};
  }
}

function gitValue(args, fallback) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim() || fallback;
  } catch {
    return fallback;
  }
}

async function injectRuntimeConfig(relativePath) {
  const target = path.join(DIST, relativePath);
  let html = await readFile(target, "utf8");
  const depth = relativePath.split(path.sep).length - 1;
  const prefix = "../".repeat(depth);
  const runtimeTag = `<script src="${prefix}scripts/runtime-config.js"></script>`;
  if (!html.includes(runtimeTag)) {
    if (!html.includes("</head>")) throw new Error(`${relativePath} is missing </head>.`);
    html = html.replace("</head>", `  ${runtimeTag}\n</head>`);
  }
  html = html.replaceAll(/data-api-base="[^"]*"/g, `data-api-base="${apiBase}"`);
  await writeFile(target, html, "utf8");
}

async function listHtmlFiles(directory = DIST, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listHtmlFiles(path.join(directory, entry.name), relativePath));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(relativePath);
    }
  }
  return files;
}

async function injectPublicLinks(relativePath) {
  const target = path.join(DIST, relativePath);
  let html = await readFile(target, "utf8");
  html = html.replace(
    /(<a\b[^>]*\bdata-app-homepage-link\b[^>]*\bhref=")[^"]*(")/g,
    `$1${resolvedWebOrigins.appLanding}/$2`,
  );
  html = html.replace(
    /(<a\b[^>]*\bhref=")https:\/\/studio\.naepopquiz\.com(?=\/[^\"]*\")/g,
    `$1${webOrigins.studio}`,
  );
  await writeFile(target, html, "utf8");
}

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

for (const relativePath of topLevelFiles) await copyFile(relativePath);
for (const directory of htmlDirectories) await copyHtmlDirectory(directory);
await cp(path.join(ROOT, "images"), path.join(DIST, "images"), { recursive: true });
await cp(path.join(ROOT, "styles"), path.join(DIST, "styles"), { recursive: true });
await mkdir(path.join(DIST, "scripts"), { recursive: true });
for (const script of runtimeScripts) await copyFile(path.join("scripts", script));
await copyFile(path.join("data", "careers.ko.json"));

await writeFile(
  path.join(DIST, "scripts", "runtime-config.js"),
  `window.__NPQ_PUBLIC_INTAKE_API_BASE__ = ${JSON.stringify(apiBase)};\n`,
  "utf8",
);

const htmlFiles = await listHtmlFiles();
for (const relativePath of htmlFiles) {
  const html = await readFile(path.join(DIST, relativePath), "utf8");
  if (html.includes('id="ir-request-form"') || html.includes('class="problem-application-form"')) {
    await injectRuntimeConfig(relativePath);
  }
  await injectPublicLinks(relativePath);
}

await writeFile(
  path.join(DIST, "robots.txt"),
  "User-agent: *\nDisallow: /\n",
  "utf8",
);

const companySource = await readJson("data/company-source.ko.json");
const openProblems = await readJson("data/company-open-problems.ko.json");
const publisherProfile = await readJson("data/publisher-legal-profile.json");
const manifest = {
  schemaId: "npq.company_site_release.v1",
  environment,
  hostingSite: "npq-company-dev",
  sourceCommit: gitValue(["rev-parse", "HEAD"], "unknown"),
  sourceDirty: Boolean(gitValue(["status", "--porcelain"], "")),
  builtAt: new Date().toISOString(),
  publicIntakeConfigured: Boolean(apiBase),
  origins: resolvedWebOrigins,
  cms: {
    companySourceVersion: companySource.sourceVersionId || companySource.version || null,
    companySourceHash: companySource.sourceHash || null,
    openProblemsVersion: openProblems.sourceVersionId || null,
    openProblemsHash: openProblems.sourceHash || null,
    publisherProfileVersion: publisherProfile.version || publisherProfile.sourceVersionId || null,
  },
};
await writeFile(
  path.join(DIST, "release-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

console.log(`Built Firebase company staging artifact at ${DIST}`);
console.log(`Public intake: ${apiBase || "disabled"}`);

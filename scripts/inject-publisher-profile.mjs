#!/usr/bin/env node

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLISHER_PROFILE_MARKER, normalizePublisherProfile, renderPublisherFooter } from "./publisher-profile.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const PROFILE_PATH = process.env.PUBLISHER_PROFILE_JSON_PATH || path.join(ROOT, "data", "publisher-legal-profile.json");
const ROOT_TARGETS = [
  "index.template.html", "index.html",
  "company.template.html", "company.html",
  "careers.template.html", "careers.html",
  "problems.template.html", "problems.html",
  "ir.html", "announcement.template.html", "announcement.html",
];
const EN_TARGETS = [
  "en/index.html", "en/company.html", "en/ir.html", "en/announcement.html", "en/problems.html",
];

async function htmlFiles(relativeDirectory) {
  try {
    const entries = await readdir(path.join(ROOT, relativeDirectory), { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".html")).map((entry) => `${relativeDirectory}/${entry.name}`);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function indent(source, prefix) {
  return source.split("\n").map((line) => `${prefix}${line}`).join("\n");
}

function inject(source, rendered, file) {
  const markerPattern = new RegExp(`^(\\s*)${PUBLISHER_PROFILE_MARKER.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*$`, "m");
  const markerMatch = source.match(markerPattern);
  if (markerMatch) return source.replace(markerPattern, indent(rendered, markerMatch[1]));
  const renderedPattern = /^(\s*)<div class="footer-brand">[\s\S]*?<\/section>$/m;
  const renderedMatch = source.match(renderedPattern);
  if (renderedMatch) return source.replace(renderedPattern, indent(rendered, renderedMatch[1]));
  const legacyPattern = /^(\s*)<p>© 2026 Netmelon\. All rights reserved\.<\/p>$/m;
  const legacyMatch = source.match(legacyPattern);
  if (legacyMatch) return source.replace(legacyPattern, indent(rendered, legacyMatch[1]));
  if (source.includes("<footer class=\"site-footer\">")) throw new Error(`${file} shared Footer has no Publisher Profile injection point.`);
  return source;
}

async function main() {
  const profile = normalizePublisherProfile(JSON.parse(await readFile(PROFILE_PATH, "utf8")));
  const targets = [...new Set([
    ...ROOT_TARGETS, ...EN_TARGETS,
    ...await htmlFiles("problems"),
    ...await htmlFiles("announcements"),
    ...await htmlFiles("en/announcements"),
    ...await htmlFiles("en/problems"),
  ])];
  let updated = 0;
  for (const file of targets) {
    let source;
    try { source = await readFile(path.join(ROOT, file), "utf8"); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    const locale = file.startsWith("en/") ? "en" : "ko";
    const output = inject(source, renderPublisherFooter(profile, locale), file);
    if (output !== source) {
      await writeFile(path.join(ROOT, file), output, "utf8");
      updated += 1;
    }
  }
  if (updated === 0) throw new Error("No company page Publisher Profile Footer was updated.");
  console.log(`Injected Publisher Legal Profile ${profile.sourceVersionId} into ${updated} company page(s).`);
}

main().catch((error) => {
  console.error("[publisher-profile-inject]", error);
  process.exit(1);
});

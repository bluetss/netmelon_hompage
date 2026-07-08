#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const TEMPLATE_PATH = process.env.COMPANY_SOURCE_TEMPLATE || path.join(ROOT, "index.template.html");
const OUTPUT_PATH = process.env.COMPANY_SOURCE_OUTPUT || path.join(ROOT, "index.html");
const API_BASE = String(
  process.env.COMPANY_SOURCE_API_BASE ||
  process.env.VITE_API_BASE ||
  ""
).replace(/\/+$/, "");
const JSON_PATH = String(process.env.COMPANY_SOURCE_JSON_PATH || "").trim();

const htmlEscape = (value, quote = false) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', quote ? "&quot;" : '"');

const renderTextWithBreaks = (value) => String(value ?? "")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => htmlEscape(line))
  .join("<br>");

function normalizeSignatureLines(identity) {
  const signature = identity?.brandSignatureMessage || {};
  const raw = Array.isArray(signature.lines) ? signature.lines : [];
  const lines = raw
    .map((line, lineIndex) => {
      const segments = Array.isArray(line?.segments) ? line.segments : [];
      return {
        order: Number.isFinite(Number(line?.order)) ? Number(line.order) : lineIndex + 1,
        segments: segments
          .map((segment, segmentIndex) => ({
            text: String(segment?.text || "").trim(),
            emphasis: segment?.emphasis === true,
            order: Number.isFinite(Number(segment?.order)) ? Number(segment.order) : segmentIndex + 1,
          }))
          .filter((segment) => segment.text)
          .sort((a, b) => a.order - b.order),
      };
    })
    .filter((line) => line.segments.length > 0)
    .sort((a, b) => a.order - b.order);

  if (lines.length > 0) return lines;

  const legacy = Array.isArray(identity?.homepageHeroLines) ? identity.homepageHeroLines : [];
  return legacy
    .map((line, index) => ({
      order: Number.isFinite(Number(line?.order)) ? Number(line.order) : index + 1,
      segments: [{ text: String(line?.text || "").trim(), emphasis: line?.emphasis === true, order: 1 }],
    }))
    .filter((line) => line.segments[0].text)
    .sort((a, b) => a.order - b.order);
}

function renderHeroLines(identity) {
  const lines = normalizeSignatureLines(identity);
  if (!lines.length) throw new Error("Company Source brandSignatureMessage.lines is empty.");

  return lines.map((line) => {
    const inner = line.segments.map((segment) => {
      const text = htmlEscape(segment.text);
      return segment.emphasis ? `<span class="hero-emphasis">${text}</span>` : text;
    }).join("");
    return `            <span class="hero-line">${inner}</span>`;
  }).join("\n");
}

function replaceOnce(source, marker, value) {
  if (!source.includes(marker)) throw new Error(`Missing build marker: ${marker}`);
  return source.replace(marker, value);
}

function updateMetaContent(source, selectorStart, content) {
  if (!content) return source;
  const escaped = htmlEscape(content, true);
  const pattern = new RegExp(`(<${selectorStart} content=")[^"]*(">)`, "i");
  return source.replace(pattern, `$1${escaped}$2`);
}

async function loadCompanySource() {
  if (JSON_PATH) {
    return JSON.parse(await readFile(JSON_PATH, "utf8"));
  }

  if (!API_BASE) {
    throw new Error("Set COMPANY_SOURCE_API_BASE or COMPANY_SOURCE_JSON_PATH before injecting Company Source.");
  }

  const response = await fetch(`${API_BASE}/company/public-source`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Company Source fetch failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function validateCompanySource(data) {
  const identity = data?.identity || {};
  const required = [
    ["identity.brandSignatureMessage.lines", normalizeSignatureLines(identity).length],
    ["identity.appIntroTitle", String(identity.appIntroTitle || identity.campaignMessage || "").trim()],
    ["identity.appIntroBody", String(identity.appIntroBody || identity.companyIntroBody || "").trim()],
    ["identity.studioIntroTitle", String(identity.studioIntroTitle || "").trim()],
    ["identity.studioIntroBody", String(identity.studioIntroBody || "").trim()],
  ];

  const missing = required.filter(([, value]) => !value).map(([label]) => label);
  if (missing.length) {
    throw new Error(`Company Source is missing required fields: ${missing.join(", ")}`);
  }
}

async function main() {
  const [template, data] = await Promise.all([
    readFile(TEMPLATE_PATH, "utf8"),
    loadCompanySource(),
  ]);

  validateCompanySource(data);

  const identity = data.identity;
  const mission = String(identity.mission || "").trim();
  const description = mission || String(identity.brandSignatureMessage?.plainText || "").trim();
  const title = String(identity.koreanName || identity.companyName || "네트멜론").trim();

  let output = template;
  output = replaceOnce(output, "<!-- __COMPANY_SOURCE_HOME_HERO_LINES__ -->", `\n${renderHeroLines(identity)}\n          `);
  output = replaceOnce(output, "<!-- __COMPANY_SOURCE_APP_TITLE__ -->", renderTextWithBreaks(identity.appIntroTitle || identity.campaignMessage));
  output = replaceOnce(output, "<!-- __COMPANY_SOURCE_APP_COPY__ -->", renderTextWithBreaks(identity.appIntroBody || identity.companyIntroBody));
  output = replaceOnce(output, "<!-- __COMPANY_SOURCE_STUDIO_TITLE__ -->", renderTextWithBreaks(identity.studioIntroTitle));
  output = replaceOnce(output, "<!-- __COMPANY_SOURCE_STUDIO_COPY__ -->", renderTextWithBreaks(identity.studioIntroBody));
  output = replaceOnce(
    output,
    "<!-- __COMPANY_SOURCE_BUILD_META__ -->",
    `<!-- Company Source injected at build time: ${htmlEscape(data.version || "unknown")}, publishedAt=${htmlEscape(data.publishedAt || "unknown")} -->`,
  );

  output = updateMetaContent(output, 'meta name="description"', description);
  output = updateMetaContent(output, 'meta property="og:description"', description);
  output = updateMetaContent(output, 'meta name="twitter:description"', description);
  output = output.replace(/<title>[^<]*<\/title>/i, `<title>${htmlEscape(title)}</title>`);

  const forbidden = [
    "__COMPANY_SOURCE_",
    "loadPublicCompanySource",
    "company/public-source fallback used",
  ];
  const found = forbidden.filter((token) => output.includes(token));
  if (found.length) {
    throw new Error(`Build output still contains forbidden token(s): ${found.join(", ")}`);
  }

  await writeFile(OUTPUT_PATH, output, "utf8");
  console.log(`Injected Company Source ${data.version || "unknown"} into ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error("[company-source-build]", error);
  process.exit(1);
});

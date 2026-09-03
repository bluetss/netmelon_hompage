#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const read = (relativePath) => readFile(path.join(ROOT, relativePath), "utf8");
const write = (relativePath, source) => writeFile(path.join(ROOT, relativePath), source, "utf8");

const pages = [
  {
    file: "index.template.html",
    brandHref: "https://netmelonai.com/",
    productHref: "#naepopquiz-app",
    englishHref: "en/index.html",
    active: "",
  },
  {
    file: "index.html",
    brandHref: "https://netmelonai.com/",
    productHref: "#naepopquiz-app",
    englishHref: "en/index.html",
    active: "",
  },
  {
    file: "company.template.html",
    brandHref: "index.html",
    productHref: "index.html#naepopquiz-app",
    englishHref: "en/company.html",
    active: "company",
  },
  {
    file: "company.html",
    brandHref: "index.html",
    productHref: "index.html#naepopquiz-app",
    englishHref: "en/company.html",
    active: "company",
  },
  {
    file: "problems.template.html",
    brandHref: "index.html",
    productHref: "index.html#naepopquiz-app",
    englishHref: "en/index.html",
    active: "problems",
  },
  {
    file: "ir.html",
    brandHref: "index.html",
    productHref: "index.html#naepopquiz-app",
    englishHref: "en/ir.html",
    active: "ir",
  },
  {
    file: "announcement.template.html",
    brandHref: "index.html",
    productHref: "index.html#naepopquiz-app",
    englishHref: "en/announcement.html",
    active: "announcement",
  },
];

function replaceSection(source, pattern, replacement, label, file) {
  if (!pattern.test(source)) {
    throw new Error(`${file} is missing ${label}.`);
  }
  return source.replace(pattern, replacement);
}

function renderHeader(template, page) {
  const activeClass = (key) => (page.active === key ? ' class="is-current"' : "");
  return template
    .replaceAll("__SITE_HEADER_BRAND_HREF__", page.brandHref)
    .replaceAll("__SITE_NAV_PRODUCT_HREF__", page.productHref)
    .replaceAll("__SITE_NAV_COMPANY_CLASS__", activeClass("company"))
    .replaceAll("__SITE_NAV_PROBLEMS_CLASS__", activeClass("problems"))
    .replaceAll("__SITE_NAV_CAREERS_CLASS__", activeClass("careers"))
    .replaceAll("__SITE_NAV_IR_CLASS__", activeClass("ir"))
    .replaceAll("__SITE_NAV_ANNOUNCEMENT_CLASS__", activeClass("announcement"))
    .replaceAll("__SITE_NAV_ENGLISH_HREF__", page.englishHref);
}

function syncShell(source, page, partials) {
  let output = source;
  output = replaceSection(
    output,
    /  <header class="site-header" id="top"[^>]*>[\s\S]*?^  <\/header>/m,
    partials.header(page).split("\n").map((line) => `  ${line}`).join("\n"),
    "site header",
    page.file,
  );
  output = replaceSection(
    output,
    /  <footer class="site-footer">[\s\S]*?^  <\/footer>/m,
    partials.footer.split("\n").map((line) => `  ${line}`).join("\n"),
    "site footer",
    page.file,
  );

  const script = partials.script.trim();
  if (output.includes('src="scripts/site-shell.js"')) {
    output = output.replace(/  <script src="scripts\/site-shell\.js" defer><\/script>/, `  ${script}`);
  } else {
    output = output.replace(/(  <\/footer>\n)/, `$1\n  ${script}\n`);
  }

  return output;
}

async function main() {
  const headerTemplate = (await read("partials/site-header.html")).trim();
  const footer = (await read("partials/site-footer.html")).trim();
  const script = (await read("partials/site-shell-script.html")).trim();
  const partials = {
    header: (page) => renderHeader(headerTemplate, page),
    footer,
    script,
  };

  for (const page of pages) {
    const source = await read(page.file);
    const output = syncShell(source, page, partials);
    if (output !== source) {
      await write(page.file, output);
      console.log(`Synced site shell into ${page.file}`);
    }
  }
}

main().catch((error) => {
  console.error("[site-shell-sync]", error);
  process.exit(1);
});

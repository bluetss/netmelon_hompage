#!/usr/bin/env node
import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const APP_HOME_ROOT =
  process.env.NAEPOPQUIZ_HOMEPAGE_ROOT || "/home/seungwoo/myworks/dev/naepopquiz_hompage";
const STUDIO_ROOT =
  process.env.NAEPOPQUIZ_STUDIO_ROOT || "/home/seungwoo/myworks/dev/naepopquiz_studio";

const DESIGN_SYSTEM_CSS = path.join(ROOT, "styles", "design-system.css");

const ensureStartsWith = (source, prefix) => source.startsWith(prefix) ? source : `${prefix}${source}`;

async function updateFile(filePath, updater) {
  const before = await readFile(filePath, "utf8");
  const after = updater(before);
  if (after !== before) await writeFile(filePath, after, "utf8");
}

async function applyAppHomepage() {
  const targetCss = path.join(APP_HOME_ROOT, "styles", "design-system.css");
  const landingCss = path.join(APP_HOME_ROOT, "styles", "landing.css");

  await copyFile(DESIGN_SYSTEM_CSS, targetCss);
  await updateFile(landingCss, (source) => {
    let next = ensureStartsWith(source, '@import url("./design-system.css");\n\n');
    next = next.replace(
      /:root\s*\{[\s\S]*?\n\}/,
      `:root {
  --bg: var(--npq-color-surface-container-low);
  --bg-muted: var(--npq-color-surface-container);
  --surface: rgba(255, 255, 255, 0.82);
  --surface-strong: var(--npq-color-surface);
  --text: var(--npq-color-on-surface);
  --muted: var(--npq-color-on-surface-variant);
  --line: var(--npq-color-outline-variant);
  --accent: var(--npq-color-secondary);
  --accent-strong: var(--npq-color-on-primary-container);
  --shadow: var(--npq-elevation-2);
}`,
    );
    next = next.replace(
      /font-family:\s*"Roboto",\s*sans-serif;/,
      "font-family: var(--npq-font-family-base);",
    );
    return next;
  });
}

async function applyStudio() {
  const targetCss = path.join(STUDIO_ROOT, "src", "styles", "design-system.css");
  const indexCss = path.join(STUDIO_ROOT, "src", "index.css");

  await copyFile(DESIGN_SYSTEM_CSS, targetCss);
  await updateFile(indexCss, (source) => {
    let next = ensureStartsWith(source, '@import "./styles/design-system.css";\n\n');
    next = next.replace(
      /body\s*\{\s*margin:\s*0;\s*font-family:[^;]+;\s*color:\s*#[0-9a-fA-F]+;\s*\}/,
      "body { margin: 0; font-family: var(--npq-font-family-base); color: var(--npq-color-on-surface); background: var(--npq-color-surface-container-low); }",
    );
    return next;
  });
}

async function main() {
  await applyAppHomepage();
  await applyStudio();
  console.log(`Applied design-system.css to ${APP_HOME_ROOT}`);
  console.log(`Applied design-system.css to ${STUDIO_ROOT}`);
}

main().catch((error) => {
  console.error("[design-system-apply]", error);
  process.exit(1);
});

#!/usr/bin/env node
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const DEFAULT_SOURCE =
  path.resolve(ROOT, "../naepopquiz_app/application/lib/utils/design_system.dart");
const SOURCE_PATH = process.env.APP_DESIGN_SYSTEM_DART || DEFAULT_SOURCE;
const SOURCE_LABEL =
  process.env.APP_DESIGN_SYSTEM_LABEL || "naepopquiz_app/application/lib/utils/design_system.dart";
const OUTPUT_PATH = process.env.APP_DESIGN_SYSTEM_CSS || path.join(ROOT, "styles", "design-system.css");
const TS_OUTPUT_PATH = String(process.env.APP_DESIGN_SYSTEM_TS || "").trim();

const camelToKebab = (value) => value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);

const argbToCss = (argb) => {
  const value = argb.toUpperCase();
  const alpha = parseInt(value.slice(0, 2), 16);
  const red = parseInt(value.slice(2, 4), 16);
  const green = parseInt(value.slice(4, 6), 16);
  const blue = parseInt(value.slice(6, 8), 16);
  if (alpha === 255) return `#${value.slice(2)}`;
  return `rgba(${red}, ${green}, ${blue}, ${(alpha / 255).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")})`;
};

const extractSection = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Missing section start: ${startMarker}`);
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;
  if (end < 0) throw new Error(`Missing section end: ${endMarker}`);
  return source.slice(start, end);
};

const parseColors = (source) => {
  const section = extractSection(source, "class AppColors", "// ==================== TYPOGRAPHY");
  const colors = [];
  const pattern = /static const Color\s+(\w+)\s*=\s*Color\(0x([0-9A-Fa-f]{8})\);/g;
  let match;
  while ((match = pattern.exec(section)) !== null) {
    colors.push({
      name: camelToKebab(match[1]),
      value: argbToCss(match[2]),
    });
  }
  return colors;
};

const cssColorToRgba = (value, alpha) => {
  const hex = String(value || "").trim().replace(/^#/, "");
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return value;
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const parseFontFamily = (source) => {
  const match = source.match(/static const String\s+_fontFamily\s*=\s*'([^']+)';/);
  return match ? match[1] : "Pretendard";
};

const parseLineHeightPx = (body) => {
  const ratioMatch = body.match(/height:\s*([0-9.]+)\s*\/\s*([0-9.]+)/);
  if (ratioMatch) return String(Number(ratioMatch[1]) / Number(ratioMatch[2]));
  const plainMatch = body.match(/height:\s*([0-9.]+)/);
  if (plainMatch) return String(Number(plainMatch[1]));
  return null;
};

const parseFontWeight = (body) => {
  if (body.includes("FontWeight.normal")) return "400";
  const match = body.match(/FontWeight\.w([0-9]{3})/);
  return match ? match[1] : null;
};

const parseTypography = (source) => {
  const section = extractSection(source, "class AppTypography", "// ==================== ELEVATION STYLES");
  const typography = [];
  const pattern = /static const TextStyle\s+(\w+)\s*=\s*TextStyle\(([\s\S]*?)\n\s*\);/g;
  let match;
  while ((match = pattern.exec(section)) !== null) {
    const [, rawName, body] = match;
    const fontSize = body.match(/fontSize:\s*([0-9.]+)/);
    const letterSpacing = body.match(/letterSpacing:\s*(-?[0-9.]+)/);
    typography.push({
      name: camelToKebab(rawName),
      fontSize: fontSize ? `${Number(fontSize[1])}px` : null,
      lineHeight: parseLineHeightPx(body),
      letterSpacing: letterSpacing ? `${Number(letterSpacing[1])}px` : "0px",
      fontWeight: parseFontWeight(body),
    });
  }
  return typography;
};

// Consume existing semantic styles, including copyWith variants. No web-only
// typography registry: the app classes remain the source of role definitions.
const parseSemanticTypography = (source, base) => {
  const styles = new Map(base.map(item => [`AppTypography.${item.name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}`, item]));
  const sizes = Object.fromEntries([...source.matchAll(/static const (?:double\s+)?(\w+)\s*=\s*([\d.]+);/g)].map(m => [m[1], Number(m[2])]));
  for (const className of ["AppTypography", "AppHomeTypography", "AppContentTypography", "AppTrainingTypography"]) {
    const section = source.slice(source.indexOf(`class ${className} {`)).split(/\n(?:abstract final )?class /)[0];
    for (const m of section.matchAll(/static (?:final|const)\s+(\w+)\s*=\s*([\w.]+)(?:\.copyWith\(([\s\S]*?)\))?\s*;/g)) {
      const parent = styles.get(m[2]) || styles.get(`${className}.${m[2]}`);
      if (!parent) continue;
      const role = className === "AppTypography" ? camelToKebab(m[1]) : `${className.replace(/^App|Typography$/g, '').toLowerCase()}-${camelToKebab(m[1])}`;
      const item = {...parent, name: role};
      const body = m[3] || '';
      const size = body.match(/fontSize:\s*(AppTypeSizes\.(\w+)|[\d.]+)/);
      if (size) item.fontSize = `${size[2] ? sizes[size[2]] : Number(size[1])}px`;
      const height = body.match(/height:\s*([\d.]+)(?:\s*\/\s*([\d.]+))?/);
      if (height) item.lineHeight = String(Number(height[1]) / (height[2] ? Number(height[2]) : 1));
      const spacing = body.match(/letterSpacing:\s*(-?[\d.]+)/);
      if (spacing) item.letterSpacing = `${Number(spacing[1])}px`;
      item.fontWeight = parseFontWeight(body) || parent.fontWeight || '400';
      styles.set(`${className}.${m[1]}`, item);
    }
  }
  return [...new Map([...styles.values()].map(item => [item.name, item])).values()];
};

const renderTypography = (typography) => typography.flatMap((item) => {
  const prefix = `--npq-type-${item.name}`;
  const lines = [];
  if (item.fontSize) lines.push(`  ${prefix}-font-size: ${Number.parseFloat(item.fontSize) / 16}rem;`);
  if (item.lineHeight) lines.push(`  ${prefix}-line-height: ${item.lineHeight.endsWith('px') ? Number.parseFloat(item.lineHeight) / Number.parseFloat(item.fontSize) : item.lineHeight};`);
  if (item.letterSpacing) lines.push(`  ${prefix}-letter-spacing: ${item.letterSpacing};`);
  lines.push(`  ${prefix}-font-weight: ${item.fontWeight || '400'};`);
  return lines;
}).join("\n");

const numericPx = (value, fallback) => {
  const match = String(value || "").match(/^([0-9.]+)px$/);
  return match ? Number(match[1]) : fallback;
};

const renderStudioTokensTs = (colors, typography) => {
  const colorMap = Object.fromEntries(colors.map((color) => [color.name, color.value]));
  const typeMap = Object.fromEntries(typography.map((type) => [type.name, type]));
  const color = (name, fallback) => colorMap[name] || fallback;
  const typeSize = (name, fallback) => numericPx(typeMap[name]?.fontSize, fallback);

  return `// src/styles/tokens.ts
// Generated from ${SOURCE_LABEL}
// Source of truth: application/lib/utils/design_system.dart
// Do not edit manually. Run scripts/sync-design-system-css.mjs after app token changes.

export const colors = {
  // Brand / primary
  primary: "${color("primary", "#00BFA5")}",
  primarySoft: "${cssColorToRgba(color("primary", "#00BFA5"), 0.08)}",
  primaryBg: "${color("primary-container", "#D6F7F2")}",

  // Accent
  accentGreen: "${color("success", "#16A34A")}",
  accentNavy: "${color("on-primary-container", "#00564B")}",

  // Text
  textStrong: "${color("on-surface", "#111827")}",
  text: "${color("on-surface-variant", "#5A6475")}",
  textSoft: "${color("on-surface-variant", "#5A6475")}",
  textMuted: "${color("outline", "#C4D2E8")}",

  // Border
  border: "${color("outline-variant", "#D7E2F2")}",
  borderSoft: "${color("outline", "#C4D2E8")}",

  // Background
  bgSoft: "${color("surface-container-low", "#F5F9FF")}",
  bgCard: "${color("surface-bright", "#FFFFFF")}",

  // Danger
  danger: "${color("error", "#DC2626")}",
  dangerDeep: "${color("on-error-container", "#8A1111")}",
  dangerSoft: "${color("error-container", "#FFE8E8")}",
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 12,
  xl: 16,
  pill: 999,
} as const;

export const fontSizes = {
  xs: ${typeSize("label-small", 11)},
  sm: ${typeSize("label-medium", 12)},
  md: ${typeSize("body-medium", 14)},
  lg: ${typeSize("body-large", 16)},
  xl: ${typeSize("title-large", 22)},
} as const;

export const spacing = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
} as const;
`;
};

async function main() {
  const source = await readFile(SOURCE_PATH, "utf8");
  const colors = parseColors(source);
  const typography = parseSemanticTypography(source, parseTypography(source));
  const fontFamily = parseFontFamily(source);

  const output = `/* Generated from ${SOURCE_LABEL}
 * Source of truth: application/lib/utils/design_system.dart
 * Do not edit manually. Run scripts/sync-design-system-css.mjs after app token changes.
 */

:root {
  --npq-font-family-base: "${fontFamily}", "Noto Sans KR", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
${colors.map((color) => `  --npq-color-${color.name}: ${color.value};`).join("\n")}
${[...extractSection(source, 'static const ColorScheme dark =', '\n/// Home semantic').matchAll(/(\w+): Color\(0x([\dA-Fa-f]{8})\)/g)].map(m => `  --npq-dark-${camelToKebab(m[1])}: ${argbToCss(m[2])};`).join('\n')}
${renderTypography(typography)}
  --npq-weight-regular: 400;
  --npq-weight-medium: 500;
  --npq-weight-semibold: 600;
  --npq-weight-bold: 700;
  --npq-weight-extra-bold: 800;
  --npq-weight-heavy: 900;
  --npq-radius-button: 12px;
  --npq-radius-card: 16px;
  --npq-radius-logo: 10px;
  --npq-header-height: 76px;
  --npq-elevation-1: 0 1px 3px 1px rgba(59, 130, 246, 0.086), 0 1px 2px 0 rgba(14, 165, 233, 0.051);
  --npq-elevation-2: 0 2px 6px 2px rgba(59, 130, 246, 0.086), 0 1px 2px 0 rgba(14, 165, 233, 0.051);
  --npq-elevation-3: 0 1px 3px 0 rgba(14, 165, 233, 0.071), 0 4px 8px 2px rgba(59, 130, 246, 0.086);
  --npq-elevation-4: 0 2px 4px 0 rgba(14, 165, 233, 0.071), 0 6px 10px 3px rgba(59, 130, 246, 0.078);
  --npq-elevation-5: 0 4px 5px 0 rgba(14, 165, 233, 0.071), 0 8px 12px 5px rgba(59, 130, 246, 0.078);
}
`;

  if (/NaN|undefined/.test(output)) throw new Error('Unresolved app typography');
  const application = path.resolve(path.dirname(SOURCE_PATH), '../..');
  if (process.argv.includes('--check')) {
    if (await readFile(OUTPUT_PATH, 'utf8') !== output) throw new Error('App design tokens differ; run sync:design-system');
    const fonts = path.join(path.dirname(OUTPUT_PATH), 'fonts');
    if (!(await readFile(path.join(fonts, 'PretendardVariable.ttf'))).equals(await readFile(path.join(application, 'assets/fonts/PretendardVariable.ttf')))) throw new Error('App font bytes differ');
    console.log('App semantic typography, light/dark colors and font parity PASS');
    return;
  }
  await writeFile(OUTPUT_PATH, output, "utf8");
  console.log(`Wrote ${OUTPUT_PATH}`);

  const fonts = path.join(path.dirname(OUTPUT_PATH), 'fonts');
  await mkdir(fonts, {recursive: true});
  await copyFile(path.join(application, 'assets/fonts/PretendardVariable.ttf'), path.join(fonts, 'PretendardVariable.ttf'));
  await writeFile(path.join(fonts, 'Pretendard-LICENSE.txt'), (await readFile(path.join(application, 'tools/open_source_notices/Pretendard_LICENSE.txt'), 'utf8')).replace(/[ \t]+$/gm, ''));
  if (!process.env.APP_DESIGN_SYSTEM_CSS) {
    const icons = path.join(ROOT, 'styles/icons');
    await mkdir(icons, {recursive: true});
    for (const name of ['menu', 'close']) await copyFile(path.join(application, `assets/material_symbols/outlined/${name}.svg`), path.join(icons, `${name}.svg`));
    const notices = JSON.parse(await readFile(path.join(application, 'assets/legal/open_source_notices.json'), 'utf8'));
    const material = notices.components.find(item => item.name === 'Material Icons');
    if (!material || !notices.notices[material.noticeId]) throw new Error('App Material Icons license missing');
    await writeFile(path.join(icons, 'Material-Icons-LICENSE.txt'), notices.notices[material.noticeId].replace(/[ \t]+$/gm, '') + '\n');
  }

  if (TS_OUTPUT_PATH) {
    await writeFile(TS_OUTPUT_PATH, renderStudioTokensTs(colors, typography), "utf8");
    console.log(`Wrote ${TS_OUTPUT_PATH}`);
  }
}

main().catch((error) => {
  console.error("[design-system-sync]", error);
  process.exit(1);
});

#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMPANY_ASSET_RENDER_SLOTS } from "./company-asset-slots.mjs";
import { PUBLISHER_PROFILE_MARKER, normalizePublisherProfile, renderPublisherFooter } from "./publisher-profile.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const read = (relativePath) => readFile(path.join(ROOT, relativePath), "utf8");
const readIfExists = async (relativePath) => {
  try {
    return await read(relativePath);
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
};
const listFiles = async (relativePath) => {
  try {
    return await readdir(path.join(ROOT, relativePath), { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
};

const failures = [];

function fail(message) {
  failures.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function findAny(source, patterns) {
  return patterns.filter((pattern) => pattern.test(source));
}

function withoutPublisherDisclosure(source) {
  return String(source).replace(/<section class=\"publisher-business\"[\s\S]*?<\/section>/gi, "");
}

function normalizeJsonLdNodes(payload) {
  const root = Array.isArray(payload) ? payload : [payload];
  return root.flatMap((item) => {
    if (Array.isArray(item?.["@graph"])) return item["@graph"];
    return item ? [item] : [];
  });
}

function extractJsonLd(source, file) {
  const scripts = Array.from(source.matchAll(
    /<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  ));

  return scripts.map((match, index) => {
    try {
      return JSON.parse(match[1].trim());
    } catch (error) {
      fail(`${file} has invalid JSON-LD script #${index + 1}: ${error.message}`);
      return null;
    }
  }).filter(Boolean);
}

function nodeHasType(node, type) {
  const nodeType = node?.["@type"];
  return Array.isArray(nodeType) ? nodeType.includes(type) : nodeType === type;
}

function jsonLdHasType(value, type) {
  if (Array.isArray(value)) return value.some((item) => jsonLdHasType(item, type));
  if (!value || typeof value !== "object") return false;
  if (nodeHasType(value, type)) return true;
  return Object.values(value).some((item) => jsonLdHasType(item, type));
}

function parseJson(source, file) {
  try {
    return JSON.parse(source);
  } catch (error) {
    fail(`${file} has invalid JSON: ${error.message}`);
    return null;
  }
}

async function checkCompanySourceBuild() {
  const generatedPages = ["index.html", "company.html"];
  const forbiddenPatterns = [
    /__COMPANY_SOURCE_/,
    /__COMPANY_NOTICES_/,
    /\/company\/public-source/,
    /loadPublicCompanySource/,
    /fetchCompanyPublicSource/,
    /company\/public-source fallback used/,
  ];

  for (const page of generatedPages) {
    const source = await read(page);
    assert(
      source.includes("Company Source injected at build time:"),
      `${page} is missing Company Source build metadata.`,
    );

    const found = findAny(source, forbiddenPatterns);
    assert(found.length === 0, `${page} contains forbidden Company Source runtime token(s).`);
  }

  const home = await read("index.html");
  assert(home.includes("<title>네트멜론</title>"), "index.html browser tab title must be 네트멜론.");
  assert(
    home.includes('<meta property="og:title" content="네트멜론">'),
    "index.html Open Graph title must be 네트멜론.",
  );
  assert(
    home.includes('<meta name="twitter:title" content="네트멜론">'),
    "index.html Twitter title must be 네트멜론.",
  );
}

function normalizeAnnouncements(payload) {
  const raw = Array.isArray(payload) ? payload : payload?.announcements;
  if (!Array.isArray(raw)) return [];

  return raw.map((announcement) => ({
    entryId: announcement?.entryId ?? announcement?.id ?? "",
    title: String(announcement?.title || "").trim(),
    announcementType: String(announcement?.announcementType || announcement?.type || "").trim(),
    slug: String(announcement?.slug || "").trim(),
    summary: String(announcement?.summary || "").trim(),
    body: String(announcement?.body || "").trim(),
    publishedAt: String(announcement?.publishedAt || announcement?.date || "").trim(),
    status: String(announcement?.status || "published").trim(),
  }));
}

async function checkCompanyAnnouncements() {
  const payload = JSON.parse(await read("data/company-announcements.ko.json"));
  const companySource = JSON.parse(await read("data/company-source.ko.json"));
  const announcements = normalizeAnnouncements(payload).filter((announcement) => announcement.status === "published");
  const announcementHtml = await read("announcement.html");
  const announcementEmptyTitle = String(companySource?.identity?.announcementEmptyTitle || "").trim();
  const announcementEmptyBody = String(companySource?.identity?.announcementEmptyBody || "").trim();
  const allowedAnnouncementTypes = new Set([
    "legal_notice",
    "governance_notice",
    "privacy_notice",
    "administrative_notice",
  ]);

  assert(announcementHtml.includes("Company announcements generated at build time:"), "announcement.html is missing company announcement build metadata.");
  assert(announcementHtml.includes('id="announcements"'), "announcement.html must expose the company announcement list or empty state.");
  assert(!announcementHtml.includes("IR 공고"), "announcement.html must not position company announcements as IR notices.");

  const invalid = announcements.filter((announcement) => (
    !announcement.entryId ||
    !announcement.title ||
    !allowedAnnouncementTypes.has(announcement.announcementType) ||
    !announcement.slug ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(announcement.slug) ||
    !announcement.summary ||
    !announcement.body ||
    !/^\d{4}-\d{2}-\d{2}$/.test(announcement.publishedAt)
  ));
  assert(invalid.length === 0, "data/company-announcements.ko.json has announcements with missing entryId/title/allowed type/kebab-case slug/summary/body or invalid publishedAt.");

  const ids = announcements.map((announcement) => String(announcement.entryId || "").trim()).filter(Boolean);
  const duplicatedIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert(duplicatedIds.length === 0, "data/company-announcements.ko.json has duplicated entry IDs.");

  const slugs = announcements.map((announcement) => announcement.slug);
  const duplicatedSlugs = slugs.filter((slug, index) => slugs.indexOf(slug) !== index);
  assert(duplicatedSlugs.length === 0, "data/company-announcements.ko.json has duplicated slugs.");

  const dates = announcements.map((announcement) => announcement.publishedAt);
  const sortedDates = [...dates].sort((a, b) => b.localeCompare(a));
  assert(dates.join("|") === sortedDates.join("|"), "data/company-announcements.ko.json must be sorted by publishedAt descending.");

  if (announcements.length === 0) {
    assert(announcementEmptyTitle, "data/company-source.ko.json must define identity.announcementEmptyTitle for announcement empty state.");
    assert(announcementEmptyBody, "data/company-source.ko.json must define identity.announcementEmptyBody for announcement empty state.");
    assert(announcementHtml.includes(announcementEmptyTitle), "announcement.html must show the Company Source announcement empty state title when no announcements are published.");
    assert(announcementHtml.includes(announcementEmptyBody), "announcement.html must show the Company Source announcement empty state body when no announcements are published.");
    assert(!announcementHtml.includes('class="announcement-list"'), "announcement.html must not render a list when no announcements are published.");
  }

  if (announcements.length > 0) {
    assert(!announcementHtml.includes(announcementEmptyTitle), "announcement.html must not show the empty-state title when announcements are published.");
    assert(!announcementHtml.includes(announcementEmptyBody), "announcement.html must not show the empty-state body when announcements are published.");
  }

  const expectedDetailFiles = new Set(announcements.map((announcement) => `${announcement.slug}.html`));
  const actualDetailFiles = (await listFiles("announcements"))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => entry.name)
    .sort();
  const staleDetailFiles = actualDetailFiles.filter((file) => !expectedDetailFiles.has(file));
  const missingDetailFiles = [...expectedDetailFiles].filter((file) => !actualDetailFiles.includes(file));
  assert(staleDetailFiles.length === 0, `announcements/ has stale generated detail page(s): ${staleDetailFiles.join(", ")}`);
  assert(missingDetailFiles.length === 0, `announcements/ is missing generated detail page(s): ${missingDetailFiles.join(", ")}`);

  for (const announcement of announcements) {
    assert(announcementHtml.includes(announcement.title), `announcement.html is missing announcement title: ${announcement.title}`);
    const detailPath = `announcements/${announcement.slug}.html`;
    const detailHtml = await read(detailPath);
    assert(detailHtml.includes("Company announcements generated at build time:"), `${detailPath} is missing company announcement detail build metadata.`);
    assert(detailHtml.includes(announcement.title), `${detailPath} is missing announcement title.`);
    assert(detailHtml.includes(announcement.summary), `${detailPath} is missing announcement summary.`);
    assert(!detailHtml.includes("__COMPANY_ANNOUNCEMENT_"), `${detailPath} contains unresolved announcement detail marker(s).`);
    assert(/<a[^>]+class="lang-link"[^>]*>\s*ENGLISH\s*<\/a>/i.test(detailHtml), `${detailPath} must expose an ENGLISH language switch.`);

    const payloads = extractJsonLd(detailHtml, detailPath);
    const nodes = payloads.flatMap(normalizeJsonLdNodes);
    assert(nodes.some((node) => nodeHasType(node, "Article")), `${detailPath} is missing JSON-LD type Article.`);
  }
}

async function checkCompanyAssets() {
  const allowedAssetTypes = new Set([
    "brand_logo",
    "app_icon",
    "store_badge",
    "raw_app_screenshot",
    "app_screenshot",
    "framed_app_screenshot",
    "feature_graphic",
    "og_image",
    "website_hero",
    "ir_visual",
    "press_image",
    "install_qr",
  ]);
  const publicDisclosureLevels = new Set(["public", "controlled_public"]);
  const devPatterns = [
    /localhost/i,
    /127\.0\.0\.1/,
    /dev\.netmelonai\.com/i,
    /dev\.naepopquiz\.com/i,
    /studio-dev\.naepopquiz\.com/i,
    /figma\.com[^"]*api/i,
  ];
  const clean = (value) => String(value ?? "").trim();
  const sameValues = (left, right) => (
    left.length === right.length && left.every((value, index) => value === right[index])
  );

  for (const locale of ["ko", "en"]) {
    const file = `data/company-assets.${locale}.json`;
    const raw = await readIfExists(file);
    if (!raw) continue;

    const payload = parseJson(raw, file);
    if (!payload) continue;

    assert(payload.schemaVersion === "asset-manifest.v2", `${file} must use asset-manifest.v2.`);
    assert(payload.siteId === "company", `${file} must have siteId=company.`);
    assert(payload.locale === locale, `${file} must have locale=${locale}.`);
    assert(Array.isArray(payload.assetIds), `${file} must include assetIds array.`);
    assert(Array.isArray(payload.assets), `${file} must include assets array.`);
    assert(payload.assetsById && typeof payload.assetsById === "object" && !Array.isArray(payload.assetsById), `${file} must include assetsById object.`);

    const foundDev = findAny(raw, devPatterns);
    assert(foundDev.length === 0, `${file} contains development or temporary asset URL(s).`);

    const assetIds = payload.assetIds.map(clean).filter(Boolean);
    const actualIds = payload.assets.map((asset) => clean(asset?.assetId)).filter(Boolean);
    const indexedIds = Object.keys(payload.assetsById || {}).map(clean).filter(Boolean);
    const duplicatedIds = assetIds.filter((id, index) => assetIds.indexOf(id) !== index);
    const missingAssets = assetIds.filter((assetId) => !actualIds.includes(assetId));
    const missingIds = actualIds.filter((assetId) => !assetIds.includes(assetId));
    assert(duplicatedIds.length === 0, `${file} has duplicated assetId(s): ${[...new Set(duplicatedIds)].join(", ")}`);
    assert(missingAssets.length === 0 && missingIds.length === 0, `${file} assetIds must match assets[].assetId exactly.`);
    assert(
      sameValues([...assetIds].sort(), [...indexedIds].sort()),
      `${file} assetIds must match assetsById keys exactly.`,
    );

    for (const asset of payload.assets) {
      const assetId = clean(asset?.assetId);
      const assetType = clean(asset?.assetType);
      const title = clean(asset?.title);
      const altText = clean(asset?.altText);
      const disclosureLevel = clean(asset?.disclosureLevel || "public");
      const indexedAsset = payload.assetsById?.[assetId];
      const derivatives = Array.isArray(asset?.derivatives) ? asset.derivatives : [];

      assert(/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(assetId), `${file} has invalid assetId: ${assetId || "-"}.`);
      assert(indexedAsset && typeof indexedAsset === "object", `${file} assetsById is missing ${assetId}.`);
      assert(clean(indexedAsset?.assetId) === assetId, `${file} assetsById.${assetId} has mismatched assetId.`);
      assert(allowedAssetTypes.has(assetType), `${file} asset ${assetId} has unsupported assetType: ${assetType}.`);
      assert(Boolean(title), `${file} asset ${assetId} is missing title.`);
      assert(Boolean(altText), `${file} asset ${assetId} is missing altText.`);
      assert(publicDisclosureLevels.has(disclosureLevel), `${file} asset ${assetId} has non-public disclosureLevel: ${disclosureLevel}.`);
      assert(derivatives.length > 0, `${file} asset ${assetId} has no published derivatives.`);

      if (locale === "en") {
        assert(!/[가-힣]/.test(title), `${file} asset ${assetId} title contains Korean fallback text.`);
        assert(!/[가-힣]/.test(altText), `${file} asset ${assetId} altText contains Korean fallback text.`);
      }

      const derivativeKeys = new Set();
      for (const derivative of derivatives) {
        const derivativeId = clean(derivative?.derivativeId);
        const purpose = clean(derivative?.purpose);
        const variant = clean(derivative?.variant || "default");
        const publicUrl = clean(derivative?.publicUrl);
        const fallbackPath = clean(derivative?.fallbackPath);
        const key = `${purpose}\u0000${variant}`;

        assert(Boolean(derivativeId), `${file} asset ${assetId} has derivative without derivativeId.`);
        assert(Boolean(purpose), `${file} asset ${assetId} derivative ${derivativeId || "-"} is missing purpose.`);
        assert(Boolean(publicUrl || fallbackPath), `${file} asset ${assetId} derivative ${derivativeId || "-"} is missing publicUrl/fallbackPath.`);
        assert(!derivativeKeys.has(key), `${file} asset ${assetId} has duplicate ${purpose}/${variant} derivatives.`);
        derivativeKeys.add(key);

        if (fallbackPath && !/^https?:\/\//i.test(fallbackPath) && !/^gs:\/\//i.test(fallbackPath)) {
          assert(!fallbackPath.startsWith("/"), `${file} asset ${assetId} fallbackPath must be relative: ${fallbackPath}`);
          assert(!fallbackPath.split("/").includes(".."), `${file} asset ${assetId} fallbackPath must not traverse directories: ${fallbackPath}`);
          const localAsset = await readIfExists(fallbackPath);
          assert(Boolean(localAsset), `${file} asset ${assetId} fallbackPath does not exist locally: ${fallbackPath}`);
        }
      }
    }

    const bindings = payload.bindings;
    const slots = payload.slots;
    assert(bindings && typeof bindings === "object" && !Array.isArray(bindings), `${file} must include bindings object.`);
    assert(bindings?.schemaVersion === "asset-bindings.v1", `${file} bindings must use asset-bindings.v1.`);
    assert(["published", "unpublished"].includes(clean(bindings?.status)), `${file} bindings has invalid public status.`);
    assert(slots && typeof slots === "object" && !Array.isArray(slots), `${file} must include slots object.`);
    assert(JSON.stringify(slots) === JSON.stringify(bindings?.slots || {}), `${file} top-level slots must match bindings.slots.`);

    if (bindings.status === "unpublished") {
      assert(Object.keys(slots).length === 0, `${file} unpublished bindings must not expose slots.`);
      continue;
    }

    for (const [slotId, references] of Object.entries(slots)) {
      assert(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(slotId), `${file} has invalid asset slot ID: ${slotId}.`);
      assert(Array.isArray(references), `${file} slot ${slotId} must be an array.`);
      const referenceKeys = new Set();
      for (const [index, reference] of references.entries()) {
        const assetId = clean(reference?.assetId);
        const purpose = clean(reference?.purpose);
        const variant = clean(reference?.variant || "default");
        const referenceKey = `${assetId}\u0000${purpose}\u0000${variant}`;
        const asset = payload.assetsById?.[assetId];
        const matches = Array.isArray(asset?.derivatives)
          ? asset.derivatives.filter((derivative) => (
              clean(derivative?.purpose) === purpose
              && clean(derivative?.variant || "default") === variant
              && Boolean(clean(derivative?.publicUrl) || clean(derivative?.fallbackPath))
            ))
          : [];

        assert(Boolean(assetId && purpose), `${file} slot ${slotId}[${index}] is missing assetId or purpose.`);
        assert(!referenceKeys.has(referenceKey), `${file} slot ${slotId} contains duplicate asset reference ${assetId} ${purpose}/${variant}.`);
        assert(asset && typeof asset === "object", `${file} slot ${slotId}[${index}] references unpublished asset ${assetId}.`);
        assert(matches.length === 1, `${file} slot ${slotId}[${index}] must resolve exactly one ${assetId} ${purpose}/${variant} derivative.`);
        referenceKeys.add(referenceKey);
      }
    }

    for (const renderSlot of COMPANY_ASSET_RENDER_SLOTS) {
      const references = Array.isArray(slots[renderSlot.slotId]) ? slots[renderSlot.slotId] : [];
      for (const [index, reference] of references.entries()) {
        const asset = payload.assetsById?.[clean(reference?.assetId)];
        assert(
          clean(reference?.purpose) === renderSlot.purpose && clean(reference?.variant || "default") === renderSlot.variant,
          `${file} slot ${renderSlot.slotId}[${index}] must use ${renderSlot.purpose}/${renderSlot.variant}.`,
        );
        assert(
          renderSlot.products.includes(clean(asset?.product)),
          `${file} slot ${renderSlot.slotId}[${index}] uses disallowed product ${clean(asset?.product) || "unknown"}.`,
        );
      }
    }

    const targetFile = locale === "ko" ? "index.html" : "en/index.html";
    const targetHtml = await readIfExists(targetFile);
    assert(Boolean(targetHtml), `${targetFile} must exist for published company asset bindings.`);
    if (targetHtml) {
      for (const renderSlot of COMPANY_ASSET_RENDER_SLOTS) {
        const startIndex = targetHtml.indexOf(renderSlot.startMarker);
        const endIndex = targetHtml.indexOf(renderSlot.endMarker, startIndex + renderSlot.startMarker.length);
        assert(startIndex >= 0 && endIndex >= 0, `${targetFile} is missing ${renderSlot.slotId} asset markers.`);
        if (startIndex >= 0 && endIndex >= 0) {
          const segment = targetHtml.slice(startIndex + renderSlot.startMarker.length, endIndex);
          const renderedIds = [...segment.matchAll(/data-asset-id="([^"]+)"/g)].map((match) => clean(match[1]));
          const expectedIds = Array.isArray(slots[renderSlot.slotId])
            ? slots[renderSlot.slotId].map((reference) => clean(reference?.assetId))
            : [];
          assert(
            sameValues(renderedIds, expectedIds),
            `${targetFile} rendered order must match ${file} slot ${renderSlot.slotId}.`,
          );
        }
      }
    }
  }
}

async function checkEnglishCmsGeneration() {
  const sourceRaw = await readIfExists("data/company-source.en.json");
  if (!sourceRaw) return;

  const generatedMarker = "Company English pages generated from CMS public English snapshots";
  const englishSource = parseJson(sourceRaw, "data/company-source.en.json");
  if (!englishSource) return;

  assert(englishSource.locale === "en", "data/company-source.en.json must have locale=en.");
  assert(englishSource.isDefault !== true, "data/company-source.en.json must not be an unpublished/default source.");
  assert(!/[가-힣]/.test(sourceRaw), "data/company-source.en.json contains Korean fallback text.");
  assert(Boolean(String(englishSource.sourceVersionId || "").trim()), "data/company-source.en.json is missing sourceVersionId.");

  const seedRaw = await readIfExists("data/company-translations.en.seed.json");
  assert(Boolean(seedRaw), "data/company-translations.en.seed.json must exist when data/company-source.en.json exists.");
  const translationSeed = seedRaw ? parseJson(seedRaw, "data/company-translations.en.seed.json") : null;
  if (translationSeed) {
    const requiredRoutes = new Set([
      "company.home",
      "company.overview",
      "company.ir",
      "company.announcements",
    ]);
    assert(translationSeed.sourceVersionId === englishSource.sourceVersionId, "data/company-translations.en.seed.json sourceVersionId must match data/company-source.en.json.");
    assert(translationSeed.targetLocale === "en", "data/company-translations.en.seed.json must have targetLocale=en.");
    assert(!/[가-힣]/.test(JSON.stringify(translationSeed.records || []).replace(/"sourceText":"[^"]*"/g, "")), "data/company-translations.en.seed.json contains Korean fallback in non-source fields.");
    const records = Array.isArray(translationSeed.records) ? translationSeed.records : [];
    const routeIds = new Set(records.map((record) => record?.routeId).filter(Boolean));
    for (const routeId of requiredRoutes) {
      assert(routeIds.has(routeId), `data/company-translations.en.seed.json is missing route ${routeId}.`);
    }
    for (const record of records) {
      assert(/^sha256:[a-f0-9]{64}$/.test(String(record?.sourceHash || "")), `${record?.routeId || "translation record"} has invalid sourceHash.`);
      const fields = Array.isArray(record?.fields) ? record.fields : [];
      assert(fields.length > 0, `${record?.routeId || "translation record"} must include translation fields.`);
      for (const field of fields) {
        assert(Boolean(String(field?.sourceText || "").trim()), `${record?.routeId || "translation record"} has field without sourceText.`);
        assert(Boolean(String(field?.targetText || "").trim()), `${record?.routeId || "translation record"} has field without targetText.`);
        assert(!/[가-힣]/.test(String(field?.targetText || "")), `${record?.routeId || "translation record"} has Korean fallback targetText.`);
      }
    }
  }

  const generatedPages = [
    "en/index.html",
    "en/company.html",
    "en/ir.html",
    "en/announcement.html",
  ];
  for (const file of generatedPages) {
    const source = await readIfExists(file);
    assert(Boolean(source), `${file} must exist when data/company-source.en.json exists.`);
    if (!source) continue;
    assert(source.includes(generatedMarker), `${file} must be generated from the CMS English snapshot.`);
    assert(!/[가-힣]/.test(withoutPublisherDisclosure(source)), `${file} contains Korean fallback text.`);
    assert(source.includes('<meta name="robots" content="noindex,nofollow">'), `${file} must stay noindex,nofollow until English public release.`);
    assert(!source.includes("hreflang="), `${file} must not expose hreflang before English public release.`);
    assert(!source.includes("og:locale:alternate"), `${file} must not expose Open Graph alternates before English public release.`);
    assert(/<a[^>]+class="lang-link"[^>]*>\s*KOREAN\s*<\/a>/i.test(source), `${file} must expose a KOREAN language switch.`);
  }

  const announcementsRaw = await readIfExists("data/company-announcements.en.json");
  const announcementPayload = announcementsRaw
    ? parseJson(announcementsRaw, "data/company-announcements.en.json")
    : { locale: "en", announcements: [] };
  if (!announcementPayload) return;
  assert(announcementPayload.locale === "en", "data/company-announcements.en.json must have locale=en.");
  assert(!announcementsRaw || !/[가-힣]/.test(announcementsRaw), "data/company-announcements.en.json contains Korean fallback text.");

  const announcements = normalizeAnnouncements(announcementPayload).filter((announcement) => announcement.status === "published");
  const expectedDetailFiles = new Set(announcements.map((announcement) => `${announcement.slug}.html`));
  const actualDetailFiles = (await listFiles("en/announcements"))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => entry.name)
    .sort();
  const staleDetailFiles = actualDetailFiles.filter((file) => !expectedDetailFiles.has(file));
  const missingDetailFiles = [...expectedDetailFiles].filter((file) => !actualDetailFiles.includes(file));
  assert(staleDetailFiles.length === 0, `en/announcements/ has stale generated detail page(s): ${staleDetailFiles.join(", ")}`);
  assert(missingDetailFiles.length === 0, `en/announcements/ is missing generated detail page(s): ${missingDetailFiles.join(", ")}`);

  const announcementIndex = await read("en/announcement.html");
  for (const announcement of announcements) {
    assert(announcementIndex.includes(announcement.title), `en/announcement.html is missing English announcement title: ${announcement.title}`);
    const detailPath = `en/announcements/${announcement.slug}.html`;
    const detailHtml = await read(detailPath);
    assert(detailHtml.includes(generatedMarker), `${detailPath} must be generated from the CMS English snapshot.`);
    assert(detailHtml.includes(announcement.title), `${detailPath} is missing announcement title.`);
    assert(detailHtml.includes(announcement.summary), `${detailPath} is missing announcement summary.`);
    assert(!/[가-힣]/.test(withoutPublisherDisclosure(detailHtml)), `${detailPath} contains Korean fallback text.`);
    assert(!detailHtml.includes("__COMPANY_"), `${detailPath} contains unresolved company marker(s).`);
  }
}

async function checkLocalizationExposure() {
  const koreanPublicFiles = [
    "index.html",
    "company.html",
    "problems.html",
    "announcement.html",
    "ir.html",
    "index.template.html",
    "company.template.html",
    "problems.template.html",
    "announcement.template.html",
  ];
  const englishFiles = [
    "en/index.html",
    "en/company.html",
    "en/ir.html",
  ];
  const optionalEnglishFiles = [
    "en/announcement.html",
  ];

  for (const file of koreanPublicFiles) {
    const source = await read(file);
    assert(!source.includes('hreflang="en"'), `${file} exposes an English hreflang before review.`);
    assert(!source.includes("og:locale:alternate"), `${file} exposes an English Open Graph alternate locale before review.`);
    assert(!source.includes("netmelonai.com/en/"), `${file} must use relative English language links until canonical English release.`);
    assert(/<a[^>]+class="lang-link"[^>]*>\s*ENGLISH\s*<\/a>/i.test(source), `${file} must expose an ENGLISH language switch.`);
  }

  const announcementDetailTemplate = await read("announcement-detail.template.html");
  assert(
    announcementDetailTemplate.includes("<!-- __SITE_HEADER__ -->"),
    "announcement-detail.template.html must keep the generated site-header placeholder.",
  );

  for (const file of englishFiles) {
    const source = await read(file);
    assert(
      source.includes('<meta name="robots" content="noindex,nofollow">'),
      `${file} must stay noindex,nofollow until English copy is approved.`,
    );
    assert(!source.includes("hreflang="), `${file} must not expose hreflang while it is noindex review-only copy.`);
    assert(
      !source.includes("og:locale:alternate"),
      `${file} must not expose Open Graph alternate locale while it is noindex review-only copy.`,
    );
    assert(/<a[^>]+class="lang-link"[^>]*>\s*KOREAN\s*<\/a>/i.test(source), `${file} must expose a KOREAN language switch.`);
  }

  const generatedEnglishFiles = [...optionalEnglishFiles];
  const englishAnnouncementDetails = await listFiles("en/announcements");
  generatedEnglishFiles.push(
    ...englishAnnouncementDetails
      .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
      .map((entry) => `en/announcements/${entry.name}`),
  );

  for (const file of generatedEnglishFiles) {
    const source = await readIfExists(file);
    if (!source) continue;
    assert(
      source.includes('<meta name="robots" content="noindex,nofollow">'),
      `${file} must stay noindex,nofollow until English copy is approved.`,
    );
    if (source.includes("Company English pages generated from CMS public English snapshots")) {
      assert(!/[가-힣]/.test(withoutPublisherDisclosure(source)), `${file} contains Korean fallback text in generated English output.`);
      assert(!source.includes("hreflang="), `${file} must not expose hreflang while English pages are review-only.`);
      assert(!source.includes("og:locale:alternate"), `${file} must not expose alternate locale while English pages are review-only.`);
      assert(/<a[^>]+class="lang-link"[^>]*>\s*KOREAN\s*<\/a>/i.test(source), `${file} must expose a KOREAN language switch.`);
    }
  }
}

async function checkSitemap() {
  const source = await read("sitemap.xml");
  const locs = Array.from(source.matchAll(/<loc>([^<]+)<\/loc>/g)).map((match) => match[1]);
  const problemPayload = parseJson(await read("data/company-open-problems.ko.json"), "data/company-open-problems.ko.json");
  const problemUrls = (Array.isArray(problemPayload?.problems) ? problemPayload.problems : [])
    .map((problem) => "https://netmelonai.com/problems/" + String(problem.slug) + ".html");

  const expected = [
    "https://netmelonai.com/",
    "https://netmelonai.com/company.html",
    "https://netmelonai.com/careers.html",
    "https://netmelonai.com/announcement.html",
    "https://netmelonai.com/ir.html",
    "https://netmelonai.com/problems.html",
    ...problemUrls,
  ];

  assert(locs.length === expected.length, `sitemap.xml must contain exactly ${expected.length} public URLs.`);
  for (const url of expected) {
    assert(locs.includes(url), `sitemap.xml is missing ${url}.`);
  }
  assert(!locs.some((url) => url.includes("/en/")), "sitemap.xml must not include unpublished English URLs.");
}

async function checkCompanyFooterRoutes() {
  const rawProfile = parseJson(await read("data/publisher-legal-profile.json"), "data/publisher-legal-profile.json");
  if (!rawProfile) return;
  let profile;
  try {
    profile = normalizePublisherProfile(rawProfile);
  } catch (error) {
    fail(`data/publisher-legal-profile.json is invalid: ${error.message}`);
    return;
  }
  const announcementPages = (await listFiles("announcements"))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => `announcements/${entry.name}`);
  const englishAnnouncementPages = (await listFiles("en/announcements"))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => `en/announcements/${entry.name}`);
  const problemPages = (await listFiles("problems"))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => "problems/" + entry.name);
  const englishProblemPages = (await listFiles("en/problems"))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => `en/problems/${entry.name}`);
  const pages = [
    ...["index.html", "company.html", "problems.html", "announcement.html", "ir.html"].map((file) => ({ file, locale: "ko" })),
    ...announcementPages.map((file) => ({ file, locale: "ko" })),
    ...problemPages.map((file) => ({ file, locale: "ko" })),
    ...["en/index.html", "en/company.html", "en/announcement.html", "en/ir.html", "en/problems.html"].map((file) => ({ file, locale: "en" })),
    ...englishAnnouncementPages.map((file) => ({ file, locale: "en" })),
    ...englishProblemPages.map((file) => ({ file, locale: "en" })),
  ];
  const appLegalRoutes = ["privacy.html", "terms.html", "data-deletion.html"];
  const duplicatedHeaderRoutes = ["company.html", "problems.html", "ir.html", "company.html#notices"];
  const footerPattern = /<footer\b[\s\S]*?<\/footer>/i;
  const compact = (value) => String(value).replace(/\s+/g, " " ).trim();

  for (const page of pages) {
    const source = await read(page.file);
    const footer = source.match(footerPattern)?.[0] || "";
    assert(Boolean(footer), `${page.file} is missing footer.`);
    assert(footer.includes("class=\"site-footer\""), `${page.file} footer must use the shared site-footer class.`);
    assert(!footer.includes("careers-footer"), `${page.file} footer must not use a page-specific careers-footer class.`);
    assert(!footer.includes(PUBLISHER_PROFILE_MARKER), `${page.file} footer contains an unresolved Publisher Profile marker.`);
    assert(!footer.includes("캐슬앤파밀리에시티 1단지"), `${page.file} footer exposes the omitted apartment complex name.`);
    assert(compact(footer).includes(compact(renderPublisherFooter(profile, page.locale))), `${page.file} footer does not match Publisher Profile ${profile.sourceVersionId}.`);
    if (page.locale === "en") {
      assert(!/[가-힣]/.test(footer), `${page.file} English footer contains Korean fallback text.`);
    }
    assert(!footer.includes(profile.customerSupportEmail), `${page.file} footer exposes customer support email instead of the dedicated support surface.`);

    for (const route of appLegalRoutes) {
      assert(!footer.includes(`href="${route}"`), `${page.file} footer links to app legal route ${route}.`);
    }
    for (const route of duplicatedHeaderRoutes) {
      assert(!footer.includes(`href="${route}"`), `${page.file} footer duplicates header route ${route}.`);
    }
  }
}


async function checkSharedSiteShell() {
  const shellCss = await read("styles/site-shell.css");
  const shellScript = await read("scripts/site-shell.js");
  const headerPartial = (await read("partials/site-header.html")).trim();
  const footerPartial = (await read("partials/site-footer.html")).trim();
  const scriptPartial = (await read("partials/site-shell-script.html")).trim();
  const pageCssFiles = [
    "styles/company.css",
    "styles/careers.css",
    "styles/problems.css",
  ];
  const shellTargets = [
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
      file: "careers.template.html",
      brandHref: "index.html",
      productHref: "index.html#naepopquiz-app",
      englishHref: "en/careers.html",
      active: "careers",
    },
    {
      file: "careers.html",
      brandHref: "index.html",
      productHref: "index.html#naepopquiz-app",
      englishHref: "en/careers.html",
      active: "careers",
    },
    {
      file: "problems.template.html",
      brandHref: "index.html",
      productHref: "index.html#naepopquiz-app",
      englishHref: "en/index.html",
      active: "problems",
    },
    {
      file: "problems.html",
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
    {
      file: "announcement.html",
      brandHref: "index.html",
      productHref: "index.html#naepopquiz-app",
      englishHref: "en/announcement.html",
      active: "announcement",
    },
  ];
  const commonShellSelectors = [
    "shell",
    "site-header",
    "site-nav",
    "site-footer",
    "footer-row",
    "footer-links",
    "footer-brand",
    "publisher-business",
    "business-verify",
    "brand",
    "download-menu",
    "download-toggle",
    "download-dropdown",
    "menu-toggle",
  ];
  const pageSpecificShellTokens = [
    "site-header-index-compatible-style",
    "careers-header",
    "careers-nav",
    "careers-footer",
    "careers-footer-links",
  ];
  const duplicatedShellScriptTokens = [
    'const header = document.querySelector(".site-header")',
    'const menuToggle = document.querySelector(".menu-toggle")',
  ];
  const forbiddenHeaderRoutes = [
    "company.html#notices",
    "#notices",
    "privacy.html",
    "terms.html",
    "data-deletion.html",
    "install.html",
    "account-deletion",
    "refund",
    "support",
    "/en/",
    "en/",
  ];
  const indent = (source) => source.split("\n").map((line) => `  ${line}`).join("\n");
  const activeClass = (target, active) => (target === active ? ' class="is-current"' : "");
  const renderHeader = (target) => headerPartial
    .replaceAll("__SITE_HEADER_BRAND_HREF__", target.brandHref)
    .replaceAll("__SITE_NAV_PRODUCT_HREF__", target.productHref)
    .replaceAll("__SITE_NAV_COMPANY_CLASS__", activeClass("company", target.active))
    .replaceAll("__SITE_NAV_PROBLEMS_CLASS__", activeClass("problems", target.active))
    .replaceAll("__SITE_NAV_CAREERS_CLASS__", activeClass("careers", target.active))
    .replaceAll("__SITE_NAV_IR_CLASS__", activeClass("ir", target.active))
    .replaceAll("__SITE_NAV_ANNOUNCEMENT_CLASS__", activeClass("announcement", target.active))
    .replaceAll("__SITE_NAV_ENGLISH_HREF__", target.englishHref);

  assert(shellCss.includes(".site-header"), "styles/site-shell.css must own the shared site header styles.");
  assert(shellCss.includes(".site-footer"), "styles/site-shell.css must own the shared site footer styles.");
  assert(shellCss.includes(".publisher-business"), "styles/site-shell.css must own Publisher Profile footer styles.");
  assert(shellCss.includes(".publisher-business .business-verify"), "styles/site-shell.css must own the business verification link style.");
  assert(footerPartial.includes(PUBLISHER_PROFILE_MARKER), "partials/site-footer.html must expose the Publisher Profile build marker.");
  assert(/\.site-header\s*{[\s\S]*?position:\s*sticky;[\s\S]*?top:\s*0;[\s\S]*?}/.test(shellCss), "styles/site-shell.css must keep the shared site header sticky.");
  assert(/@media\s*\(max-width:\s*920px\)\s*{[\s\S]*?\.site-header\s+\.shell\s*{[\s\S]*?gap:\s*10px;[\s\S]*?}/.test(shellCss), "styles/site-shell.css must constrain mobile header spacing.");
  assert(/\.mobile-actions\s*{[\s\S]*?flex:\s*0\s+0\s+auto;[\s\S]*?}/.test(shellCss), "styles/site-shell.css must prevent mobile header actions from shrinking away.");
  assert(/\.menu-toggle\s*{[\s\S]*?flex:\s*0\s+0\s+42px;[\s\S]*?}/.test(shellCss), "styles/site-shell.css must keep the mobile menu button visible.");
  assert(shellScript.includes('document.querySelector(".site-header")'), "scripts/site-shell.js must own the shared site header behavior.");
  assert(shellScript.includes('document.querySelector(".menu-toggle")'), "scripts/site-shell.js must own the shared mobile menu behavior.");
  assert(!shellScript.includes("document.body.style.paddingTop"), "scripts/site-shell.js must not mutate body padding for the shared header.");
  assert(!shellScript.includes('style.setProperty("--header-offset"'), "scripts/site-shell.js must not mutate --header-offset at runtime.");
  assert(headerPartial.includes('class="download-menu"'), "partials/site-header.html must include the shared mobile app download menu.");
  assert(headerPartial.includes('class="download-toggle"'), "partials/site-header.html must include the shared mobile app download button.");
  assert(headerPartial.includes("https://play.google.com/store/apps/details?id=com.netmelon.naepopquiz"), "partials/site-header.html must link to the Google Play app listing.");
  assert(headerPartial.includes("https://apple.co/4ez9nji"), "partials/site-header.html must link to the App Store app listing.");
  assert(!headerPartial.includes(">공지<"), "partials/site-header.html must not expose notices as a global header menu.");
  assert(!headerPartial.includes("#notices"), "partials/site-header.html must not link to the internal notices section.");
  assert(!headerPartial.includes('style="'), "partials/site-header.html must not use inline layout styles.");
  assert(headerPartial.includes('class="lang-link"'), "partials/site-header.html must expose the English language switch.");
  assert(scriptPartial === '<script src="scripts/site-shell.js" defer></script>', "partials/site-shell-script.html must load scripts/site-shell.js.");

  const headerNav = headerPartial.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/i)?.[1] || "";
  const headerNavLabels = Array.from(headerNav.matchAll(/<a(?:\b|__)[^>]*>([\s\S]*?)<\/a>/gi))
    .map((match) => match[1].replace(/<[^>]*>/g, "").trim());
  assert(
    headerNavLabels.join("|") === "회사소개|제품소개|풀고 있는 문제|채용|IR|회사 공고|ENGLISH",
    `partials/site-header.html global nav must be exactly 회사소개, 제품소개, 풀고 있는 문제, 채용, IR, 회사 공고, ENGLISH. Current: ${headerNavLabels.join(", ")}`,
  );

  for (const route of forbiddenHeaderRoutes) {
    assert(!headerPartial.includes(route), `partials/site-header.html must not expose ${route} in the global header.`);
  }

  for (const file of pageCssFiles) {
    const source = await read(file);
    assert(source.includes('@import url("./site-shell.css");'), `${file} must import the shared site shell.`);

    for (const selector of commonShellSelectors) {
      const selectorPattern = new RegExp(`(^|\\n)\\s*\\.${selector}\\b`);
      assert(!selectorPattern.test(source), `${file} must not redefine shared .${selector} styles.`);
    }
  }

  const companyCss = await read("styles/company.css");
  assert(!/body\.company-detail-page\s+\.site-header\b/.test(companyCss), "styles/company.css must not override the shared site header.");
  assert(!/\.company-detail-page\s+\.site-header\b/.test(companyCss), "styles/company.css must not override the shared site header.");
  assert(!/body\.company-detail-page\s*{[\s\S]*?padding-top:\s*var\(--header-offset\);[\s\S]*?}/.test(companyCss), "styles/company.css must not add page-specific header padding.");

  const companyTemplate = await read("company.template.html");
  assert(companyTemplate.includes("<body>"), "company.template.html must use the same unclassed body structure as index.html.");
  assert(companyTemplate.includes('class="hero hero-motto"'), "company.template.html must keep the index hero structure.");
  assert(companyTemplate.includes('class="story-scroll"'), "company.template.html must keep the index story-scroll structure.");
  assert(companyTemplate.includes('class="story-section magnetic-section app-panel company-mission-panel"'), "company.template.html must render mission in an index-style sticky story section.");
  assert(companyTemplate.includes('class="story-section magnetic-section studio-panel company-vision-panel"'), "company.template.html must render vision in an index-style sticky story section.");
  assert(companyTemplate.includes('class="story-section magnetic-section company-values-panel"'), "company.template.html must render core values after vision in an index-style sticky story section.");
  assert(companyTemplate.includes("<!-- __COMPANY_SOURCE_COMPANY_CORE_VALUES__ -->"), "company.template.html must include the Company Source core values marker.");
  assert(companyTemplate.includes('class="story-section magnetic-section career-panel company-history-panel"'), "company.template.html must render history in an index-style sticky story section.");
  assert(!companyTemplate.includes("company-notices-panel"), "company.template.html must not render the removed notices section.");
  assert(!companyTemplate.includes("__COMPANY_NOTICES_"), "company.template.html must not include removed notice injection markers.");
  assert(companyTemplate.includes('class="story-end-spacer"'), "company.template.html must use the same end spacer as index.html.");
  assert(!companyTemplate.includes("company-detail-page"), "company.template.html must not use the legacy company detail body class.");
  assert(!companyTemplate.includes("company-slide"), "company.template.html must not use the legacy company slide layout.");
  assert(!companyTemplate.includes("company-end-spacer"), "company.template.html must not use the legacy company end spacer.");

  for (const target of shellTargets) {
    const source = await read(target.file);
    assert(!/\.site-header\s*{/.test(source), `${target.file} must not define inline .site-header styles.`);
    assert(!/\.company-detail-page\s+\.site-header\b/.test(source), `${target.file} must not override the shared site header.`);
    assert(source.includes(indent(renderHeader(target))), `${target.file} header is not synced from partials/site-header.html.`);
    assert(!source.includes(PUBLISHER_PROFILE_MARKER), `${target.file} contains an unresolved Publisher Profile footer marker.`);
    assert(source.includes("class=\"publisher-business\""), `${target.file} footer is missing the Publisher Profile disclosure.`);
    assert(source.includes(`  ${scriptPartial}`), `${target.file} must load the shared site shell script.`);

    for (const token of pageSpecificShellTokens) {
      assert(!source.includes(token), `${target.file} contains page-specific shell token ${token}.`);
    }

    for (const token of duplicatedShellScriptTokens) {
      assert(!source.includes(token), `${target.file} duplicates shared site shell JavaScript.`);
    }
  }
}

async function checkOpenProblemsAndCareers() {
  const rootHtml = (await listFiles(""))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => entry.name);
  const englishHtml = (await listFiles("en"))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => `en/${entry.name}`);
  const announcementHtml = (await listFiles("announcements"))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => `announcements/${entry.name}`);
  const problemHtml = (await listFiles("problems"))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => "problems/" + entry.name);
  for (const file of [...rootHtml, ...englishHtml, ...announcementHtml, ...problemHtml]) {
    const source = await read(file);
    if (!/<html\b/i.test(source)) continue;
    const title = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
    assert(Boolean(title), file + " is missing a browser title.");
    assert(!title.includes("|"), file + " browser title must not contain a pipe suffix: " + title);
  }
  for (const file of ["careers.html", "careers.template.html"]) {
    const source = await read(file);
    assert(!/document\.title\s*=\s*`[^`]*\|/.test(source), file + " must not add a pipe suffix at runtime.");
  }

  const dataFile = "data/company-open-problems.ko.json";
  const raw = await read(dataFile);
  const payload = parseJson(raw, dataFile);
  if (!payload) return;
  assert(payload.schemaId === "npq.company_open_problems.v1", dataFile + " has unsupported schemaId.");
  assert(payload.siteId === "company" && payload.locale === "ko", dataFile + " must target company/ko.");
  assert(payload.enabled === true && payload.lifecycleStatus === "published", dataFile + " must be an enabled published snapshot.");
  assert(Boolean(String(payload.sourceVersionId || "").trim()), dataFile + " is missing sourceVersionId.");
  assert(Boolean(String(payload.sourceHash || "").trim()), dataFile + " is missing sourceHash.");

  const problems = Array.isArray(payload.problems) ? payload.problems : [];
  const careersPayload = parseJson(await read("data/careers.ko.json"), "data/careers.ko.json") || {};
  const careerJobs = Array.isArray(careersPayload.jobs) ? careersPayload.jobs : [];
  const legacyProblemIds = {
    "consumer-marketplace-growth": ["paid-learner-growth", "creator-supply"],
    "product-design": ["first-speech-product-research"],
  };
  const mappedJobs = (problem) => {
    const acceptedIds = new Set([problem.problemId, ...(legacyProblemIds[problem.problemId] || [])]);
    return careerJobs.filter((job) => (Array.isArray(job?.technicalChallenges) ? job.technicalChallenges : []).some((item) => {
      const mappedId = String(item || "").trim().match(/^(?:Primary|Supporting|Guardrail|Input)\s*·\s*([a-z0-9]+(?:-[a-z0-9]+)*)\b/)?.[1];
      return mappedId && acceptedIds.has(mappedId);
    }));
  };
  assert(problems.length > 0, dataFile + " must include at least one problem.");
  assert(problems.some((problem) => ["open", "exploring"].includes(problem?.status)), dataFile + " must include an open or exploring problem.");
  const page = await read("problems.html");
  assert(page.includes("Open Problem Source generated at build time:"), "problems.html is missing Open Problem Source build metadata.");
  assert(!page.includes("__OPEN_PROBLEMS_"), "problems.html contains unresolved Open Problem Source markers.");
  assert(page.includes('<meta name="robots" content="index,follow">'), "problems.html must be indexable.");
  for (const problem of problems) {
    assert(page.includes(String(problem.title)), "problems.html is missing problem title: " + problem.title);
  }
  const participatingProblems = problems.filter((problem) => ["open", "exploring"].includes(problem?.status));
  const inlineFormCount = (page.match(/class="problem-application-form"/g) || []).length;
  const inlineToggleCount = (page.match(/data-problem-application-toggle/g) || []).length;
  assert(inlineFormCount === participatingProblems.length, "problems.html must render one inline application form per participating problem.");
  assert(inlineToggleCount === participatingProblems.length, "problems.html must render one application toggle per participating problem.");
  for (const problem of participatingProblems) {
    assert(
      page.includes('name="problemId" value="' + String(problem.problemId) + '"'),
      "problems.html inline form is missing problem identity: " + problem.problemId,
    );
  }
  assert(!page.includes('id="problem-intake-form"') && !page.includes('id="problem-intake"'), "problems.html must not restore the separate bottom application section.");
  assert(!page.includes('<select name="problemId"'), "problems.html inline application forms must not ask visitors to select the problem again.");
  assert(page.includes('scripts/problem-intake.js'), "problems.html is missing the participation form script.");
  assert(page.includes('data-api-base="https://'), "problems.html is missing the production intake API base.");
  assert(!/data-problem-id[^>]*href="mailto:/i.test(page), "problems.html must use the online form instead of a mailto problem CTA.");
  const internalOnlyPhrases = [
    "정규직 채용 공고",
    "상시 채용 공고",
    "45분",
    "무급 탐색",
    "관리자 검토",
    "서로 적합",
    "후속 범위",
    "보상 조건",
    "지식재산 원칙",
    "담당자:",
  ];
  for (const phrase of internalOnlyPhrases) {
    assert(!page.includes(phrase), "problems.html exposes internal workflow copy: " + phrase);
  }

  const payloads = extractJsonLd(page, "problems.html");
  assert(payloads.some((payload) => jsonLdHasType(payload, "CollectionPage")), "problems.html is missing CollectionPage JSON-LD.");
  assert(payloads.some((payload) => jsonLdHasType(payload, "ItemList")), "problems.html is missing ItemList JSON-LD.");
  assert(!payloads.some((payload) => jsonLdHasType(payload, "JobPosting")), "problems.html must not claim JobPosting structured data.");

  const expectedDetailFiles = new Set(problems.map((problem) => problem.slug + ".html"));
  const actualDetailFiles = (await listFiles("problems"))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => entry.name);
  assert(actualDetailFiles.length === expectedDetailFiles.size, "problems/ must contain exactly one generated page per published problem.");
  for (const file of actualDetailFiles) {
    assert(expectedDetailFiles.has(file), "problems/ contains a stale detail page: " + file);
  }
  const rejectedParticipationPhrases = ["지원서", "지원 접수", "관련 경험", "접수가 완료"];
  for (const problem of problems) {
    const detailPath = "problems/" + problem.slug + ".html";
    const detailUrl = "https://netmelonai.com/" + detailPath;
    const detail = await read(detailPath);
    assert(page.includes('href="' + detailPath + '"'), "problems.html is missing the external detail link for " + problem.problemId);
    assert(detail.includes("Open Problem Detail generated at build time:"), detailPath + " is missing generated detail metadata.");
    assert(detail.includes('<link rel="canonical" href="' + detailUrl + '">'), detailPath + " is missing its unique canonical URL.");
    assert(detail.includes('<meta property="og:url" content="' + detailUrl + '">'), detailPath + " is missing its unique Open Graph URL.");
    assert(detail.includes('<meta property="og:title" content="' + String(problem.title)), detailPath + " is missing its problem-specific Open Graph title.");
    assert(detail.includes('<meta property="og:image" content="https://'), detailPath + " is missing a public Open Graph image.");
    assert(detail.includes(String(problem.title)) && detail.includes(String(problem.summary)), detailPath + " is missing its public problem copy.");
    assert(!detail.includes("__OPEN_PROBLEM_"), detailPath + " contains unresolved Open Problem markers.");
    for (const job of mappedJobs(problem)) {
      const listHref = 'careers.html?job_id=' + encodeURIComponent(String(job.id));
      const detailHref = '../' + listHref;
      assert(page.includes('href="' + listHref + '"'), "problems.html is missing the mapped careers action for " + problem.problemId);
      assert(detail.includes('href="' + detailHref + '"'), detailPath + " is missing its mapped careers action.");
      if (job.status !== "open") {
        assert(page.includes('data-career-status="' + String(job.status) + '"') && page.includes(" hidden"), "review-only careers actions must be hidden outside staging preview.");
      }
    }
    for (const phrase of rejectedParticipationPhrases) {
      assert(!detail.includes(phrase), detailPath + " contains obsolete application wording: " + phrase);
    }
    if (["open", "exploring"].includes(problem.status)) {
      assert(detail.includes('name="problemId" value="' + String(problem.problemId) + '"'), detailPath + " form is not bound to its problem identity.");
      assert(detail.includes("<span>해결 방안</span>"), detailPath + " must request a solution proposal.");
      assert(detail.includes("<span>자료 링크"), detailPath + " must provide a resource link field.");
      assert(detail.includes('name="solutionProposal"'), detailPath + " must use the semantic solution proposal field.");
      assert(detail.includes('name="resourceUrl"'), detailPath + " must use the semantic resource URL field.");
      assert(detail.includes("해결 방안 보내기"), detailPath + " must use solution proposal language.");
      const publishedVideos = Array.isArray(problem.videos) ? problem.videos : [];
      if (publishedVideos.length) {
        assert(detail.includes("problem-detail-videos"), detailPath + " must render its published problem videos.");
        assert(detail.includes("https://www.youtube-nocookie.com/embed/"), detailPath + " must use the privacy-enhanced YouTube embed.");
      }
    }
    const detailPayloads = extractJsonLd(detail, detailPath);
    assert(detailPayloads.some((payload) => jsonLdHasType(payload, "WebPage")), detailPath + " is missing WebPage JSON-LD.");
    assert(!detailPayloads.some((payload) => jsonLdHasType(payload, "JobPosting")), detailPath + " must not claim JobPosting structured data.");
  }

  const publicNavigationFiles = [
    "partials/site-header.html",
    "index.html",
    "company.html",
    "problems.html",
    "announcement.html",
    "ir.html",
    "en/index.html",
    "en/company.html",
    "en/announcement.html",
    "en/ir.html",
  ];
  for (const file of publicNavigationFiles) {
    const source = await read(file);
    assert(/href="[^"]*careers\.html/i.test(source), file + " must expose the careers route.");
  }
  const sitemap = await read("sitemap.xml");
  assert(sitemap.includes("careers.html"), "sitemap.xml must expose the careers route.");
  assert(sitemap.includes("problems.html"), "sitemap.xml must include the open problems route.");
}

async function checkStructuredData() {
  const pages = [
    {
      file: "index.html",
      types: ["Organization", "WebSite", "WebPage", "SoftwareApplication", "WebApplication", "FAQPage"],
    },
    {
      file: "company.html",
      types: ["Organization", "AboutPage"],
    },
    {
      file: "problems.html",
      types: ["CollectionPage", "ItemList"],
    },
    {
      file: "ir.html",
      types: ["Organization", "ContactPage"],
    },
    {
      file: "announcement.html",
      types: ["Organization", "CollectionPage", "ItemList"],
    },
  ];

  for (const page of pages) {
    const source = await read(page.file);
    const payloads = extractJsonLd(source, page.file);
    const nodes = payloads.flatMap(normalizeJsonLdNodes);

    assert(payloads.length > 0, `${page.file} is missing JSON-LD structured data.`);
    for (const type of page.types) {
      assert(payloads.some((payload) => jsonLdHasType(payload, type)), `${page.file} is missing JSON-LD type ${type}.`);
    }

    for (const node of nodes) {
      if (nodeHasType(node, "JobPosting")) {
        assert(Boolean(node.title), `${page.file} has JobPosting without title.`);
        assert(Boolean(node.description), `${page.file} has JobPosting without description.`);
        assert(Boolean(node.datePosted), `${page.file} has JobPosting without datePosted.`);
        assert(Boolean(node.hiringOrganization), `${page.file} has JobPosting without hiringOrganization.`);
        assert(Boolean(node.jobLocation), `${page.file} has JobPosting without jobLocation.`);
      }
    }
  }
}

async function checkProductionUrls() {
  const problemFiles = (await listFiles("problems"))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => "problems/" + entry.name);
  const files = [
    "index.html",
    "company.html",
    "problems.html",
    "announcement.html",
    "ir.html",
    "privacy.html",
    "terms.html",
    "data-deletion.html",
    "install.html",
    "en/index.html",
    "en/company.html",
    "en/ir.html",
    ...problemFiles,
  ];
  const blocked = [
    /localhost/i,
    /127\.0\.0\.1/,
    /dev\.netmelonai\.com/i,
    /dev\.naepopquiz\.com/i,
    /studio-dev\.naepopquiz\.com/i,
  ];

  for (const file of files) {
    const source = await read(file);
    const found = findAny(source, blocked);
    assert(found.length === 0, `${file} contains dev/staging URL(s).`);
  }
}

async function main() {
  await checkCompanySourceBuild();
  await checkCompanyAnnouncements();
  await checkCompanyAssets();
  await checkEnglishCmsGeneration();
  await checkLocalizationExposure();
  await checkSitemap();
  await checkCompanyFooterRoutes();
  await checkSharedSiteShell();
  await checkOpenProblemsAndCareers();
  await checkStructuredData();
  await checkProductionUrls();

  if (failures.length) {
    console.error("[site-release-check] failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log("[site-release-check] passed");
}

main().catch((error) => {
  console.error("[site-release-check]", error);
  process.exit(1);
});

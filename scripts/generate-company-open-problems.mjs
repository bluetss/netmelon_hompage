#!/usr/bin/env node
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DATA_PATH = process.env.COMPANY_OPEN_PROBLEMS_JSON_PATH || path.join(ROOT, "data", "company-open-problems.ko.json");
const CAREERS_DATA_PATH = process.env.COMPANY_CAREERS_JSON_PATH || path.join(ROOT, "data", "careers.ko.json");
const TEMPLATE_PATH = path.join(ROOT, "problems.template.html");
const DETAIL_TEMPLATE_PATH = path.join(ROOT, "problem-detail.template.html");
const DETAIL_OUTPUT_DIR = path.join(ROOT, "problems");
const SITEMAP_PATH = path.join(ROOT, "sitemap.xml");
const OUTPUT_PATH = path.join(ROOT, "problems.html");
const SITE_URL = "https://netmelonai.com/";
const PAGE_URL = new URL("problems.html", SITE_URL).toString();
const DEFAULT_INTAKE_API_BASE = "https://naepopquiz-flask-server-djbccwoo6a-uc.a.run.app";
const OG_IMAGE_URL = new URL("images/og-cover.png", SITE_URL).toString();
const INTAKE_API_BASE = String(
  process.env.COMPANY_OPEN_PROBLEMS_INTAKE_API_BASE
  || process.env.COMPANY_OPEN_PROBLEMS_API_BASE
  || process.env.COMPANY_SOURCE_API_BASE
  || process.env.VITE_API_BASE
  || DEFAULT_INTAKE_API_BASE
).replace(/\/+$/, "");
const ALLOWED_STATUSES = new Set(["exploring", "open", "paused", "closed"]);
const STATUS_LABEL = { exploring: "논의 중", open: "참여 가능", paused: "잠시 멈춤", closed: "마감" };
const LEGACY_PROBLEM_IDS = {
  "consumer-marketplace-growth": ["paid-learner-growth", "creator-supply"],
  "product-design": ["first-speech-product-research"],
};

const clean = (value) => String(value ?? "").trim();
const htmlEscape = (value, quote = false) => clean(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', quote ? "&quot;" : '"');
const escapeScriptJson = (value) => JSON.stringify(value)
  .replaceAll("<", "\u003c")
  .replaceAll(">", "\u003e")
  .replaceAll("&", "\u0026")
  .replaceAll("\u2028", "\\u2028")
  .replaceAll("\u2029", "\\u2029");

function required(source, key) {
  const value = clean(source?.[key]);
  if (!value) throw new Error("Open Problem Source is missing " + key + ".");
  return value;
}

function list(source, key, minimum = 1) {
  const value = Array.isArray(source?.[key]) ? source[key].map(clean).filter(Boolean) : [];
  if (value.length < minimum) throw new Error("Open Problem Source " + key + " requires at least " + minimum + " item(s).");
  return value;
}

function optionalList(source, key) {
  return Array.isArray(source?.[key]) ? source[key].map(clean).filter(Boolean) : [];
}

function youtubeVideoId(value) {
  try {
    const url = new URL(clean(value));
    const host = url.hostname.toLowerCase();
    let videoId = "";
    if (host === "youtu.be") videoId = url.pathname.split("/").filter(Boolean)[0] || "";
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      videoId = url.searchParams.get("v") || url.pathname.match(/^\/(?:embed|shorts)\/([^/?#]+)/)?.[1] || "";
    }
    return /^[A-Za-z0-9_-]{6,20}$/.test(videoId) ? videoId : "";
  } catch {
    return "";
  }
}

function validate(source) {
  if (!source || typeof source !== "object") throw new Error("Open Problem Source must be an object.");
  if (source.schemaId !== "npq.company_open_problems.v1") throw new Error("Unsupported Open Problem Source schemaId.");
  if (source.siteId !== "company" || source.locale !== "ko") throw new Error("Open Problem Source must target company/ko.");
  if (source.enabled !== true || source.lifecycleStatus !== "published") throw new Error("Open Problem Source must be enabled and published.");
  ["eyebrow", "headline", "intro", "sourceVersionId", "sourceHash"].forEach((key) => required(source, key));
  const problems = Array.isArray(source.problems) ? source.problems : [];
  if (!problems.some((item) => item?.status === "open" || item?.status === "exploring")) throw new Error("Open Problem Source needs at least one participating problem.");
  const ids = new Set();
  const slugs = new Set();
  for (const [index, problem] of problems.entries()) {
    const label = clean(problem?.title) || "problem " + (index + 1);
    ["problemId", "slug", "title", "summary", "category", "whyItMatters"].forEach((key) => required(problem, key));
    ["currentEvidence", "unknowns", "constraints", "desiredContributions"].forEach((key) => list(problem, key));
    if (!/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(problem.problemId)) throw new Error(label + " has invalid problemId.");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(problem.slug)) throw new Error(label + " has invalid slug.");
    if (ids.has(problem.problemId) || slugs.has(problem.slug)) throw new Error("Open Problem Source contains duplicate problem identity.");
    ids.add(problem.problemId);
    slugs.add(problem.slug);
    if (!ALLOWED_STATUSES.has(problem.status)) throw new Error(label + " has unsupported status.");
    const videos = Array.isArray(problem.videos) ? problem.videos : [];
    if (videos.length > 8) throw new Error(label + " has too many videos.");
    videos.forEach((video) => {
      if (!youtubeVideoId(video?.youtubeUrl)) throw new Error(label + " has an invalid YouTube URL.");
    });
  }
  return problems.slice().sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));
}

function replaceOnce(source, marker, replacement) {
  if (!source.includes(marker)) throw new Error("Missing Open Problem build marker: " + marker);
  return source.replace(marker, replacement);
}


function renderApplicationForm(problem, privacyHref = "privacy.html") {
  return [
    '<form class="problem-application-form" data-api-base="' + htmlEscape(INTAKE_API_BASE, true) + '" novalidate>',
    '<input type="hidden" name="problemId" value="' + htmlEscape(problem.problemId, true) + '">',
    '<label class="problem-intake-field"><span>이름</span><input type="text" name="name" autocomplete="name" maxlength="200" required></label>',
    '<label class="problem-intake-field"><span>이메일</span><input type="email" name="email" autocomplete="email" maxlength="240" required></label>',
    '<label class="problem-intake-field full"><span>해결 방안</span><textarea name="solutionProposal" rows="6" minlength="10" maxlength="5000" placeholder="이 문제를 어떻게 접근하고 검증할지 알려주세요." required></textarea></label>',
    '<label class="problem-intake-field full"><span>자료 링크 <small>선택</small></span><input type="url" name="resourceUrl" inputmode="url" maxlength="1000" placeholder="https://"><small class="problem-intake-help">제안서·문서·코드 등 필요한 자료를 볼 수 있는 공개 링크</small></label>',
    '<label class="problem-intake-honeypot" aria-hidden="true"><span>Website</span><input type="text" name="website" tabindex="-1" autocomplete="off"></label>',
    '<label class="problem-intake-consent full"><input type="checkbox" name="consent" required><span>해결 방안 확인과 연락을 위한 이름, 이메일, 해결 방안 수집에 동의합니다. <a href="' + htmlEscape(privacyHref, true) + '">개인정보처리방침</a></span></label>',
    '<div class="problem-intake-actions full"><button class="problem-intake-submit" type="submit"><span>해결 방안 보내기</span><i aria-hidden="true"></i></button><p class="problem-intake-status" aria-live="polite"></p></div>',
    "</form>",
  ].join("\n");
}

function mappedProblemIds(job) {
  return (Array.isArray(job?.technicalChallenges) ? job.technicalChallenges : [])
    .map((item) => clean(item).match(/^Primary\s*·\s*([a-z0-9]+(?:-[a-z0-9]+)*)\b/)?.[1] || "")
    .filter(Boolean);
}

function careersByProblem(careersSource) {
  const jobs = Array.isArray(careersSource?.jobs) ? careersSource.jobs : [];
  const result = new Map();
  for (const job of jobs) {
    const id = clean(job?.id);
    const title = clean(job?.title);
    const status = clean(job?.status);
    if (!id || !title || !["open", "closed"].includes(status)) continue;
    for (const problemId of mappedProblemIds(job)) {
      const current = result.get(problemId) || [];
      if (!current.some((item) => item.id === id)) current.push({ id, title, status });
      result.set(problemId, current);
    }
  }
  return result;
}

function careersForProblem(problem, careerMap) {
  const ids = [problem.problemId, ...(LEGACY_PROBLEM_IDS[problem.problemId] || [])];
  const seen = new Set();
  return ids.flatMap((id) => careerMap.get(id) || []).filter((job) => {
    if (seen.has(job.id)) return false;
    seen.add(job.id);
    return true;
  });
}

function renderCareerLinks(careers, hrefPrefix = "") {
  return careers.map((job) => {
    const reviewOnly = job.status !== "open";
    return '<a class="problem-career-link" href="' + hrefPrefix + 'careers.html?job_id=' + encodeURIComponent(job.id) + '" data-career-status="' + htmlEscape(job.status, true) + '" aria-label="' + htmlEscape(job.title + " 지원하기", true) + '"' + (reviewOnly ? " hidden" : "") + '>채용 포지션 지원하기</a>';
  }).join("\n");
}

function renderApplication(problem, careers) {
  const panelId = "problem-application-" + problem.slug;
  const titleId = panelId + "-title";
  return [
    '<div class="problem-card-actions">',
    '<a class="problem-detail-link" href="problems/' + htmlEscape(problem.slug, true) + '.html">문제 자세히 보기</a>',
    '<button class="problem-interest" type="button" data-problem-application-toggle aria-expanded="false" aria-controls="' + htmlEscape(panelId, true) + '"><span data-problem-application-label>해결 방안 보내기</span></button>',
    renderCareerLinks(careers),
    "</div>",
    '<section class="problem-application" id="' + htmlEscape(panelId, true) + '" aria-labelledby="' + htmlEscape(titleId, true) + '" hidden>',
    '<div class="problem-application-head"><h4 id="' + htmlEscape(titleId, true) + '">' + htmlEscape(problem.category) + ' 해결 방안</h4><p>이 문제를 어떻게 풀고 확인할지 보내주세요.</p></div>',
    renderApplicationForm(problem),
    "</section>",
  ].join("\n");
}

function renderProblem(problem, careerMap) {
  const isOpen = problem.status === "open" || problem.status === "exploring";
  return [
    '<details class="problem-card" id="' + htmlEscape(problem.slug, true) + '">',
    "<summary>",
    '<div class="problem-card-title">',
    '<div class="problem-meta">',
    '<span class="' + (isOpen ? "is-open" : "") + '">' + htmlEscape(STATUS_LABEL[problem.status]) + "</span>",
    "<span>" + htmlEscape(problem.category) + "</span>",
    "</div>",
    "<h3>" + htmlEscape(problem.title) + "</h3>",
    '<p class="problem-summary">' + htmlEscape(problem.summary) + "</p>",
    "</div>",
    "</summary>",
    '<div class="problem-card-body">',
    '<p class="problem-why">' + htmlEscape(problem.whyItMatters) + "</p>",
    '<section class="problem-contribution"><h4>이 문제에 필요한 전문성</h4><div class="problem-contribution-list">',
    problem.desiredContributions.map((item) => "<span>" + htmlEscape(item) + "</span>").join(""),
    "</div></section>",
    isOpen ? renderApplication(problem, careersForProblem(problem, careerMap)) : "",
    "</div>",
    "</details>",
  ].join("\n");
}


function detailPageUrl(problem) {
  return new URL("problems/" + problem.slug + ".html", SITE_URL).toString();
}

function renderList(items) {
  return '<ul>' + items.map((item) => "<li>" + htmlEscape(item) + "</li>").join("") + "</ul>";
}

function renderOptionalSection(title, items) {
  return items.length
    ? '<section class="problem-detail-section"><h2>' + htmlEscape(title) + '</h2>' + renderList(items) + "</section>"
    : "";
}

function renderProblemVideos(problem) {
  const videos = (Array.isArray(problem.videos) ? problem.videos : [])
    .map((video) => ({ ...video, videoId: youtubeVideoId(video?.youtubeUrl) }))
    .filter((video) => video.videoId)
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));
  if (!videos.length) return "";
  return [
    '<section class="problem-detail-videos" aria-labelledby="problem-videos-title">',
    '<div class="problem-detail-video-head"><h2 id="problem-videos-title">문제 설명</h2><p>영상으로 문제와 현재 확인할 지점을 살펴보세요.</p></div>',
    '<div class="problem-detail-video-list">',
    videos.map((video) => [
      '<article class="problem-detail-video">',
      '<div class="problem-detail-video-frame"><iframe src="https://www.youtube-nocookie.com/embed/' + htmlEscape(video.videoId, true) + '" title="' + htmlEscape(video.title || problem.title, true) + '" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>',
      video.title ? "<h3>" + htmlEscape(video.title) + "</h3>" : "",
      video.description ? "<p>" + htmlEscape(video.description) + "</p>" : "",
      "</article>",
    ].join("\n")).join("\n"),
    "</div>",
    "</section>",
  ].join("\n");
}

function renderDetailHeader(headerTemplate) {
  return headerTemplate
    .replaceAll("__SITE_HEADER_BRAND_HREF__", "../index.html")
    .replaceAll("__SITE_NAV_PRODUCT_HREF__", "../index.html#naepopquiz-app")
    .replaceAll("__SITE_NAV_COMPANY_CLASS__", "")
    .replaceAll("__SITE_NAV_CAREERS_CLASS__", "")
    .replaceAll("__SITE_NAV_PROBLEMS_CLASS__", ' class="is-current"')
    .replaceAll("__SITE_NAV_IR_CLASS__", "")
    .replaceAll("__SITE_NAV_ANNOUNCEMENT_CLASS__", "")
    .replaceAll("__SITE_NAV_ENGLISH_HREF__", "../en/index.html")
    .replaceAll('src="images/', 'src="../images/')
    .replaceAll('href="company.html"', 'href="../company.html"')
    .replaceAll('href="problems.html"', 'href="../problems.html"')
    .replaceAll('href="ir.html"', 'href="../ir.html"')
    .replaceAll('href="announcement.html"', 'href="../announcement.html"');
}

function buildDetailSchema(problem) {
  const pageUrl = detailPageUrl(problem);
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": pageUrl + "#page",
    url: pageUrl,
    name: problem.title,
    description: problem.summary,
    inLanguage: "ko-KR",
    isPartOf: { "@type": "WebSite", "@id": SITE_URL + "#website", url: SITE_URL, name: "Netmelon" },
    about: {
      "@type": "Thing",
      name: problem.category,
      description: problem.title,
    },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "홈", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "풀고 있는 문제", item: PAGE_URL },
        { "@type": "ListItem", position: 3, name: problem.category, item: pageUrl },
      ],
    },
  };
}

function renderDetailContent(problem) {
  const currentAttempts = optionalList(problem, "currentAttempts");
  const whatWeProvide = optionalList(problem, "whatWeProvide");
  const neededExpertise = optionalList(problem, "neededExpertise");
  const successCriteria = optionalList(problem, "successCriteria");
  return [
    renderProblemVideos(problem),
    '<section class="problem-detail-section">',
    "<h2>왜 이 문제인가</h2>",
    "<p>" + htmlEscape(problem.whyItMatters) + "</p>",
    "</section>",
    '<div class="problem-detail-grid">',
    '<section class="problem-detail-section"><h2>현재 출발점</h2>' + renderList(problem.currentEvidence) + "</section>",
    renderOptionalSection("현재 시도", currentAttempts),
    '<section class="problem-detail-section"><h2>핵심 질문</h2>' + renderList(problem.unknowns) + "</section>",
    '<section class="problem-detail-section"><h2>지켜야 할 기준</h2>' + renderList(problem.constraints) + "</section>",
    '<section class="problem-detail-section"><h2>필요한 전문성</h2>' + renderList(neededExpertise.length ? neededExpertise : problem.desiredContributions) + "</section>",
    renderOptionalSection("함께 확인할 결과", successCriteria),
    renderOptionalSection("네트멜론이 제공할 수 있는 것", whatWeProvide),
    "</div>",
  ].filter(Boolean).join("\n");
}

function renderDetailParticipation(problem) {
  const isOpen = problem.status === "open" || problem.status === "exploring";
  if (!isOpen) {
    return '<section class="problem-detail-participation"><p class="problem-detail-closed">현재 이 문제의 해결 방안을 받고 있지 않습니다.</p></section>';
  }
  return [
    '<section class="problem-detail-participation" id="participate" aria-labelledby="participate-title">',
    '<div class="problem-application-head">',
    '<p class="problems-kicker">Solution</p>',
    '<h2 id="participate-title">해결 방안을 보내주세요</h2>',
    "<p>이 문제에 대한 접근과 검증 방법을 알려주세요.</p>",
    "</div>",
    renderApplicationForm(problem, "../privacy.html"),
    "</section>",
  ].join("\n");
}

function renderDetailPage(detailTemplate, shellPartials, source, problem, careerMap) {
  const pageUrl = detailPageUrl(problem);
  const isOpen = problem.status === "open" || problem.status === "exploring";
  const buildMeta = "<!-- Open Problem Detail generated at build time: sourceVersionId=" + htmlEscape(source.sourceVersionId, true) + ", problemId=" + htmlEscape(problem.problemId, true) + " -->";
  let output = detailTemplate;
  output = output.replaceAll("__OPEN_PROBLEM_META_DESCRIPTION__", htmlEscape(problem.summary, true));
  output = output.replaceAll("__OPEN_PROBLEM_CANONICAL_URL__", htmlEscape(pageUrl, true));
  output = output.replaceAll("__OPEN_PROBLEM_PAGE_TITLE__", htmlEscape(problem.title, true));
  output = output.replaceAll("__OPEN_PROBLEM_STATUS__", htmlEscape(STATUS_LABEL[problem.status]));
  output = output.replaceAll("__OPEN_PROBLEM_STATUS_CLASS__", isOpen ? "is-open" : "");
  output = output.replaceAll("__OPEN_PROBLEM_CATEGORY__", htmlEscape(problem.category));
  output = output.replaceAll("__OPEN_PROBLEM_TITLE__", htmlEscape(problem.title));
  output = output.replaceAll("__OPEN_PROBLEM_SUMMARY__", htmlEscape(problem.summary));
  output = replaceOnce(output, "<!-- __OPEN_PROBLEM_BUILD_META__ -->", buildMeta);
  output = replaceOnce(output, "<!-- __OPEN_PROBLEM_SCHEMA__ -->", escapeScriptJson(buildDetailSchema(problem)));
  const heroActions = isOpen ? [
    '<a class="problem-detail-primary-action" href="#participate">해결 방안 제안하기</a>',
    renderCareerLinks(careersForProblem(problem, careerMap), "../"),
  ].filter(Boolean).join("\n") : "";
  output = replaceOnce(output, "<!-- __OPEN_PROBLEM_HERO_ACTION__ -->", heroActions);
  output = replaceOnce(output, "<!-- __OPEN_PROBLEM_DETAIL_CONTENT__ -->", renderDetailContent(problem));
  output = replaceOnce(output, "<!-- __OPEN_PROBLEM_PARTICIPATION__ -->", renderDetailParticipation(problem));
  output = replaceOnce(output, "<!-- __SITE_HEADER__ -->", renderDetailHeader(shellPartials.header).split("\n").map((line) => "  " + line).join("\n"));
  output = replaceOnce(output, "<!-- __SITE_FOOTER__ -->", shellPartials.footer.split("\n").map((line) => "  " + line).join("\n"));
  output = replaceOnce(output, "<!-- __SITE_SHELL_SCRIPT__ -->", '  <script src="../scripts/site-shell.js" defer></script>');
  if (/__OPEN_PROBLEM_/.test(output)) throw new Error(problem.slug + " detail page contains unresolved Open Problem markers.");
  return output;
}

async function cleanupStaleDetailPages(problems) {
  await mkdir(DETAIL_OUTPUT_DIR, { recursive: true });
  const expectedFiles = new Set(problems.map((problem) => problem.slug + ".html"));
  const entries = await readdir(DETAIL_OUTPUT_DIR, { withFileTypes: true });
  const staleFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html") && !expectedFiles.has(entry.name))
    .map((entry) => entry.name);
  await Promise.all(staleFiles.map((file) => unlink(path.join(DETAIL_OUTPUT_DIR, file))));
}

async function writeDetailPages(detailTemplate, shellPartials, source, problems, careerMap) {
  await cleanupStaleDetailPages(problems);
  await Promise.all(problems.map((problem) => writeFile(
    path.join(DETAIL_OUTPUT_DIR, problem.slug + ".html"),
    renderDetailPage(detailTemplate, shellPartials, source, problem, careerMap),
    "utf8",
  )));
}

async function updateSitemap(source, problems) {
  const sitemap = await readFile(SITEMAP_PATH, "utf8");
  const start = "  <!-- GENERATED_OPEN_PROBLEM_URLS_START -->";
  const end = "  <!-- GENERATED_OPEN_PROBLEM_URLS_END -->";
  const lastmod = clean(source.publishedAt).slice(0, 10) || "2026-08-31";
  const urls = problems.map((problem) => [
    "  <url>",
    "    <loc>" + detailPageUrl(problem) + "</loc>",
    "    <lastmod>" + lastmod + "</lastmod>",
    "  </url>",
  ].join("\n")).join("\n");
  const pattern = /  <!-- GENERATED_OPEN_PROBLEM_URLS_START -->[\s\S]*?  <!-- GENERATED_OPEN_PROBLEM_URLS_END -->/;
  if (!pattern.test(sitemap)) throw new Error("sitemap.xml is missing generated Open Problem URL markers.");
  await writeFile(SITEMAP_PATH, sitemap.replace(pattern, [start, urls, end].filter(Boolean).join("\n")), "utf8");
}

function buildSchema(source, problems) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": PAGE_URL + "#page",
    url: PAGE_URL,
    name: "풀고 있는 문제",
    description: source.intro,
    inLanguage: "ko-KR",
    isPartOf: { "@type": "WebSite", "@id": SITE_URL + "#website", url: SITE_URL, name: "Netmelon" },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: problems.length,
      itemListElement: problems.map((problem, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: new URL("problems/" + problem.slug + ".html", SITE_URL).toString(),
        name: problem.title,
        description: problem.summary,
      })),
    },
  };
}

async function main() {
  const [rawSource, rawCareers, template, detailTemplate, header, footer] = await Promise.all([
    readFile(DATA_PATH, "utf8"),
    readFile(CAREERS_DATA_PATH, "utf8"),
    readFile(TEMPLATE_PATH, "utf8"),
    readFile(DETAIL_TEMPLATE_PATH, "utf8"),
    readFile(path.join(ROOT, "partials", "site-header.html"), "utf8"),
    readFile(path.join(ROOT, "partials", "site-footer.html"), "utf8"),
  ]);
  const source = JSON.parse(rawSource);
  const problems = validate(source);
  const careerMap = careersByProblem(JSON.parse(rawCareers));
  let output = template;
  const buildMeta = "<!-- Open Problem Source generated at build time: sourceVersionId=" + htmlEscape(source.sourceVersionId, true) + ", sourceHash=" + htmlEscape(source.sourceHash, true) + ", publishedAt=" + htmlEscape(source.publishedAt || "unknown", true) + " -->";
  output = replaceOnce(output, "<!-- __OPEN_PROBLEMS_BUILD_META__ -->", buildMeta);
  output = replaceOnce(output, "<!-- __OPEN_PROBLEMS_SCHEMA__ -->", escapeScriptJson(buildSchema(source, problems)));
  output = replaceOnce(output, "<!-- __OPEN_PROBLEMS_EYEBROW__ -->", htmlEscape(source.eyebrow));
  output = replaceOnce(output, "<!-- __OPEN_PROBLEMS_HEADLINE__ -->", htmlEscape(source.headline));
  output = replaceOnce(output, "<!-- __OPEN_PROBLEMS_INTRO__ -->", htmlEscape(source.intro));
  output = replaceOnce(output, "<!-- __OPEN_PROBLEMS_CARDS__ -->", problems.map((problem) => renderProblem(problem, careerMap)).join("\n"));
  if (/__OPEN_PROBLEMS_/.test(output)) throw new Error("problems.html contains unresolved Open Problem Source markers.");
  await writeFile(OUTPUT_PATH, output, "utf8");
  const shellPartials = { header: header.trim(), footer: footer.trim() };
  await Promise.all([writeDetailPages(detailTemplate, shellPartials, source, problems, careerMap), updateSitemap(source, problems)]);
  console.log("Generated problems.html and " + problems.length + " detail page(s) from " + source.sourceVersionId + ".");
}

main().catch((error) => {
  console.error("[company-open-problems-build]", error);
  process.exit(1);
});

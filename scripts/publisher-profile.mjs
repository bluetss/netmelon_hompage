#!/usr/bin/env node

import { createHash } from "node:crypto";

export const PUBLISHER_PROFILE_MARKER = "<!-- __PUBLISHER_LEGAL_PROFILE__ -->";

const REQUIRED_PUBLIC_FIELDS = [
  "legalName",
  "representativeName",
  "businessRegistrationNumber",
  "mailOrderRegistrationNumber",
  "mailOrderRegistrationAuthority",
  "businessAddress",
  "hostingProviderName",
  "customerSupportEmail",
  "businessInfoVerificationUrl",
  "copyrightNotice",
];

const REQUIRED_FOOTER_ROUTES = new Set([
  "company.overview",
  "app.privacy",
  "app.terms",
  "app.paid_service_terms",
  "app.data_deletion",
  "app.support",
]);

const clean = (value) => String(value ?? "").trim();
const OMITTED_FOOTER_ADDRESS_SUFFIX = " (캐슬앤파밀리에시티 1단지)";

export function publisherBusinessAddressForFooter(value) {
  const address = clean(value);
  return address.endsWith(OMITTED_FOOTER_ADDRESS_SUFFIX)
    ? address.slice(0, -OMITTED_FOOTER_ADDRESS_SUFFIX.length).trim()
    : address;
}

export const htmlEscape = (value, quote = false) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll("\"", quote ? "&quot;" : "\"");

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

export function publisherProfileContent(profile) {
  return {
    schemaId: profile.schemaId,
    enabled: profile.enabled,
    publisherId: profile.publisherId,
    legalName: profile.legalName,
    representativeName: profile.representativeName,
    businessRegistrationNumber: profile.businessRegistrationNumber,
    mailOrderRegistrationNumber: profile.mailOrderRegistrationNumber,
    mailOrderRegistrationAuthority: profile.mailOrderRegistrationAuthority,
    businessAddress: profile.businessAddress,
    hostingProviderName: profile.hostingProviderName,
    customerSupportPhone: profile.customerSupportPhone,
    customerSupportEmail: profile.customerSupportEmail,
    customerSupportHours: profile.customerSupportHours,
    companyHomepageRouteId: profile.companyHomepageRouteId,
    studioRouteId: profile.studioRouteId,
    businessInfoVerificationUrl: profile.businessInfoVerificationUrl,
    footerRouteIds: profile.footerRouteIds,
    copyrightNotice: profile.copyrightNotice,
  };
}

export function publisherProfileHash(profile) {
  const canonical = JSON.stringify(stableValue(publisherProfileContent(profile)));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function normalizePublisherProfile(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Publisher Legal Profile must be a JSON object.");
  }
  const profile = {
    ...raw,
    schemaId: clean(raw.schemaId),
    publisherId: clean(raw.publisherId),
    legalName: clean(raw.legalName),
    representativeName: clean(raw.representativeName),
    businessRegistrationNumber: clean(raw.businessRegistrationNumber),
    mailOrderRegistrationNumber: clean(raw.mailOrderRegistrationNumber),
    mailOrderRegistrationAuthority: clean(raw.mailOrderRegistrationAuthority),
    businessAddress: clean(raw.businessAddress),
    hostingProviderName: clean(raw.hostingProviderName),
    customerSupportPhone: clean(raw.customerSupportPhone),
    customerSupportEmail: clean(raw.customerSupportEmail),
    customerSupportHours: clean(raw.customerSupportHours) || null,
    companyHomepageRouteId: clean(raw.companyHomepageRouteId),
    studioRouteId: clean(raw.studioRouteId),
    businessInfoVerificationUrl: clean(raw.businessInfoVerificationUrl),
    footerRouteIds: Array.isArray(raw.footerRouteIds) ? raw.footerRouteIds.map(clean).filter(Boolean) : [],
    copyrightNotice: clean(raw.copyrightNotice),
    lifecycleStatus: clean(raw.lifecycleStatus),
    sourceVersionId: clean(raw.sourceVersionId),
    versionLabel: clean(raw.versionLabel),
    sourceHash: clean(raw.sourceHash),
    publishedAt: clean(raw.publishedAt),
  };

  if (profile.schemaId !== "npq.publisher_legal_profile.v1") throw new Error("Unsupported Publisher Legal Profile schema.");
  if (profile.publisherId !== "netmelon") throw new Error("Publisher Legal Profile identity drift.");
  if (profile.enabled !== true || profile.lifecycleStatus !== "published") throw new Error("Publisher Legal Profile must be published and enabled.");
  for (const field of REQUIRED_PUBLIC_FIELDS) {
    if (!clean(profile[field])) throw new Error(`Publisher Legal Profile is missing ${field}.`);
  }
  for (const field of ["sourceVersionId", "versionLabel", "sourceHash", "publishedAt"]) {
    if (!clean(profile[field])) throw new Error(`Publisher Legal Profile is missing ${field}.`);
  }
  if (!/^[a-f0-9]{64}$/i.test(profile.sourceHash)) throw new Error("Publisher Legal Profile sourceHash is invalid.");
  if (!profile.customerSupportEmail.includes("@") || /\s/.test(profile.customerSupportEmail)) throw new Error("Publisher Legal Profile customerSupportEmail is invalid.");
  if (profile.companyHomepageRouteId !== "company.home") throw new Error("Publisher Legal Profile company route is invalid.");
  if (profile.studioRouteId !== "studio.root_redirect") throw new Error("Publisher Legal Profile Studio route is invalid.");
  const verificationUrl = new URL(profile.businessInfoVerificationUrl);
  if (verificationUrl.protocol !== "https:" || (verificationUrl.hostname !== "ftc.go.kr" && !verificationUrl.hostname.endsWith(".ftc.go.kr"))) {
    throw new Error("Publisher Legal Profile verification URL must use HTTPS on ftc.go.kr.");
  }
  for (const routeId of REQUIRED_FOOTER_ROUTES) {
    if (!profile.footerRouteIds.includes(routeId)) throw new Error(`Publisher Legal Profile is missing route ${routeId}.`);
  }
  if (publisherProfileHash(profile) !== profile.sourceHash) throw new Error("Publisher Legal Profile sourceHash does not match its content.");
  return profile;
}

export function renderPublisherFooter(profile, locale = "ko") {
  const labels = locale === "en" ? {
    aria: "Business information",
    businessNumber: "Business registration",
    representative: "Representative",
    hosting: "Hosting service",
    mailOrder: "Mail-order registration",
    verify: "Verify business information",
  } : {
    aria: "사업자 정보",
    businessNumber: "사업자등록번호",
    representative: "대표",
    hosting: "호스팅 서비스",
    mailOrder: "통신판매업 신고번호",
    verify: "사업자정보확인",
  };
  const registeredValue = (value) => locale === "en" ? `<span lang="ko">${htmlEscape(value)}</span>` : htmlEscape(value);
  const item = (label, value, suffix = "") => `<span class="publisher-business-item"><strong>${htmlEscape(label)}:</strong> ${registeredValue(value)}${suffix}</span>`;
  const verifyLink = ` <a class="business-verify" href="${htmlEscape(profile.businessInfoVerificationUrl, true)}" target="_blank" rel="noopener noreferrer">${htmlEscape(labels.verify)}</a>`;
  return [
    "<div class=\"footer-brand\">",
    "  <strong class=\"footer-company-name\">Netmelon</strong>",
    `  <p class="footer-copyright">${htmlEscape(profile.copyrightNotice)}</p>`,
    "</div>",
    `<section class="publisher-business" aria-label="${htmlEscape(labels.aria, true)}" data-publisher-profile-version="${htmlEscape(profile.sourceVersionId, true)}" data-publisher-profile-hash="${htmlEscape(profile.sourceHash, true)}">`,
    `  <p class="publisher-business-line">${item(labels.businessNumber, profile.businessRegistrationNumber)}${item(labels.representative, profile.representativeName)}</p>`,
    `  <p class="publisher-business-line">${item(labels.hosting, profile.hostingProviderName)}${item(labels.mailOrder, profile.mailOrderRegistrationNumber, verifyLink)}</p>`,
    `  <p class="publisher-business-address">${registeredValue(publisherBusinessAddressForFooter(profile.businessAddress))}</p>`,
    "</section>",
  ].join("\n");
}

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizePublisherProfile, publisherProfileHash, renderPublisherFooter } from "./publisher-profile.mjs";

const original = JSON.parse(await readFile(new URL("../data/publisher-legal-profile.json", import.meta.url), "utf8"));
assert.equal(normalizePublisherProfile(original).sourceHash, original.sourceHash);
const updated = {
  ...original,
  customerSupportEmail: "netmelon@netmelonai.com",
  copyrightReceiver: { enabled: true, name: "Fixture", department: "Fixture company", phone: "", fax: "",
    email: "netmelon@netmelonai.com", postalAddress: "Fixture address", submissionUrl: "" },
};
updated.sourceHash = publisherProfileHash(updated);
assert.equal(normalizePublisherProfile(updated).sourceHash, updated.sourceHash);
assert.throws(() => normalizePublisherProfile({ ...updated, copyrightReceiver: { ...updated.copyrightReceiver, email: "other@example.test" } }), /sourceHash/);
for (const locale of ["ko", "en"]) {
  assert.ok(renderPublisherFooter({ ...updated, customerSupportPhone: "070-4250-1000" }, locale).includes("070-4250-1000"));
  assert.ok(!renderPublisherFooter({ ...updated, customerSupportPhone: "" }, locale).includes("070-4250-1000"));
}
console.log("publisher profile legacy and copyrightReceiver hash binding: PASS");

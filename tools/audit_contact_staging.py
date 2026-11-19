"""Read-only contact and release identity check for the company staging site."""
import argparse
import json
import os
from pathlib import Path
import re
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument("--source-sha", required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
if os.environ.get("NPQ_OWNER_OPERATION_ENVIRONMENT") != "staging":
    parser.error("requires managed staging owner-operation")
if not re.fullmatch(r"[a-f0-9]{40}", args.source_sha):
    parser.error("exact source SHA required")

origin = "https://company-dev.netmelonai.com"


def mail_links(html):
    links = set(re.findall(r'href="mailto:([^"?]+)', html))
    for encoded in re.findall(r'href="/cdn-cgi/l/email-protection#([a-fA-F0-9]+)', html):
        raw = bytes.fromhex(encoded)
        links.add(bytes(value ^ raw[0] for value in raw[1:]).decode().split("?", 1)[0])
    return links


def read(path):
    request = urllib.request.Request(origin + path, headers={
        "User-Agent": "Mozilla/5.0", "Cache-Control": "no-cache"})
    with urllib.request.urlopen(request, timeout=30) as response:
        assert response.status == 200
        return response.read(2_000_000).decode(), response.headers


manifest, _ = read("/release-manifest.json")
manifest = json.loads(manifest)
assert manifest["sourceCommit"] == args.source_sha
assert manifest["environment"] == "staging"
assert manifest["hostingSite"] == "npq-company-dev"
assert manifest["sourceDirty"] is False
assert manifest["publicIntakeConfigured"] is False
rows = []
for route in ["/", "/en/", "/creators", "/en/creators"]:
    html, headers = read(route)
    assert "noindex" in headers.get("X-Robots-Tag", "")
    footer = re.search(r"<footer\b[\s\S]*?</footer>", html).group()
    for mailbox in ["netmelon", "creator", "support"]:
        assert f"{mailbox}@netmelonai.com" in mail_links(footer)
    if "creators" in route:
        contact = html.split('id="contact"', 1)[1].split("</section>", 1)[0]
        assert "creator@netmelonai.com" in mail_links(contact)
        assert "netmelon@netmelonai.com" not in mail_links(contact)
    rows.append({"route": route, "status": 200, "contactLinksPassed": True})
result = {"origin": origin, "sourceSha": args.source_sha, "rows": rows,
          "publicIntakeConfigured": False, "remoteDataWrites": 0}
args.output.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result))

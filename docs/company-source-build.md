# Company Source build-time injection

목표: 회사 홈페이지의 SEO 핵심 문구를 runtime fetch에 의존하지 않고, Studio 공개본을 빌드 시점에 HTML에 주입합니다.

## 파일 구조

```text
index.template.html                # 사람이 수정하는 홈 템플릿
company.template.html              # 사람이 수정하는 회사소개 템플릿
problems.template.html             # 풀고 있는 문제 페이지 템플릿
scripts/inject-company-source.mjs   # /company/public-source를 읽어 HTML 생성
scripts/fetch-company-announcements.mjs # 회사 공고 CMS 공개 스냅샷을 data JSON으로 저장
scripts/generate-company-announcements.mjs # 회사 공고 공개 JSON을 읽어 공고 페이지 생성
scripts/check-site-release.mjs      # 빌드 산출물과 release 규칙 검증
data/company-announcements.ko.json  # 회사 공고 원천 JSON
scripts/fetch-company-open-problems.mjs # 공개 Open Problem Source를 로컬 JSON으로 저장
scripts/generate-company-open-problems.mjs # 공개 문제 협업 페이지 생성
data/company-open-problems.ko.json # 한국어 풀고 있는 문제 공개 snapshot
data/company-open-problems.en.json # 영문 풀고 있는 문제 공개 snapshot (검수 완료 후에만 생성)
index.html                         # 빌드 결과물, 배포 대상
company.html                       # 빌드 결과물, 배포 대상
problems.html                      # 빌드 결과물, 배포 대상
careers.html                       # 보존 아카이브, 빌드에서 수정하거나 노출하지 않음
announcement.html                  # 빌드 결과물, 배포 대상
```

## 실행

API 주소는 기본값으로 제공하지 않습니다. dev/staging/production 주소 중 하나를 명시적으로 주입하세요.

```bash
COMPANY_SOURCE_API_BASE="https://your-api.example.com" node scripts/inject-company-source.mjs
```

기본 실행은 `index.html`, `company.html`, `problems.html`, `announcement.html`을 생성합니다. 기존 `careers.html`, `careers.template.html`, `en/careers.html`은 보존 아카이브이며 빌드가 수정하지 않습니다.

단일 출력 파일만 테스트하려면 기존처럼 template/output을 명시하세요.

```bash
COMPANY_SOURCE_JSON_PATH="./company-source.json" \
COMPANY_SOURCE_TEMPLATE="./index.template.html" \
COMPANY_SOURCE_OUTPUT="/tmp/index.html" \
node scripts/inject-company-source.mjs
```

네트워크 호출 없이 파일로 주입하려면:

```bash
COMPANY_SOURCE_JSON_PATH="./company-source.json" node scripts/inject-company-source.mjs
```

## 풀고 있는 문제 CMS 반영

Studio의 `함께 풀 문제 관리`에서 초안을 저장하고 검토본을 만든 뒤 발행합니다. 정적 사이트는 발행된 public snapshot만 가져옵니다.

```bash
COMPANY_PUBLIC_OPEN_PROBLEMS_URL="https://your-api.example.com/web-cms/public/company-open-problems?locale=ko" \
COMPANY_OPEN_PROBLEMS_INTAKE_API_BASE="https://your-api.example.com" \
npm run build:with-cms
```

`fetch-company-open-problems.mjs`는 schema, site/locale, published lifecycle, sourceVersionId/sourceHash를 검증한 뒤 `data/company-open-problems.ko.json`을 원자적으로 교체합니다. 이 JSON은 직접 편집하는 원본이 아니라 마지막 공개 snapshot의 빌드 캐시입니다. `generate-company-open-problems.mjs`는 문제 질문, 근거, 현재 시도, 필요한 전문성, 제공 환경과 Studio에서 등록한 YouTube 설명 영상을 목록과 상세 페이지에 렌더링합니다. 후보 등급, 담당자, 접촉 이력과 내부 메모는 공개 projection과 정적 HTML에 포함하지 않습니다. 해결 방안 폼은 `COMPANY_OPEN_PROBLEMS_INTAKE_API_BASE`의 `/web-cms/public/company-open-problem-proposals`를 사용합니다. 구조화 데이터는 `CollectionPage`, `ItemList`, `WebPage`만 사용하며 `JobPosting`을 사용하지 않습니다.

## 회사 공고 CMS 반영

회사 공고는 Studio CMS의 published public snapshot을 정적 사이트 빌드 전에 가져온 뒤 HTML로 생성합니다.

```bash
COMPANY_PUBLIC_ANNOUNCEMENTS_URL="https://your-api.example.com/company/public-announcements" \
npm run build:with-cms
```

Studio CMS에서 공고를 게시했고 이번 배포에 반드시 1건 이상 포함되어야 한다면 최소 게시 건수 검증을 켭니다.

```bash
COMPANY_PUBLIC_ANNOUNCEMENTS_URL="https://your-api.example.com/company/public-announcements" \
npm run build:with-cms:require-announcement
```

위 명령은 내부적으로 다음 순서로 실행됩니다.

```text
scripts/fetch-company-announcements.mjs
→ data/company-announcements.ko.json 저장
→ scripts/sync-site-shell.mjs
→ scripts/inject-company-source.mjs
→ scripts/generate-company-announcements.mjs
→ announcement.html 및 announcements/{slug}.html 생성
```

`scripts/fetch-company-announcements.mjs`는 다음을 검증합니다.

- public snapshot의 `site`가 `company`인지
- `locale`이 `ko`인지
- `entryType`이 `company_announcement`인지
- 각 공고가 `published` 상태인지
- `entryId`, `announcementType`, `title`, `slug`, `summary`, `body`, `publishedAt`이 유효한지
- `entryId`와 `slug`가 중복되지 않는지
- `COMPANY_ANNOUNCEMENTS_MIN_PUBLISHED`가 설정된 경우 최소 게시 건수를 만족하는지

인증이 필요한 snapshot endpoint라면 다음 값을 추가합니다.

```bash
COMPANY_ANNOUNCEMENTS_BEARER_TOKEN="..." \
COMPANY_PUBLIC_ANNOUNCEMENTS_URL="https://your-api.example.com/company/public-announcements" \
npm run build:with-cms
```

snapshot 저장 위치를 바꾸어 테스트할 때만 `COMPANY_ANNOUNCEMENTS_JSON_PATH`를 사용합니다.

```bash
COMPANY_ANNOUNCEMENTS_JSON_PATH="/tmp/company-announcements.ko.json" \
COMPANY_PUBLIC_ANNOUNCEMENTS_URL="https://your-api.example.com/company/public-announcements" \
npm run fetch:company-announcements
```

## 회사 공고 빈 상태

`data/company-announcements.ko.json`에 published 공고가 0건이면 `announcement.html`은 빈 상태 섹션을 렌더링합니다.

빈 상태 문구는 HTML 템플릿이나 서버 fallback에 하드코딩하지 않습니다. `data/company-source.ko.json`의 published Company Source 필드에서 가져옵니다.

```text
identity.announcementEmptyTitle
identity.announcementEmptyBody
```

공고가 1건 이상 있으면 빈 상태 문구는 렌더링되면 안 됩니다. `npm run check`가 이를 검증합니다.

## 회사 공고 상세 페이지 정리

`scripts/generate-company-announcements.mjs`는 현재 snapshot에 포함된 공고만 기준으로 `announcements/{slug}.html`을 생성합니다.

현재 snapshot에 없는 예전 상세 HTML은 빌드 중 삭제됩니다. 예를 들어 CMS에서 공고를 archive하면 다음 빌드에서 해당 slug의 상세 HTML이 `announcements/`에서 제거되어야 합니다.

`npm run check`는 다음 상태를 실패로 처리합니다.

- `data/company-announcements.ko.json`에는 있는데 `announcements/{slug}.html`이 없는 경우
- `data/company-announcements.ko.json`에는 없는데 `announcements/{slug}.html`이 남아 있는 경우
- published 공고가 있는데 빈 상태 문구가 표시되는 경우
- published 공고가 없는데 목록 UI가 표시되는 경우

production 주입은 published public source만 허용합니다. 응답에 `isDefault=true`가 있거나 `sourceVersionId`, `version`, `publishedAt`, `publishedBy`가 없으면 빌드가 실패합니다.

로컬 개발에서 미발행 JSON을 임시로 확인해야 할 때만 명시적으로 우회하세요.

```bash
COMPANY_SOURCE_ALLOW_UNPUBLISHED=1 COMPANY_SOURCE_JSON_PATH="./company-source.local.json" node scripts/inject-company-source.mjs
```

CI/CD에서는 배포 전 단계에 아래를 추가하세요.

```json
{
  "scripts": {
    "predeploy": "node scripts/inject-company-source.mjs"
  }
}
```

## 운영 원칙

- `*.template.html`에는 Studio 공개본에서 주입될 회사 원천 문구를 마커로 둡니다.
- `index.html`, `company.html`, `problems.html`은 빌드 결과물입니다. Studio 공개본을 바꾸면 다시 빌드하고 배포합니다.
- `careers.html`, `careers.template.html`, `en/careers.html`은 보존 아카이브입니다. 공통 헤더, sitemap, Company Source/Publisher Profile 빌드가 이 파일을 수정하거나 노출하면 안 됩니다.
- `data/company-announcements.ko.json`은 회사 공고의 현재 원천입니다. 빌드 시 `announcement.html`의 공고 목록 또는 빈 상태에 주입됩니다.
- `announcements/*.html`은 generated detail page입니다. 직접 수정하지 말고 CMS snapshot과 빌드 스크립트로 재생성합니다.
- 현재 공개 surface의 빌드 산출물에는 Organization, WebSite, AboutPage, CollectionPage, ItemList 등 페이지별 JSON-LD가 포함됩니다. 문제 협업 페이지에는 `JobPosting`을 넣지 않습니다.
- Company Source fetch가 실패하거나 필수 필드가 비어 있으면 빌드가 실패합니다. 잘못된 문구를 배포하지 않기 위해서입니다.
- Company Announcement fetch가 실패하거나 public snapshot 계약을 위반하면 빌드가 실패합니다. Studio CMS에는 Published로 보이는데 홈페이지에 표시되지 않으면 public snapshot API와 `data/company-announcements.ko.json`을 먼저 확인합니다.
- production 배포용 Company Source는 published provenance가 있어야 합니다. `sourceVersionId`, `version`, `publishedAt`, `publishedBy`가 비어 있으면 배포하지 않습니다.
- `company.html`, `problems.html`은 SEO 핵심 문구를 runtime fetch로 교체하지 않습니다.
- production HTML에는 dev/staging API URL을 하드코딩하지 않습니다.
- 페이지 로딩 중 runtime spinner나 skeleton을 보여주지 않습니다. 사용자는 이미 주입된 완성 HTML을 봅니다.


## English Open Problems snapshot

`COMPANY_OPEN_PROBLEMS_LOCALE=en npm run fetch:company-open-problems` 또는 `npm run fetch:company-open-problems:english`는 서버의 `locale=en` 공개 projection만 `data/company-open-problems.en.json`으로 저장합니다. 한국어 projection을 영문 fallback으로 복사하지 않으며, 영문 CMS version이 실제로 게시되기 전에는 fetch가 실패해야 합니다. 영문 정적 페이지는 검수 기간에 `noindex,nofollow`를 유지하고 sitemap과 한국어 hreflang에 추가하지 않습니다.

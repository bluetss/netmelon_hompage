# Index build-time Company Source injection

목표: `index.html`에서 하드코딩 fallback을 먼저 보여주지 않고, Studio 공개본을 빌드 시점에 HTML에 주입합니다.

## 파일 구조

```text
index.template.html              # 사람이 수정하는 원본 템플릿, fallback 문구 없음
scripts/inject-company-source.mjs # /company/public-source를 읽어 index.html 생성
index.html                       # 빌드 결과물, 배포 대상
```

## 실행

API 주소는 기본값으로 제공하지 않습니다. dev/staging/production 주소 중 하나를 명시적으로 주입하세요.

```bash
COMPANY_SOURCE_API_BASE="https://your-api.example.com" node scripts/inject-company-source.mjs
```

네트워크 호출 없이 파일로 주입하려면:

```bash
COMPANY_SOURCE_JSON_PATH="./company-source.json" node scripts/inject-company-source.mjs
```

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

- `index.template.html`에는 사용자에게 보일 fallback 문구를 넣지 않습니다.
- `index.html`은 빌드 결과물입니다. Studio 문구를 바꾸면 다시 빌드하고 배포합니다.
- Company Source fetch가 실패하거나 필수 필드가 비어 있으면 빌드가 실패합니다. 잘못된 문구를 배포하지 않기 위해서입니다.
- production 배포용 Company Source는 published provenance가 있어야 합니다. `sourceVersionId`, `version`, `publishedAt`, `publishedBy`가 비어 있으면 배포하지 않습니다.
- production HTML에는 dev/staging API URL을 하드코딩하지 않습니다.
- 페이지 로딩 중 runtime spinner나 skeleton을 보여주지 않습니다. 사용자는 이미 주입된 완성 HTML을 봅니다.

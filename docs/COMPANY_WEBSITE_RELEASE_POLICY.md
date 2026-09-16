# 회사 홈페이지 staging·운영 배포 정책

## 배포 경계

회사 홈페이지의 모든 수정본은 Firebase Hosting site `npq-company-dev`에서 먼저
build, deploy, smoke test한다. 최종 사용자 승인 전에는 GitHub Pages 운영 사이트
`netmelonai.com`, 운영 배포 branch, `CNAME`을 변경하지 않는다.

Firebase staging에는 저장소 root가 아니라 `dist/` 공개 산출물만 배포한다. staging은
`X-Robots-Tag: noindex, nofollow, noarchive`와 전체 차단 `robots.txt`를 유지한다.

## 환경 연결

| 환경 | 회사 홈페이지 | 앱 랜딩 링크 | Studio 링크 | 공개 인입 API | 데이터 |
| --- | --- | --- | --- | --- | --- |
| local | local server | local preview 또는 명시한 staging origin | 명시한 staging origin | 기본 disabled | local snapshot 또는 명시한 staging source |
| staging | `https://npq-company-dev.web.app` | `https://npq-landing-dev.web.app` | `https://studio-dev.naepopquiz.com` | staging 전용 public-intake Cloud Run | OIDC core를 통한 staging 저장소 |
| production | `https://netmelonai.com` | `https://naepopquiz.com` | `https://studio.naepopquiz.com` | production 전용 public-intake Cloud Run | OIDC core를 통한 production 저장소 |

회사 홈페이지의 앱·Studio 링크는 빌드 환경 설정으로 resolve한다. staging 산출물에 production 교차 사이트 origin이 있거나 production 산출물에 `*-dev`, staging `web.app` origin이 있으면 배포 검사를 실패시킨다. CMS 문구에 환경별 절대 URL을 저장하지 않는다.

`studio-dev.naepopquiz.com`은 Cloudflare IP allowlist를 적용한 검수 origin이다. 반면 Firebase 기본 `npq-company-dev.web.app`과 `npq-landing-dev.web.app`은 Cloudflare를 통과하지 않으므로 동일한 접근 통제를 받는다고 간주하지 않는다. 두 기본 origin의 staging 산출물에는 비밀, 사용자 데이터 또는 관리자 기능을 포함하지 않고 `noindex`를 유지한다. 회사와 앱 랜딩에 Cloudflare 보호 custom domain이 마련되면 URL registry와 build 검사를 해당 origin으로 함께 전환한다.

로컬·staging build가 기존 제품 핵심 Cloud Run 주소로 fallback하면 안 된다. 공개 인입
API base가 없으면 IR과 문제 해결 방안 form만 비활성 안내를 표시하고 정적 페이지는 계속
제공한다. 브라우저는 429·503이나 연결 실패를 자동 재시도하지 않는다.

홈페이지는 격리 public-intake URL만 안다. Firestore·SMTP가 있는 core URL과 내부 경로를
브라우저에 직접 연결하지 않는다. 격리 서비스는 body·origin·rate·전역 상한을 통과한
요청만 서비스 계정 OIDC로 core에 전달하며, 실패 시 양식만 일시 중단 안내를 표시한다.

## 승인 순서

1. Studio에서 회사 CMS 공개본을 발행한다.
2. 회사 저장소에서 환경을 명시해 `dist/`를 생성한다.
3. 정적 release 검사와 `noindex` 검사를 통과한다.
4. Firebase `npq-company-dev`에 배포한다.
5. 데스크톱·모바일·링크·CMS 자원·폼 상태를 smoke test한다.
6. 수정과 staging 재배포를 반복한다.
7. 사용자가 최종 승인한 뒤에만 승인된 commit을 GitHub 운영 배포 branch에 반영한다.
8. 운영 smoke가 통과한 뒤 기존 핵심 서버의 공개 인입 호환 route를 닫는다.

Firebase production 이전은 이 정책의 자동 후속 단계가 아니다. 별도 사용자 승인과 DNS,
rollback, cache, 비용 검토가 있어야 한다.

## 2026-09-01 staging 기준선

| 항목 | 값 |
| --- | --- |
| Hosting site/version | `npq-company-dev` / `43a3ba9829f1b316` |
| URL | `https://npq-company-dev.web.app` |
| 공개 인입 API | `https://npq-public-intake-dwg6e75nqq-uc.a.run.app` |
| 산출물 | 59 files, `publicIntakeConfigured=true` |
| staging header | `noindex, nofollow, noarchive`; `no-cache, no-store, must-revalidate` |
| 운영 보호 | GitHub Pages, `netmelonai.com`, `CNAME`, 운영 branch 변경 없음 |

## 산출물 계약

`dist/`에는 공개 HTML, runtime CSS·JavaScript, 이미지, 필요한 공개 JSON, 검색·도메인
검증 파일과 release manifest만 들어간다. template, CMS 편집 원본, build/fetch/import
script, `.git`, CLI token, 환경 파일과 secret은 배포하지 않는다.

`release-manifest.json`은 environment, source commit, dirty 여부, build 시각, 회사·앱 랜딩·Studio의 resolved origin, public-intake API 연결 여부와 CMS source version/hash를 기록한다. secret이나 인증 token은 기록하지 않는다.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

프레임워크 없이 순수 HTML/CSS/JS로 만든 한국어 "문의하기" 폼 페이지(`index.html`, `style.css`, `script.js`)와, 제출 내용을 AI 폴더의 로컬 파일(`data/inquiries.json`)에 저장하는 Node 서버(`supabase-db/`)로 구성됩니다. 테스트나 린트 설정은 없습니다.

## 실행

`supabase-db/`에서 `npm run server`(또는 `npm run dev`로 변경 시 자동 재시작)를 실행하고 http://localhost:5500 으로 엽니다. `.claude/launch.json`의 `contact-form` 설정도 이 서버를 실행합니다. `index.html`을 `file://`로 직접 열면 API 호출이 실패합니다.

## 구조와 동작

- **검증 흐름** (`script.js`): `validators` 객체의 키가 각 입력 요소의 `name` 속성과 일치해야 하고, 에러 메시지는 `#<name>-error` 요소에 표시됩니다. 필드를 추가할 때는 HTML의 `name`/`id`, `<name>-error` 요소, `validators` 항목을 함께 추가해야 합니다. 폼은 `novalidate`이므로 브라우저 기본 검증 대신 이 JS 검증만 사용합니다.
- **검증 시점**: blur 시 검사하고, 이미 `invalid` 클래스가 붙은 필드는 입력할 때마다 재검사합니다. 제출 시 전체 검사 후 첫 번째 오류 필드로 포커스를 이동합니다.
- **전화번호**: 입력 시 자동으로 하이픈을 넣습니다(`02` 서울 지역번호는 별도 처리). 검증 정규식 `^0\d{1,2}-\d{3,4}-\d{4}$`와 포맷 로직이 서로 맞아야 합니다.
- **제출**: `POST /api/inquiries`로 JSON을 보냅니다. 성공 시에만 폼 리셋·카운터 0·성공 메시지를 보여주고, 실패 시 입력값을 유지한 채 `#form-error`에 메시지를, 서버 검증 오류(`errors`)는 각 `#<name>-error`에 표시합니다.
- **분석** (`analytics.js`): PostHog(US). `POSTHOG_KEY`가 비어 있으면 로드하지 않고 `track()`은 아무것도 하지 않습니다. 이벤트는 `inquiry_submitted`·`inquiry_submit_failed`·`inquiry_validation_failed`이며 **입력값(개인정보)은 보내지 않고** 필드 이름·글자 수만 보냅니다. 관리자 페이지에는 넣지 않습니다.
- **스타일**: 색상은 `style.css`의 `:root` CSS 변수로 관리합니다(인디고 계열 primary). 480px 이하에서 모바일 레이아웃이 적용됩니다.

## 관리자 페이지 (`admin.html`, `admin.css`, `admin.js`)

`/admin`에서 접수된 문의를 조회·검색·수정·삭제합니다. **인증이 없으므로** 주소를 아는 누구나 개인정보를 보고 고칠 수 있습니다. 외부에 공개하기 전에 인증을 추가해야 합니다.

- API: `GET /api/inquiries`(최신순 목록), `PUT /api/inquiries/:id`(제출과 같은 `validate` 적용), `DELETE /api/inquiries/:id`. 없는 id는 404를 반환합니다.
- 목록은 한 번에 모두 받아 브라우저에서 검색합니다(페이지네이션 없음). 사용자 입력은 `textContent`로만 렌더링합니다(XSS 방지).
- 수정 대화상자의 `validators`와 전화번호 자동 하이픈은 `script.js`와 같은 규칙이므로 함께 맞춰야 합니다.
- 720px 이하에서는 표가 카드 목록으로 바뀝니다.
- **메모**: 한 문의에 메모를 여러 개 남길 수 있습니다(추가·삭제만, 수정 없음). 수정 대화상자 아래 `#memo-form`은 문의 수정 폼과 별개의 form이며 추가 즉시 저장됩니다. API: `POST /api/inquiries/:id/memos`(`{ content }`, 최대 500자 — 서버 `MEMO_LIMIT`과 HTML `maxlength`를 맞출 것), `DELETE /api/inquiries/:id/memos/:memoId`. 문의를 삭제하면 메모도 함께 삭제됩니다.

## supabase-db/ — 문의 저장 서버

- `server.ts`: Node `http` 서버. 루트의 폼·관리자 페이지 파일만 화이트리스트로 서빙하고(상위 폴더의 개인 파일 노출 방지), API 요청을 검증한 뒤 `store.ts`로 저장합니다. **서버 검증 규칙과 길이 제한(`LIMITS`)은 `script.js`·`admin.js`의 `validators`, HTML `maxlength`와 맞춰야 합니다.**
- `store.ts`: 저장소. Supabase 접속이 안 되어 **AI 폴더의 `data/inquiries.json`** 에 문의와 메모(`memos` 배열)를 저장합니다. 쓰기는 큐로 하나씩 처리하고 임시 파일→이름 변경으로 저장해 파일이 깨지지 않게 합니다. `data/`는 개인정보라 `.gitignore` 대상이며, 파일이 없으면 빈 상태로 시작합니다.
- **오류 처리**: 각 API는 오류를 잡아 500과 한국어 안내를 반환하고, 그 밖의 예상치 못한 오류는 `server.ts`의 최상위 `try/catch`와 `process.on('unhandledRejection'|'uncaughtException')`이 받아 **서버를 끄지 않고** 기록합니다(재시작해 줄 관리 도구가 없기 때문). 오류는 `logger.ts`의 `logError`로 터미널과 **`logs/error.log`**(`.gitignore` 대상)에 남기며, 요청 본문(개인정보)은 기록하지 않습니다.
- **오류 알림 메일** (`alert.ts`): `logError`가 호출될 때마다 Resend API로 메일을 보냅니다(패키지 없이 `fetch`). `.env`의 `RESEND_API_KEY`·`ERROR_ALERT_EMAIL`을 읽고, 키가 비었거나 형식이 맞지 않으면 꺼집니다(서버 시작 시 상태 출력). 발신 주소는 Resend 테스트용 `onboarding@resend.dev`라 **Resend 가입 이메일로만** 받을 수 있습니다(다른 주소는 도메인 인증 후 `ERROR_ALERT_FROM` 설정). 메일 폭주를 막으려고 10분에 1통만 보내고 그사이 건수는 다음 메일에 적습니다. 발송 실패는 터미널에만 출력합니다(`logError` 재호출 시 무한 반복).
- **데이터 파일 손상**: 저장할 때마다 직전 정상본을 `data/inquiries.json.bak`으로 보관합니다. `inquiries.json`이 깨지면 원본을 `inquiries.corrupt-<시각>.json`으로 따로 남기고 `.bak`으로 복구해 계속 진행합니다(마지막 저장 1건이 빠질 수 있음). 둘 다 못 읽으면 빈 데이터로 시작하지 않고 `DataFileError`로 멈춰 기존 데이터를 덮어쓰지 않습니다.
- **화면 쪽**: `script.js`·`admin.js`는 원인을 아는 실패(`SubmitError`·`RequestError`: 네트워크·서버 응답)만 그 메시지를 보여주고, 예상치 못한 오류는 기술적인 문구 대신 "예상치 못한 오류가 발생했습니다…"를 보여줍니다. 문의 폼의 예상치 못한 오류는 PostHog `client_error`(메시지 200자까지)와 `inquiry_submit_failed`(`reason: "unexpected"`)로 기록됩니다.
- `store-db.ts`: 같은 함수를 Drizzle로 구현한 Supabase 저장소(아직 미사용). 응답 모양(`memos` 배열 포함)이 `store.ts`와 같아서 `server.ts`의 import만 바꾸면 전환됩니다.

### Supabase (현재 서버에서 사용하지 않음)

`.env`의 두 URL에 비밀번호 대신 `[YOUR-PASSWORD]` 자리표시자가 남아 있어 접속이 실패합니다. 실제 비밀번호로 바꾼 뒤 `npm run db:migrate`로 `inquiry_memos` 테이블(`0001_add_inquiry_memos`)을 적용하고 `store-db.ts`로 전환하세요. 비밀번호의 특수문자는 URL 인코딩해야 합니다.

- `db.ts`: 접속 공용 모듈. `supabase-db/.env`를 경로 고정으로 읽습니다. `DATABASE_URL`은 트랜잭션 모드 풀러(6543)라 `prepare: false`가 필요합니다.
- 스키마는 `drizzle/schema.ts`, 마이그레이션은 `drizzle/migrations/`. 스키마 변경 후 `npm run db:generate` → `npm run db:migrate`. drizzle-kit은 `DIRECT_URL`(세션 모드 5432)을 사용합니다.
- `npm start`(`index.ts`)는 저장된 문의 목록을 출력합니다.
- `.env`(DB 비밀번호 포함)는 `.gitignore` 대상입니다. 절대 커밋하지 마세요.

## 챗봇 프로젝트 (별도 저장소)

엑셀 Q&A 기반 상담 챗봇은 `Desktop/개인프로젝트` 저장소로 분리했습니다. 이 저장소에는 포함하지 않습니다.

## 규칙

- UI 문구, 코드 주석, 커밋 메시지는 한국어로 작성합니다.
- 루트의 `.jpeg`/`.xlsx` 파일은 이 프로젝트와 무관한 개인 파일이며 `.gitignore`에 등록되어 있습니다. 수정하거나 커밋하지 마세요.

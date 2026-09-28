# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

빌드 도구, 패키지 매니저, 프레임워크 없이 순수 HTML/CSS/JS로 만든 한국어 "문의하기" 폼 페이지입니다. 파일은 `index.html`, `style.css`, `script.js` 세 개뿐이며 테스트나 린트 설정은 없습니다.

## 실행

`index.html`을 브라우저에서 직접 열거나 아무 정적 서버로 서빙하면 됩니다. `.claude/launch.json`의 `contact-form` 설정(포트 5500)은 이전 세션 scratchpad에 있던 `serve.js`를 가리키므로 해당 파일이 없으면 동작하지 않습니다. 이 경우 정적 서버 스크립트를 새로 만들고 경로를 갱신해야 합니다.

## 구조와 동작

- **검증 흐름** (`script.js`): `validators` 객체의 키가 각 입력 요소의 `name` 속성과 일치해야 하고, 에러 메시지는 `#<name>-error` 요소에 표시됩니다. 필드를 추가할 때는 HTML의 `name`/`id`, `<name>-error` 요소, `validators` 항목을 함께 추가해야 합니다. 폼은 `novalidate`이므로 브라우저 기본 검증 대신 이 JS 검증만 사용합니다.
- **검증 시점**: blur 시 검사하고, 이미 `invalid` 클래스가 붙은 필드는 입력할 때마다 재검사합니다. 제출 시 전체 검사 후 첫 번째 오류 필드로 포커스를 이동합니다.
- **전화번호**: 입력 시 자동으로 하이픈을 넣습니다(`02` 서울 지역번호는 별도 처리). 검증 정규식 `^0\d{1,2}-\d{3,4}-\d{4}$`와 포맷 로직이 서로 맞아야 합니다.
- **제출**: 백엔드가 아직 없어 `console.log`로만 출력합니다(`TODO` 주석 위치). 제출 후 폼을 리셋하고 글자수 카운터를 0으로 되돌린 뒤 성공 메시지를 보여줍니다.
- **스타일**: 색상은 `style.css`의 `:root` CSS 변수로 관리합니다(인디고 계열 primary). 480px 이하에서 모바일 레이아웃이 적용됩니다.

## 개인프로젝트/ — 엑셀 Q&A 기반 AI 상담 챗봇

루트의 문의 폼과 별개의 프로젝트입니다(목표: 엑셀 Q&A → RAG/LLM → 카카오톡 상담 챗봇). 현재는 LLM 없이 브라우저에서만 동작하는 1단계입니다.

- **데이터**: 시작 시 `DEFAULT_QA_FILES`(`qa.xlsx`, `Q&A예제.xlsx`)를 순서대로 `fetch`하고, 모두 없으면 `sample-qa.js`의 `SAMPLE_QA`를 사용합니다. 헤더의 [엑셀 불러오기]로 xlsx/csv를 직접 올릴 수도 있습니다. 엑셀 파싱은 CDN의 SheetJS(`XLSX`)로 첫 시트만 읽으며 두 형식을 지원합니다.
  - 표 형식(`tableToQa`): 머리글 줄을 `COLUMN_ALIASES`로 찾음(질문·답변 필수, 카테고리·키워드 선택). 예시는 `qa-template.csv`.
  - 줄 형식(`linesToQa`): 셀을 위→아래로 읽어 `Q: 질문` 다음 `A: 답변`을 한 쌍으로 묶음. 사용자의 실제 엑셀(`Q&A예제.xlsx`)이 이 형식입니다.
- **검색**: 한국어 2글자 단위(bigram) Dice 유사도 + 키워드 열 일치 가산점. `ANSWER_THRESHOLD` 이상이면 답변, `SUGGEST_THRESHOLD` 이상이면 추천 질문 제시, 그 미만이면 상담원 연결을 안내합니다. 등록된 Q&A 밖의 답변은 만들지 않는 것이 원칙입니다.
- 상담원 연결은 아직 안내 메시지뿐입니다(`TODO` 주석 위치).
- `file://`로 직접 열면 `qa.xlsx` 자동 로드가 막히므로 정적 서버로 실행해야 합니다.

## 규칙

- UI 문구, 코드 주석, 커밋 메시지는 한국어로 작성합니다.
- 루트의 `.jpeg`/`.xlsx` 파일은 이 프로젝트와 무관한 개인 파일이며 `.gitignore`에 등록되어 있습니다. 수정하거나 커밋하지 마세요.

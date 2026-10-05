// PostHog 분석 연동 (문의 폼 페이지 전용 — 개인정보가 보이는 관리자 페이지에는 넣지 않음)
// 프로젝트 키(phc_로 시작)는 브라우저에 공개되는 키라 코드에 넣어도 됩니다.
const POSTHOG_KEY = "phc_sp48g6HFb9rV4tgkkNYsamf4TnV3gL8WuKNSo4LDhmYS";
const POSTHOG_HOST = "https://us.i.posthog.com";

// PostHog가 로드되지 않았거나(키 없음, 광고 차단 등) 실패해도 폼은 그대로 동작해야 함
window.track = (event, properties) => {
  try {
    window.posthog?.capture?.(event, properties);
  } catch {
    // 분석 오류는 무시
  }
};

if (POSTHOG_KEY) {
  const script = document.createElement("script");
  script.src = "https://us-assets.i.posthog.com/static/array.js";
  script.async = true;
  script.onload = () => {
    window.posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: "identified_only",
      // 세션 녹화 시 이름·이메일·전화번호·문의내용 입력값은 가림
      session_recording: { maskAllInputs: true },
    });
  };
  document.head.append(script);
}

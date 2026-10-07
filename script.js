const form = document.getElementById("contact-form");
const successMsg = document.getElementById("form-success");
const formError = document.getElementById("form-error");
const submitBtn = form.querySelector(".submit-btn");
const phoneInput = document.getElementById("phone");
const messageInput = document.getElementById("message");
const messageCount = document.getElementById("message-count");

const UNEXPECTED_MESSAGE = "예상치 못한 오류가 발생했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.";

// 원인을 알고 있는 제출 실패 (reason: "network" | "server") — 메시지를 그대로 사용자에게 보여줌
class SubmitError extends Error {
  constructor(reason, message) {
    super(message);
    this.reason = reason;
  }
}

// 이 페이지 코드에서 잡지 못한 오류 — 사용자에게 안내하고 PostHog에 기록 (입력값은 보내지 않음)
window.addEventListener("error", (e) => {
  if (!e.filename?.endsWith("/script.js")) return; // PostHog 등 외부 스크립트 오류는 무시
  console.error("예상치 못한 오류:", e.error ?? e.message);
  track("client_error", { message: String(e.message).slice(0, 200) });
  formError.textContent = UNEXPECTED_MESSAGE;
  formError.hidden = false;
});

const validators = {
  name: (v) => (v.trim() ? "" : "이름을 입력해주세요."),
  email: (v) => {
    if (!v.trim()) return "이메일을 입력해주세요.";
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "" : "올바른 이메일 형식이 아닙니다.";
  },
  phone: (v) => {
    if (!v.trim()) return "전화번호를 입력해주세요.";
    return /^0\d{1,2}-\d{3,4}-\d{4}$/.test(v) ? "" : "올바른 전화번호 형식이 아닙니다.";
  },
  message: (v) => (v.trim() ? "" : "문의내용을 입력해주세요."),
};

function validateField(input) {
  const message = validators[input.name](input.value);
  document.getElementById(`${input.name}-error`).textContent = message;
  input.classList.toggle("invalid", Boolean(message));
  return !message;
}

// 전화번호 자동 하이픈 (예: 01012345678 → 010-1234-5678)
phoneInput.addEventListener("input", () => {
  const digits = phoneInput.value.replace(/\D/g, "").slice(0, 11);
  let formatted = digits;
  if (digits.startsWith("02")) {
    if (digits.length > 5) formatted = `${digits.slice(0, 2)}-${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`;
    else if (digits.length > 2) formatted = `${digits.slice(0, 2)}-${digits.slice(2)}`;
  } else {
    if (digits.length > 7) formatted = `${digits.slice(0, 3)}-${digits.slice(3, digits.length - 4)}-${digits.slice(-4)}`;
    else if (digits.length > 3) formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  phoneInput.value = formatted;
});

messageInput.addEventListener("input", () => {
  messageCount.textContent = messageInput.value.length;
});

// 입력 후 포커스가 빠질 때 검사, 에러 상태에서는 입력 즉시 재검사
form.querySelectorAll("input, textarea").forEach((input) => {
  input.addEventListener("blur", () => validateField(input));
  input.addEventListener("input", () => {
    if (input.classList.contains("invalid")) validateField(input);
  });
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  successMsg.hidden = true;
  formError.hidden = true;

  const inputs = [...form.querySelectorAll("input, textarea")];
  const results = inputs.map(validateField);
  if (results.includes(false)) {
    // 분석 이벤트에는 입력값 없이 오류 필드 이름만 보냄
    track("inquiry_validation_failed", {
      fields: inputs.filter((_, i) => !results[i]).map((el) => el.name),
    });
    inputs[results.indexOf(false)].focus();
    return;
  }

  const data = Object.fromEntries(new FormData(form));
  submitBtn.disabled = true;
  submitBtn.textContent = "보내는 중...";

  try {
    let res;
    try {
      res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } catch {
      throw new SubmitError("network", "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
    }
    const result = await res.json().catch(() => ({}));

    if (!res.ok) {
      // 서버 검증 오류는 해당 필드 아래에 표시 (폼에 없는 필드 이름은 무시)
      const fieldErrors = Object.entries(result.errors ?? {}).filter(([name]) => form.elements[name]);
      fieldErrors.forEach(([name, message]) => {
        const errorEl = document.getElementById(`${name}-error`);
        if (errorEl) errorEl.textContent = message;
        form.elements[name].classList.add("invalid");
      });
      if (fieldErrors.length) form.elements[fieldErrors[0][0]].focus();
      throw new SubmitError("server", result.error ?? "문의 접수에 실패했습니다.");
    }

    form.reset();
    messageCount.textContent = "0";
    successMsg.hidden = false;
    track("inquiry_submitted", { message_length: data.message.length });
  } catch (err) {
    // 네트워크·서버 오류는 준비된 안내 문구를, 그 밖의 예상치 못한 오류는 일반 문구를 보여줌
    const known = err instanceof SubmitError;
    if (!known) console.error("문의 제출 중 예상치 못한 오류:", err);
    track("inquiry_submit_failed", { reason: known ? err.reason : "unexpected" });
    formError.textContent = known ? err.message : UNEXPECTED_MESSAGE;
    formError.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "문의 보내기";
  }
});

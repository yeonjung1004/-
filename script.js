const form = document.getElementById("contact-form");
const successMsg = document.getElementById("form-success");
const formError = document.getElementById("form-error");
const submitBtn = form.querySelector(".submit-btn");
const phoneInput = document.getElementById("phone");
const messageInput = document.getElementById("message");
const messageCount = document.getElementById("message-count");

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
    const res = await fetch("/api/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await res.json().catch(() => ({}));

    if (!res.ok) {
      // 서버 검증 오류는 해당 필드 아래에 표시
      const fieldErrors = Object.entries(result.errors ?? {});
      fieldErrors.forEach(([name, message]) => {
        document.getElementById(`${name}-error`).textContent = message;
        form.elements[name].classList.add("invalid");
      });
      if (fieldErrors.length) form.elements[fieldErrors[0][0]].focus();
      throw new Error(result.error ?? "문의 접수에 실패했습니다.");
    }

    form.reset();
    messageCount.textContent = "0";
    successMsg.hidden = false;
    track("inquiry_submitted", { message_length: data.message.length });
  } catch (err) {
    track("inquiry_submit_failed", { reason: err instanceof TypeError ? "network" : "server" });
    formError.textContent =
      err instanceof TypeError ? "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요." : err.message;
    formError.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "문의 보내기";
  }
});

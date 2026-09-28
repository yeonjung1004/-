const form = document.getElementById("contact-form");
const successMsg = document.getElementById("form-success");
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

form.addEventListener("submit", (e) => {
  e.preventDefault();
  successMsg.hidden = true;

  const inputs = [...form.querySelectorAll("input, textarea")];
  const results = inputs.map(validateField);
  if (results.includes(false)) {
    inputs[results.indexOf(false)].focus();
    return;
  }

  const data = Object.fromEntries(new FormData(form));
  // TODO: 백엔드 구현 후 여기서 서버로 전송
  console.log("문의 데이터:", data);

  form.reset();
  messageCount.textContent = "0";
  successMsg.hidden = false;
});

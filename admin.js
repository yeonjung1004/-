const listBody = document.getElementById("inquiry-list");
const emptyMsg = document.getElementById("empty");
const summary = document.getElementById("summary");
const listError = document.getElementById("list-error");
const searchInput = document.getElementById("search");
const refreshBtn = document.getElementById("refresh-btn");

const dialog = document.getElementById("edit-dialog");
const form = document.getElementById("edit-form");
const dialogMeta = document.getElementById("dialog-meta");
const formError = document.getElementById("form-error");
const saveBtn = document.getElementById("save-btn");
const deleteBtn = document.getElementById("delete-btn");
const phoneInput = document.getElementById("phone");
const messageInput = document.getElementById("message");
const messageCount = document.getElementById("message-count");
const toast = document.getElementById("toast");

const memoList = document.getElementById("memo-list");
const memoEmpty = document.getElementById("memo-empty");
const memoCount = document.getElementById("memo-count");
const memoForm = document.getElementById("memo-form");
const memoInput = document.getElementById("memo-input");
const memoInputCount = document.getElementById("memo-input-count");
const memoError = document.getElementById("memo-error");
const memoAddBtn = document.getElementById("memo-add-btn");

let inquiries = [];
let editingId = null;

// script.js(문의 폼)와 같은 검증 규칙
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

function clearErrors() {
  form.querySelectorAll("input, textarea").forEach((input) => {
    input.classList.remove("invalid");
    document.getElementById(`${input.name}-error`).textContent = "";
  });
  formError.hidden = true;
}

const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatDate(value) {
  return dateFormat.format(new Date(value));
}

let toastTimer;
function showToast(text) {
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 2500);
}

async function request(url, options = {}) {
  let res;
  try {
    res = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    throw new Error("서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(result.error ?? "요청을 처리하지 못했습니다.");
    err.status = res.status;
    err.errors = result.errors;
    throw err;
  }
  return result;
}

// ---------- 목록 ----------

// 검색어와 일치하는 부분을 <mark>로 감싸서 붙임 (textContent만 사용해 XSS 방지)
function appendHighlighted(el, text, query) {
  if (!query) {
    el.textContent = text;
    return;
  }
  const lower = text.toLowerCase();
  let start = 0;
  let idx;
  while ((idx = lower.indexOf(query, start)) !== -1) {
    el.append(text.slice(start, idx));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(idx, idx + query.length);
    el.append(mark);
    start = idx + query.length;
  }
  el.append(text.slice(start));
}

function cell(className, text, query) {
  const td = document.createElement("td");
  td.className = className;
  appendHighlighted(td, text, query);
  return td;
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = query
    ? inquiries.filter((q) =>
        [q.name, q.email, q.phone, q.message].some((v) => v.toLowerCase().includes(query))
      )
    : inquiries;

  listBody.replaceChildren(
    ...filtered.map((q) => {
      const tr = document.createElement("tr");
      tr.dataset.id = q.id;

      const contact = document.createElement("td");
      contact.className = "cell-contact";
      const email = document.createElement("span");
      appendHighlighted(email, q.email, query);
      const phone = document.createElement("span");
      phone.className = "phone";
      appendHighlighted(phone, q.phone, query);
      contact.append(email, phone);

      const nameTd = cell("cell-name", q.name, query);
      if (q.memos.length) {
        const badge = document.createElement("span");
        badge.className = "memo-badge";
        badge.textContent = `메모 ${q.memos.length}`;
        nameTd.append(document.createElement("br"), badge);
      }

      const messageTd = document.createElement("td");
      messageTd.className = "cell-body";
      const message = document.createElement("div");
      message.className = "cell-message";
      appendHighlighted(message, q.message, query);
      messageTd.append(message);

      const actions = document.createElement("td");
      actions.className = "cell-actions";
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn-secondary btn-sm";
      editBtn.textContent = "수정";
      editBtn.setAttribute("aria-label", `${q.name}님 문의 수정`);
      const memoBtn = document.createElement("button");
      memoBtn.type = "button";
      memoBtn.className = "btn btn-secondary btn-sm";
      memoBtn.dataset.memo = "";
      memoBtn.textContent = q.memos.length ? `메모 ${q.memos.length}` : "메모";
      memoBtn.setAttribute("aria-label", `${q.name}님 문의 메모`);
      actions.append(memoBtn, editBtn);

      tr.append(
        cell("cell-id", String(q.id)),
        cell("cell-date", formatDate(q.createdAt)),
        nameTd,
        contact,
        messageTd,
        actions
      );
      return tr;
    })
  );

  summary.textContent = query
    ? `전체 ${inquiries.length}건 중 ${filtered.length}건 검색됨`
    : `전체 ${inquiries.length}건`;
  emptyMsg.hidden = filtered.length > 0;
  emptyMsg.textContent = query ? "검색 결과가 없습니다." : "아직 접수된 문의가 없습니다.";
}

async function loadInquiries() {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "불러오는 중...";
  listError.hidden = true;
  try {
    const result = await request("/api/inquiries");
    inquiries = result.inquiries;
    render();
  } catch (err) {
    listError.textContent = err.message;
    listError.hidden = false;
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "새로고침";
  }
}

searchInput.addEventListener("input", render);
refreshBtn.addEventListener("click", loadInquiries);

listBody.addEventListener("click", (e) => {
  const tr = e.target.closest("tr");
  if (!tr) return;
  openEditor(Number(tr.dataset.id));
  // [메모] 버튼이면 메모 입력란으로 바로 이동
  if (e.target.closest("[data-memo]")) {
    memoInput.scrollIntoView({ block: "center" });
    memoInput.focus();
  }
});

// ---------- 수정 대화상자 ----------

function openEditor(id) {
  const q = inquiries.find((item) => item.id === id);
  if (!q) return;
  editingId = id;
  clearErrors();
  form.elements.name.value = q.name;
  form.elements.email.value = q.email;
  form.elements.phone.value = q.phone;
  form.elements.message.value = q.message;
  messageCount.textContent = q.message.length;
  dialogMeta.textContent = `#${q.id} · ${formatDate(q.createdAt)} 접수`;
  memoInput.value = "";
  memoInputCount.textContent = 0;
  memoError.textContent = "";
  memoInput.classList.remove("invalid");
  renderMemos(q);
  dialog.showModal();
}

function closeEditor() {
  dialog.close();
}

dialog.querySelectorAll("[data-close]").forEach((btn) => btn.addEventListener("click", closeEditor));

// 바깥(배경) 클릭 시 닫기 — 입력창에서 드래그하다 밖에서 놓은 경우는 제외
let pressedOnBackdrop = false;
dialog.addEventListener("pointerdown", (e) => {
  pressedOnBackdrop = e.target === dialog;
});
dialog.addEventListener("click", (e) => {
  if (pressedOnBackdrop && e.target === dialog) closeEditor();
  pressedOnBackdrop = false;
});

// 전화번호 자동 하이픈 (script.js와 동일)
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

form.querySelectorAll("input, textarea").forEach((input) => {
  input.addEventListener("blur", () => validateField(input));
  input.addEventListener("input", () => {
    if (input.classList.contains("invalid")) validateField(input);
  });
});

// 이미 다른 곳에서 삭제된 문의라면 목록에서도 제거
function removeFromList(id) {
  inquiries = inquiries.filter((q) => q.id !== id);
  render();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.hidden = true;

  const inputs = [...form.querySelectorAll("input, textarea")];
  const results = inputs.map(validateField);
  if (results.includes(false)) {
    inputs[results.indexOf(false)].focus();
    return;
  }

  const id = editingId;
  saveBtn.disabled = true;
  saveBtn.textContent = "저장 중...";
  try {
    const { inquiry } = await request(`/api/inquiries/${id}`, {
      method: "PUT",
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    inquiries = inquiries.map((q) => (q.id === id ? inquiry : q));
    render();
    closeEditor();
    showToast("문의가 수정되었습니다.");
  } catch (err) {
    const fieldErrors = Object.entries(err.errors ?? {});
    fieldErrors.forEach(([name, message]) => {
      document.getElementById(`${name}-error`).textContent = message;
      form.elements[name].classList.add("invalid");
    });
    if (fieldErrors.length) form.elements[fieldErrors[0][0]].focus();
    if (err.status === 404) removeFromList(id);
    formError.textContent = err.message;
    formError.hidden = false;
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "저장";
  }
});

deleteBtn.addEventListener("click", async () => {
  const id = editingId;
  const q = inquiries.find((item) => item.id === id);
  if (!confirm(`${q ? `${q.name}님의 ` : ""}문의(#${id})를 삭제할까요?\n${q?.memos.length ? `메모 ${q.memos.length}개도 함께 삭제되며, ` : ""}삭제한 문의는 되돌릴 수 없습니다.`)) return;

  deleteBtn.disabled = true;
  deleteBtn.textContent = "삭제 중...";
  try {
    await request(`/api/inquiries/${id}`, { method: "DELETE" });
    removeFromList(id);
    closeEditor();
    showToast("문의가 삭제되었습니다.");
  } catch (err) {
    if (err.status === 404) {
      removeFromList(id);
      closeEditor();
      showToast("이미 삭제된 문의입니다.");
      return;
    }
    formError.textContent = err.message;
    formError.hidden = false;
  } finally {
    deleteBtn.disabled = false;
    deleteBtn.textContent = "삭제";
  }
});

// ---------- 메모 (한 문의에 여러 개) ----------

function renderMemos(q) {
  memoList.replaceChildren(
    ...q.memos.map((m) => {
      const li = document.createElement("li");
      li.className = "memo-item";

      const body = document.createElement("div");
      body.className = "memo-body";
      const content = document.createElement("p");
      content.className = "memo-content";
      content.textContent = m.content;
      const date = document.createElement("p");
      date.className = "memo-date";
      date.textContent = formatDate(m.createdAt);
      body.append(content, date);

      const del = document.createElement("button");
      del.type = "button";
      del.className = "icon-btn";
      del.dataset.memoId = m.id;
      del.textContent = "×";
      del.setAttribute("aria-label", "메모 삭제");

      li.append(body, del);
      return li;
    })
  );
  memoEmpty.hidden = q.memos.length > 0;
  memoCount.textContent = q.memos.length ? q.memos.length : "";
}

// 목록의 문의 데이터에 메모 변경을 반영
function updateMemos(id, change) {
  const q = inquiries.find((item) => item.id === id);
  if (!q) return;
  q.memos = change(q.memos);
  render();
  if (editingId === id) renderMemos(q);
}

memoInput.addEventListener("input", () => {
  memoInputCount.textContent = memoInput.value.length;
  if (memoInput.value.trim()) {
    memoError.textContent = "";
    memoInput.classList.remove("invalid");
  }
});

memoForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const content = memoInput.value.trim();
  if (!content) {
    memoError.textContent = "메모 내용을 입력해주세요.";
    memoInput.classList.add("invalid");
    memoInput.focus();
    return;
  }

  const id = editingId;
  memoAddBtn.disabled = true;
  memoAddBtn.textContent = "저장 중...";
  try {
    const { memo } = await request(`/api/inquiries/${id}/memos`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    updateMemos(id, (memos) => [...memos, memo]);
    memoInput.value = "";
    memoInputCount.textContent = 0;
    showToast("메모가 추가되었습니다.");
  } catch (err) {
    memoError.textContent = err.message;
    if (err.status === 404) {
      removeFromList(id);
      closeEditor();
      showToast("이미 삭제된 문의입니다.");
    }
  } finally {
    memoAddBtn.disabled = false;
    memoAddBtn.textContent = "메모 추가";
  }
});

memoList.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-memo-id]");
  if (!btn) return;
  if (!confirm("이 메모를 삭제할까요?")) return;

  const id = editingId;
  const memoId = Number(btn.dataset.memoId);
  btn.disabled = true;
  try {
    await request(`/api/inquiries/${id}/memos/${memoId}`, { method: "DELETE" });
    showToast("메모가 삭제되었습니다.");
  } catch (err) {
    if (err.status !== 404) {
      memoError.textContent = err.message;
      btn.disabled = false;
      return;
    }
  }
  // 성공했거나 이미 삭제된 메모면 화면에서 제거
  updateMemos(id, (memos) => memos.filter((m) => m.id !== memoId));
});

loadInquiries();

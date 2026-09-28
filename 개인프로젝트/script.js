const messagesEl = document.getElementById("messages");
const quickRepliesEl = document.getElementById("quick-replies");
const composer = document.getElementById("composer");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const fileInput = document.getElementById("qa-file");

// 유사도 기준: 이 값 이상이면 바로 답변, 그 아래 구간은 추천 질문 제시, 더 낮으면 상담원 연결 안내
const ANSWER_THRESHOLD = 0.45;
const SUGGEST_THRESHOLD = 0.2;

let qaList = [];

/* ---------- Q&A 데이터 불러오기 ---------- */

// 엑셀 머리글 이름이 조금 달라도 인식되도록 후보 이름으로 열을 찾음
const COLUMN_ALIASES = {
  question: ["질문", "문의", "question", "q"],
  answer: ["답변", "답", "answer", "a"],
  category: ["카테고리", "분류", "구분", "category"],
  keywords: ["키워드", "keyword", "keywords", "태그"],
};

function findColumn(headers, aliases) {
  return headers.find((h) => aliases.includes(String(h).trim().toLowerCase()));
}

// 형식 1) 표 형태: 머리글 줄에 질문/답변(Q/A) 열이 있고 한 행에 Q&A 하나
function tableToQa(rows) {
  const headerIndex = rows.findIndex((r) =>
    findColumn(r, COLUMN_ALIASES.question) !== undefined && findColumn(r, COLUMN_ALIASES.answer) !== undefined
  );
  if (headerIndex === -1) return null;
  const headers = rows[headerIndex];
  const col = Object.fromEntries(
    Object.entries(COLUMN_ALIASES).map(([key, aliases]) => [key, headers.indexOf(findColumn(headers, aliases))])
  );
  const cell = (r, i) => (i >= 0 ? String(r[i] ?? "").trim() : "");
  return rows
    .slice(headerIndex + 1)
    .map((r) => ({
      question: cell(r, col.question),
      answer: cell(r, col.answer),
      category: cell(r, col.category),
      keywords: cell(r, col.keywords),
    }))
    .filter((qa) => qa.question && qa.answer);
}

// 형식 2) 줄 형태: "Q: 질문" 다음 "A: 답변" (A 뒤에 접두어 없는 줄은 답변에 이어 붙임)
const QA_LINE = /^\s*([QA])\s*[:：.)]\s*([\s\S]*)$/i;

function linesToQa(rows) {
  const list = [];
  let current = null;
  rows.flat().map((v) => String(v).trim()).filter(Boolean).forEach((text) => {
    const m = text.match(QA_LINE);
    if (m && m[1].toUpperCase() === "Q") {
      current = { question: m[2].trim(), answer: "", category: "", keywords: "" };
      list.push(current);
    } else if (m && current) {
      current.answer = [current.answer, m[2].trim()].filter(Boolean).join("\n");
    } else if (current && current.answer) {
      current.answer += `\n${text}`;
    }
  });
  return list.filter((qa) => qa.question && qa.answer);
}

function parseWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: "array" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
  const list = tableToQa(rows) ?? linesToQa(rows);
  if (!list.length) {
    throw new Error("Q&A를 찾지 못했습니다. '질문/답변' 머리글 또는 'Q: … / A: …' 형식으로 작성해주세요.");
  }
  return list;
}

function setQaList(list, sourceLabel) {
  qaList = list.map((qa) => ({
    ...qa,
    grams: bigrams(qa.question),
    keywordList: qa.keywords.split(/[,\n]/).map(normalize).filter(Boolean),
  }));
  addSystem(`${sourceLabel} · Q&A ${qaList.length}개`);
  renderQuickReplies();
}

// 같은 폴더의 엑셀을 순서대로 찾아 자동으로 읽고, 없으면(또는 파일을 직접 연 경우) 예시 데이터를 사용
const DEFAULT_QA_FILES = ["qa.xlsx", "Q&A예제.xlsx"];

async function loadDefaultQa() {
  for (const name of DEFAULT_QA_FILES) {
    try {
      const res = await fetch(encodeURIComponent(name));
      if (!res.ok) continue;
      setQaList(parseWorkbook(await res.arrayBuffer()), `${name} 불러옴`);
      return;
    } catch (err) {
      if (err.message) addSystem(`${name} 읽기 실패: ${err.message}`);
    }
  }
  setQaList(SAMPLE_QA, "예시 데이터 사용 중");
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;
  try {
    setQaList(parseWorkbook(await file.arrayBuffer()), `${file.name} 불러옴`);
  } catch (err) {
    addSystem(`불러오기 실패: ${err.message}`);
  }
  fileInput.value = "";
});

/* ---------- 질문 검색 (키워드 + 글자 단위 유사도) ---------- */

function normalize(text) {
  return String(text).toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

// 한국어는 띄어쓰기·조사 변화가 많아 두 글자씩 잘라 비교 (예: "환불신청" → 환불, 불신, 신청)
function bigrams(text) {
  const s = normalize(text);
  const set = new Set();
  if (s.length === 1) set.add(s);
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let common = 0;
  a.forEach((g) => b.has(g) && common++);
  return (2 * common) / (a.size + b.size);
}

function search(query) {
  const q = normalize(query);
  const qGrams = bigrams(query);
  return qaList
    .map((qa) => {
      const keywordHits = qa.keywordList.filter((k) => q.includes(k)).length;
      const score = Math.min(1, similarity(qGrams, qa.grams) + keywordHits * 0.35);
      return { qa, score };
    })
    .sort((x, y) => y.score - x.score);
}

/* ---------- 화면 출력 ---------- */

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addSystem(text) {
  const el = document.createElement("p");
  el.className = "system";
  el.textContent = text;
  messagesEl.append(el);
  scrollToBottom();
}

function addMessage(role, text) {
  const msg = document.createElement("div");
  msg.className = `msg ${role}`;
  if (role === "bot") {
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = "AI";
    msg.append(avatar);
  }
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  msg.append(bubble);
  messagesEl.append(msg);
  scrollToBottom();
  return bubble;
}

function addChoices(bubble, items) {
  const wrap = document.createElement("div");
  wrap.className = "choices";
  items.forEach(({ label, className, onClick }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `chip ${className || ""}`;
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    wrap.append(btn);
  });
  bubble.append(wrap);
  scrollToBottom();
}

function showTyping() {
  const msg = document.createElement("div");
  msg.className = "msg bot typing";
  msg.innerHTML = '<div class="avatar">AI</div><div class="bubble"><span></span><span></span><span></span></div>';
  messagesEl.append(msg);
  scrollToBottom();
  return msg;
}

function renderQuickReplies() {
  quickRepliesEl.innerHTML = "";
  qaList.slice(0, 6).forEach((qa) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = qa.question;
    btn.addEventListener("click", () => ask(qa.question));
    quickRepliesEl.append(btn);
  });
}

const agentChoice = {
  label: "상담원 연결",
  className: "agent",
  onClick: () => {
    addMessage("user", "상담원 연결");
    // TODO: 실제 상담원 연결(카카오톡 상담톡, 전화, 문의 폼 등)로 교체
    addMessage("bot", "상담원 연결을 요청했습니다.\n평일 09:00~18:00에 순차적으로 연락드리겠습니다.");
  },
};

function answer(item) {
  const bubble = addMessage("bot", item.answer);
  if (item.category) {
    const source = document.createElement("span");
    source.className = "source";
    source.textContent = `참고: [${item.category}] ${item.question}`;
    bubble.append(source);
  }
}

// 등록된 Q&A 안에서만 답변하고, 확신이 없으면 추천 질문이나 상담원 연결로 안내 (임의 답변 방지)
function reply(query) {
  const results = search(query);
  const top = results[0];

  if (top && top.score >= ANSWER_THRESHOLD) {
    answer(top.qa);
    return;
  }

  const candidates = results.filter((r) => r.score >= SUGGEST_THRESHOLD).slice(0, 3);
  if (candidates.length) {
    const bubble = addMessage("bot", "정확히 일치하는 답변을 찾지 못했어요.\n혹시 아래 질문 중에 있나요?");
    addChoices(bubble, [
      ...candidates.map(({ qa }) => ({ label: qa.question, onClick: () => ask(qa.question) })),
      agentChoice,
    ]);
    return;
  }

  const bubble = addMessage("bot", "죄송합니다. 등록된 답변 중에서 관련 내용을 찾지 못했어요.\n다른 표현으로 질문하시거나 상담원에게 문의해주세요.");
  addChoices(bubble, [agentChoice]);
}

function ask(text) {
  const query = text.trim();
  // 답변 중에는 Enter 연타·버튼 중복 클릭으로 같은 질문이 두 번 전송되지 않도록 막음
  if (!query || sendBtn.disabled) return;
  addMessage("user", query);
  sendBtn.disabled = true;
  const typing = showTyping();
  setTimeout(() => {
    typing.remove();
    reply(query);
    sendBtn.disabled = false;
  }, 500);
}

composer.addEventListener("submit", (e) => {
  e.preventDefault();
  ask(userInput.value);
  userInput.value = "";
  userInput.focus();
});

addMessage("bot", "안녕하세요! AI 상담봇입니다.\n궁금한 점을 입력하시거나 아래 자주 묻는 질문을 눌러주세요.");
loadDefaultQa();

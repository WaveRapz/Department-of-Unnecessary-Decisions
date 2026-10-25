// Department of Unnecessary Decisions — client-side app
// Set this to your deployed Cloudflare Worker URL after deployment.
// Do NOT put your AI provider key in this file.
const API_ENDPOINT = "https://dud-ai-backend.waveraps11.workers.dev";

const form = document.querySelector("#decision-form");
const dilemmaInput = document.querySelector("#dilemma");
const categoryInput = document.querySelector("#category");
const resultPanel = document.querySelector("#result");
const investigationPanel = document.querySelector("#investigation-panel");
const answerForm = document.querySelector("#answer-form");
const answerInput = document.querySelector("#followup-answer");
const processingMessage = document.querySelector("#processing-message");
const processingText = document.querySelector("#processing-text");
const errorMessage = document.querySelector("#error-message");
const historyKey = "dud-case-history-v2";
const MAX_CHARS = 500;
const MAX_FOLLOWUPS = 2;

let activeCase = null;
let busy = false;

const categoryNames = {
  money: "Financial irresponsibility",
  food: "Food-related emergency",
  social: "Social interaction / texting",
  sleep: "Sleep schedule violations",
  purchase: "Questionable purchases",
  other: "Other / none of your business"
};

function getCases() {
  try {
    const value = JSON.parse(localStorage.getItem(historyKey) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveCases(cases) {
  try {
    localStorage.setItem(historyKey, JSON.stringify(cases.slice(0, 8)));
  } catch (error) {
    console.warn("Case archive could not be saved in this browser.", error);
  }
}

function makeCaseNumber() {
  return String(Date.now()).slice(-6);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function setBusy(value, message = "The committee is shuffling paperwork...") {
  busy = value;
  processingMessage.hidden = !value;
  processingText.textContent = message;
  form.querySelector('button[type="submit"]').disabled = value;
  answerForm.querySelector('button[type="submit"]').disabled = value;
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

function clearError() {
  errorMessage.hidden = true;
  errorMessage.textContent = "";
}

function renderHistory() {
  const cases = getCases();
  document.querySelector("#case-count").textContent =
    `CASES FILED: ${String(cases.length).padStart(3, "0")}`;
  document.querySelector("#pending-count").textContent =
    cases.filter(item => /PENDING|INVESTIGATION/i.test(item.verdict || "")).length;

  const list = document.querySelector("#history-list");
  if (!cases.length) {
    list.innerHTML = '<p class="empty-state">No cases on record. Your questionable judgment remains undocumented.</p>';
    return;
  }

  list.innerHTML = cases.slice(0, 5).map(item => `
    <div class="history-item">
      <div>
        <strong>${escapeHTML(item.dilemma)}</strong>
        <small>CASE #${escapeHTML(item.caseNumber)} · ${escapeHTML(item.date)}</small>
      </div>
      <span class="mini-verdict">${escapeHTML(item.verdict)}</span>
    </div>
  `).join("");
}

async function callAI() {
  if (!API_ENDPOINT || API_ENDPOINT.includes("PASTE_YOUR")) {
    throw new Error("The AI endpoint has not been configured yet. Deploy the backend Worker and paste its URL into script.js.");
  }

  const response = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dilemma: activeCase.dilemma,
      category: activeCase.category,
      conversation: activeCase.conversation,
      followupCount: activeCase.followupCount
    })
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("The Bureau returned paperwork in an unreadable format. Please try again.");
  }

  if (!response.ok) {
    throw new Error(data.error || "The Bureau's servers are unavailable. Please try again shortly.");
  }
  if (!data || !["question", "verdict"].includes(data.type)) {
    throw new Error("The Bureau returned an invalid determination. Please try again.");
  }
  return data;
}

function askFollowup(question) {
  document.querySelector("#followup-question").textContent = question;
  investigationPanel.hidden = false;
  resultPanel.hidden = true;
  answerInput.value = "";
  document.querySelector("#answer-char-count").textContent = "0 / 500";
  investigationPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  answerInput.focus({ preventScroll: true });
}

function displayVerdict(data) {
  const ruling = String(data.ruling || "UNDER INVESTIGATION").toUpperCase().slice(0, 60);
  const stamp = String(data.stamp || ruling).toUpperCase().slice(0, 24);
  const title = String(data.title || ruling).slice(0, 120);
  const explanation = String(data.explanation || "The committee has declined to provide a coherent explanation.").slice(0, 1800);
  const notice = String(data.notice || "This decision is final-ish.").slice(0, 500);
  const confidence = Number.isFinite(Number(data.confidence))
    ? `${Math.max(1, Math.min(100, Math.round(Number(data.confidence))))}%`
    : "Unclear";
  const wisdom = Number.isFinite(Number(data.wisdom))
    ? `${Math.max(0, Math.min(100, Math.round(Number(data.wisdom))))}/100`
    : "Unclear";

  document.querySelector("#result-case").textContent = `CASE #${activeCase.caseNumber}`;
  document.querySelector("#result-title").textContent = title;
  document.querySelector("#result-explanation").textContent = explanation;
  document.querySelector("#result-confidence").textContent = confidence;
  document.querySelector("#result-wisdom").textContent = wisdom;
  document.querySelector("#result-stamp").textContent = stamp;
  document.querySelector("#result-stamp").classList.toggle("denied", /DENIED|REJECTED|PROHIBITED/i.test(stamp + " " + ruling));
  document.querySelector("#result-stamp").classList.toggle("pending", /PENDING|INVESTIGATION/i.test(stamp + " " + ruling));
  document.querySelector("#result-title").style.color =
    /DENIED|REJECTED|PROHIBITED/i.test(ruling) ? "var(--red)" :
    /PENDING|INVESTIGATION/i.test(ruling) ? "#8a6b14" : "var(--green)";

  const noticeBox = document.querySelector("#result-notice");
  noticeBox.textContent = notice;
  noticeBox.hidden = false;
  document.querySelector("#result-footnote").textContent = "THIS DECISION IS FINAL-ISH. APPEALS WILL BE MISPLACED.";

  activeCase.verdict = ruling;
  activeCase.finalTitle = title;
  activeCase.date = new Date().toLocaleDateString();
  activeCase.conversation = activeCase.conversation.slice(-8);
  const cases = getCases();
  cases.unshift({
    caseNumber: activeCase.caseNumber,
    dilemma: activeCase.dilemma,
    verdict: ruling,
    title,
    explanation,
    date: activeCase.date
  });
  saveCases(cases);
  renderHistory();

  investigationPanel.hidden = true;
  resultPanel.hidden = false;
  resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function continueReview() {
  clearError();
  setBusy(true, activeCase.followupCount
    ? "The committee is reviewing your additional evidence..."
    : "The committee is locating its one functioning brain cell...");
  try {
    const data = await callAI();
    if (data.type === "question" && activeCase.followupCount < MAX_FOLLOWUPS) {
      activeCase.conversation.push({ role: "assistant", content: String(data.question || "Please provide more information.").slice(0, 500) });
      askFollowup(activeCase.conversation.at(-1).content);
    } else {
      if (data.type === "question") {
        // The backend should issue a ruling after the question limit; if it doesn't, request one.
        activeCase.conversation.push({ role: "user", content: "No further clarification is available. Issue your final ruling using the information already provided." });
        activeCase.followupCount = MAX_FOLLOWUPS;
        const finalData = await callAI();
        if (finalData.type === "question") {
          throw new Error("The Bureau is refusing to conclude its investigation. Please try a new case.");
        }
        displayVerdict(finalData);
      } else {
        displayVerdict(data);
      }
    }
  } catch (error) {
    showError(error.message || "Something went wrong. Please try again.");
  } finally {
    setBusy(false);
  }
}

dilemmaInput.addEventListener("input", () => {
  document.querySelector("#char-count").textContent = `${dilemmaInput.value.length} / ${MAX_CHARS}`;
});

answerInput.addEventListener("input", () => {
  document.querySelector("#answer-char-count").textContent = `${answerInput.value.length} / ${MAX_CHARS}`;
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy) return;
  const dilemma = dilemmaInput.value.trim();
  if (!dilemma) return;
  if (dilemma.length > MAX_CHARS) {
    showError("Your application exceeds the 500-character statutory limit.");
    return;
  }

  activeCase = {
    caseNumber: makeCaseNumber(),
    dilemma,
    category: categoryInput.value,
    conversation: [],
    followupCount: 0
  };
  resultPanel.hidden = true;
  investigationPanel.hidden = true;
  clearError();
  await continueReview();
});

answerForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy || !activeCase) return;
  const answer = answerInput.value.trim();
  if (!answer) return;
  if (answer.length > MAX_CHARS) {
    showError("Your testimony exceeds the 500-character statutory limit.");
    return;
  }

  activeCase.conversation.push({ role: "user", content: answer });
  activeCase.followupCount += 1;
  investigationPanel.hidden = true;
  await continueReview();
});

document.querySelector("#new-case").addEventListener("click", () => {
  activeCase = null;
  resultPanel.hidden = true;
  investigationPanel.hidden = true;
  clearError();
  form.reset();
  dilemmaInput.value = "";
  document.querySelector("#char-count").textContent = "0 / 500";
  dilemmaInput.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

document.querySelector("#clear-history").addEventListener("click", () => {
  if (getCases().length && confirm("Are you sure? This will permanently erase the evidence from this browser.")) {
    localStorage.removeItem(historyKey);
    renderHistory();
  }
});

renderHistory();

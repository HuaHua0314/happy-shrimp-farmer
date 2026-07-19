const STORAGE_KEY = "happyShrimpFarmer.v1";
const DEFAULT_PONDS = ["\u4e00\u865f\u6c60", "\u4e8c\u865f\u6c60", "\u80b2\u82d7\u6c60"];
const STATUS = {
  fed: { label: "\u5df2\u9935\u990a" }, half: { label: "\u534a\u91cf\u9935\u990a" },
  leftover: { label: "\u6709\u5269\u6599" }, notFed: { label: "\u672a\u9935\u990a" }
};
const INSPECTION = {
  ok: { label: "\u72c0\u6cc1\u6b63\u5e38", icon: "\u2705", className: "status-ok" },
  rest: { label: "\u66ab\u505c\u5de1\u8996", icon: "\ud83d\udfe1", className: "status-rest" },
  notInspected: { label: "\u5c1a\u672a\u5de1\u8996", icon: "\ud83d\udd34", className: "status-notInspected" }
};

const todayKey = localDateKey(new Date());
let state = loadState();
let editingId = null;

const homeView = document.querySelector("#homeView");
const patrolView = document.querySelector("#patrolView");
const pondList = document.querySelector("#pondList");
const emptyState = document.querySelector("#emptyState");
const gridSelect = document.querySelector("#gridColumns");
const recordDialog = document.querySelector("#recordDialog");
const recordForm = document.querySelector("#recordForm");
const nameDialog = document.querySelector("#nameDialog");
const nameForm = document.querySelector("#nameForm");
const developmentDialog = document.querySelector("#developmentDialog");

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loadState() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (_) {}
  if (!saved || !Array.isArray(saved.ponds)) {
    saved = { ponds: DEFAULT_PONDS.map((name, index) => ({ id: Date.now() + index, name, records: {} })) };
  }
  if (!saved.firstUseDate) {
    saved.firstUseDate = todayKey;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  }
  return saved;
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function normalizeRecord(record) {
  if (!record) return null;
  const normalized = { ...record };
  if (!normalized.inspection) normalized.inspection = normalized.feeding ? "ok" : "notInspected";
  return normalized;
}

function dayNumber() {
  const first = new Date(`${state.firstUseDate}T00:00:00`);
  if (Number.isNaN(first.getTime())) return 1;
  const today = new Date(`${todayKey}T00:00:00`);
  return Math.max(1, Math.round((today - first) / 86400000) + 1);
}

function formatStatusText(record) {
  if (!record) return INSPECTION.notInspected.label;
  const details = [INSPECTION[record.inspection]?.label || INSPECTION.notInspected.label];
  if (record.feeding) details.push(STATUS[record.feeding]?.label);
  if (record.waterColor) details.push(`\u6c34\u8272\uff1a${record.waterColor}`);
  if (record.additives) details.push(`\u6dfb\u52a0\u7269\uff1a${record.additives}`);
  if (record.notes) details.push(`\u5099\u8a3b\uff1a${record.notes}`);
  return details.join(" \u00b7 ");
}

function render() {
  pondList.replaceChildren();
  pondList.style.gridTemplateColumns = `repeat(${gridSelect.value}, minmax(0, 1fr))`;
  const template = document.querySelector("#pondTemplate");
  let inspected = 0;

  state.ponds.forEach((pond) => {
    pond.records ||= {};
    const record = normalizeRecord(pond.records[todayKey]);
    const inspection = record?.inspection || "notInspected";
    const inspectionMeta = INSPECTION[inspection] || INSPECTION.notInspected;
    const card = template.content.firstElementChild.cloneNode(true);
    card.dataset.id = pond.id;
    card.classList.add(inspectionMeta.className);
    card.querySelector("h3").textContent = pond.name;
    card.querySelector(".pond-status-icon").textContent = inspectionMeta.icon;
    card.querySelector(".status-text").textContent = formatStatusText(record);
    card.querySelector(".record-time").textContent = record?.time ? `\u7d00\u9304\u6642\u9593 ${record.time}` : "";
    card.querySelector(".record-button").textContent = record ? "\u4fee\u6539\u7d00\u9304" : "\u958b\u59cb\u7d00\u9304";
    if (inspection === "ok") inspected += 1;
    pondList.append(card);
  });

  const total = state.ponds.length;
  const percent = total ? Math.round(inspected / total * 100) : 0;
  document.querySelector("#completedCount").textContent = inspected;
  document.querySelector("#totalCount").textContent = total;
  document.querySelector("#progressBar").style.width = `${percent}%`;
  document.querySelector("#progressText").textContent = `${percent}%`;
  document.querySelector(".progress-track").setAttribute("aria-valuenow", percent);
  emptyState.hidden = total > 0;
}

function showHome() { patrolView.hidden = true; homeView.hidden = false; render(); window.scrollTo(0, 0); }
function showPatrol() { homeView.hidden = true; patrolView.hidden = false; render(); window.scrollTo(0, 0); }
function showDevelopment() { developmentDialog.showModal(); }

function openRecord(id) {
  const pond = state.ponds.find((item) => String(item.id) === String(id));
  if (!pond) return;
  editingId = pond.id;
  recordForm.reset();
  document.querySelector("#dialogTitle").textContent = pond.name;
  const record = normalizeRecord(pond.records?.[todayKey]);
  if (record) {
    recordForm.elements.inspection.value = record.inspection;
    if (record.feeding) recordForm.elements.feeding.value = record.feeding;
    recordForm.elements.waterColor.value = record.waterColor || "";
    recordForm.elements.additives.value = record.additives || "";
    recordForm.elements.notes.value = record.notes || "";
  }
  recordDialog.showModal();
}

const formattedToday = new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date());
document.querySelector("#today").textContent = formattedToday;
document.querySelectorAll("[data-open-patrol]").forEach((button) => button.addEventListener("click", showPatrol));
document.querySelectorAll("[data-feature]").forEach((button) => button.addEventListener("click", showDevelopment));
document.querySelector("#backHomeButton").addEventListener("click", showHome);
document.querySelector("#addPondButton").addEventListener("click", () => nameDialog.showModal());
gridSelect.addEventListener("change", render);

pondList.addEventListener("click", (event) => {
  const card = event.target.closest(".pond-card");
  if (!card) return;
  const id = card.dataset.id;
  if (event.target.closest(".record-button")) openRecord(id);
  if (event.target.closest(".delete-button")) {
    const pond = state.ponds.find((item) => String(item.id) === id);
    if (pond && confirm(`\u78ba\u5b9a\u8981\u522a\u9664\u300c${pond.name}\u300d\u55ce\uff1f`)) {
      state.ponds = state.ponds.filter((item) => String(item.id) !== id);
      saveState(); render();
    }
  }
});

recordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const pond = state.ponds.find((item) => String(item.id) === String(editingId));
  const data = new FormData(recordForm);
  const inspection = data.get("inspection");
  if (!pond || !inspection) return;
  const record = { inspection, time: new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()) };
  const feeding = data.get("feeding");
  if (feeding) record.feeding = feeding;
  ["waterColor", "additives", "notes"].forEach((key) => { const value = data.get(key)?.trim(); if (value) record[key] = value; });
  pond.records ||= {};
  pond.records[todayKey] = record;
  saveState(); render(); recordDialog.close();
});

nameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = nameForm.elements.pondName.value.trim();
  if (!name) return;
  state.ponds.push({ id: Date.now(), name, records: {} });
  saveState(); render(); nameDialog.close(); nameForm.reset();
});

document.addEventListener("click", (event) => {
  const action = event.target.dataset.action;
  if (action === "add") nameDialog.showModal();
  if (action === "close") recordDialog.close();
  if (action === "close-name") nameDialog.close();
  if (action === "close-development") developmentDialog.close();
});

render();

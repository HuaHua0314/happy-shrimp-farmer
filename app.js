const STORAGE_KEY = "happyShrimpFarmer.v1";
const DEFAULT_PONDS = ["水尾1池", "水尾2池", "大池1"];
const STATUS = {
  fed: { label: "已餵完", icon: "✅" },
  half: { label: "吃一半", icon: "🟡" },
  leftover: { label: "沒吃完", icon: "🟠" },
  notFed: { label: "沒餵", icon: "⚪" }
};
const INSPECTION = {
  ok: { label: "已檢查", icon: "✅", className: "status-ok" },
  rest: { label: "休息中", icon: "😴", className: "status-rest" },
  notInspected: { label: "尚未檢查", icon: "⚠️", className: "status-notInspected" }
};

const todayKey = new Date().toLocaleDateString("sv-SE");
let state = loadState();
let editingId = null;

const pondList = document.querySelector("#pondList");
const emptyState = document.querySelector("#emptyState");
const gridSelect = document.querySelector("#gridColumns");
const recordDialog = document.querySelector("#recordDialog");
const recordForm = document.querySelector("#recordForm");
const nameDialog = document.querySelector("#nameDialog");
const nameForm = document.querySelector("#nameForm");

document.querySelector("#today").textContent = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric", month: "long", day: "numeric", weekday: "long"
}).format(new Date());

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.ponds?.length) return saved;
  } catch (_) {}
  return { ponds: DEFAULT_PONDS.map((name, index) => ({ id: Date.now() + index, name, records: {} })) };
}

function normalizeRecord(record) {
  if (!record) return null;
  const normalized = { ...record };
  if (!normalized.inspection) {
    normalized.inspection = normalized.feeding ? "ok" : "notInspected";
  }
  return normalized;
}

function formatStatusText(record) {
  if (!record) return INSPECTION.notInspected.label;
  const inspectionLabel = INSPECTION[record.inspection]?.label || INSPECTION.notInspected.label;
  const details = [];
  if (record.feeding) details.push(STATUS[record.feeding]?.label);
  if (record.waterColor) details.push(`水色：${record.waterColor}`);
  if (record.additives) details.push(`添加物：${record.additives}`);
  if (record.notes) details.push(`備註：${record.notes}`);
  return [inspectionLabel, ...details].join(" ・ ");
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
  pondList.replaceChildren();
  pondList.style.gridTemplateColumns = `repeat(${gridSelect.value}, minmax(0, 1fr))`;
  const template = document.querySelector("#pondTemplate");
  let completed = 0;

  state.ponds.forEach((pond) => {
    const record = normalizeRecord(pond.records[todayKey]);
    const card = template.content.firstElementChild.cloneNode(true);
    card.dataset.id = pond.id;
    const inspection = record?.inspection || "notInspected";
    card.classList.add(INSPECTION[inspection].className);
    card.querySelector("h3").textContent = pond.name;
    card.querySelector(".pond-status-icon").textContent = INSPECTION[inspection].icon;
    card.querySelector(".status-text").textContent = formatStatusText(record);
    card.querySelector(".record-time").textContent = record?.time ? `完成時間 ${record.time}` : "";
    card.querySelector(".record-button").textContent = record ? "重新編輯" : "開始紀錄";
    if (inspection === "ok") completed += 1;
    pondList.append(card);
  });

  const total = state.ponds.length;
  const percent = total ? Math.round(completed / total * 100) : 0;
  document.querySelector("#completedCount").textContent = completed;
  document.querySelector("#totalCount").textContent = total;
  document.querySelector("#progressBar").style.width = `${percent}%`;
  document.querySelector("#progressText").textContent = `${percent}%`;
  document.querySelector(".progress-track").setAttribute("aria-valuenow", percent);
  emptyState.hidden = total > 0;
}

function openRecord(id) {
  const pond = state.ponds.find((item) => item.id === id);
  if (!pond) return;
  editingId = id;
  recordForm.reset();
  document.querySelector("#dialogTitle").textContent = pond.name;
  const record = normalizeRecord(pond.records[todayKey]);
  if (record) {
    recordForm.elements.inspection.value = record.inspection;
    if (record.feeding) recordForm.elements.feeding.value = record.feeding;
    recordForm.elements.waterColor.value = record.waterColor || "";
    recordForm.elements.additives.value = record.additives || "";
    recordForm.elements.notes.value = record.notes || "";
  }
  recordDialog.showModal();
}

pondList.addEventListener("click", (event) => {
  const card = event.target.closest(".pond-card");
  if (!card) return;
  const id = Number(card.dataset.id);
  if (event.target.closest(".record-button")) openRecord(id);
  if (event.target.closest(".delete-button")) {
    const pond = state.ponds.find((item) => item.id === id);
    if (pond && confirm(`確定要刪除「${pond.name}」嗎？`)) {
      state.ponds = state.ponds.filter((item) => item.id !== id);
      saveState(); render();
    }
  }
});

recordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const pond = state.ponds.find((item) => item.id === editingId);
  const data = new FormData(recordForm);
  const inspection = data.get("inspection");
  if (!pond || !inspection) return;

  const record = {
    inspection,
    time: new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date())
  };

  const feeding = data.get("feeding");
  if (feeding) record.feeding = feeding;

  const waterColor = data.get("waterColor").trim();
  if (waterColor) record.waterColor = waterColor;

  const additives = data.get("additives").trim();
  if (additives) record.additives = additives;

  const notes = data.get("notes").trim();
  if (notes) record.notes = notes;

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

document.querySelector("#addPondButton").addEventListener("click", () => nameDialog.showModal());
gridSelect.addEventListener("change", render);
document.addEventListener("click", (event) => {
  const action = event.target.dataset.action;
  if (action === "add") nameDialog.showModal();
  if (action === "close") recordDialog.close();
  if (action === "close-name") nameDialog.close();
});

render();

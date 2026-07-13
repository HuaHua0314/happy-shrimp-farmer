const STORAGE_KEY = "happyShrimpFarmer.v1";
const DEFAULT_PONDS = ["水尾1池", "水尾2池", "大池1"];
const STATUS = {
  fed: { label: "已餵完", icon: "✅" },
  rest: { label: "今天休息", icon: "😴" },
  half: { label: "吃一半", icon: "🟡" },
  leftover: { label: "沒吃完", icon: "🟠" },
  notFed: { label: "沒餵", icon: "⚪" }
};

const todayKey = new Date().toLocaleDateString("sv-SE");
let state = loadState();
let editingId = null;

const pondList = document.querySelector("#pondList");
const emptyState = document.querySelector("#emptyState");
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

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
  pondList.replaceChildren();
  const template = document.querySelector("#pondTemplate");
  let completed = 0;

  state.ponds.forEach((pond) => {
    const record = pond.records[todayKey];
    const card = template.content.firstElementChild.cloneNode(true);
    card.dataset.id = pond.id;
    card.querySelector("h3").textContent = pond.name;
    card.querySelector(".pond-status-icon").textContent = record ? STATUS[record.feeding].icon : "○";
    card.querySelector(".status-text").textContent = record ? STATUS[record.feeding].label : "尚未完成";
    card.querySelector(".record-time").textContent = record ? `完成時間 ${record.time}${record.notes ? `・${record.notes}` : ""}` : "";
    card.querySelector(".record-button").textContent = record ? "重新編輯" : "開始紀錄";
    if (record) { card.classList.add("is-complete"); completed += 1; }
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
  const record = pond.records[todayKey];
  if (record) {
    const radio = recordForm.elements.feeding.value = record.feeding;
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
  if (!pond || !data.get("feeding")) return;
  pond.records[todayKey] = {
    feeding: data.get("feeding"),
    notes: data.get("notes").trim(),
    time: new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date())
  };
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
document.addEventListener("click", (event) => {
  const action = event.target.dataset.action;
  if (action === "add") nameDialog.showModal();
  if (action === "close") recordDialog.close();
  if (action === "close-name") nameDialog.close();
});

render();

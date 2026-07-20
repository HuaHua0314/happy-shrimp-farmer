const STORAGE_KEY = "happyShrimpFarmer.v1";
const ACCOUNT_KEY = "happyShrimpFarmer.account.v1";
const FARM_KEY = "happyShrimpFarmer.farm.v1";
const TEST_CODE = "123456";
const DEFAULT_PONDS = ["一號池", "二號池", "育苗池"];

const STATUS = {
  fed: { label: "已餵養" }, half: { label: "半量餵養" },
  leftover: { label: "有剩料" }, notFed: { label: "未餵養" }
};
const INSPECTION = {
  ok: { label: "狀況正常", icon: "✅", className: "status-ok" },
  rest: { label: "暫停巡視", icon: "🟡", className: "status-rest" },
  notInspected: { label: "尚未巡視", icon: "🔴", className: "status-notInspected" }
};

const todayKey = localDateKey(new Date());
let state = loadPatrolState();
let account = loadJson(ACCOUNT_KEY, { phone: "", isLoggedIn: false });
let farmData = normalizeFarmData(loadJson(FARM_KEY, null));
let editingId = null;
let pendingPhone = "";
let onboardingStep = 1;
let editingZoneId = null;
let draggedZoneElement = null;

const authView = document.querySelector("#authView");
const onboardingView = document.querySelector("#onboardingView");
const homeView = document.querySelector("#homeView");
const patrolView = document.querySelector("#patrolView");
const settingsView = document.querySelector("#settingsView");
const zoneManagementView = document.querySelector("#zoneManagementView");
const pondList = document.querySelector("#pondList");
const emptyState = document.querySelector("#emptyState");
const gridSelect = document.querySelector("#gridColumns");
const recordDialog = document.querySelector("#recordDialog");
const recordForm = document.querySelector("#recordForm");
const nameDialog = document.querySelector("#nameDialog");
const nameForm = document.querySelector("#nameForm");
const developmentDialog = document.querySelector("#developmentDialog");
const zoneEditorDialog = document.querySelector("#zoneEditorDialog");
const zoneEditorForm = document.querySelector("#zoneEditorForm");

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loadJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch (_) {
    return fallback;
  }
}

function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function loadPatrolState() {
  let saved = loadJson(STORAGE_KEY, null);
  if (!saved || !Array.isArray(saved.ponds)) {
    saved = { ponds: DEFAULT_PONDS.map((name, index) => ({ id: Date.now() + index, name, records: {} })) };
  }
  if (!saved.firstUseDate) {
    saved.firstUseDate = todayKey;
    saveJson(STORAGE_KEY, saved);
  }
  return saved;
}

function normalizeFarmData(saved) {
  const zones = Array.isArray(saved?.zones) ? saved.zones.map((zone, index) => ({ ...zone, order: Number.isFinite(zone.order) ? zone.order : index })) : [];
  zones.sort((a, b) => a.order - b.order);
  zones.forEach((zone, index) => { zone.order = index; });
  return {
    farm: saved?.farm || null,
    zones,
    ponds: Array.isArray(saved?.ponds) ? saved.ponds.map((pond) => ({ ...pond, status: pond.status || "active" })) : [],
    onboardingCompleted: saved?.onboardingCompleted === true
  };
}

function savePatrolState() { saveJson(STORAGE_KEY, state); }
function saveAccount() { saveJson(ACCOUNT_KEY, account); }
function saveFarmData() { saveJson(FARM_KEY, farmData); }
function createId(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }
function cleanName(value) { return String(value || "").trim().replace(/\s+/g, " "); }
function sameName(a, b) { return cleanName(a).toLocaleLowerCase("zh-Hant") === cleanName(b).toLocaleLowerCase("zh-Hant"); }

function dayNumber() {
  const first = new Date(`${state.firstUseDate || todayKey}T00:00:00`);
  const today = new Date(`${todayKey}T00:00:00`);
  if (Number.isNaN(first.getTime())) return 1;
  return Math.max(1, Math.round((today - first) / 86400000) + 1);
}

function updateHomeView() { document.querySelector("#homeDay").textContent = dayNumber(); }

function syncFarmPondsToPatrol() {
  state.ponds ||= [];
  farmData.ponds.forEach((farmPond) => {
    let patrolPond = state.ponds.find((pond) => pond.farmPondId === farmPond.id);
    if (!patrolPond) {
      patrolPond = state.ponds.find((pond) => !pond.farmPondId && sameName(pond.name, farmPond.name));
    }
    if (patrolPond) {
      patrolPond.farmPondId = farmPond.id;
      patrolPond.name = farmPond.name;
      patrolPond.isActive = farmPond.status !== "rest";
      patrolPond.records ||= {};
    } else {
      state.ponds.push({ id: Date.now() + Math.random(), farmPondId: farmPond.id, name: farmPond.name, isActive: farmPond.status !== "rest", records: {} });
    }
  });
  savePatrolState();
}

function hideAppViews() {
  [authView, onboardingView, homeView, patrolView, settingsView, zoneManagementView].forEach((view) => { view.hidden = true; });
}

function routeApp() {
  hideAppViews();
  if (!account.isLoggedIn || !/^09\d{8}$/.test(account.phone || "")) {
    authView.hidden = false;
    showPhoneStep();
    return;
  }
  if (!farmData.onboardingCompleted) {
    onboardingView.hidden = false;
    showOnboardingStep(farmData.farm ? (farmData.zones.length ? 3 : 2) : 1);
    return;
  }
  syncFarmPondsToPatrol();
  homeView.hidden = false;
  updateHomeView();
  render();
}

function showPhoneStep() {
  document.querySelector("#phoneStep").hidden = false;
  document.querySelector("#codeStep").hidden = true;
  document.querySelector("#phoneError").textContent = "";
  document.querySelector("#codeError").textContent = "";
  document.querySelector("#loginPhone").value = account.phone || "";
}

function showCodeStep() {
  document.querySelector("#phoneStep").hidden = true;
  document.querySelector("#codeStep").hidden = false;
  document.querySelector("#phonePreview").textContent = `驗證手機號碼：${pendingPhone}`;
  document.querySelector("#loginCode").value = "";
  document.querySelector("#loginCode").focus();
}

function showOnboardingStep(step) {
  onboardingStep = Math.max(1, Math.min(3, step));
  document.querySelectorAll(".onboarding-step").forEach((panel) => { panel.hidden = Number(panel.dataset.step) !== onboardingStep; });
  [1, 2, 3].forEach((number) => document.querySelector(`#stepDot${number}`).classList.toggle("active", number <= onboardingStep));
  if (farmData.farm) document.querySelector("#farmName").value = farmData.farm.name;
  renderOnboardingLists();
}

function renderOnboardingLists() {
  const zoneList = document.querySelector("#onboardingZoneList");
  zoneList.replaceChildren(...farmData.zones.map((zone) => setupItem(zone.name)));
  const pondListElement = document.querySelector("#onboardingPondList");
  pondListElement.replaceChildren(...farmData.ponds.map((pond) => {
    const zone = farmData.zones.find((item) => item.id === pond.zoneId);
    return setupItem(pond.name, zone?.name || "未指定區域");
  }));
  fillZoneSelect(document.querySelector("#pondZone"));
}

function setupItem(name, detail = "") {
  const item = document.createElement("div");
  item.className = "setup-item";
  const title = document.createElement("span");
  title.textContent = name;
  item.append(title);
  if (detail) {
    const small = document.createElement("small");
    small.textContent = detail;
    item.append(small);
  }
  return item;
}

function fillZoneSelect(select, selected = "") {
  select.replaceChildren();
  farmData.zones.forEach((zone) => {
    const option = document.createElement("option");
    option.value = zone.id;
    option.textContent = zone.name;
    option.selected = zone.id === selected;
    select.append(option);
  });
}

function addZone(name, errorElement) {
  const cleaned = cleanName(name);
  if (!cleaned) { errorElement.textContent = "請輸入區域名稱。"; return false; }
  if (farmData.zones.some((zone) => sameName(zone.name, cleaned))) { errorElement.textContent = "這個區域名稱已經使用過了。"; return false; }
  farmData.zones.push({ id: createId("zone"), name: cleaned, order: farmData.zones.length });
  errorElement.textContent = "";
  saveFarmData();
  return true;
}

function addFarmPond(zoneId, name, errorElement) {
  const cleaned = cleanName(name);
  if (!farmData.zones.some((zone) => zone.id === zoneId)) { errorElement.textContent = "請先選擇所屬區域。"; return false; }
  if (!cleaned) { errorElement.textContent = "請輸入池子名稱。"; return false; }
  if (farmData.ponds.some((pond) => sameName(pond.name, cleaned))) { errorElement.textContent = "這個池子名稱已經使用過了。"; return false; }
  farmData.ponds.push({ id: createId("pond"), name: cleaned, zoneId, status: "active" });
  errorElement.textContent = "";
  saveFarmData();
  syncFarmPondsToPatrol();
  return true;
}

function normalizeRecord(record) {
  if (!record) return null;
  const normalized = { ...record };
  if (!normalized.inspection) normalized.inspection = normalized.feeding ? "ok" : "notInspected";
  return normalized;
}

function formatStatusText(record, pond) {
  if (pond?.isActive === false) return "休息中";
  if (!record) return INSPECTION.notInspected.label;
  const details = [INSPECTION[record.inspection]?.label || INSPECTION.notInspected.label];
  if (record.feeding) details.push(STATUS[record.feeding]?.label);
  if (record.waterColor) details.push(`水色：${record.waterColor}`);
  if (record.additives) details.push(`添加物：${record.additives}`);
  if (record.notes) details.push(`備註：${record.notes}`);
  return details.join(" · ");
}

function render() {
  pondList.replaceChildren();
  pondList.style.gridTemplateColumns = `repeat(${gridSelect.value}, minmax(0, 1fr))`;
  const template = document.querySelector("#pondTemplate");
  let inspected = 0;
  state.ponds.forEach((pond) => {
    pond.records ||= {};
    const record = normalizeRecord(pond.records[todayKey]);
    const inspection = pond.isActive === false ? "rest" : (record?.inspection || "notInspected");
    const inspectionMeta = INSPECTION[inspection] || INSPECTION.notInspected;
    const card = template.content.firstElementChild.cloneNode(true);
    card.dataset.id = pond.id;
    card.classList.add(inspectionMeta.className);
    card.querySelector("h3").textContent = pond.name;
    card.querySelector(".pond-status-icon").textContent = inspectionMeta.icon;
    card.querySelector(".status-text").textContent = formatStatusText(record, pond);
    card.querySelector(".record-time").textContent = record?.time ? `紀錄時間 ${record.time}` : "";
    card.querySelector(".record-button").textContent = record ? "修改紀錄" : "開始紀錄";
    card.querySelector(".record-button").disabled = pond.isActive === false;
    card.querySelector(".delete-button").hidden = Boolean(pond.farmPondId);
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

function showHome() { hideAppViews(); homeView.hidden = false; updateHomeView(); render(); window.scrollTo(0, 0); }
function showPatrol() { hideAppViews(); patrolView.hidden = false; render(); window.scrollTo(0, 0); }
function showDevelopment() { developmentDialog.showModal(); }

function showSettings() {
  hideAppViews();
  settingsView.hidden = false;
  document.querySelector("#settingsPhone").textContent = account.phone;
  document.querySelector("#settingsFarmName").value = farmData.farm?.name || "";
  renderSettings();
  window.scrollTo(0, 0);
}

function showZoneManagement() {
  hideAppViews();
  zoneManagementView.hidden = false;
  saveFarmData();
  renderZoneManagement();
  window.scrollTo(0, 0);
}

function renderZoneManagement() {
  farmData.zones.sort((a, b) => a.order - b.order);
  const list = document.querySelector("#zoneManagementList");
  list.replaceChildren(...farmData.zones.map((zone, index) => zoneSortItem(zone, index)));
  document.querySelector("#zoneEmptyState").hidden = farmData.zones.length > 0;
}

function zoneSortItem(zone, index) {
  const item = document.createElement("article");
  item.className = "zone-sort-item";
  item.dataset.zoneId = zone.id;
  item.draggable = true;
  const handle = document.createElement("button");
  handle.className = "zone-drag-handle";
  handle.type = "button";
  handle.setAttribute("aria-label", "拖曳排序");
  handle.textContent = "☰";
  const name = document.createElement("span");
  name.className = "zone-name";
  name.textContent = zone.name;
  const edit = document.createElement("button");
  edit.className = "zone-edit-button";
  edit.type = "button";
  edit.setAttribute("aria-label", `修改${zone.name}`);
  edit.textContent = "✏️";
  edit.addEventListener("click", () => openZoneEditor(zone.id));
  item.append(handle, name, edit);
  return item;
}

function openZoneEditor(zoneId = null) {
  editingZoneId = zoneId;
  const zone = farmData.zones.find((item) => item.id === zoneId);
  document.querySelector("#zoneEditorTitle").textContent = zone ? "修改區域" : "新增區域";
  document.querySelector("#zoneEditorSubmit").textContent = zone ? "儲存" : "新增";
  document.querySelector("#zoneEditorName").value = zone?.name || "";
  document.querySelector("#zoneEditorError").textContent = "";
  zoneEditorDialog.showModal();
  document.querySelector("#zoneEditorName").focus();
}

function persistZoneOrder() {
  const ids = [...document.querySelectorAll("#zoneManagementList [data-zone-id]")].map((item) => item.dataset.zoneId);
  farmData.zones.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  farmData.zones.forEach((zone, index) => { zone.order = index; });
  saveFarmData();
  renderZoneManagement();
}

function renderSettings() {
  fillZoneSelect(document.querySelector("#settingsPondZone"));
  const pondListElement = document.querySelector("#settingsPondList");
  pondListElement.replaceChildren(...farmData.ponds.map((pond) => managePondItem(pond)));
}

function managePondItem(pond) {
  const row = document.createElement("div");
  row.className = "manage-item pond-manage-item";
  row.dataset.pondId = pond.id;
  row.innerHTML = `<input class="flow-input" aria-label="池子名稱" maxlength="30"><select class="flow-input" aria-label="池子狀態"><option value="active">使用中</option><option value="rest">休息</option></select><button class="button button-secondary" type="button" data-action="save-pond">儲存</button>`;
  row.querySelector("input").value = pond.name;
  row.querySelector("select").value = pond.status || "active";
  return row;
}

function openRecord(id) {
  const pond = state.ponds.find((item) => String(item.id) === String(id));
  if (!pond || pond.isActive === false) return;
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

document.querySelector("#phoneForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const phone = event.currentTarget.elements.phone.value.replace(/\s/g, "");
  if (!/^09\d{8}$/.test(phone)) {
    document.querySelector("#phoneError").textContent = "請輸入 09 開頭的 10 碼手機號碼。";
    return;
  }
  pendingPhone = phone;
  document.querySelector("#phoneError").textContent = "";
  showCodeStep();
});

document.querySelector("#codeForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.currentTarget.elements.code.value.trim() !== TEST_CODE) {
    document.querySelector("#codeError").textContent = "驗證碼不正確，測試期間請輸入 123456。";
    return;
  }
  account = { phone: pendingPhone, isLoggedIn: true };
  saveAccount();
  routeApp();
});

document.querySelector("#farmForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = cleanName(event.currentTarget.elements.farmName.value);
  if (!name) { document.querySelector("#farmError").textContent = "請輸入農場名稱。"; return; }
  farmData.farm = { id: farmData.farm?.id || createId("farm"), name };
  document.querySelector("#farmError").textContent = "";
  saveFarmData();
  showOnboardingStep(2);
});

document.querySelector("#zoneForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (addZone(event.currentTarget.elements.zoneName.value, document.querySelector("#zoneError"))) {
    event.currentTarget.reset(); renderOnboardingLists();
  }
});

document.querySelector("#pondSetupForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (addFarmPond(event.currentTarget.elements.zoneId.value, event.currentTarget.elements.pondName.value, document.querySelector("#pondSetupError"))) {
    event.currentTarget.elements.pondName.value = ""; renderOnboardingLists();
  }
});

document.querySelector("#settingsFarmForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = cleanName(event.currentTarget.elements.farmName.value);
  if (!name) { document.querySelector("#settingsFarmError").textContent = "請輸入農場名稱。"; return; }
  farmData.farm = { id: farmData.farm?.id || createId("farm"), name };
  document.querySelector("#settingsFarmError").textContent = "";
  saveFarmData();
});

document.querySelector("#settingsPondForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const zoneId = document.querySelector("#settingsPondZone").value;
  const input = document.querySelector("#settingsPondName");
  if (addFarmPond(zoneId, input.value, document.querySelector("#settingsPondError"))) { input.value = ""; renderSettings(); }
});

zoneEditorForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = cleanName(event.currentTarget.elements.zoneName.value);
  const error = document.querySelector("#zoneEditorError");
  if (!name) { error.textContent = "請輸入區域名稱。"; return; }
  if (farmData.zones.some((zone) => zone.id !== editingZoneId && sameName(zone.name, name))) {
    error.textContent = "這個區域名稱已經使用過了。";
    return;
  }
  const zone = farmData.zones.find((item) => item.id === editingZoneId);
  if (zone) zone.name = name;
  else farmData.zones.push({ id: createId("zone"), name, order: farmData.zones.length });
  farmData.zones.forEach((item, index) => { item.order = index; });
  error.textContent = "";
  saveFarmData();
  zoneEditorDialog.close();
  renderZoneManagement();
});

document.querySelector("#addZoneFab").addEventListener("click", () => openZoneEditor());

const zoneManagementList = document.querySelector("#zoneManagementList");
zoneManagementList.addEventListener("dragstart", (event) => {
  draggedZoneElement = event.target.closest(".zone-sort-item");
  if (!draggedZoneElement) return;
  draggedZoneElement.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
});
zoneManagementList.addEventListener("dragover", (event) => {
  if (!draggedZoneElement) return;
  event.preventDefault();
  const target = event.target.closest(".zone-sort-item");
  if (!target || target === draggedZoneElement) return;
  const after = event.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2;
  zoneManagementList.insertBefore(draggedZoneElement, after ? target.nextSibling : target);
});
zoneManagementList.addEventListener("drop", (event) => {
  event.preventDefault();
  if (!draggedZoneElement) return;
  draggedZoneElement.classList.remove("dragging");
  persistZoneOrder();
  draggedZoneElement = null;
});
zoneManagementList.addEventListener("dragend", () => {
  draggedZoneElement?.classList.remove("dragging");
  draggedZoneElement = null;
});
zoneManagementList.addEventListener("pointerdown", (event) => {
  const handle = event.target.closest(".zone-drag-handle");
  if (!handle || event.pointerType === "mouse") return;
  draggedZoneElement = handle.closest(".zone-sort-item");
  draggedZoneElement.classList.add("dragging");
  handle.setPointerCapture(event.pointerId);
  event.preventDefault();
});
zoneManagementList.addEventListener("pointermove", (event) => {
  if (!draggedZoneElement || event.pointerType === "mouse") return;
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".zone-sort-item");
  if (!target || target === draggedZoneElement) return;
  const after = event.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2;
  zoneManagementList.insertBefore(draggedZoneElement, after ? target.nextSibling : target);
});
zoneManagementList.addEventListener("pointerup", (event) => {
  if (!draggedZoneElement || event.pointerType === "mouse") return;
  draggedZoneElement.classList.remove("dragging");
  draggedZoneElement = null;
  persistZoneOrder();
});
zoneManagementList.addEventListener("pointercancel", () => {
  draggedZoneElement?.classList.remove("dragging");
  draggedZoneElement = null;
  renderZoneManagement();
});

document.querySelector("#logoutButton").addEventListener("click", () => {
  account = { phone: account.phone || "", isLoggedIn: false };
  saveAccount();
  hideAppViews();
  authView.hidden = false;
  document.querySelector("#phoneForm").reset();
  document.querySelector("#codeForm").reset();
  showPhoneStep();
});

document.querySelectorAll("[data-feature]").forEach((button) => button.addEventListener("click", () => {
  const feature = button.dataset.feature;
  if (feature === "patrol") showPatrol();
  else if (feature === "settings" || feature === "profile") showZoneManagement();
  else showDevelopment();
}));
document.querySelectorAll("[data-home]").forEach((button) => button.addEventListener("click", showHome));
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
    if (pond && confirm(`確定要刪除「${pond.name}」嗎？`)) {
      state.ponds = state.ponds.filter((item) => String(item.id) !== id);
      savePatrolState(); render();
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
  savePatrolState(); render(); recordDialog.close();
});

nameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = cleanName(nameForm.elements.pondName.value);
  if (!name || state.ponds.some((pond) => sameName(pond.name, name))) return;
  state.ponds.push({ id: Date.now(), name, records: {} });
  savePatrolState(); render(); nameDialog.close(); nameForm.reset();
});

document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  if (action === "back-phone") showPhoneStep();
  if (action === "open-full-settings") showSettings();
  if (action === "open-zone-management") showZoneManagement();
  if (action === "skip-onboarding") {
    farmData.onboardingCompleted = true;
    saveFarmData();
    showHome();
  }
  if (action === "onboarding-back") showOnboardingStep(onboardingStep - 1);
  if (action === "zones-next") {
    if (!farmData.zones.length) document.querySelector("#zoneError").textContent = "請至少建立一個區域。";
    else showOnboardingStep(3);
  }
  if (action === "finish-onboarding") {
    if (!farmData.ponds.length) document.querySelector("#pondSetupError").textContent = "請至少建立一個池子。";
    else { farmData.onboardingCompleted = true; saveFarmData(); syncFarmPondsToPatrol(); showHome(); }
  }
  if (action === "save-pond") {
    const row = event.target.closest("[data-pond-id]");
    const pond = farmData.ponds.find((item) => item.id === row?.dataset.pondId);
    const name = cleanName(row?.querySelector("input").value);
    if (!pond || !name || farmData.ponds.some((item) => item.id !== pond.id && sameName(item.name, name))) {
      document.querySelector("#settingsPondError").textContent = !name ? "池子名稱不可空白。" : "池子名稱不可重複。";
    } else { pond.name = name; pond.status = row.querySelector("select").value; document.querySelector("#settingsPondError").textContent = ""; saveFarmData(); syncFarmPondsToPatrol(); renderSettings(); }
  }
  if (action === "add") nameDialog.showModal();
  if (action === "close") recordDialog.close();
  if (action === "close-name") nameDialog.close();
  if (action === "close-development") developmentDialog.close();
  if (action === "close-zone-editor") zoneEditorDialog.close();
});

document.querySelector("#today").textContent = new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date());
routeApp();

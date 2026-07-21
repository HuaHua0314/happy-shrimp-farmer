const STORAGE_KEY = "happyShrimpFarmer.v1";
const ACCOUNT_KEY = "happyShrimpFarmer.account.v1";
const FARM_KEY = "happyShrimpFarmer.farm.v1";
const FEEDING_KEY = "happyShrimpFarmer.feeding.v1";
const SHRIMP_PATROL_KEY = "happyShrimpFarmer.shrimpPatrol.v1";
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
let feedingData = loadJson(FEEDING_KEY, { records: [] });
if (!Array.isArray(feedingData.records)) feedingData = { records: [] };
let shrimpPatrolData = loadJson(SHRIMP_PATROL_KEY, { records: [] });
if (!Array.isArray(shrimpPatrolData.records)) shrimpPatrolData = { records: [] };
let editingId = null;
let pendingPhone = "";
let onboardingStep = 1;
let editingZoneId = null;
let draggedZoneElement = null;
let currentPondZoneId = null;
let editingFarmPondId = null;
let draggedPondElement = null;
let currentFeedingZoneId = null;
let currentFeedingPondId = null;
let currentShrimpPatrolZoneId = null;
let currentShrimpPatrolPondId = null;

const authView = document.querySelector("#authView");
const onboardingView = document.querySelector("#onboardingView");
const homeView = document.querySelector("#homeView");
const patrolView = document.querySelector("#patrolView");
const settingsView = document.querySelector("#settingsView");
const zoneManagementView = document.querySelector("#zoneManagementView");
const pondManagementView = document.querySelector("#pondManagementView");
const pondZoneDetailView = document.querySelector("#pondZoneDetailView");
const feedingZoneView = document.querySelector("#feedingZoneView");
const feedingPondView = document.querySelector("#feedingPondView");
const feedingRecordView = document.querySelector("#feedingRecordView");
const shrimpPatrolZoneView = document.querySelector("#shrimpPatrolZoneView");
const shrimpPatrolPondView = document.querySelector("#shrimpPatrolPondView");
const shrimpPatrolRecordView = document.querySelector("#shrimpPatrolRecordView");
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
const farmEditorDialog = document.querySelector("#farmEditorDialog");
const pondEditorDialog = document.querySelector("#pondEditorDialog");
const pondEditorForm = document.querySelector("#pondEditorForm");
const feedingRecordForm = document.querySelector("#feedingRecordForm");
const shrimpPatrolRecordForm = document.querySelector("#shrimpPatrolRecordForm");

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
    ponds: Array.isArray(saved?.ponds) ? saved.ponds.map((pond, index) => ({ ...pond, status: pond.status || "active", order: Number.isFinite(pond.order) ? pond.order : index })) : [],
    onboardingCompleted: saved?.onboardingCompleted === true
  };
}

function savePatrolState() { saveJson(STORAGE_KEY, state); }
function saveAccount() { saveJson(ACCOUNT_KEY, account); }
function saveFarmData() { saveJson(FARM_KEY, farmData); }
function saveFeedingData() { saveJson(FEEDING_KEY, feedingData); }
function saveShrimpPatrolData() { saveJson(SHRIMP_PATROL_KEY, shrimpPatrolData); }
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
  [authView, onboardingView, homeView, patrolView, settingsView, zoneManagementView, pondManagementView, pondZoneDetailView, feedingZoneView, feedingPondView, feedingRecordView, shrimpPatrolZoneView, shrimpPatrolPondView, shrimpPatrolRecordView].forEach((view) => { view.hidden = true; });
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
  const order = farmData.ponds.filter((pond) => pond.zoneId === zoneId).length;
  farmData.ponds.push({ id: createId("pond"), name: cleaned, zoneId, status: "active", order });
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

function showShrimpPatrolZones() {
  hideAppViews();
  shrimpPatrolZoneView.hidden = false;
  const zones = [...farmData.zones].sort((a, b) => a.order - b.order);
  const list = document.querySelector("#shrimpPatrolZoneList");
  list.replaceChildren(...zones.map((zone) => shrimpPatrolZoneItem(zone)));
  document.querySelector("#shrimpPatrolZoneEmptyState").hidden = zones.length > 0;
  window.scrollTo(0, 0);
}

function shrimpPatrolZoneItem(zone) {
  const button = document.createElement("button");
  button.className = "settings-menu-item";
  button.type = "button";
  const pondCount = farmData.ponds.filter((pond) => pond.zoneId === zone.id).length;
  button.innerHTML = `<span><strong></strong><small>${pondCount} 個池子</small></span><b aria-hidden="true">›</b>`;
  button.querySelector("strong").textContent = zone.name;
  button.addEventListener("click", () => showShrimpPatrolPonds(zone.id));
  return button;
}

function shrimpPatrolCompletedToday(pondId) {
  return shrimpPatrolData.records.some((record) => record.pondId === pondId && record.date === todayKey);
}

function showShrimpPatrolPonds(zoneId) {
  const zone = farmData.zones.find((item) => item.id === zoneId);
  if (!zone) { showShrimpPatrolZones(); return; }
  currentShrimpPatrolZoneId = zoneId;
  hideAppViews();
  shrimpPatrolPondView.hidden = false;
  document.querySelector("#shrimpPatrolZoneTitle").textContent = zone.name;
  renderShrimpPatrolPonds();
  window.scrollTo(0, 0);
}

function renderShrimpPatrolPonds() {
  const ponds = farmData.ponds.filter((pond) => pond.zoneId === currentShrimpPatrolZoneId).sort((a, b) => a.order - b.order);
  const completedCount = ponds.filter((pond) => shrimpPatrolCompletedToday(pond.id)).length;
  const list = document.querySelector("#shrimpPatrolPondList");
  list.replaceChildren(...ponds.map((pond) => shrimpPatrolPondItem(pond)));
  document.querySelector("#shrimpPatrolPondEmptyState").hidden = ponds.length > 0;
  document.querySelector("#shrimpPatrolProgressText").textContent = `已完成：${completedCount} / ${ponds.length}`;
  document.querySelector("#shrimpPatrolAllComplete").hidden = ponds.length === 0 || completedCount !== ponds.length;
}

function shrimpPatrolPondItem(pond) {
  const completed = shrimpPatrolCompletedToday(pond.id);
  const button = document.createElement("button");
  button.className = `feeding-pond-item${completed ? " completed" : ""}`;
  button.type = "button";
  button.setAttribute("role", "listitem");
  button.setAttribute("aria-label", `${pond.name}，今天${completed ? "已完成" : "尚未完成"}巡蝦`);
  const name = document.createElement("strong");
  if (completed) {
    const check = document.createElement("span");
    check.className = "feeding-completed-check";
    check.textContent = "✓";
    name.append(check, ` ${pond.name}`);
  } else {
    name.textContent = pond.name;
  }
  button.append(name);
  button.addEventListener("click", () => showShrimpPatrolRecord(pond.id));
  return button;
}

function setPatrolRadioValue(form, name, value) {
  if (value) form.elements[name].value = value;
}

function showShrimpPatrolRecord(pondId) {
  const pond = farmData.ponds.find((item) => item.id === pondId && item.zoneId === currentShrimpPatrolZoneId);
  if (!pond) { showShrimpPatrolPonds(currentShrimpPatrolZoneId); return; }
  currentShrimpPatrolPondId = pondId;
  hideAppViews();
  shrimpPatrolRecordView.hidden = false;
  shrimpPatrolRecordForm.reset();
  document.querySelector("#shrimpPatrolPondTitle").textContent = pond.name;
  document.querySelector("#shrimpPatrolDate").textContent = "今天";
  document.querySelector("#shrimpPatrolTime").textContent = new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  document.querySelector("#shrimpPatrolRecordError").textContent = "";
  const photoStatus = document.querySelector("#shrimpPatrolPhotoStatus");
  const existing = shrimpPatrolData.records.find((record) => record.pondId === pondId && record.date === todayKey);
  photoStatus.textContent = existing?.waterPhoto ? "已保留今天的水色照片" : "沒有選擇照片";
  if (existing) {
    setPatrolRadioValue(shrimpPatrolRecordForm, "overall", existing.overall);
    setPatrolRadioValue(shrimpPatrolRecordForm, "waterColor", existing.waterColor);
    setPatrolRadioValue(shrimpPatrolRecordForm, "waterwheel", existing.waterwheel);
    setPatrolRadioValue(shrimpPatrolRecordForm, "drainage", existing.drainage);
    const conditions = Array.isArray(existing.shrimpConditions) ? existing.shrimpConditions : [];
    shrimpPatrolRecordForm.querySelectorAll('[name="shrimpCondition"]').forEach((input) => { input.checked = conditions.includes(input.value); });
    shrimpPatrolRecordForm.elements.notes.value = existing.notes || "";
  }
  window.scrollTo(0, 0);
}

function patrolPhotoDataUrl(file) {
  if (!file) return Promise.resolve("");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("無法讀取照片"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("照片格式無法使用"));
      image.onload = () => {
        const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function shrimpPatrolHasAbnormal(record) {
  return record.overall === "abnormal"
    || Boolean(record.waterColor && record.waterColor !== "normal")
    || record.waterwheel === "abnormal"
    || record.drainage === "abnormal"
    || record.shrimpConditions.some((value) => value !== "normal");
}

function showFeedingZones() {
  hideAppViews();
  feedingZoneView.hidden = false;
  const list = document.querySelector("#feedingZoneList");
  const zones = [...farmData.zones].sort((a, b) => a.order - b.order);
  list.replaceChildren(...zones.map((zone) => feedingZoneItem(zone)));
  document.querySelector("#feedingZoneEmptyState").hidden = zones.length > 0;
  window.scrollTo(0, 0);
}

function feedingZoneItem(zone) {
  const button = document.createElement("button");
  button.className = "settings-menu-item";
  button.type = "button";
  const pondCount = farmData.ponds.filter((pond) => pond.zoneId === zone.id).length;
  button.innerHTML = `<span><strong></strong><small>${pondCount} 個池子</small></span><b aria-hidden="true">›</b>`;
  button.querySelector("strong").textContent = zone.name;
  button.addEventListener("click", () => showFeedingPonds(zone.id));
  return button;
}

function showFeedingPonds(zoneId) {
  const zone = farmData.zones.find((item) => item.id === zoneId);
  if (!zone) { showFeedingZones(); return; }
  currentFeedingZoneId = zoneId;
  hideAppViews();
  feedingPondView.hidden = false;
  document.querySelector("#feedingZoneTitle").textContent = zone.name;
  renderFeedingPonds();
  window.scrollTo(0, 0);
}

function renderFeedingPonds() {
  const ponds = farmData.ponds.filter((pond) => pond.zoneId === currentFeedingZoneId).sort((a, b) => a.order - b.order);
  const completedCount = ponds.filter((pond) => feedingCompletedToday(pond.id)).length;
  const list = document.querySelector("#feedingPondList");
  list.replaceChildren(...ponds.map((pond) => feedingPondItem(pond)));
  document.querySelector("#feedingPondEmptyState").hidden = ponds.length > 0;
  document.querySelector("#feedingProgressText").textContent = `已完成：${completedCount} / ${ponds.length}`;
  document.querySelector("#feedingAllComplete").hidden = ponds.length === 0 || completedCount !== ponds.length;
}

function feedingCompletedToday(pondId) {
  return feedingData.records.some((record) => record.pondId === pondId && record.date === todayKey);
}

function feedingPondItem(pond) {
  const completed = feedingCompletedToday(pond.id);
  const item = document.createElement("button");
  item.className = `feeding-pond-item${completed ? " completed" : ""}`;
  item.type = "button";
  item.setAttribute("role", "listitem");
  item.setAttribute("aria-label", `${pond.name}，今天${completed ? "已完成" : "尚未完成"}餵蝦`);
  const name = document.createElement("strong");
  if (completed) {
    const check = document.createElement("span");
    check.className = "feeding-completed-check";
    check.textContent = "✓";
    name.append(check, ` ${pond.name}`);
  } else {
    name.textContent = pond.name;
  }
  item.append(name);
  item.addEventListener("click", () => showFeedingRecord(pond.id));
  return item;
}

function feedingRecordTimestamp(record) {
  const fallback = `${record.date || ""}T${record.time || "00:00"}`;
  const value = Date.parse(record.updatedAt || fallback);
  return Number.isNaN(value) ? 0 : value;
}

function latestFeedingRecord(pondId, excludedRecordId = "") {
  return feedingData.records
    .filter((record) => record.pondId === pondId && record.id !== excludedRecordId)
    .sort((a, b) => feedingRecordTimestamp(b) - feedingRecordTimestamp(a))[0] || null;
}

function feedingDateLabel(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  const today = new Date(`${todayKey}T00:00:00`);
  const days = Math.round((today - date) / 86400000);
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  return new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric" }).format(date);
}

function renderPreviousFeedingRecord(pondId, currentRecord) {
  const previous = latestFeedingRecord(pondId, currentRecord?.id);
  const empty = document.querySelector("#previousFeedingEmpty");
  const details = document.querySelector("#previousFeedingDetails");
  empty.hidden = Boolean(previous);
  details.hidden = !previous;
  if (!previous) return;
  document.querySelector("#previousFeedingDate").textContent = feedingDateLabel(previous.date);
  document.querySelector("#previousFeedingTime").textContent = previous.time || "";
  document.querySelector("#previousFeedingKilograms").textContent = previous.kilograms == null ? "未填公斤數" : `${previous.kilograms} 公斤`;
  document.querySelector("#previousFeedingStatus").textContent = previous.previousMeal === "finished" ? "✅ 吃完" : "○ 沒吃完";
}

function showFeedingRecord(pondId) {
  const pond = farmData.ponds.find((item) => item.id === pondId && item.zoneId === currentFeedingZoneId);
  if (!pond) { showFeedingPonds(currentFeedingZoneId); return; }
  currentFeedingPondId = pondId;
  hideAppViews();
  feedingRecordView.hidden = false;
  document.querySelector("#feedingPondTitle").textContent = pond.name;
  document.querySelector("#feedingDate").textContent = "今天";
  document.querySelector("#feedingTime").textContent = new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  feedingRecordForm.reset();
  document.querySelector("#feedingRecordError").textContent = "";
  const existing = feedingData.records.find((record) => record.pondId === pondId && record.date === todayKey);
  const latest = latestFeedingRecord(pondId);
  renderPreviousFeedingRecord(pondId, existing);
  if (latest) {
    feedingRecordForm.elements.brand.value = latest.brand || "";
    feedingRecordForm.elements.feedNumber.value = latest.feedNumber || "";
  }
  window.scrollTo(0, 0);
}

function showSettings() {
  hideAppViews();
  settingsView.hidden = false;
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
  document.querySelector("#settingsFarmSummary").textContent = farmData.farm?.name || "尚未設定";
  document.querySelector("#settingsZoneSummary").textContent = `${farmData.zones.length} 個區域`;
  document.querySelector("#settingsPondSummary").textContent = `${farmData.ponds.length} 個池子`;
}

function showPondManagement() {
  hideAppViews();
  pondManagementView.hidden = false;
  renderPondManagement();
  window.scrollTo(0, 0);
}

function renderPondManagement() {
  const list = document.querySelector("#pondZoneList");
  list.replaceChildren(...farmData.zones.map((zone) => pondZoneItem(zone)));
  document.querySelector("#pondZoneEmptyState").hidden = farmData.zones.length > 0;
}

function pondZoneItem(zone) {
  const button = document.createElement("button");
  button.className = "settings-menu-item";
  button.type = "button";
  const count = farmData.ponds.filter((pond) => pond.zoneId === zone.id).length;
  button.innerHTML = `<span><strong></strong><small>${count} 個池子</small></span><b aria-hidden="true">›</b>`;
  button.querySelector("strong").textContent = zone.name;
  button.addEventListener("click", () => showPondZone(zone.id));
  return button;
}

function showPondZone(zoneId) {
  const zone = farmData.zones.find((item) => item.id === zoneId);
  if (!zone) { showPondManagement(); return; }
  currentPondZoneId = zoneId;
  hideAppViews();
  pondZoneDetailView.hidden = false;
  document.querySelector("#pondZoneTitle").textContent = zone.name;
  renderZonePonds();
  window.scrollTo(0, 0);
}

function renderZonePonds() {
  const ponds = farmData.ponds.filter((pond) => pond.zoneId === currentPondZoneId).sort((a, b) => a.order - b.order);
  const list = document.querySelector("#zonePondList");
  list.replaceChildren(...ponds.map((pond) => zonePondItem(pond)));
  document.querySelector("#zonePondEmptyState").hidden = ponds.length > 0;
}

function zonePondItem(pond) {
  const item = document.createElement("article");
  item.className = "zone-sort-item pond-sort-item";
  item.dataset.pondId = pond.id;
  item.draggable = true;
  const handle = document.createElement("button");
  handle.className = "pond-drag-handle";
  handle.type = "button";
  handle.setAttribute("aria-label", "拖曳排序");
  handle.textContent = "☰";
  const name = document.createElement("button");
  name.className = "pond-name-button";
  name.type = "button";
  name.innerHTML = `<strong></strong><small>${pond.status === "rest" ? "休息" : "使用中"}</small>`;
  name.querySelector("strong").textContent = pond.name;
  name.addEventListener("click", () => openPondEditor(pond.id));
  item.append(handle, name);
  return item;
}

function openPondEditor(pondId = null) {
  editingFarmPondId = pondId;
  const pond = farmData.ponds.find((item) => item.id === pondId);
  document.querySelector("#pondEditorTitle").textContent = pond ? "修改池子" : "新增池子";
  document.querySelector("#pondEditorSubmit").textContent = pond ? "儲存" : "新增";
  document.querySelector("#pondEditorName").value = pond?.name || "";
  document.querySelector("#pondEditorStatus").value = pond?.status || "active";
  document.querySelector("#pondEditorError").textContent = "";
  pondEditorDialog.showModal();
  document.querySelector("#pondEditorName").focus();
}

function persistPondOrder() {
  const ids = [...document.querySelectorAll("#zonePondList [data-pond-id]")].map((item) => item.dataset.pondId);
  farmData.ponds.filter((pond) => pond.zoneId === currentPondZoneId).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)).forEach((pond, index) => { pond.order = index; });
  saveFarmData();
  renderZonePonds();
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
  farmEditorDialog.close();
  renderSettings();
});

pondEditorForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = cleanName(event.currentTarget.elements.pondName.value);
  const status = event.currentTarget.elements.status.value;
  const error = document.querySelector("#pondEditorError");
  if (!name) { error.textContent = "請輸入池子名稱。"; return; }
  if (farmData.ponds.some((pond) => pond.id !== editingFarmPondId && sameName(pond.name, name))) {
    error.textContent = "這個池子名稱已經使用過了。";
    return;
  }
  const pond = farmData.ponds.find((item) => item.id === editingFarmPondId);
  if (pond) { pond.name = name; pond.status = status; }
  else {
    const order = farmData.ponds.filter((item) => item.zoneId === currentPondZoneId).length;
    farmData.ponds.push({ id: createId("pond"), name, zoneId: currentPondZoneId, status, order });
  }
  error.textContent = "";
  saveFarmData();
  syncFarmPondsToPatrol();
  pondEditorDialog.close();
  renderZonePonds();
});

document.querySelector("#shrimpPatrolPhoto").addEventListener("change", (event) => {
  const file = event.currentTarget.files?.[0];
  document.querySelector("#shrimpPatrolPhotoStatus").textContent = file ? file.name : "沒有選擇照片";
});

shrimpPatrolRecordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const now = new Date();
  const existingIndex = shrimpPatrolData.records.findIndex((record) => record.pondId === currentShrimpPatrolPondId && record.date === todayKey);
  const existing = existingIndex >= 0 ? shrimpPatrolData.records[existingIndex] : null;
  const photoFile = event.currentTarget.elements.waterPhoto.files?.[0];
  const error = document.querySelector("#shrimpPatrolRecordError");
  let waterPhoto = existing?.waterPhoto || "";
  try {
    if (photoFile) waterPhoto = await patrolPhotoDataUrl(photoFile);
  } catch (_) {
    error.textContent = "這張照片目前無法使用，請換一張或不附照片。";
    return;
  }
  const record = {
    id: existing?.id || createId("shrimpPatrol"),
    pondId: currentShrimpPatrolPondId,
    zoneId: currentShrimpPatrolZoneId,
    date: todayKey,
    time: new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }).format(now),
    overall: data.get("overall") || "",
    waterColor: data.get("waterColor") || "",
    waterwheel: data.get("waterwheel") || "",
    drainage: data.get("drainage") || "",
    shrimpConditions: data.getAll("shrimpCondition"),
    notes: cleanName(data.get("notes")),
    waterPhoto,
    waterPhotoName: photoFile?.name || existing?.waterPhotoName || "",
    updatedAt: now.toISOString()
  };
  record.hasAbnormal = shrimpPatrolHasAbnormal(record);
  const records = [...shrimpPatrolData.records];
  if (existingIndex >= 0) records[existingIndex] = record;
  else records.push(record);
  try {
    saveJson(SHRIMP_PATROL_KEY, { records });
  } catch (_) {
    error.textContent = "儲存空間不足，請改用較小的照片或不附照片。";
    return;
  }
  shrimpPatrolData = { records };
  error.textContent = "";
  showShrimpPatrolPonds(currentShrimpPatrolZoneId);
});

feedingRecordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const previousMeal = data.get("previousMeal");
  const brand = data.get("brand");
  const feedNumber = data.get("feedNumber");
  const kilogramsText = String(data.get("kilograms") || "").trim();
  const error = document.querySelector("#feedingRecordError");
  if (!previousMeal) { error.textContent = "請選擇前一餐是否吃完。"; return; }
  if (!brand) { error.textContent = "請選擇飼料品牌。"; return; }
  if (!feedNumber) { error.textContent = "請選擇飼料號數。"; return; }
  if (previousMeal === "finished" && !kilogramsText) { error.textContent = "前一餐吃完時，請輸入本餐公斤數。"; return; }
  if (kilogramsText && (!Number.isFinite(Number(kilogramsText)) || Number(kilogramsText) <= 0)) { error.textContent = "公斤數請輸入大於 0 的數字。"; return; }
  const now = new Date();
  const existingIndex = feedingData.records.findIndex((record) => record.pondId === currentFeedingPondId && record.date === todayKey);
  const existing = existingIndex >= 0 ? feedingData.records[existingIndex] : null;
  const record = {
    id: existing?.id || createId("feeding"),
    pondId: currentFeedingPondId,
    zoneId: currentFeedingZoneId,
    date: todayKey,
    time: new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }).format(now),
    previousMeal,
    brand,
    feedNumber,
    kilograms: kilogramsText ? Number(kilogramsText) : null,
    notes: cleanName(data.get("notes")),
    updatedAt: now.toISOString()
  };
  if (existingIndex >= 0) feedingData.records[existingIndex] = record;
  else feedingData.records.push(record);
  error.textContent = "";
  saveFeedingData();
  showFeedingPonds(currentFeedingZoneId);
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

document.querySelector("#addPondFab").addEventListener("click", () => openPondEditor());

const zonePondList = document.querySelector("#zonePondList");
zonePondList.addEventListener("dragstart", (event) => {
  draggedPondElement = event.target.closest(".pond-sort-item");
  if (!draggedPondElement) return;
  draggedPondElement.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
});
zonePondList.addEventListener("dragover", (event) => {
  if (!draggedPondElement) return;
  event.preventDefault();
  const target = event.target.closest(".pond-sort-item");
  if (!target || target === draggedPondElement) return;
  const after = event.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2;
  zonePondList.insertBefore(draggedPondElement, after ? target.nextSibling : target);
});
zonePondList.addEventListener("drop", (event) => {
  event.preventDefault();
  if (!draggedPondElement) return;
  draggedPondElement.classList.remove("dragging");
  persistPondOrder();
  draggedPondElement = null;
});
zonePondList.addEventListener("dragend", () => {
  draggedPondElement?.classList.remove("dragging");
  draggedPondElement = null;
});
zonePondList.addEventListener("pointerdown", (event) => {
  const handle = event.target.closest(".pond-drag-handle");
  if (!handle || event.pointerType === "mouse") return;
  draggedPondElement = handle.closest(".pond-sort-item");
  draggedPondElement.classList.add("dragging");
  handle.setPointerCapture(event.pointerId);
  event.preventDefault();
});
zonePondList.addEventListener("pointermove", (event) => {
  if (!draggedPondElement || event.pointerType === "mouse") return;
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".pond-sort-item");
  if (!target || target === draggedPondElement) return;
  const after = event.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2;
  zonePondList.insertBefore(draggedPondElement, after ? target.nextSibling : target);
});
zonePondList.addEventListener("pointerup", (event) => {
  if (!draggedPondElement || event.pointerType === "mouse") return;
  draggedPondElement.classList.remove("dragging");
  draggedPondElement = null;
  persistPondOrder();
});
zonePondList.addEventListener("pointercancel", () => {
  draggedPondElement?.classList.remove("dragging");
  draggedPondElement = null;
  renderZonePonds();
});

document.querySelectorAll("[data-feature]").forEach((button) => button.addEventListener("click", () => {
  const feature = button.dataset.feature;
  if (feature === "patrol") showShrimpPatrolZones();
  else if (feature === "feeding") showFeedingZones();
  else if (feature === "settings" || feature === "profile") showSettings();
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
  if (action === "open-shrimp-patrol-zones") showShrimpPatrolZones();
  if (action === "back-shrimp-patrol-ponds") showShrimpPatrolPonds(currentShrimpPatrolZoneId);
  if (action === "open-feeding-zones") showFeedingZones();
  if (action === "back-feeding-ponds") showFeedingPonds(currentFeedingZoneId);
  if (action === "open-farm-editor") {
    document.querySelector("#settingsFarmName").value = farmData.farm?.name || "";
    document.querySelector("#settingsFarmError").textContent = "";
    farmEditorDialog.showModal();
    document.querySelector("#settingsFarmName").focus();
  }
  if (action === "open-zone-management") showZoneManagement();
  if (action === "open-pond-management") showPondManagement();
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
  if (action === "add") nameDialog.showModal();
  if (action === "close") recordDialog.close();
  if (action === "close-name") nameDialog.close();
  if (action === "close-development") developmentDialog.close();
  if (action === "close-zone-editor") zoneEditorDialog.close();
  if (action === "close-farm-editor") farmEditorDialog.close();
  if (action === "close-pond-editor") pondEditorDialog.close();
});

document.querySelector("#today").textContent = new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date());
routeApp();

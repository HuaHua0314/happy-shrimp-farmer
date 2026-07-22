const STORAGE_KEY = "happyShrimpFarmer.v1";
const ACCOUNT_KEY = "happyShrimpFarmer.account.v1";
const FARM_KEY = "happyShrimpFarmer.farm.v1";
const FEEDING_KEY = "happyShrimpFarmer.feeding.v1";
const SHRIMP_PATROL_KEY = "happyShrimpFarmer.shrimpPatrol.v1";
const FERTILIZING_KEY = "happyShrimpFarmer.fertilizing.v1";
const FERTILIZER_KEY = "happyShrimpFarmer.fertilizers.v1";
const HARVEST_KEY = "happyShrimpFarmer.harvest.v1";
const FIREBASE_PENDING_KEY = "happyShrimpFarmer.firebasePending.v1";
const HARVEST_ITEMS = [
  { id: "male", name: "公蝦", defaultPrice: 360 },
  { id: "female", name: "母蝦", defaultPrice: 280 },
  { id: "smallDish", name: "小菜", defaultPrice: 200 },
  { id: "blackMale", name: "黑公", defaultPrice: 50 },
  { id: "tiny", name: "小小", defaultPrice: 50 },
  { id: "culled", name: "被淘汰", defaultPrice: 80 },
  { id: "totalShrimp", name: "總蝦", defaultPrice: 200 }
];
const firebaseServicePromise = import("./firebase-service.js").then((module) => module.firebaseService).catch(() => null);
const DEFAULT_PONDS = ["一號池", "二號池", "育苗池"];

const todayKey = localDateKey(new Date());
let state = loadPatrolState();
let account = loadJson(ACCOUNT_KEY, { phone: "", isLoggedIn: false });
let farmData = normalizeFarmData(loadJson(FARM_KEY, null));
let feedingData = loadJson(FEEDING_KEY, { records: [] });
if (!Array.isArray(feedingData.records)) feedingData = { records: [] };
let shrimpPatrolData = loadJson(SHRIMP_PATROL_KEY, { records: [] });
if (!Array.isArray(shrimpPatrolData.records)) shrimpPatrolData = { records: [] };
if (!Array.isArray(shrimpPatrolData.customConditions)) {
  shrimpPatrolData.customConditions = [...new Set(shrimpPatrolData.records.map((record) => cleanName(record.shrimpOther)).filter(Boolean))];
}
let fertilizingData = loadJson(FERTILIZING_KEY, { records: [] });
if (!Array.isArray(fertilizingData.records)) fertilizingData = { records: [] };
let fertilizerData = loadJson(FERTILIZER_KEY, { items: [] });
if (Array.isArray(fertilizerData)) fertilizerData = { items: fertilizerData };
if (!Array.isArray(fertilizerData.items)) fertilizerData = { items: [] };
let harvestData = loadJson(HARVEST_KEY, { records: [], prices: {} });
if (!Array.isArray(harvestData.records)) harvestData.records = [];
if (!harvestData.prices || typeof harvestData.prices !== "object") harvestData.prices = {};
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
let currentFertilizingZoneId = null;
let currentFertilizingPondId = null;
let pendingFertilizerItems = [];
let currentHarvestZoneId = null;
let currentHarvestPondId = null;
let activeFarmId = "";
let firebaseUser = null;
let firebaseSyncQueue = Promise.resolve();

const authView = document.querySelector("#authView");
const onboardingView = document.querySelector("#onboardingView");
const homeView = document.querySelector("#homeView");
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
const fertilizingZoneView = document.querySelector("#fertilizingZoneView");
const fertilizingPondView = document.querySelector("#fertilizingPondView");
const fertilizingRecordView = document.querySelector("#fertilizingRecordView");
const harvestZoneView = document.querySelector("#harvestZoneView");
const harvestPondView = document.querySelector("#harvestPondView");
const harvestRecordView = document.querySelector("#harvestRecordView");
const developmentDialog = document.querySelector("#developmentDialog");
const zoneEditorDialog = document.querySelector("#zoneEditorDialog");
const zoneEditorForm = document.querySelector("#zoneEditorForm");
const farmEditorDialog = document.querySelector("#farmEditorDialog");
const pondEditorDialog = document.querySelector("#pondEditorDialog");
const pondEditorForm = document.querySelector("#pondEditorForm");
const feedingRecordForm = document.querySelector("#feedingRecordForm");
const shrimpPatrolRecordForm = document.querySelector("#shrimpPatrolRecordForm");
const fertilizingRecordForm = document.querySelector("#fertilizingRecordForm");
const applyFertilizerDialog = document.querySelector("#applyFertilizerDialog");
const applyFertilizerForm = document.querySelector("#applyFertilizerForm");
const harvestRecordForm = document.querySelector("#harvestRecordForm");

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
function pendingFirebaseTypes() {
  const value = loadJson(FIREBASE_PENDING_KEY, []);
  return Array.isArray(value) ? value : [];
}

function markFirebasePending(type) {
  saveJson(FIREBASE_PENDING_KEY, [...new Set([...pendingFirebaseTypes(), type])]);
}

function clearFirebasePending(type) {
  saveJson(FIREBASE_PENDING_KEY, pendingFirebaseTypes().filter((item) => item !== type));
}

async function syncFirebaseType(service, type) {
  if (!service?.configured || !firebaseUser) return false;
  if (!activeFarmId && farmData.farm) activeFarmId = await service.ensureFarm(farmData.farm) || "";
  if (!activeFarmId) return false;
  if (type === "farm") await service.syncFarmStructure(activeFarmId, farmData.farm, farmData.zones, farmData.ponds);
  else if (type === "feeding") await service.syncRecords(activeFarmId, "feeding", feedingData.records);
  else if (type === "patrol") await service.syncRecords(activeFarmId, "patrol", shrimpPatrolData.records);
  else if (type === "fertilizing") await service.syncRecords(activeFarmId, "fertilizing", fertilizingData.records);
  else if (type === "fertilizers") await service.syncRecords(activeFarmId, "fertilizers", fertilizerData.items);
  else if (type === "harvest") await service.syncRecords(activeFarmId, "harvest", harvestData.records);
  else return false;
  clearFirebasePending(type);
  return true;
}

function queueFirebaseSync(type) {
  markFirebasePending(type);
  firebaseSyncQueue = firebaseSyncQueue
    .then(async () => syncFirebaseType(await firebaseServicePromise, type))
    .catch((error) => console.error("Firebase sync failed", error));
}

async function flushPendingFirebaseSync(service) {
  for (const type of pendingFirebaseTypes()) await syncFirebaseType(service, type);
}

function saveFarmData() { saveJson(FARM_KEY, farmData); queueFirebaseSync("farm"); }
function saveFeedingData() { saveJson(FEEDING_KEY, feedingData); queueFirebaseSync("feeding"); }
function saveShrimpPatrolData() { saveJson(SHRIMP_PATROL_KEY, shrimpPatrolData); queueFirebaseSync("patrol"); }
function saveFertilizingData() { saveJson(FERTILIZING_KEY, fertilizingData); queueFirebaseSync("fertilizing"); }
function saveFertilizerData() { saveJson(FERTILIZER_KEY, fertilizerData); queueFirebaseSync("fertilizers"); }
function saveHarvestData() { saveJson(HARVEST_KEY, harvestData); queueFirebaseSync("harvest"); }
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
  [authView, onboardingView, homeView, settingsView, zoneManagementView, pondManagementView, pondZoneDetailView, feedingZoneView, feedingPondView, feedingRecordView, shrimpPatrolZoneView, shrimpPatrolPondView, shrimpPatrolRecordView, fertilizingZoneView, fertilizingPondView, fertilizingRecordView, harvestZoneView, harvestPondView, harvestRecordView].forEach((view) => { view.hidden = true; });
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
}

function localPhoneFromFirebase(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.startsWith("886") ? `0${digits.slice(3)}` : digits;
}

async function loadOrMigrateFirebaseFarm(service, farmId) {
  const cloud = await service.loadFarm(farmId);
  const imported = Boolean(cloud.farm?.localStorageImportedAt);
  const hasCloudData = cloud.zones.length > 0 || cloud.ponds.length > 0 || cloud.feedingRecords.length > 0 || cloud.patrolRecords.length > 0 || cloud.fertilizingRecords.length > 0 || cloud.harvestRecords.length > 0 || cloud.fertilizers.length > 0;

  if (!imported && !hasCloudData) {
    await service.syncFarmStructure(farmId, farmData.farm, farmData.zones, farmData.ponds);
    await service.syncRecords(farmId, "feeding", feedingData.records);
    await service.syncRecords(farmId, "patrol", shrimpPatrolData.records);
    await service.syncRecords(farmId, "fertilizing", fertilizingData.records);
    await service.syncRecords(farmId, "harvest", harvestData.records);
    await service.syncRecords(farmId, "fertilizers", fertilizerData.items);
    await service.completeInitialImport(farmId);
    return;
  }

  if (!imported) await service.completeInitialImport(farmId);
  farmData = normalizeFarmData({ farm: cloud.farm ? { id: farmId, name: cloud.farm.name } : null, zones: cloud.zones, ponds: cloud.ponds, onboardingCompleted: cloud.zones.length > 0 && cloud.ponds.length > 0 });
  saveJson(FARM_KEY, farmData);
  feedingData = { records: cloud.feedingRecords };
  saveJson(FEEDING_KEY, feedingData);
  shrimpPatrolData = { records: cloud.patrolRecords, customConditions: [...new Set(cloud.patrolRecords.flatMap((record) => record.customConditions || [record.shrimpOther]).filter(Boolean))] };
  saveJson(SHRIMP_PATROL_KEY, shrimpPatrolData);
  fertilizingData = { records: cloud.fertilizingRecords };
  saveJson(FERTILIZING_KEY, fertilizingData);
  {
    const records = cloud.harvestRecords;
    const prices = { ...harvestData.prices };
    [...records].sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || ""))).forEach((record) => record.items?.forEach((item) => { prices[item.id] = item.unitPrice; }));
    harvestData = { records, prices };
    saveJson(HARVEST_KEY, harvestData);
  }
  fertilizerData = { items: cloud.fertilizers };
  saveJson(FERTILIZER_KEY, fertilizerData);
}

async function initializeFirebaseApp() {
  const service = await firebaseServicePromise;
  if (!service?.configured) {
    account = { phone: "", isLoggedIn: false };
    routeApp();
    document.querySelector("#phoneError").textContent = "Firebase 尚未設定，請先完成 firebase-config.js。";
    return;
  }
  service.onAuthChanged(async (user) => {
    firebaseUser = user;
    if (!user) {
      account = { phone: "", isLoggedIn: false };
      saveAccount();
      activeFarmId = "";
      routeApp();
      return;
    }
    account = { phone: localPhoneFromFirebase(user.phoneNumber), isLoggedIn: true, uid: user.uid };
    saveAccount();
    try {
      activeFarmId = await service.ensureFarm(farmData.farm) || "";
      if (activeFarmId) {
        await flushPendingFirebaseSync(service);
        await loadOrMigrateFirebaseFarm(service, activeFarmId);
      }
    } catch (error) {
      console.error("Firebase initial sync failed", error);
    }
    routeApp();
  });
}

window.addEventListener("online", () => {
  firebaseSyncQueue = firebaseSyncQueue
    .then(async () => {
      const service = await firebaseServicePromise;
      if (service?.configured && firebaseUser && activeFarmId) await flushPendingFirebaseSync(service);
    })
    .catch((error) => console.error("Firebase reconnect sync failed", error));
});

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

function showHome() { hideAppViews(); homeView.hidden = false; updateHomeView(); window.scrollTo(0, 0); }
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

function allShrimpCustomConditions() {
  const candidates = [
    ...shrimpPatrolData.customConditions,
    ...shrimpPatrolData.records.flatMap((record) => Array.isArray(record.customConditions) ? record.customConditions : [record.shrimpOther])
  ].map(cleanName).filter(Boolean);
  return candidates.filter((value, index) => candidates.findIndex((candidate) => sameName(candidate, value)) === index);
}

function selectedShrimpCustomConditions() {
  return [...document.querySelectorAll("#shrimpOtherHistory .custom-condition-button[aria-pressed='true']")].map((button) => button.dataset.value);
}

function renderShrimpOtherHistory(selectedValues = []) {
  const values = allShrimpCustomConditions();
  const list = document.querySelector("#shrimpOtherHistory");
  list.replaceChildren(...values.map((value) => {
    const button = document.createElement("button");
    button.className = "custom-condition-button";
    button.type = "button";
    button.dataset.value = value;
    button.textContent = value;
    button.setAttribute("aria-pressed", selectedValues.some((selected) => sameName(selected, value)) ? "true" : "false");
    return button;
  }));
}

function updateShrimpConditionalFields() {
  const conditions = [...shrimpPatrolRecordForm.querySelectorAll('[name="shrimpCondition"]:checked')].map((input) => input.value);
  const hasDeadShrimp = conditions.includes("deadShrimp");
  const hasOther = conditions.includes("other");
  document.querySelector("#deadShrimpDetails").hidden = !hasDeadShrimp;
  document.querySelector("#shrimpOtherDetails").hidden = !hasOther;
  document.querySelector("#deadShrimpOtherWrap").hidden = !hasDeadShrimp || shrimpPatrolRecordForm.elements.deadShrimpCount.value !== "more";
  if (!hasDeadShrimp) {
    shrimpPatrolRecordForm.querySelectorAll('[name="deadShrimpCount"]').forEach((input) => { input.checked = false; });
    shrimpPatrolRecordForm.elements.deadShrimpOtherCount.value = "";
  }
  if (!hasOther) {
    document.querySelectorAll("#shrimpOtherHistory .custom-condition-button").forEach((button) => { button.setAttribute("aria-pressed", "false"); });
    document.querySelector("#shrimpOtherContent").value = "";
    document.querySelector("#shrimpOtherError").textContent = "";
  }
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
  const selectedCustomConditions = Array.isArray(existing?.customConditions) ? existing.customConditions : [existing?.shrimpOther].filter(Boolean);
  renderShrimpOtherHistory(selectedCustomConditions);
  photoStatus.textContent = existing?.waterPhoto ? "已保留今天的水色照片" : "沒有選擇照片";
  if (existing) {
    setPatrolRadioValue(shrimpPatrolRecordForm, "overall", existing.overall);
    setPatrolRadioValue(shrimpPatrolRecordForm, "waterColor", existing.waterColor);
    setPatrolRadioValue(shrimpPatrolRecordForm, "waterwheel", existing.waterwheel);
    setPatrolRadioValue(shrimpPatrolRecordForm, "drainage", existing.drainage);
    const savedConditions = Array.isArray(existing.shrimpConditions) ? existing.shrimpConditions : [];
    const conditions = savedConditions.some((value) => value !== "normal") ? savedConditions.filter((value) => value !== "normal") : savedConditions;
    shrimpPatrolRecordForm.querySelectorAll('[name="shrimpCondition"]').forEach((input) => { input.checked = conditions.includes(input.value); });
    setPatrolRadioValue(shrimpPatrolRecordForm, "deadShrimpCount", ["other", "over30"].includes(existing.deadShrimpCount) ? "more" : existing.deadShrimpCount);
    shrimpPatrolRecordForm.elements.deadShrimpOtherCount.value = existing.deadShrimpOtherCount ?? "";
    shrimpPatrolRecordForm.elements.notes.value = existing.notes || "";
  }
  updateShrimpConditionalFields();
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

function showFertilizingZones() {
  hideAppViews();
  fertilizingZoneView.hidden = false;
  const zones = [...farmData.zones].sort((a, b) => a.order - b.order);
  const list = document.querySelector("#fertilizingZoneList");
  list.replaceChildren(...zones.map((zone) => {
    const button = document.createElement("button");
    button.className = "settings-menu-item";
    button.type = "button";
    const count = farmData.ponds.filter((pond) => pond.zoneId === zone.id).length;
    button.innerHTML = `<span><strong></strong><small>${count} 個池子</small></span><b aria-hidden="true">›</b>`;
    button.querySelector("strong").textContent = zone.name;
    button.addEventListener("click", () => showFertilizingPonds(zone.id));
    return button;
  }));
  document.querySelector("#fertilizingZoneEmptyState").hidden = zones.length > 0;
  window.scrollTo(0, 0);
}

function fertilizingCompletedToday(pondId) {
  return fertilizingData.records.some((record) => record.pondId === pondId && record.date === todayKey);
}

function showFertilizingPonds(zoneId) {
  const zone = farmData.zones.find((item) => item.id === zoneId);
  if (!zone) { showFertilizingZones(); return; }
  currentFertilizingZoneId = zoneId;
  hideAppViews();
  fertilizingPondView.hidden = false;
  document.querySelector("#fertilizingZoneTitle").textContent = zone.name;
  renderFertilizingPonds();
  window.scrollTo(0, 0);
}

function renderFertilizingPonds() {
  const ponds = farmData.ponds.filter((pond) => pond.zoneId === currentFertilizingZoneId).sort((a, b) => a.order - b.order);
  const completed = ponds.filter((pond) => fertilizingCompletedToday(pond.id)).length;
  const list = document.querySelector("#fertilizingPondList");
  list.replaceChildren(...ponds.map((pond) => {
    const done = fertilizingCompletedToday(pond.id);
    const button = document.createElement("button");
    button.className = `feeding-pond-item${done ? " completed" : ""}`;
    button.type = "button";
    button.setAttribute("role", "listitem");
    const name = document.createElement("strong");
    if (done) {
      const check = document.createElement("span");
      check.className = "feeding-completed-check";
      check.textContent = "✓";
      name.append(check, ` ${pond.name}`);
    } else name.textContent = pond.name;
    button.append(name);
    button.addEventListener("click", () => showFertilizingRecord(pond.id));
    return button;
  }));
  document.querySelector("#fertilizingPondEmptyState").hidden = ponds.length > 0;
  document.querySelector("#fertilizingProgressText").textContent = `已完成：${completed} / ${ponds.length}`;
  document.querySelector("#fertilizingAllComplete").hidden = ponds.length === 0 || completed !== ponds.length;
}

function fertilizerDefaults(name) {
  return fertilizerData.items.find((item) => sameName(item.name, name)) || null;
}

function fertilizerAmount(quantity, unitPrice) {
  return Number((Number(quantity || 0) * Number(unitPrice || 0)).toFixed(2));
}

function formatMoney(value) {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function setFertilizerUnit(row, unit) {
  const select = row.querySelector(".fertilizer-unit-select");
  const customWrap = row.querySelector(".fertilizer-custom-unit-wrap");
  const customInput = row.querySelector(".fertilizer-custom-unit");
  const known = [...select.options].some((option) => option.value === unit && option.value !== "__other__");
  select.value = known ? unit : (unit ? "__other__" : "");
  customWrap.hidden = select.value !== "__other__";
  customInput.value = known ? "" : unit || "";
}

function setFertilizerQuantity(row, quantity) {
  const select = row.querySelector(".fertilizer-quantity-select");
  const customWrap = row.querySelector(".fertilizer-custom-quantity-wrap");
  const customInput = row.querySelector(".fertilizer-custom-quantity");
  const text = quantity === "" || quantity == null ? "" : String(Number(quantity));
  const known = [...select.options].some((option) => option.value === text && option.value !== "__custom__");
  select.value = known ? text : (text ? "__custom__" : "");
  customWrap.hidden = select.value !== "__custom__";
  customInput.value = known ? "" : text;
}

function fertilizerRowQuantity(row) {
  const select = row.querySelector(".fertilizer-quantity-select");
  return select.value === "__custom__" ? Number(row.querySelector(".fertilizer-custom-quantity").value) : Number(select.value);
}

function fertilizerRowUnit(row) {
  const select = row.querySelector(".fertilizer-unit-select");
  return select.value === "__other__" ? cleanName(row.querySelector(".fertilizer-custom-unit").value) : select.value;
}

function addFertilizerItem(initial = {}) {
  const item = document.createElement("article");
  item.className = "fertilizer-item";
  item.innerHTML = `<div class="fertilizer-item-heading"><strong>肥料</strong><button class="fertilizer-remove" type="button" aria-label="移除這項肥料">移除</button></div><label>肥料名稱<select class="flow-input fertilizer-select"><option value="">請選擇肥料</option></select></label><label class="fertilizer-new-name-wrap" hidden>新肥料名稱<input class="flow-input fertilizer-new-name" maxlength="50" placeholder="請輸入肥料名稱"></label><div class="fertilizer-field-grid"><label>使用量<select class="flow-input fertilizer-quantity-select"><option value="">請選擇</option><option value="0.25">1/4</option><option value="0.333">1/3</option><option value="0.5">1/2</option><option value="0.75">3/4</option><option value="1">1</option><option value="1.5">1.5</option><option value="2">2</option><option value="3">3</option><option value="5">5</option><option value="10">10</option><option value="__custom__">自行輸入</option></select></label><label class="fertilizer-custom-quantity-wrap" hidden>自行輸入使用量<input class="flow-input fertilizer-custom-quantity" type="number" inputmode="decimal" min="0.001" step="0.001" placeholder="例如：1.25"></label><label>單位<select class="flow-input fertilizer-unit-select"><option value="">請選擇</option><option value="包">包</option><option value="公斤">公斤</option><option value="公克">公克</option><option value="瓶">瓶</option><option value="公升">公升</option><option value="毫升">毫升</option><option value="桶">桶</option><option value="袋">袋</option><option value="支">支</option><option value="顆">顆</option><option value="__other__">其他（自行輸入）</option></select></label><label class="fertilizer-custom-unit-wrap" hidden>其他單位<input class="flow-input fertilizer-custom-unit" maxlength="12" placeholder="請輸入單位"></label><label>單價<input class="flow-input fertilizer-price" type="number" inputmode="decimal" min="0" step="0.01"></label></div><p class="fertilizer-amount">本項金額：<strong>0</strong> 元</p>`;
  const fertilizerSelect = item.querySelector(".fertilizer-select");
  fertilizerData.items.forEach((fertilizer) => {
    const option = document.createElement("option");
    option.value = fertilizer.name;
    option.textContent = fertilizer.name;
    fertilizerSelect.append(option);
  });
  const addOption = document.createElement("option");
  addOption.value = "__new__";
  addOption.textContent = "＋新增其他肥料";
  fertilizerSelect.append(addOption);
  const saved = initial.name ? fertilizerDefaults(initial.name) : null;
  if (initial.name && saved) fertilizerSelect.value = saved.name;
  else if (initial.name) {
    fertilizerSelect.value = "__new__";
    item.querySelector(".fertilizer-new-name-wrap").hidden = false;
    item.querySelector(".fertilizer-new-name").value = initial.name;
  }
  setFertilizerQuantity(item, initial.quantity ?? "");
  setFertilizerUnit(item, initial.unit || "");
  item.querySelector(".fertilizer-price").value = initial.unitPrice ?? "";
  document.querySelector("#fertilizerItems").append(item);
  updateFertilizingTotals();
}

function updateFertilizingTotals() {
  let total = 0;
  document.querySelectorAll("#fertilizerItems .fertilizer-item").forEach((item) => {
    const amount = fertilizerAmount(fertilizerRowQuantity(item), item.querySelector(".fertilizer-price").value);
    item.querySelector(".fertilizer-amount strong").textContent = formatMoney(amount);
    total += amount;
  });
  document.querySelector("#fertilizingTotal").textContent = formatMoney(total);
}

function collectFertilizerItems(errorElement) {
  const rows = [...document.querySelectorAll("#fertilizerItems .fertilizer-item")];
  if (!rows.length) { errorElement.textContent = "請至少新增一項肥料。"; return null; }
  const items = [];
  for (const row of rows) {
    const selection = row.querySelector(".fertilizer-select").value;
    const name = selection === "__new__" ? cleanName(row.querySelector(".fertilizer-new-name").value) : cleanName(selection);
    const quantity = fertilizerRowQuantity(row);
    const unit = fertilizerRowUnit(row);
    const unitPriceText = row.querySelector(".fertilizer-price").value.trim();
    const unitPrice = Number(unitPriceText);
    if (!name) { errorElement.textContent = "請輸入每項肥料名稱。"; return null; }
    if (!Number.isFinite(quantity) || quantity <= 0) { errorElement.textContent = `請輸入「${name}」的使用量。`; return null; }
    if (!unit) { errorElement.textContent = `請輸入「${name}」的單位。`; return null; }
    if (unitPriceText === "" || !Number.isFinite(unitPrice) || unitPrice < 0) { errorElement.textContent = `請輸入「${name}」的單價。`; return null; }
    items.push({ name, quantity, unit, unitPrice, amount: fertilizerAmount(quantity, unitPrice) });
  }
  errorElement.textContent = "";
  return items;
}

function showFertilizingRecord(pondId) {
  const pond = farmData.ponds.find((item) => item.id === pondId && item.zoneId === currentFertilizingZoneId);
  if (!pond) { showFertilizingPonds(currentFertilizingZoneId); return; }
  currentFertilizingPondId = pondId;
  hideAppViews();
  fertilizingRecordView.hidden = false;
  fertilizingRecordForm.reset();
  document.querySelector("#fertilizerItems").replaceChildren();
  document.querySelector("#fertilizingPondTitle").textContent = pond.name;
  document.querySelector("#fertilizingTime").textContent = new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  document.querySelector("#fertilizingRecordError").textContent = "";
  addFertilizerItem();
  window.scrollTo(0, 0);
}

function fertilizingRecordFor(pond, items, notes, now) {
  const time = new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  return { id: createId("fertilizing"), zoneId: pond.zoneId, pondId: pond.id, pondName: pond.name, date: todayKey, time, items, totalAmount: Number(items.reduce((sum, item) => sum + item.amount, 0).toFixed(2)), notes, createdAt: now.toISOString() };
}

function rememberNewFertilizers(items) {
  const nextItems = [...fertilizerData.items];
  items.forEach((item) => {
    if (!nextItems.some((existing) => sameName(existing.name, item.name))) {
      nextItems.push({ id: createId("fertilizer"), name: item.name, defaultUnit: item.unit, defaultPrice: item.unitPrice });
    }
  });
  if (nextItems.length !== fertilizerData.items.length) {
    saveJson(FERTILIZER_KEY, { items: nextItems });
    fertilizerData = { items: nextItems };
    queueFirebaseSync("fertilizers");
  }
}

function showHarvestZones() {
  hideAppViews();
  harvestZoneView.hidden = false;
  const zones = [...farmData.zones].sort((a, b) => a.order - b.order);
  const list = document.querySelector("#harvestZoneList");
  list.replaceChildren(...zones.map((zone) => {
    const button = document.createElement("button");
    button.className = "settings-menu-item";
    button.type = "button";
    const count = farmData.ponds.filter((pond) => pond.zoneId === zone.id).length;
    button.innerHTML = `<span><strong></strong><small>${count} 個池子</small></span><b aria-hidden="true">›</b>`;
    button.querySelector("strong").textContent = zone.name;
    button.addEventListener("click", () => showHarvestPonds(zone.id));
    return button;
  }));
  document.querySelector("#harvestZoneEmptyState").hidden = zones.length > 0;
  window.scrollTo(0, 0);
}

function harvestCompletedToday(pondId) {
  return harvestData.records.some((record) => record.pondId === pondId && record.date === todayKey);
}

function showHarvestPonds(zoneId) {
  const zone = farmData.zones.find((item) => item.id === zoneId);
  if (!zone) { showHarvestZones(); return; }
  currentHarvestZoneId = zoneId;
  hideAppViews();
  harvestPondView.hidden = false;
  document.querySelector("#harvestZoneTitle").textContent = zone.name;
  renderHarvestPonds();
  window.scrollTo(0, 0);
}

function renderHarvestPonds() {
  const ponds = farmData.ponds.filter((pond) => pond.zoneId === currentHarvestZoneId).sort((a, b) => a.order - b.order);
  const completed = ponds.filter((pond) => harvestCompletedToday(pond.id)).length;
  const list = document.querySelector("#harvestPondList");
  list.replaceChildren(...ponds.map((pond) => {
    const done = harvestCompletedToday(pond.id);
    const button = document.createElement("button");
    button.className = `feeding-pond-item${done ? " completed" : ""}`;
    button.type = "button";
    button.setAttribute("role", "listitem");
    const name = document.createElement("strong");
    if (done) {
      const check = document.createElement("span");
      check.className = "feeding-completed-check";
      check.textContent = "✓";
      name.append(check, ` ${pond.name}`);
    } else name.textContent = pond.name;
    button.append(name);
    button.addEventListener("click", () => showHarvestRecord(pond.id));
    return button;
  }));
  document.querySelector("#harvestPondEmptyState").hidden = ponds.length > 0;
  document.querySelector("#harvestProgressText").textContent = `已完成：${completed} / ${ponds.length}`;
  document.querySelector("#harvestAllComplete").hidden = ponds.length === 0 || completed !== ponds.length;
}

function harvestPrice(item) {
  const remembered = Number(harvestData.prices[item.id]);
  return Number.isFinite(remembered) && remembered >= 0 ? remembered : item.defaultPrice;
}

function renderHarvestItems() {
  const list = document.querySelector("#harvestItems");
  list.replaceChildren(...HARVEST_ITEMS.map((definition) => {
    const item = document.createElement("article");
    item.className = "harvest-item";
    item.dataset.itemId = definition.id;
    item.innerHTML = `<h2></h2><label class="harvest-inline-field"><input class="flow-input harvest-weight" aria-label="重量（台斤）" type="number" inputmode="decimal" min="0" step="0.01" placeholder="重量"><span>斤</span></label><label class="harvest-inline-field"><input class="flow-input harvest-price" aria-label="單價（元／台斤）" type="number" inputmode="decimal" min="0" step="0.01" placeholder="單價"><span>元</span></label><p>小計：<strong class="harvest-subtotal">0</strong>元</p>`;
    item.querySelector("h2").textContent = definition.id === "culled" ? "被打掉" : definition.name;
    item.querySelector(".harvest-price").value = harvestPrice(definition);
    return item;
  }));
  updateHarvestTotals();
}

function harvestRowValues(row) {
  const weight = Number(row.querySelector(".harvest-weight").value) || 0;
  const price = Number(row.querySelector(".harvest-price").value) || 0;
  return { weight, price, subtotal: Number((weight * price).toFixed(2)) };
}

function updateHarvestMode(changedWeight = null) {
  const totalRow = document.querySelector('#harvestItems [data-item-id="totalShrimp"]');
  const categoryRows = [...document.querySelectorAll('#harvestItems .harvest-item:not([data-item-id="totalShrimp"])')];
  if (changedWeight && Number(changedWeight.value) > 0) {
    const changedRow = changedWeight.closest(".harvest-item");
    if (changedRow === totalRow) categoryRows.forEach((row) => { row.querySelector(".harvest-weight").value = ""; });
    else totalRow.querySelector(".harvest-weight").value = "";
  }
  const hasTotal = Number(totalRow.querySelector(".harvest-weight").value) > 0;
  const hasCategory = categoryRows.some((row) => Number(row.querySelector(".harvest-weight").value) > 0);
  categoryRows.forEach((row) => row.querySelectorAll("input").forEach((input) => { input.disabled = hasTotal; }));
  totalRow.querySelectorAll("input").forEach((input) => { input.disabled = hasCategory; });
  updateHarvestTotals();
}

function updateHarvestTotals() {
  let totalWeight = 0;
  let totalIncome = 0;
  document.querySelectorAll("#harvestItems .harvest-item").forEach((row) => {
    const values = harvestRowValues(row);
    row.querySelector(".harvest-subtotal").textContent = formatMoney(values.subtotal);
    totalWeight += values.weight;
    totalIncome += values.subtotal;
  });
  document.querySelector("#harvestTotalWeight").textContent = formatMoney(totalWeight);
  document.querySelector("#harvestTotalIncome").textContent = formatMoney(totalIncome);
}

function showHarvestRecord(pondId) {
  const pond = farmData.ponds.find((item) => item.id === pondId && item.zoneId === currentHarvestZoneId);
  if (!pond) { showHarvestPonds(currentHarvestZoneId); return; }
  currentHarvestPondId = pondId;
  hideAppViews();
  harvestRecordView.hidden = false;
  harvestRecordForm.reset();
  document.querySelector("#harvestPondTitle").textContent = pond.name;
  document.querySelector("#harvestTime").textContent = new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  document.querySelector("#harvestRecordError").textContent = "";
  renderHarvestItems();
  window.scrollTo(0, 0);
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

document.querySelector("#phoneForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const phone = event.currentTarget.elements.phone.value.replace(/\s/g, "");
  if (!/^09\d{8}$/.test(phone)) {
    document.querySelector("#phoneError").textContent = "請輸入 09 開頭的 10 碼手機號碼。";
    return;
  }
  pendingPhone = phone;
  document.querySelector("#phoneError").textContent = "";
  const submit = event.currentTarget.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const service = await firebaseServicePromise;
    if (!service?.configured) throw new Error("Firebase 尚未設定。");
    await service.sendOtp(phone);
    showCodeStep();
  } catch (error) {
    document.querySelector("#phoneError").textContent = error.message || "目前無法傳送驗證碼，請稍後再試。";
  } finally {
    submit.disabled = false;
  }
});

document.querySelector("#codeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = event.currentTarget.elements.code.value.trim();
  if (!/^\d{6}$/.test(code)) {
    document.querySelector("#codeError").textContent = "請輸入簡訊中的 6 碼驗證碼。";
    return;
  }
  const submit = event.currentTarget.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const service = await firebaseServicePromise;
    await service.confirmOtp(code);
    document.querySelector("#codeError").textContent = "";
  } catch (error) {
    document.querySelector("#codeError").textContent = error.message || "驗證碼不正確或已過期。";
  } finally {
    submit.disabled = false;
  }
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

document.querySelector("#addFertilizerItem").addEventListener("click", () => addFertilizerItem());

document.querySelector("#fertilizerItems").addEventListener("click", (event) => {
  const remove = event.target.closest(".fertilizer-remove");
  if (!remove) return;
  remove.closest(".fertilizer-item").remove();
  updateFertilizingTotals();
});

document.querySelector("#fertilizerItems").addEventListener("input", (event) => {
  if (event.target.matches(".fertilizer-custom-quantity, .fertilizer-price")) updateFertilizingTotals();
});

document.querySelector("#fertilizerItems").addEventListener("change", (event) => {
  const row = event.target.closest(".fertilizer-item");
  if (!row) return;
  if (event.target.matches(".fertilizer-select")) {
    const isNew = event.target.value === "__new__";
    row.querySelector(".fertilizer-new-name-wrap").hidden = !isNew;
    if (!isNew) row.querySelector(".fertilizer-new-name").value = "";
    const defaults = fertilizerDefaults(event.target.value);
    if (defaults) {
      setFertilizerUnit(row, defaults.defaultUnit ?? defaults.unit ?? "");
      row.querySelector(".fertilizer-price").value = defaults.defaultPrice ?? defaults.unitPrice ?? defaults.price ?? "";
    } else if (isNew) {
      setFertilizerUnit(row, "");
      row.querySelector(".fertilizer-price").value = "";
      row.querySelector(".fertilizer-new-name").focus();
    } else {
      setFertilizerUnit(row, "");
      row.querySelector(".fertilizer-price").value = "";
    }
  }
  if (event.target.matches(".fertilizer-quantity-select")) {
    const custom = event.target.value === "__custom__";
    row.querySelector(".fertilizer-custom-quantity-wrap").hidden = !custom;
    if (!custom) row.querySelector(".fertilizer-custom-quantity").value = "";
    else row.querySelector(".fertilizer-custom-quantity").focus();
  }
  if (event.target.matches(".fertilizer-unit-select")) {
    const custom = event.target.value === "__other__";
    row.querySelector(".fertilizer-custom-unit-wrap").hidden = !custom;
    if (!custom) row.querySelector(".fertilizer-custom-unit").value = "";
    else row.querySelector(".fertilizer-custom-unit").focus();
  }
  updateFertilizingTotals();
});

fertilizingRecordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const error = document.querySelector("#fertilizingRecordError");
  const items = collectFertilizerItems(error);
  if (!items) return;
  const pond = farmData.ponds.find((item) => item.id === currentFertilizingPondId);
  if (!pond) { error.textContent = "找不到這個池子，請返回後再試一次。"; return; }
  const record = fertilizingRecordFor(pond, items, cleanName(event.currentTarget.elements.notes.value), new Date());
  fertilizingData.records.push(record);
  try {
    saveFertilizingData();
    rememberNewFertilizers(items);
  } catch (_) {
    fertilizingData.records.pop();
    try { saveFertilizingData(); } catch (_) {}
    error.textContent = "目前無法儲存，請稍後再試。";
    return;
  }
  showFertilizingPonds(currentFertilizingZoneId);
});

function renderApplyFertilizerPonds() {
  const list = document.querySelector("#applyFertilizerPonds");
  const zones = [...farmData.zones].sort((a, b) => a.order - b.order);
  const nodes = [];
  zones.forEach((zone) => {
    const ponds = farmData.ponds.filter((pond) => pond.zoneId === zone.id && pond.id !== currentFertilizingPondId).sort((a, b) => a.order - b.order);
    if (!ponds.length) return;
    const heading = document.createElement("h3");
    heading.className = "apply-zone-heading";
    heading.textContent = zone.name;
    nodes.push(heading);
    ponds.forEach((pond) => {
      const card = document.createElement("article");
      card.className = "apply-pond-card";
      card.dataset.pondId = pond.id;
      const toggle = document.createElement("label");
      toggle.className = "apply-pond-toggle";
      toggle.innerHTML = `<input type="checkbox"><strong></strong>`;
      toggle.querySelector("strong").textContent = pond.name;
      const quantities = document.createElement("div");
      quantities.className = "apply-quantities";
      quantities.hidden = true;
      pendingFertilizerItems.forEach((item, index) => {
        const label = document.createElement("label");
        label.textContent = `${item.name}（${item.unit}）`;
        const input = document.createElement("input");
        input.className = "flow-input apply-quantity";
        input.type = "number";
        input.inputMode = "decimal";
        input.min = "0.01";
        input.step = "0.01";
        input.value = item.quantity;
        input.dataset.itemIndex = index;
        label.append(input);
        quantities.append(label);
      });
      card.append(toggle, quantities);
      nodes.push(card);
    });
  });
  list.replaceChildren(...nodes);
  if (!nodes.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "目前沒有其他池子可以套用。";
    list.append(empty);
  }
}

document.querySelector("#applyFertilizerButton").addEventListener("click", () => {
  const error = document.querySelector("#fertilizingRecordError");
  const items = collectFertilizerItems(error);
  if (!items) return;
  pendingFertilizerItems = items;
  document.querySelector("#applyFertilizerError").textContent = "";
  renderApplyFertilizerPonds();
  applyFertilizerDialog.showModal();
});

document.querySelector("#applyFertilizerPonds").addEventListener("change", (event) => {
  if (event.target.type !== "checkbox") return;
  event.target.closest(".apply-pond-card").querySelector(".apply-quantities").hidden = !event.target.checked;
});

applyFertilizerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const error = document.querySelector("#applyFertilizerError");
  const selectedCards = [...document.querySelectorAll("#applyFertilizerPonds .apply-pond-card")].filter((card) => card.querySelector('input[type="checkbox"]').checked);
  if (!selectedCards.length) { error.textContent = "請至少選擇一個要套用的池子。"; return; }
  const currentPond = farmData.ponds.find((pond) => pond.id === currentFertilizingPondId);
  if (!currentPond) { error.textContent = "找不到目前的池子，請返回後再試一次。"; return; }
  const now = new Date();
  const notes = cleanName(fertilizingRecordForm.elements.notes.value);
  const records = [fertilizingRecordFor(currentPond, pendingFertilizerItems, notes, now)];
  for (const card of selectedCards) {
    const pond = farmData.ponds.find((item) => String(item.id) === card.dataset.pondId);
    if (!pond) continue;
    const items = pendingFertilizerItems.map((item, index) => {
      const quantity = Number(card.querySelector(`[data-item-index="${index}"]`).value);
      return { ...item, quantity, amount: fertilizerAmount(quantity, item.unitPrice) };
    });
    if (items.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0)) { error.textContent = `請確認「${pond.name}」每項肥料的使用量。`; return; }
    records.push(fertilizingRecordFor(pond, items, notes, now));
  }
  fertilizingData.records.push(...records);
  try {
    saveFertilizingData();
    rememberNewFertilizers(pendingFertilizerItems);
  } catch (_) {
    fertilizingData.records.splice(-records.length, records.length);
    try { saveFertilizingData(); } catch (_) {}
    error.textContent = "目前無法儲存，請稍後再試。";
    return;
  }
  applyFertilizerDialog.close();
  showFertilizingPonds(currentFertilizingZoneId);
});

document.querySelector("#harvestItems").addEventListener("input", (event) => {
  if (event.target.matches(".harvest-weight")) updateHarvestMode(event.target);
  else if (event.target.matches(".harvest-price")) updateHarvestTotals();
});

harvestRecordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const error = document.querySelector("#harvestRecordError");
  const pond = farmData.ponds.find((item) => item.id === currentHarvestPondId);
  const zone = farmData.zones.find((item) => item.id === currentHarvestZoneId);
  if (!pond || !zone) { error.textContent = "找不到目前的區域或池子，請返回後再試一次。"; return; }
  const items = HARVEST_ITEMS.map((definition) => {
    const row = document.querySelector(`#harvestItems [data-item-id="${definition.id}"]`);
    const values = harvestRowValues(row);
    return { id: definition.id, name: definition.name, weight: values.weight, unitPrice: values.price, subtotal: values.subtotal };
  });
  if (!items.some((item) => item.weight > 0)) { error.textContent = "請至少輸入一個品項的重量。"; return; }
  if (items.some((item) => !Number.isFinite(item.unitPrice) || item.unitPrice < 0)) { error.textContent = "請確認每個品項的單價。"; return; }
  const now = new Date();
  const totalWeight = Number(items.reduce((sum, item) => sum + item.weight, 0).toFixed(2));
  const totalIncome = Number(items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));
  const record = {
    id: createId("harvest"),
    date: todayKey,
    time: new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }).format(now),
    zoneId: zone.id,
    zoneName: zone.name,
    pondId: pond.id,
    pondName: pond.name,
    items,
    totalWeight,
    totalIncome,
    notes: cleanName(event.currentTarget.elements.notes.value),
    createdAt: now.toISOString()
  };
  const prices = { ...harvestData.prices };
  items.forEach((item) => { prices[item.id] = item.unitPrice; });
  const nextData = { records: [...harvestData.records, record], prices };
  try {
    saveJson(HARVEST_KEY, nextData);
  } catch (_) {
    error.textContent = "目前無法儲存抓蝦紀錄，請稍後再試。";
    return;
  }
  harvestData = nextData;
  queueFirebaseSync("harvest");
  error.textContent = "";
  showHarvestPonds(currentHarvestZoneId);
});

document.querySelector("#shrimpOtherHistory").addEventListener("click", (event) => {
  const button = event.target.closest(".custom-condition-button");
  if (!button) return;
  button.setAttribute("aria-pressed", button.getAttribute("aria-pressed") === "true" ? "false" : "true");
});

document.querySelector("#addShrimpOtherButton").addEventListener("click", () => {
  const input = document.querySelector("#shrimpOtherContent");
  const error = document.querySelector("#shrimpOtherError");
  const name = cleanName(input.value);
  if (!name) {
    error.textContent = "請輸入自訂狀況名稱。";
    return;
  }
  const selected = selectedShrimpCustomConditions();
  const existing = allShrimpCustomConditions().find((value) => sameName(value, name));
  if (!existing) {
    shrimpPatrolData.customConditions.push(name);
    try {
      saveShrimpPatrolData();
    } catch (_) {
      shrimpPatrolData.customConditions.pop();
      error.textContent = "目前無法儲存這個狀況，請稍後再試。";
      return;
    }
  }
  renderShrimpOtherHistory([...selected, existing || name]);
  input.value = "";
  error.textContent = existing ? "這個狀況已存在，已為你選取。" : "";
});

shrimpPatrolRecordForm.addEventListener("change", (event) => {
  const changed = event.target.closest('[name="shrimpCondition"]');
  if (changed?.checked) {
    const choices = [...shrimpPatrolRecordForm.querySelectorAll('[name="shrimpCondition"]')];
    if (changed.value === "normal") {
      choices.forEach((choice) => { if (choice !== changed) choice.checked = false; });
    } else {
      const normal = choices.find((choice) => choice.value === "normal");
      if (normal) normal.checked = false;
    }
  }
  if (changed || event.target.name === "deadShrimpCount") updateShrimpConditionalFields();
});

shrimpPatrolRecordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const now = new Date();
  const pond = farmData.ponds.find((item) => item.id === currentShrimpPatrolPondId);
  const existingIndex = shrimpPatrolData.records.findIndex((record) => record.pondId === currentShrimpPatrolPondId && record.date === todayKey);
  const existing = existingIndex >= 0 ? shrimpPatrolData.records[existingIndex] : null;
  const photoFile = event.currentTarget.elements.waterPhoto.files?.[0];
  const error = document.querySelector("#shrimpPatrolRecordError");
  if (!pond) {
    error.textContent = "找不到這個池子，請返回池子列表後再試一次。";
    return;
  }
  let waterPhoto = existing?.waterPhoto || "";
  try {
    if (photoFile) waterPhoto = await patrolPhotoDataUrl(photoFile);
  } catch (_) {
    error.textContent = "這張照片目前無法使用，請換一張或不附照片。";
    return;
  }
  const shrimpConditions = data.getAll("shrimpCondition");
  const hasDeadShrimp = shrimpConditions.includes("deadShrimp");
  const hasOtherShrimpCondition = shrimpConditions.includes("other");
  const deadShrimpCount = hasDeadShrimp ? data.get("deadShrimpCount") || "" : "";
  const customConditions = hasOtherShrimpCondition ? selectedShrimpCustomConditions() : [];
  const recordTime = new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const hasMolting = shrimpConditions.includes("molting");
  const record = {
    id: existing?.id || createId("shrimpPatrol"),
    pondId: currentShrimpPatrolPondId,
    pondName: pond.name,
    zoneId: currentShrimpPatrolZoneId,
    date: todayKey,
    time: recordTime,
    overall: data.get("overall") || "",
    waterColor: data.get("waterColor") || "",
    waterwheel: data.get("waterwheel") || "",
    drainage: data.get("drainage") || "",
    shrimpConditions,
    deadShrimpCount,
    deadShrimpOtherCount: hasDeadShrimp && deadShrimpCount === "more" ? Number(data.get("deadShrimpOtherCount")) || null : null,
    customConditions,
    shrimpOther: customConditions[0] || "",
    hasMolting,
    moltingEvent: hasMolting ? { pondId: pond.id, zoneId: currentShrimpPatrolZoneId, pondName: pond.name, date: todayKey, time: recordTime, isMolting: true } : null,
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
    saveJson(SHRIMP_PATROL_KEY, { records, customConditions: shrimpPatrolData.customConditions });
  } catch (_) {
    error.textContent = "儲存空間不足，請改用較小的照片或不附照片。";
    return;
  }
  shrimpPatrolData = { records, customConditions: shrimpPatrolData.customConditions };
  queueFirebaseSync("patrol");
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
  else if (feature === "additives") showFertilizingZones();
  else if (feature === "harvest") showHarvestZones();
  else if (feature === "settings" || feature === "profile") showSettings();
  else showDevelopment();
}));
document.querySelector("#harvestHomeButton").addEventListener("click", showHarvestZones);
document.querySelectorAll("[data-home]").forEach((button) => button.addEventListener("click", showHome));
document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  if (action === "back-phone") showPhoneStep();
  if (action === "open-full-settings") showSettings();
  if (action === "open-shrimp-patrol-zones") showShrimpPatrolZones();
  if (action === "back-shrimp-patrol-ponds") showShrimpPatrolPonds(currentShrimpPatrolZoneId);
  if (action === "open-feeding-zones") showFeedingZones();
  if (action === "back-feeding-ponds") showFeedingPonds(currentFeedingZoneId);
  if (action === "open-fertilizing-zones") showFertilizingZones();
  if (action === "back-fertilizing-ponds") showFertilizingPonds(currentFertilizingZoneId);
  if (action === "close-apply-fertilizer") applyFertilizerDialog.close();
  if (action === "open-harvest-zones") showHarvestZones();
  if (action === "back-harvest-ponds") showHarvestPonds(currentHarvestZoneId);
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
  if (action === "close-development") developmentDialog.close();
  if (action === "close-zone-editor") zoneEditorDialog.close();
  if (action === "close-farm-editor") farmEditorDialog.close();
  if (action === "close-pond-editor") pondEditorDialog.close();
});

initializeFirebaseApp();

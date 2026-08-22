import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence, GoogleAuthProvider, linkWithPopup, onAuthStateChanged, RecaptchaVerifier, signInAnonymously, signInWithCredential, signInWithPhoneNumber, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore, query, serverTimestamp, setDoc, where, writeBatch } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const COLLECTIONS = {
  feeding: "feedingRecords",
  patrol: "patrolRecords",
  fertilizing: "fertilizingRecords",
  harvest: "harvestRecords",
  fertilizers: "fertilizers"
};

const configured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("REPLACE_");
let app = null;
let auth = null;
let db = null;
let confirmationResult = null;
let recaptchaVerifier = null;
let developmentPhone = "";
let authenticatedDisplayName = "";

if (configured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  // Persist auth state in local storage so refresh/close retains login.
  try {
    setPersistence(auth, browserLocalPersistence);
  } catch (e) {
    console.warn("Failed to set auth persistence:", e);
  }
  auth.languageCode = "zh-TW";
  db = getFirestore(app);
}

function requireConfigured() {
  if (!configured) throw new Error("Firebase 尚未設定，請先完成 firebase-config.js。 ");
}

function taiwanPhone(phone) {
  return `+886${String(phone).replace(/\D/g, "").replace(/^0/, "")}`;
}

function creator(user, displayName = "") {
  const phone = user.phoneNumber || developmentPhone || "";
  return { uid: user.uid, phone, name: displayName || authenticatedDisplayName || user.displayName || phone || "成員" };
}

async function claimPhoneInvitation(user, identityPhone) {
  if (!identityPhone) return "";
  const invitations = await getDocs(query(collection(db, "farmInvites"), where("phone", "==", identityPhone)));
  const invitation = invitations.docs.find((item) => item.data().status === "pending");
  if (!invitation) return "";
  const data = invitation.data();
  await setDoc(doc(db, "farms", data.farmId, "members", user.uid), { uid: user.uid, phone: identityPhone, name: identityPhone, role: data.role || "member", status: "active", inviteId: invitation.id, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await setDoc(invitation.ref, { status: "accepted", acceptedBy: user.uid, acceptedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
  return data.farmId;
}

async function currentUser() {
  requireConfigured();
  if (auth.currentUser) return auth.currentUser;
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => { unsubscribe(); resolve(user); });
  });
}

export const firebaseService = {
  configured,
  authMode: "google",
  onAuthChanged(callback) {
    if (!configured) { callback(null); return () => {}; }
    return onAuthStateChanged(auth, callback);
  },
  // Redirect-based sign-in was removed; auth state is handled via `onAuthStateChanged`.
  async signInGoogle() {
    requireConfigured();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const current = auth.currentUser;
    if (current?.isAnonymous) {
      // 將 Google 憑證連結到既有匿名 UID，保留原 Farm 與所有資料權限。
      try {
        return (await linkWithPopup(current, provider)).user;
      } catch (error) {
        const credential = GoogleAuthProvider.credentialFromError(error);
        if (error.code === "auth/credential-already-in-use" && credential) {
          return (await signInWithCredential(auth, credential)).user;
        }
        throw error;
      }
    }
    return (await signInWithPopup(auth, provider)).user;
  },
  async signInAnonymous(phone) {
    requireConfigured();
    // TODO(production-auth): 正式上線時改回 Phone Authentication，並把手機憑證連結到匿名帳號。
    developmentPhone = taiwanPhone(phone);
    const user = auth.currentUser || (await signInAnonymously(auth)).user;
    await setDoc(doc(db, "users", user.uid), {
      phone: developmentPhone,
      authMode: "anonymous-development",
      updatedAt: serverTimestamp()
    }, { merge: true });
    return user;
  },
  // TODO(production-auth): 保留 Phone Authentication API，正式上線時重新接回登入介面。
  async sendOtp(phone, buttonId = "sendCodeButton") {
    requireConfigured();
    recaptchaVerifier?.clear();
    recaptchaVerifier = new RecaptchaVerifier(auth, buttonId, { size: "invisible" });
    confirmationResult = await signInWithPhoneNumber(auth, taiwanPhone(phone), recaptchaVerifier);
  },
  async confirmOtp(code) {
    if (!confirmationResult) throw new Error("請先取得驗證碼。 ");
    return (await confirmationResult.confirm(code)).user;
  },
  async logout() { requireConfigured(); await signOut(auth); },
  async ensureFarm(localFarm, localDevelopmentPhone = "") {
    const user = await currentUser();
    if (!user) throw new Error("尚未登入 Firebase。 ");
    const profileRef = doc(db, "users", user.uid);
    const profile = await getDoc(profileRef);
    const identityPhone = user.phoneNumber
      || profile.data()?.phone
      || (localDevelopmentPhone ? taiwanPhone(localDevelopmentPhone) : "");
    developmentPhone = identityPhone;
    authenticatedDisplayName = user.displayName || profile.data()?.displayName || "";
    if (identityPhone && profile.data()?.phone !== identityPhone) {
      await setDoc(profileRef, {
        phone: identityPhone,
        displayName: user.displayName || "",
        email: user.email || "",
        photoURL: user.photoURL || "",
        authMode: user.isAnonymous ? "anonymous-development" : (user.providerData.some((item) => item.providerId === "google.com") ? "google" : "phone"),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
    let farmId = profile.data()?.activeFarmId || "";
    if (!farmId) farmId = await claimPhoneInvitation(user, identityPhone);
    const creatingFarm = !farmId && Boolean(localFarm?.id);
    if (creatingFarm) farmId = localFarm.id;
    if (!farmId) return null;
    const farmRef = doc(db, "farms", farmId);
    if (creatingFarm) {
      await setDoc(farmRef, { name: localFarm?.name || "我的農場", ownerId: user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await setDoc(doc(db, "farms", farmId, "members", user.uid), { uid: user.uid, phone: identityPhone, email: user.email || "", name: user.displayName || identityPhone || "擁有者", role: "owner", status: "active", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    } else {
      const membership = await getDoc(doc(db, "farms", farmId, "members", user.uid));
      if (!membership.exists()) throw new Error("目前帳號不是這個農場的成員。 ");
    }
    await setDoc(profileRef, { phone: identityPhone, email: user.email || "", displayName: user.displayName || "", photoURL: user.photoURL || "", activeFarmId: farmId, authMode: user.isAnonymous ? "anonymous-development" : (user.providerData.some((item) => item.providerId === "google.com") ? "google" : "phone"), updatedAt: serverTimestamp() }, { merge: true });
    return farmId;
  },
  async loadFarm(farmId) {
    requireConfigured();
    const [farmSnap, zonesSnap, pondsSnap, feedingSnap, patrolSnap, fertilizingSnap, harvestSnap, fertilizersSnap] = await Promise.all([
      getDoc(doc(db, "farms", farmId)),
      getDocs(collection(db, "farms", farmId, "zones")),
      getDocs(collection(db, "farms", farmId, "ponds")),
      getDocs(collection(db, "farms", farmId, COLLECTIONS.feeding)),
      getDocs(collection(db, "farms", farmId, COLLECTIONS.patrol)),
      getDocs(collection(db, "farms", farmId, COLLECTIONS.fertilizing)),
      getDocs(collection(db, "farms", farmId, COLLECTIONS.harvest)),
      getDocs(collection(db, "farms", farmId, COLLECTIONS.fertilizers))
    ]);
    const rows = (snapshot) => snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    return { farm: farmSnap.exists() ? { id: farmId, ...farmSnap.data() } : null, zones: rows(zonesSnap), ponds: rows(pondsSnap), feedingRecords: rows(feedingSnap), patrolRecords: rows(patrolSnap), fertilizingRecords: rows(fertilizingSnap), harvestRecords: rows(harvestSnap), fertilizers: rows(fertilizersSnap) };
  },
  async completeInitialImport(farmId) {
    requireConfigured();
    const user = await currentUser();
    if (!user) throw new Error("請先登入 Firebase。");
    await setDoc(doc(db, "farms", farmId), {
      localStorageImportedAt: serverTimestamp(),
      localStorageImportedBy: user.uid,
      updatedAt: serverTimestamp()
    }, { merge: true });
  },
  async syncFarmStructure(farmId, farm, zones, ponds) {
    requireConfigured();
    const user = await currentUser();
    if (!user) return;
    const batch = writeBatch(db);
    batch.set(doc(db, "farms", farmId), { name: farm?.name || "我的農場", updatedAt: serverTimestamp() }, { merge: true });
    zones.forEach((zone) => batch.set(doc(db, "farms", farmId, "zones", String(zone.id)), { ...zone, farmId, creator: zone.creator || creator(user), createdAt: zone.createdAt || serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true }));
    ponds.forEach((pond) => batch.set(doc(db, "farms", farmId, "ponds", String(pond.id)), { ...pond, farmId, creator: pond.creator || creator(user), createdAt: pond.createdAt || serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true }));
    await batch.commit();
  },
  async syncRecords(farmId, type, records, displayName = "") {
    requireConfigured();
    const user = await currentUser();
    if (!user || !COLLECTIONS[type]) return;
    const batch = writeBatch(db);
    records.forEach((record) => {
      const id = String(record.id || `${record.pondId}_${record.date}_${record.time}`);
      batch.set(doc(db, "farms", farmId, COLLECTIONS[type], id), { ...record, farmId, creator: record.creator || creator(user, displayName), createdAt: record.createdAt || serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    });
    await batch.commit();
  },
  async deleteRecord(farmId, type, recordId) {
    requireConfigured();
    if (!COLLECTIONS[type]) throw new Error("不支援的資料類型。");
    await deleteDoc(doc(db, "farms", farmId, COLLECTIONS[type], String(recordId)));
  },
  async deleteStructureItem(farmId, type, itemId) {
    requireConfigured();
    if (!['zones', 'ponds', 'fertilizers'].includes(type)) throw new Error("不支援的資料類型。");
    await deleteDoc(doc(db, "farms", farmId, type, String(itemId)));
  },
  async addMember(farmId, member) {
    requireConfigured();
    await setDoc(doc(db, "farms", farmId, "members", member.uid), { uid: member.uid, phone: member.phone || "", name: member.name || "成員", role: member.role || "member", status: "active", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
  },
  async inviteByPhone(farmId, phone, role = "member") {
    requireConfigured();
    const normalized = taiwanPhone(phone);
    await setDoc(doc(db, "farmInvites", `${farmId}_${normalized}`), { farmId, phone: normalized, role, status: "pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
};

window.HappyShrimpFirebase = firebaseService;

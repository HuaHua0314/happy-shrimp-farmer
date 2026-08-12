# Firebase 設定

1. 在 Firebase Console 建立專案並註冊 Web App。
2. 將 Web App 的 `firebaseConfig` 貼到 `firebase-config.js`。
3. Authentication → Sign-in method：啟用「Google」；如需把既有匿名開發帳號升級為 Google 帳號，暫時保留「匿名」。
4. Authentication → Settings → Authorized domains：加入 GitHub Pages 網域與本機測試網域。
5. 電話登入程式目前保留但已從介面隱藏，不會發送簡訊。
6. Firestore Database：建立正式模式資料庫，建議區域選擇接近台灣的區域。
7. 安裝 Firebase CLI、登入並選擇專案後執行 `firebase deploy --only firestore:rules`。

## Firestore 結構

- `users/{uid}`：使用者目前使用的 Farm。
- `farms/{farmId}`：農場基本資料。
- `farms/{farmId}/members/{uid}`：`owner`、`admin`、`member`。
- `farms/{farmId}/zones/{zoneId}`
- `farms/{farmId}/ponds/{pondId}`
- `farms/{farmId}/feedingRecords/{recordId}`
- `farms/{farmId}/patrolRecords/{recordId}`
- `farms/{farmId}/fertilizingRecords/{recordId}`
- `farms/{farmId}/harvestRecords/{recordId}`
- `farms/{farmId}/fertilizers/{fertilizerId}`
- `farmInvites/{farmId}_{phone}`：手機邀請；受邀者首次登入時自動加入 Farm。

首次 Firebase 登入後，如果 Firestore 尚無農場資料，系統會上傳目前 localStorage；後續重新整理會先讀取 Firestore，localStorage 僅作本機快取。

## Google 登入與既有匿名帳號

- 使用 `signInWithPopup`（無 redirect 流程）。
- 如果目前瀏覽器仍登入匿名開發帳號，系統會先將 Google provider 連結到原匿名 UID，以保留 Farm 與成員權限。
- 電話登入的 HTML、事件與 Firebase service 方法仍保留，介面以 `phoneLoginFallback` 隱藏。
- 本機 Firestore 快取會記錄使用者 UID，切換 Google 帳號時不會把上一位使用者的 localStorage 上傳成新農場。
- 正式重新啟用 Phone Authentication 時，請處理程式中的 `TODO(phone-auth)` 與 `TODO(production-auth)`。

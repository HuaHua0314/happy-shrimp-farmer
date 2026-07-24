# Firebase 設定

1. 在 Firebase Console 建立專案並註冊 Web App。
2. 將 Web App 的 `firebaseConfig` 貼到 `firebase-config.js`。
3. Authentication → Sign-in method：開發期間啟用「匿名」。暫時不需要啟用「電話」。
4. Authentication → Settings → Authorized domains：加入 GitHub Pages 網域與本機測試網域。
5. 手機號碼目前只作為匿名開發身份及邀請比對使用，不會發送簡訊，也不代表已驗證。
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

## 匿名開發模式

- 登入畫面與手機欄位保留，但實際呼叫 Firebase Anonymous Authentication。
- 匿名 UID 會由 Firebase 在同一瀏覽器持續保存，重新整理不會建立新帳號。
- 清除瀏覽器網站資料或登出後，匿名身份可能無法復原；重要正式資料不可只依賴匿名身份。
- 正式上線時，應將 Phone Auth credential 連結到目前匿名帳號，以保留相同 UID 與既有農場權限。
- 切回 Phone Authentication 時，請處理程式中的 `TODO(production-auth)`，並移除 Firestore Rules 的開發模式電話備援。

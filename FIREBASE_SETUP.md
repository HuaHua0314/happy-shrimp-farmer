# Firebase 設定

1. 在 Firebase Console 建立專案並註冊 Web App。
2. 將 Web App 的 `firebaseConfig` 貼到 `firebase-config.js`。
3. Authentication → Sign-in method：啟用「電話」。
4. Authentication → Settings → Authorized domains：加入 GitHub Pages 網域與本機測試網域。
5. Authentication → Phone numbers for testing：開發期間可建立測試手機及固定驗證碼。
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

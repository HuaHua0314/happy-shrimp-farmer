# 四個上線檔案檢查結果

檢查日期：2026-11-18。範圍為 `orders.html`、`management-core.js`、`management.css`、`management.js`，以及其原訂單與商品功能。

## 本次發現、重現及修正

發現 `management.js` 的 `guard()` 在開始儲存時停用 `#app button,dialog button`，但 finally 僅恢復 `#app button,#of button`。因此商品視窗 `#pd` 的儲存、上下架及關閉按鈕可能維持 disabled。這是實際功能問題，先前的測試用直接呼叫函式／派發事件，未完整覆蓋商品按鈕狀態。

已先說明問題與修正方式，備份至 `backups/four-file-review-20261118/`，再僅修改本機 finally 的選取範圍，與停用範圍一致。新增案例在修正前於 320px 明確失敗；修正後四種寬度全部通過。另加入實際點擊開啟商品管理、點擊編輯、點擊儲存觸發原生表單提交、儲存後點擊關閉的案例，確認舊訂單成交單價未改。

本次沒有變更 Firebase 路徑、Firebase 設定或安全規則；沒有連線讀寫正式 Firebase。沒有 Commit、Push 或部署。

## 檔案與依賴

| 項目 | 結果 |
| --- | --- |
| orders.html → management.css | 相對路徑正確、實體檔存在、大小寫一致 |
| orders.html → management-core.js → management.js | 引用及順序正確，core 先載入 |
| JavaScript 語法 | 兩個外部腳本與兩段 inline 腳本均通過 |
| 本機必要執行檔 | 就此訂單頁而言，四個檔案已齊全，需放在同一目錄 |
| 外部依賴 | 沿用 Google CDN 的 Firebase 10.12.5 app/auth/database compat SDK；仍需網路及既有 Firebase 後端設定 |
| 非必要瀏覽器檔案 | tests、備份、驗收 Markdown、orders.html.json、firebase.json 不會被此頁載入；另一套養殖系統的 firebase-config.js／firebase-service.js 也不是本頁的新依賴 |

規則副本不需隨網站載入，但線上資料庫本身必須已具備正確規則。不能把「四個本機檔案齊全」解讀成已確認線上 Firebase 設定或 CDN 隨時可用。

## 修正後自動化結果

| 測試 | 結果 |
| --- | --- |
| tests/static-test.cjs | 通過：路徑、檔案、語法、載入順序、原 Firebase 設定及 SDK 引用、登入方法與本機 Rules |
| management.test.cjs | 17 通過／0 失敗 |
| tests/browser-test.cjs | 320、375、768、1280px，各 54 通過；合計 216 通過／0 失敗 |

四大功能均接入並通過主要隔離流程：

- 客戶：同名分離、平台帳號辨識、舊客戶帶入、資料儲存、歷史金額與次數、同步期間保留草稿。
- 成品庫存：初始化基準、不補扣基準前已出貨單、手動入出庫、多商品含贈品出貨扣除、反向還原、操作去重、交易衝突保護。
- 報表：訂單建立日與實際收款日分開、日期不明、支出連動、包數／商品營收、現金收支與 CSV。
- 支出：分類新增修改、支出新增編輯刪除、搜尋與日期篩選。
- 原功能：假資料舊單讀取、訂單新增／編輯／刪除、成交快照保留、商品編輯／上下架及修正後的商品儲存／關閉操作。

## Firebase 相容與保留資料

仍使用原 `happy-shrimp-order` 專案與 Email／密碼登入。原路徑為 `users/{uid}/orders`、`users/{uid}/products`；新增的 customers、inventory、inventoryMovements、inventoryOperations、expenses、expenseCategories 均在同一 UID 下。

本機 `orders.html.json` 在 `users/$uid` 限制 `.read`／`.write` 為 `auth != null && auth.uid === $uid`，支援目前的讀取、獨立客戶／支出寫入及訂單庫存共同祖先交易。若線上規則與此相同，不需修改；如果另有驗證規則，需另行核對，不可放寬權限來通過測試。`firebase.json` 是另一套養殖系統的 Firestore 配置，不能用它代替訂單 Realtime Database Rules。

客戶統計從訂單衍生，不批次回寫舊單；沒有自動補收款日期、清空訂單／商品或重設既有資料的流程。訂單庫存交易會處理整個本人節點，在最新資料上只變更目標訂單、相關庫存及紀錄，其他節點值由測試確認保留。原本使用者確認後的單筆刪單功能仍存在；商品以停用保留歷史。

**沒有實測**：真實 Firebase 登入、正式舊資料完整讀取、真正儲存／重新開頁、線上 Rules、真實雙裝置同步與 SDK 交易重試。測試使用假 Firebase，不得宣稱上述正式環境項目已通過。四個檔案中的原設定／登入程式沒有被替換，與「真實登入已實測」是不同結論。

## Commit 與 Push 判斷

- **本機 Commit：可以，在先審閱差異並選入全部四個執行檔及此次回歸測試的前提下。** 不要選入 backups 或私密資料。這只是程式提交就緒，不等於完成正式環境驗收。
- **Push 至 main：目前建議暫緩。** GitHub 最近成功的 Pages 工作流程仍為 run `38364350172`，main／根目錄建置；Push 可能觸發直接上線。即時 Pages 設定仍需核對。
- 三個新增資源目前仍未加入本機 index，遠端 main 也尚未包含它們。只提交 orders.html 必然不完整。已追蹤舊 ZIP 的發佈排除、以及備份／測試的 artifact 排除仍需處理；不刪除本機備份。

下一步：核對 Pages 目前來源、整理四檔及測試的提交清單與發佈排除，在獨立 Firebase 測試環境完成真實登入／儲存及雙裝置驗收，再確認是否允許 Push。實際手機及 Excel 開檔也仍需驗收。現在不改正式資料或線上規則。

## 最後提交確認與 Rules 操作方式

再次執行目前三個測試入口，結果為靜態檢查通過、17 個核心案例通過、四種寬度各 54 個瀏覽器案例通過，共 216 個瀏覽器檢查，失敗 0。本次沒有再修改四個執行檔，也沒有任何正式 Firebase 讀寫或 Rules 發佈。

**結論：可以提交四個檔案。** 這表示四檔的本機連結、語法與現有隔離測試已達可提交狀態，沒有已知尚待修正的檔案缺漏；不表示正式登入、資料庫規則與跨裝置驗收已完成，也不是允許現在 Push 發布分支或部署。

### 是否需要另行部署 Rules

本機規則已在本人 `users/$uid` 授權 `.read`／`.write`。Realtime Database 的父路徑授權涵蓋子節點，因此如果 Console 中最新部署版本與此相同、且沒有其他欄位驗證衝突，新增 customers、inventory、inventoryMovements、inventoryOperations、expenses、expenseCategories 不需逐一新增規則或重新部署。

線上版本目前未核對；不能僅因新增節點就假定必須發佈規則，也不能因本機檔案正確就假定線上已相同。

只有確認線上缺少必要權限或驗證不相容時，才另行安排以下人工操作，現在不執行：

1. Firebase Console 選擇 **happy-shrimp-order → Realtime Database → 正確資料庫 → Rules**，先複製保存目前已部署規則；另保存正式資料備份。不要選到 happy-shrimp-farmer 的 Firestore。
2. 比對本人 `users/$uid` 的讀取、交易寫入範圍及新欄位驗證。保留其他路徑與既有 `.validate`；若現有規則更嚴格，先審查差異，不能直接整份貼上本機 JSON，也不能把資料庫改為公開讀寫。
3. 在 Emulator 或 Rules Playground 測試：本人 UID 的必要讀寫通過，未登入與其他 UID 拒絕；新欄位驗證及訂單／庫存交易相容。若無法在維持原安全限制下通過，就先調整方案，不直接放寬。
4. 差異經確認、測試通過並獲准後，才在 Console 按 Publish。這是另一次明確的規則發佈操作，不隨提交四個網站檔案自動完成。

目前 `firebase.json` 只指定另一套 Firestore Rules，不能直接拿它當成訂單 Realtime Database Rules 的部署設定。

官方依據：[Realtime Database 規則繼承與語法](https://firebase.google.com/docs/database/security/core-syntax)、[查看、測試及部署規則](https://firebase.google.com/docs/database/security/get-started)。

### 仍需完成的上線事項

- 確認目前 Pages 發布來源；四個執行檔同目錄、一併提交。保留原網站其他檔案，不以四檔取代整個既有網站。
- 審閱 staged 清單，納入三個新資源及 orders.html；排除備份與私密檔，設定網站 artifact 不發布測試及舊 ZIP。
- 唯讀核對線上 Rules，並備份／比對正式訂單、商品與客戶資料。此程式沒有部署時自動清空、遷移或重設資料的流程；原有人工編輯與確認後刪單功能仍會依使用者操作改變資料。
- 於隔離 Firebase 環境完成真實登入、儲存後重開頁面、雙裝置同步與交易競爭測試，完成手機及 Excel 驗收。
- 實際啟用自動庫存前，安排一次實體盤點；所有舊版分頁關閉並統一使用新版。未初始化前不扣庫存是既定保護行為，不應為了上線而重設舊單。

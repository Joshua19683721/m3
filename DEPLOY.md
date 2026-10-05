# 部署到 GitHub

這套系統是**純靜態網站**，沒有後端。所有路徑都是相對路徑，
所以放在 `https://<帳號>.github.io/<倉庫名>/` 這種子路徑下可以直接運作，
**不需要改任何程式碼**（已實測過子路徑 + 深層連結 + 音標都正常）。

---

## 快速上線（三步）

### 1. 在 GitHub 建立一個空的倉庫

到 <https://github.com/new>，倉庫名填 **`m3`**，
**Visibility 選 Public**，**不要**勾選自動建立 README（這個專案已經有 README.md）。

> ✅ 已經建立好了：<https://github.com/Joshua19683721/m3>，直接跳到第 2 步。

### 2. 第一次推上去

```bat
cd /d C:\Users\joshu\Downloads\mkes1-6-allgrade

git add .
git commit -m "feat: 場景式英文單字輸入練習（內容取自英語單字口袋書 1-6 級）"

git remote add origin https://github.com/Joshua19683721/m3.git
git branch -M main
git push -u origin main
```

> 第一次 push 會跳出 Git Credential Manager 視窗，登入 GitHub 即可。
>
> `git init` 已經幫你做過了，但 **commit 身分還沒設定**，
> 所以第一次 commit 前請先設定（只影響這個倉庫，不動你的全域設定）：
>
> ```bat
> git config user.name  "你的名字"
> git config user.email "你的 GitHub Email"
> ```

### 3. 開啟 GitHub Pages（必須做這一步）

推到 GitHub **不會自動開啟 Pages**，要去網頁上點一下：

1. 開啟 <https://github.com/Joshua19683721/m3/settings/pages>
2. **Build and deployment → Source** 選 **Deploy from a branch**
3. **Branch** 選 `main`，**Folder** 選 `/ (root)`
4. 儲存

大約一分鐘後網址就會開通：

```
https://joshua19683721.github.io/m3/
```

> 這個專案放了 `.nojekyll`，所以 GitHub 會把檔案**原樣**輸出，不經過 Jekyll。
> 倉庫根目錄就是網站根目錄，而 App 全部使用相對路徑，
> 所以在 `/m3/` 這種子路徑下運作正常。

> **為什麼不用 Actions？**
> 走 Actions（`actions/deploy-pages`）同樣要先在 Settings 開啟 Pages 才會跑，
> 還要多按一次 Re-run；直接用分支部署反而少一步，也不會有失敗紅燈。
> 所以這個專案改用分支部署，並已移除 `.github/workflows/`。

---

## 會被推上去什麼

| 類別 | 內容 |
|---|---|
| App 本體 | `index.html`、`assets/`、`data/banks.js`（662 KB，執行時需要） |
| 產生工具 | `tools/*.py`（PDF 解析、音標換算、場景分類、題庫產生） |
| 人工校正 | `tools/fixes.json`（49 筆修正，**一定要保留**，重跑 build 才不會被洗掉） |
| 校對紀錄 | `tools/findings/`（23 批逐條校對的原始紀錄，內容出處） |
| 測試 | `tools/test_app.js`（88 項） |
| 設定 | `.gitignore`、`package.json`、`README.md`、`start.bat`、Pages workflow |

合計約 **950 KB、44 個檔案**。

### 不會被推上去（`.gitignore` 已排除）

| 檔案 | 大小 | 原因 |
|---|---|---|
| `source.pdf` | 879 KB | 原始 PDF 較大；要保留出處就把 `.gitignore` 最後一行註解掉 |
| `tools/ipa.json` | 3.6 MB | `python tools/fetch_ipa.py` 可重建 |
| `tools/cache/cmudict.dict` | 3.5 MB | 下載快取 |
| `tools/lexicon.json` | 167 KB | 中間產物 |
| `node_modules/` | — | `npm install` 重建 |
| `shot-*.png` | — | 本機截圖 |

---

## 別人在這個倉庫怎麼用

```bat
git clone https://github.com/Joshua19683721/m3.git
cd m3

npm install                # 只有測試需要（jsdom）
npm start                   # http://127.0.0.1:8848
```

**要改題目內容**（換 PDF、修中文、加場景、改詞組對照表）：

```bat
pip install opencc-python-reimplemented PyPDF2
npm run build               # 解析 → 套校正 → 檢查 → 產生題庫 → 簡繁檢查
npm test                    # 88 項測試
```

`npm run build` 最後一步會檢查有沒有簡體字，**有就直接讓建置失敗**，
避免改動時不小心混入簡體字或台灣非法的異體字（臺／喫／遊泳／皇后後）。

---

## 想改網址樣式？

網址是用 hash 做的，所以不用設定伺服器轉址：

```
/                              首頁
/#food                         直接進「飲食餐桌」
/#food/12/3                    飲食餐桌 第 13 個單元 第 4 步
/#food/12/3/解析                同上，並直接開啟解析面板
/#browse/lunch                 查單字，關鍵字 lunch
/#查單字/午餐                    同上（中文關鍵字）
```

練習進度存在瀏覽器的 localStorage，**跟倉庫無關**——
換瀏覽器或換裝置就不會跟著走。若要跨裝置同步，`.github/workflows/deploy-pages.yml`
目前沒有後端，需要另外接 Firebase / Supabase 之類的服务才能做到。
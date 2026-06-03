<div align="center">
    <h1> Froggy 機器人</h1>
  <p>
    一個使用 Node.js 與 Discord.js 構建的 Discord 機器人。
    <br>
    可能具備一些功能。
  </p>
  <p>
    <img src="https://img.shields.io/badge/Node.js-18.x-43853d?style=flat-square&logo=node.js&logoColor=white" alt="Node.js Version" />
    <img src="https://img.shields.io/badge/Discord.js-v14-5865F2?style=flat-square&logo=discord&logoColor=white" alt="Discord.js Version" />
    <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License" />
  </p>

</div>

<hr>

## 環境需求

在開始之前，請確保您的系統已安裝以下軟體：

*   <a href="https://nodejs.org/"><b>Node.js</b></a>（建議使用 v18 或以上版本）
*   <a href="https://github.com/yt-dlp/yt-dlp"><b>yt-dlp</b></a>（音樂播放器解析 YouTube 網址與音訊流之必要套件）
*   <i>（備註：FFmpeg 已由 <code>ffmpeg-static</code> 依賴項自動處理，但仍建議您在環境中安裝它）。</i>

<hr>

## 安裝與設定

<b>1. 複製原始碼：</b>
```bash
git clone <此項目 URL>
cd froggy
```

<b>2. 安裝依賴套件：</b>
```bash
npm install
```

<b>3. 設定環境變數：</b>
複製範例環境變數檔案，並填入您的憑證資訊。
```bash
cp .env.example .env
```
> **必要變數 (`.env`)：**
> *   `TOKEN`: 您的 Discord 機器人 Token（可從 [Discord Developer Portal](https://discord.com/developers/applications) 取得）。
> *   `STEAM_API_KEY`: 若要使用 `/steam` 指令，此為選項。
> *   `YOUTUBE_API_KEY`: 若要使用 `/youtube` 指令，此爲選項。

<b>4. 部署斜線指令：</b>
在啟動機器人之前，您必須先向 Discord 註冊它的斜線指令。
```bash
npm run deploy
```
*（若日後需要移除所有指令，可以執行 <code>npm run clear</code>）*

<hr>

## 啟動機器人

<details open>
<summary><b>開發模式</b>（存檔時會自動重新啟動）</summary>

```bash
npm run dev
```

</details>

<details open>
<summary><b>正式上線模式</b></summary>

```bash
npm run start
```

</details>

<hr>

## 授權條款

本專案採用 `LICENSE` 檔案中記載之授權條款。

----

你既然要走了，那就走吧。祝你生活愉快！

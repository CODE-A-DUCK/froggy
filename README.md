## 這是可能是一隻 Discord 機 氣 人

這是一個基於 Node.js 的 Discord 機氣人，採用我们觉得很厲害的分離架構（多看看我们是怎么写屎山代码的吧！）。

### 這應該是開始

#### 1. 設定
複製 `.env.example` 並重新命名為 `.env`，然後填入必要的資訊：
```bash
cp .env.example .env
```
所需的變數包含：
- `DISCORD_TOKEN`: 你的機气人 Token。
- `REDIS_URL`: Redis 連線字串 (預設為 `redis://127.0.0.1:6379`)。
- `TEST_GUILD_ID`: (選填) 用於測試指令的伺服器 ID。

#### 2. 啟動 Redis
音乐功能依賴 Redis 進行跨進程通訊。如果你本地沒有 Redis，可以使用 Docker 快速啟動：

```bash
docker run -d --name <名字> -p 6379:6379 redis:alpine
```
請確保 `.env` 中的 `REDIS_URL` 與你的 Redis 端口一致。

#### 3. 安裝依賴
使用 Node.js 作為運行環境。

```bash
cd bot && npm install

cd ../player && npm install
```

#### 4. 部署斜線指令
在啟動你的鸡气人之前，你需要將指令註冊到 Discord：

```bash
cd bot
# 部署到特定的伺服器 (我們推薦你在開發時使用)
node src/deploy/deploy.js --guild <YOUR_GUILD_ID>
# 或
# 部署到全域（可能會比較慢喲）
node src/deploy/deploy.js --global
```

#### 5. 啟動機氣人

##### 你可以使用 Node 啟動

```bash
cd bot && node .
cd player && node .
```

##### Docker
`docker-compose.yml` 可以快速部署：

```bash
docker-compose up -d
```

### 結構
- `bot/`: 負責處理 Discord 互動、指令、UI 更新。
- `player/`: 負責語音連線、音訊處理與播放。
- `execute.js`: 用於測試或執行特定任務的腳本。

import { createCanvas, loadImage } from "canvas";
import { SlashCommandBuilder, AttachmentBuilder } from "discord.js";
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

//數字格式化（1.2M / 345K）
function formatNumber(num) {
  if (!num) return "0";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 10_000) return Math.floor(num / 1_000) + "K";
  return num.toLocaleString();
}

export const youtubeCommand = {
  name: "youtube",
  category: "<:gameline:1510524519494848512> | 檔案查詢",
  data: new SlashCommandBuilder()
    .setName("youtube")
    .setDescription("查詢 YouTube 頻道檔案")
    .addStringOption((option) =>
      option
        .setName("channel")
        .setDescription("輸入 @handle、頻道 ID 或完整 YouTube 網址")
        .setRequired(true),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    if (!YOUTUBE_API_KEY) {
      return interaction.editReply(
        "我似乎尚未設定 YouTube API Key，請聯絡開發者",
      );
    }

    let input = interaction.options.getString("channel").trim();

    try {
      let channelId = null;
      let handle = null;

      const clean = input
        .replace(/https?:\/\/(www\.)?youtube\.com\//, "")
        .replace(/\/$/, "");

      if (clean.startsWith("@")) {
        handle = clean.substring(1);
      } else if (clean.startsWith("channel/")) {
        channelId = clean.split("/")[1];
      } else if (/^UC[\w-]{22}$/.test(clean)) {
        channelId = clean;
      } else {
        handle = clean; //假設是 handle
      }

      //取得頻道資料
      let apiUrl;
      if (channelId) {
        apiUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&id=${channelId}&key=${YOUTUBE_API_KEY}`;
      } else {
        apiUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&forHandle=${handle}&key=${YOUTUBE_API_KEY}`;
      }

      const res = await fetch(apiUrl);
      const data = await res.json();

      if (!data.items || data.items.length === 0) {
        return interaction.editReply(
          "<:errorwarningline:1510529314515320944> | 找不到這個 YouTube 頻道，請確認 ID 或 @handle 是否正確",
        );
      }

      const channel = data.items[0];
      const snippet = channel.snippet;
      const stats = channel.statistics || {};
      const branding = channel.brandingSettings || {};
      const channelIdFinal = channel.id;

      const channelName = snippet.title;
      const customUrl = snippet.customUrl || `@${handle || ""}`;
      const subscriberCount = parseInt(stats.subscriberCount || 0);
      const viewCount = parseInt(stats.viewCount || 0);
      const videoCount = parseInt(stats.videoCount || 0);
      const description = (snippet.description || "").substring(0, 160);
      const avatarUrl =
        snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url;
      const bannerUrl = branding.image?.bannerExternalUrl || null;

      //取得最新 3 部影片
      let recentVideos = [];
      try {
        const uploadsId = `UU${channelIdFinal.substring(2)}`;
        const plRes = await fetch(
          `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsId}&maxResults=3&key=${YOUTUBE_API_KEY}`,
        );
        const plData = await plRes.json();
        if (plData.items) {
          recentVideos = plData.items.map((item) => ({
            title: item.snippet.title,
            thumbnail: item.snippet.thumbnails?.medium?.url,
          }));
        }
      } catch {
        console.log("[YouTube] unable to find newest vid");
      }

      const canvas = createCanvas(1400, 720);
      const ctx = canvas.getContext("2d");

      //背景
      if (bannerUrl) {
        try {
          const banner = await loadImage(bannerUrl);
          ctx.drawImage(banner, 0, 0, 1400, 720);
        } catch {
          ctx.fillStyle = "#0f1724";
          ctx.fillRect(0, 0, 1400, 720);
        }
      } else {
        ctx.fillStyle = "#0f1724";
        ctx.fillRect(0, 0, 1400, 720);
      }

      ctx.fillStyle = "rgba(15, 23, 36, 0.78)";
      ctx.fillRect(0, 0, 1400, 720);

      //頭像
      const avatarX = 70,
        avatarY = 70,
        avatarSize = 170;
      if (avatarUrl) {
        try {
          const avatar = await loadImage(avatarUrl);
          ctx.save();
          ctx.beginPath();
          ctx.arc(
            avatarX + avatarSize / 2,
            avatarY + avatarSize / 2,
            avatarSize / 2,
            0,
            Math.PI * 2,
          );
          ctx.clip();
          ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
          ctx.restore();

          //白色外框
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(
            avatarX + avatarSize / 2,
            avatarY + avatarSize / 2,
            avatarSize / 2 + 3,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
        } catch {
          ctx.fillStyle = "#0f1724";
          ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
        }
      }

      //文字
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 34px 'Microsoft YaHei'";
      ctx.fillText(channelName, 280, 105);

      ctx.fillStyle = "#b0bec5";
      ctx.font = "18px 'Microsoft YaHei'";
      ctx.fillText(customUrl, 280, 138);

      //統計數字
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 22px 'Microsoft YaHei'";
      ctx.fillText(`訂閱者 ${formatNumber(subscriberCount)}`, 280, 185);
      ctx.fillText(`觀看總數 ${formatNumber(viewCount)}`, 580, 185);
      ctx.fillText(`影片 ${videoCount.toLocaleString()}`, 920, 185);

      //簡介
      if (description) {
        ctx.fillStyle = "#c1c8d1";
        ctx.font = "16px 'Microsoft YaHei'";
        const lines = description.match(/.{1,65}/g) || [description];
        lines.slice(0, 3).forEach((line, i) => {
          ctx.fillText(line, 280, 225 + i * 24);
        });
      }

      //最新影片
      let y = 310;
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px 'Microsoft YaHei'";
      ctx.fillText("最新上傳", 70, y);
      y += 35;

      for (let i = 0; i < Math.min(recentVideos.length, 3); i++) {
        const vid = recentVideos[i];
        const x = 70 + i * 430;

        try {
          const thumb = await loadImage(vid.thumbnail);
          ctx.drawImage(thumb, x, y, 400, 225);
        } catch {
          ctx.fillStyle = "#0f1724";
          ctx.fillRect(x, y, 400, 225);
        }

        ctx.fillStyle = "#e0e0e0";
        ctx.font = "14px 'Microsoft YaHei'";
        const titleLines = vid.title.match(/.{1,42}/g) || [vid.title];
        titleLines.slice(0, 2).forEach((line, j) => {
          ctx.fillText(line, x, y + 245 + j * 18);
        });
      }

      //Footer
      ctx.fillStyle = "#666666";
      ctx.font = "12px 'Microsoft YaHei'";
      ctx.fillText("Froggy DC 機器人 • YouTube 頻道檔案", 70, 695);

      const buffer = canvas.toBuffer("image/png");
      const attachment = new AttachmentBuilder(buffer, {
        name: "youtube-profile.png",
      });
      await interaction.editReply({ files: [attachment] });
    } catch (error) {
      console.error("[Command:YouTube] Error:", error);
      await interaction.editReply({
        content:
          "<:errorwarningline:1510529314515320944> | 該頻道可能已設為不公開，或暫時無法取得資料",
      });
    }
  },
};

import { SlashCommandBuilder, AttachmentBuilder, Collection } from "discord.js";
import { createCanvas, loadImage } from "canvas";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultBgPath = join(__dirname, "../../assist/default-bg.png");
const STEAM_KEY = process.env.STEAM_API_KEY;

//ffmpeg 路徑
ffmpeg.setFfmpegPath(ffmpegStatic);

const countryNames = {
  HK: "香港", TW: "台灣", CN: "中國", JP: "日本", KR: "韓國",
  US: "美國", GB: "英國", CA: "加拿大", AU: "澳洲", DE: "德國",
  FR: "法國", SG: "新加坡", MY: "馬來西亞", TH: "泰國", VN: "越南",
  FL: "芬蘭", SE: "瑞典", NO: "挪威"
};

//若是 webm 截取第一幀
async function extractFirstFrameFromWebm(webmUrl) {
  return new Promise((resolve) => {
    const tempPath = join(tmpdir(), `froggy-steam-bg-${Date.now()}.png`);
    ffmpeg(webmUrl)
      .inputOptions(["-ss", "0"])
      .outputOptions(["-frames:v", "1", "-q:v", "2"])
      .output(tempPath)
      .on("end", () => resolve(tempPath))
      .on("error", () => resolve(null))
      .run();
  });
}

//cheerio 抓取背景圖
async function getSteamProfileBackground(steam64, existingHtml = null) {
  try {
    let html = existingHtml;
    if (!html) {
      const profileUrl = `https://steamcommunity.com/profiles/${steam64}?l=english`;
      const res = await fetch(profileUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      if (!res.ok) return null;
      html = await res.text();
    }

    const $ = cheerio.load(html);
    let bgUrl = null;

    const bgDiv = $(".has_profile_background, .full_width_background, .no_header.profile_page");
    if (bgDiv.length > 0) {
      const style = bgDiv.attr("style") || "";
      const match = style.match(/url\(['"]?([^'")]+)['"]?\)/i);
      if (match && match[1]) {
        bgUrl = match[1].startsWith("http") ? match[1] : `https:${match[1]}`;
        return bgUrl;
      }
    }

    const regex = /https?:\/\/[^"'\s]+(steamcommunity|fastly\.steamstatic)\.com\/(community_assets|public)\/images\/items\/[^"'\s]+\.(jpg|png|webp)/gi;
    const allMatches = [...html.matchAll(regex)].map(m => m[0]);
    if (allMatches.length > 0) {
      const jpgMatch = allMatches.find(url => url.endsWith(".jpg"));
      bgUrl = jpgMatch || allMatches[allMatches.length - 1];
    }

    if (bgUrl && !bgUrl.startsWith("http")) bgUrl = `https:${bgUrl}`;
    if (!bgUrl) return null;

    if (bgUrl.endsWith(".webm")) {
      const framePath = await extractFirstFrameFromWebm(bgUrl);
      return framePath || null;
    }
    return bgUrl;
  } catch {
    return null;
  }
}

export const steamCommand = {
  name: "steam",
  category: "<:gameline:1510524519494848512> | 檔案查詢",
  data: new SlashCommandBuilder()
    .setName("steam")
    .setDescription("查詢 Steam 玩家檔案")
    .addStringOption((option) =>
      option.setName("steamid").setDescription("輸入 Steam64 ID、自定義網址名稱或完整網址（非檔案名稱/profile name）").setRequired(true),
    ),

  async execute(interaction, context) {
    await interaction.deferReply();
    if (!STEAM_KEY) return interaction.editReply("我似乎尚未設定 Steam API Key，請聯絡開發者");

    let input = interaction.options.getString("steamid").trim();
    let steam64 = input;

    try {
      let cleanInput = input.replace(/https?:\/\/steamcommunity\.com\//, "").replace(/\/$/, "");
      if (cleanInput.startsWith("profiles/")) {
        steam64 = cleanInput.split("/")[1];
      } else if (cleanInput.startsWith("id/")) {
        const vanity = cleanInput.split("/")[1];
        const resolveRes = await fetch(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${STEAM_KEY}&vanityurl=${vanity}`);
        const resolveData = await resolveRes.json();
        if (resolveData.response?.success !== 1) return interaction.editReply("<:errorwarningline:1510529314515320944> | 找不到這位 Steam 玩家");
        steam64 = resolveData.response.steamid;
      } else if (!/^\d{17}$/.test(cleanInput)) {
        const resolveRes = await fetch(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${STEAM_KEY}&vanityurl=${cleanInput}`);
        const resolveData = await resolveRes.json();
        if (resolveData.response?.success !== 1) return interaction.editReply("<:errorwarningline:1510529314515320944> | 找不到這位 Steam 玩家");
        steam64 = resolveData.response.steamid;
      }

      const summaryRes = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_KEY}&steamids=${steam64}`);
      const player = (await summaryRes.json()).response?.players?.[0];
      if (!player) return interaction.editReply("<:errorwarningline:1510529314515320944> | 找不到這位 Steam 玩家");

      const levelRes = await fetch(`https://api.steampowered.com/IPlayerService/GetSteamLevel/v1/?key=${STEAM_KEY}&steamid=${steam64}`);
      const level = (await levelRes.json()).response?.player_level || "未知";

      const ownedRes = await fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${STEAM_KEY}&steamid=${steam64}&include_appinfo=true&include_played_free_games=true`);
      const ownedData = await ownedRes.json();
      const ownedCount = ownedData.response?.game_count || 0;
      const allGames = ownedData.response?.games || [];
      const mostPlayed = [...allGames].sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 5);
      const totalHours = Math.floor(allGames.reduce((sum, g) => sum + (g.playtime_forever || 0), 0) / 60);

      const recentRes = await fetch(`https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=${STEAM_KEY}&steamid=${steam64}&count=4`);
      const recentGames = (await recentRes.json()).response?.games || [];

      const currentlyPlaying = player.gameextrainfo || null;
      const countryCode = player.loccountrycode || "";
      const country = countryNames[countryCode] || countryCode || "未知";
      const realName = player.realname ? `${player.realname} • ` : "";

      let accountAge = "";
      if (player.timecreated) {
        const createdDate = new Date(player.timecreated * 1000);
        const years = Math.floor((Date.now() - createdDate) / (1000 * 60 * 60 * 24 * 365));
        accountAge = `已加入 Steam ${years} 年又 ${Math.floor((Date.now() - createdDate) / (1000 * 60 * 60 * 24)) % 365} 天`;
      }

      let profileHtml = "";
      let $ = null;
      let bio = "";
      let avatarFrameUrl = null;
      let featuredBadge = null;
      let badgeCount = 0;
      let badgePreviews = [];
      let friendCount = 0;
      let showcaseImage = null;
      let showcaseTitle = "";

      try {
        const profileRes = await fetch(`https://steamcommunity.com/profiles/${steam64}?l=english`, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          },
        });
        profileHtml = await profileRes.text();
        $ = cheerio.load(profileHtml);

        bio = $(".profile_summary").text().trim().replace(/\s+/g, " ").substring(0, 120) || "";

        const frameSrc = $(".profile_avatar_frame picture img, .profile_avatar_frame source").attr("srcset") ||
                         $(".profile_avatar_frame img").attr("src");
        if (frameSrc) avatarFrameUrl = frameSrc.split(" ")[0];

        const badgeIcon = $(".favorite_badge_icon img").attr("src");
        const badgeName = $(".favorite_badge_description .name").text().trim();
        const badgeXp = $(".favorite_badge_description .xp").text().trim();
        if (badgeIcon && badgeName) {
          featuredBadge = { icon: badgeIcon, name: badgeName, xp: badgeXp };
        }

        badgeCount = parseInt($(".profile_count_link_total").first().text().trim()) || 0;
        $(".profile_badges_badge img").each((i, el) => {
          if (i < 4) badgePreviews.push($(el).attr("src"));
        });

        friendCount = parseInt($(".profile_friend_links .profile_count_link_total").text().trim()) || 0;

        const customization = $(".profile_customization").first();
        if (customization.length > 0) {
          showcaseTitle = customization.find(".profile_customization_header").text().trim();
          const img = customization.find("img").first();
          if (img.length > 0) {
            showcaseImage = img.attr("src");
          }
        }
      } catch (e) {
        console.log("[Steam] 額外資料抓取失敗（使用預設）");
      }

      //抓取背景
      let finalBgUrl = null;
      const scrapedBg = await getSteamProfileBackground(steam64, profileHtml);
      if (scrapedBg) finalBgUrl = scrapedBg;

      //Canvas 繪製
      const canvas = createCanvas(1400, 750);
      const ctx = canvas.getContext("2d");

      // 使用固定好看的深色
      const cardColor = "rgba(25, 30, 52, 0.93)";

      if (finalBgUrl) {
        try {
          const bgImage = await loadImage(finalBgUrl);
          ctx.drawImage(bgImage, 0, 0, 1400, 750);

          // 加強高斯模糊（外面更明顯）
          ctx.filter = "blur(48px)";
          ctx.drawImage(bgImage, 0, 0, 1400, 750);
          ctx.filter = "none";

          ctx.fillStyle = "rgba(15, 23, 36, 0.78)";
          ctx.fillRect(0, 0, 1400, 750);
        } catch {}
      } else {
        const defaultBg = await loadImage(defaultBgPath);
        ctx.drawImage(defaultBg, 0, 0, 1400, 750);
        ctx.filter = "blur(48px)";
        ctx.drawImage(defaultBg, 0, 0, 1400, 750);
        ctx.filter = "none";
        ctx.fillStyle = "rgba(15, 23, 36, 0.78)";
        ctx.fillRect(0, 0, 1400, 750);
      }

      // === 中間卡片（圓角 32px）===
      const cardX = 70;
      const cardY = 35;
      const cardWidth = 1260;
      const cardHeight = 680;
      const radius = 32;

      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
      ctx.shadowBlur = 45;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 18;

      ctx.fillStyle = cardColor;
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardWidth, cardHeight, radius);
      ctx.fill();
      ctx.restore();

      // 卡片內部內容區域
      const contentX = cardX + 45;
      const contentY = cardY + 38;

      const avatar = await loadImage(player.avatarfull);
      const avatarX = contentX;
      const avatarY = contentY;
      const avatarSize = 155;

      //頭像
      ctx.save();
      ctx.beginPath();
      ctx.rect(avatarX, avatarY, avatarSize, avatarSize);
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();

      if (avatarFrameUrl) {
        try {
          const frame = await loadImage(avatarFrameUrl);
          ctx.drawImage(frame, avatarX - 10, avatarY - 10, avatarSize + 20, avatarSize + 20);
        } catch {}
      }

      //玩家名稱
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 22px 'Microsoft YaHei'";
      ctx.fillText(player.personaname, contentX + 180, contentY + 32);

      //名稱與國家/地區
      ctx.fillStyle = "#b0bec5";
      ctx.font = "15px 'Microsoft YaHei'";
      ctx.fillText(`${realName}${country}`, contentX + 180, contentY + 55);

      //Steam ID
      ctx.fillStyle = "#b0bec5";
      ctx.font = "14px 'Microsoft YaHei'";
      ctx.fillText(`ID: ${steam64}`, contentX + 180, contentY + 75);

      //加入時間
      if (accountAge) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "13px 'Microsoft YaHei'";
        ctx.fillText(accountAge, contentX + 180, contentY + 95);
      }

      //簡介
      if (bio) {
        ctx.fillStyle = "#c1c8d1";
        ctx.font = "14px 'Microsoft YaHei'";
        const lines = bio.match(/.{1,48}/g) || [bio];
        lines.slice(0, 3).forEach((line, i) => {
          ctx.fillText(line, contentX + 180, contentY + 118 + (i * 17));
        });
      }

      // === 右側欄位 ===
      const rightX = contentX + 960;

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 26px 'Microsoft YaHei'";
      ctx.fillText(`Level ${level}`, rightX, contentY + 28);

      if (featuredBadge) {
        try {
          const badgeImg = await loadImage(featuredBadge.icon);
          ctx.drawImage(badgeImg, rightX, contentY + 42, 50, 50);
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 15px 'Microsoft YaHei'";
          ctx.fillText(featuredBadge.name, rightX + 58, contentY + 65);
          ctx.fillStyle = "#b0bec5";
          ctx.font = "12px 'Microsoft YaHei'";
          ctx.fillText(featuredBadge.xp, rightX + 58, contentY + 82);
        } catch {}
      }

      //徽章預覽
      let badgeX = rightX;
      for (let i = 0; i < Math.min(badgePreviews.length, 3); i++) {
        try {
          const b = await loadImage(badgePreviews[i]);
          ctx.drawImage(b, badgeX, contentY + 100, 40, 40);
          badgeX += 46;
        } catch {}
      }

      if (badgeCount > 3) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 17px 'Microsoft YaHei'";
        ctx.fillText(`+ ${badgeCount - 3}`, rightX + 145, contentY + 128);
      }

      //游戲統計
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px 'Microsoft YaHei'";
      ctx.fillText(`擁有 ${ownedCount} 款遊戲 • 總遊玩 ${totalHours} 小時`, contentX, contentY + 195);

      //最近玩的游戲
      let y = contentY + 225;
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px 'Microsoft YaHei'";
      ctx.fillText("最近玩的遊戲", contentX, y);
      y += 26;

      for (let i = 0; i < Math.min(recentGames.length, 4); i++) {
        const game = recentGames[i];
        try {
          const banner = await loadImage(`https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`);
          ctx.drawImage(banner, contentX, y, 105, 40);
        } catch {}
        ctx.fillStyle = "#e0e0e0";
        ctx.font = "13px 'Microsoft YaHei'";
        ctx.fillText(`${game.name} — ${(game.playtime_2weeks / 60).toFixed(1)} 小時`, contentX + 115, y + 24);
        y += 48;
      }

      //最常玩的游戲
      y = contentY + 225;
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px 'Microsoft YaHei'";
      ctx.fillText("最常玩的遊戲（總時數）", contentX + 700, y);
      y += 26;

      for (let i = 0; i < Math.min(mostPlayed.length, 5); i++) {
        const game = mostPlayed[i];
        try {
          const banner = await loadImage(`https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`);
          ctx.drawImage(banner, contentX + 700, y, 105, 40);
        } catch {}
        ctx.fillStyle = "#e0e0e0";
        ctx.font = "13px 'Microsoft YaHei'";
        ctx.fillText(`${game.name} — ${(game.playtime_forever / 60).toFixed(1)} 小時`, contentX + 815, y + 24);
        y += 48;
      }

      //底部
      ctx.fillStyle = "#888888";
      ctx.font = "12px 'Microsoft YaHei'";
      ctx.fillText("Froggy DC 機器人 • Steam profile", contentX, cardY + cardHeight - 22);

      const buffer = canvas.toBuffer("image/png");
      const attachment = new AttachmentBuilder(buffer, { name: "steam-profile.png" });
      await interaction.editReply({ files: [attachment] });

    } catch (error) {
      console.error("[Command:Steam] Error:", error);
      await interaction.editReply({ content: "<:errorwarningline:1510529314515320944> | 該玩家已將其 Steam 賬戶設為私密，或暫時無法取得資料" });
    }
  },
};
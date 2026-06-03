import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createCanvas, loadImage } from "canvas";
import { SlashCommandBuilder, AttachmentBuilder } from "discord.js";

import { EMOJIS } from "../../../../shared/emojis.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STEAM_KEY = process.env.STEAM_API_KEY;

const bgPath = join(__dirname, "../../../../../assets/images/bg_hoi.jpg");

export const hoi4profileCommand = {
  name: "hoi4profile",
  category: `${EMOJIS.hoi_anime} | 鋼鐵雄心IV`,
  data: new SlashCommandBuilder()
    .setName("hoi4profile")
    .setDescription("查詢 Hearts of Iron IV 玩家檔案與成就")
    .addStringOption((option) =>
      option
        .setName("steamid")
        .setDescription("輸入 Steam64 ID 或網址")
        .setRequired(true),
    ),

  async execute(interaction) {
    await interaction.deferReply();
    if (!STEAM_KEY)
      return interaction.editReply(
        "我似乎尚未設定 Steam API Key，請聯絡開發者",
      );

    let input = interaction.options.getString("steamid").trim();
    let steam64 = input;

    try {
      //Steam ID 解析
      let cleanInput = input
        .replace(/https?:\/\/steamcommunity\.com\//, "")
        .replace(/\/$/, "");
      if (cleanInput.startsWith("profiles/"))
        steam64 = cleanInput.split("/")[1];
      else if (cleanInput.startsWith("id/")) {
        const vanity = cleanInput.split("/")[1];
        const res = await fetch(
          `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${STEAM_KEY}&vanityurl=${vanity}`,
        );
        const data = await res.json();
        if (data.response?.success !== 1)
          return interaction.editReply(
            `${EMOJIS.errorwarningline} | 找不到這位 Steam 玩家`,
          );
        steam64 = data.response.steamid;
      } else if (!/^\d{17}$/.test(cleanInput)) {
        const res = await fetch(
          `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${STEAM_KEY}&vanityurl=${cleanInput}`,
        );
        const data = await res.json();
        if (data.response?.success !== 1)
          return interaction.editReply(
            `${EMOJIS.errorwarningline} | 找不到這位 Steam 玩家`,
          );
        steam64 = data.response.steamid;
      }

      const summaryRes = await fetch(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_KEY}&steamids=${steam64}`,
      );
      const player = (await summaryRes.json()).response?.players?.[0];
      if (!player)
        return interaction.editReply(
          `${EMOJIS.errorwarningline} | 找不到這位 Steam 玩家`,
        );

      const ownedRes = await fetch(
        `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${STEAM_KEY}&steamid=${steam64}&include_appinfo=true`,
      );
      const hoi4Game = ((await ownedRes.json()).response?.games || []).find(
        (g) => g.appid === 394360,
      );
      const playtimeHours = hoi4Game
        ? Math.floor((hoi4Game.playtime_forever || 0) / 60)
        : 0;

      let achieved = 0,
        totalAch = 0;
      try {
        const achRes = await fetch(
          `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=394360&key=${STEAM_KEY}&steamid=${steam64}`,
        );
        const list = (await achRes.json()).playerstats?.achievements || [];
        achieved = list.filter((a) => a.achieved === 1).length;
        totalAch = list.length;
      } catch {
        ctx.fillStyle = "#0f1724";
        ctx.fillRect(0, 0, 1400, 520);
      }

      // canvas
      const canvas = createCanvas(1400, 520);
      const ctx = canvas.getContext("2d");

      // 背景
      const bg = await loadImage(bgPath);
      ctx.drawImage(bg, 0, 0, 1400, 520);

      // 置中卡片
      const cardX = 80,
        cardY = 50,
        cardW = 1240,
        cardH = 420,
        radius = 32;

      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.65)";
      ctx.shadowBlur = 45;
      ctx.shadowOffsetY = 15;
      ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardW, cardH, radius);
      ctx.fill();
      ctx.restore();

      const pad = 55;

      // 左側：頭像+名字
      const avatar = await loadImage(player.avatarfull);
      const avatarSize = 165;
      const leftX = cardX + pad;
      const leftY = cardY + 85;

      ctx.save();
      ctx.beginPath();
      ctx.arc(
        leftX + avatarSize / 2,
        leftY + avatarSize / 2,
        avatarSize / 2,
        0,
        Math.PI * 2,
      );
      ctx.clip();
      ctx.drawImage(avatar, leftX, leftY, avatarSize, avatarSize);
      ctx.restore();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 26px 'Microsoft YaHei'";
      ctx.fillText(player.personaname, leftX + avatarSize + 30, leftY + 50);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "14px 'Microsoft YaHei'";
      ctx.fillText(`Steam ID: ${steam64}`, leftX + avatarSize + 30, leftY + 78);

      // 右側遊玩時數+成就
      const rightX = cardX + cardW - 420;
      const rightY = cardY + 100;

      ctx.fillStyle = "#00d4ff";
      ctx.font = "bold 18px 'Microsoft YaHei'";
      ctx.fillText("⏱️ 遊玩時數", rightX, rightY);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 46px 'Microsoft YaHei'";
      ctx.fillText(`${playtimeHours} 小時`, rightX, rightY + 55);

      ctx.fillStyle = "#ffd700";
      ctx.font = "bold 18px 'Microsoft YaHei'";
      ctx.fillText("🏆 成就進度", rightX, rightY + 110);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 46px 'Microsoft YaHei'";
      ctx.fillText(`${achieved} / ${totalAch || "???"}`, rightX, rightY + 165);

      if (totalAch > 0) {
        const progress = Math.min(achieved / totalAch, 1);
        ctx.fillStyle = "#475569";
        ctx.fillRect(rightX, rightY + 195, 340, 14);
        ctx.fillStyle = "#00d4ff";
        ctx.fillRect(rightX, rightY + 195, 340 * progress, 14);
      }

      // Footer
      ctx.fillStyle = "#475569";
      ctx.font = "11px 'Microsoft YaHei'";
      ctx.fillText(
        "Froggy DC 機器人 • Hearts of Iron IV",
        leftX,
        cardY + cardH - 35,
      );

      const buffer = canvas.toBuffer("image/png");
      const attachment = new AttachmentBuilder(buffer, {
        name: "hoi4-profile.png",
      });
      await interaction.editReply({ files: [attachment] });
    } catch (error) {
      console.error("[HOI4Profile] Error:", error);
      await interaction.editReply({
        content: `${EMOJIS.errorwarningline} | 資料取得失敗`,
      });
    }
  },
};

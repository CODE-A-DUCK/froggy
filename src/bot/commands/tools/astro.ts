import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";

import { EMOJIS } from "../../../shared/emojis.js";
import {
  geocode,
  getWeather,
  get7Timer,
  getAstronomyData,
  type LocationInfo,
  type WeatherData,
  type SevenTimerData,
  type AstronomyData,
} from "../../services/astro-service.js";

import { renderWeatherImage, type WeatherView } from "./astro/renderer.js";

const formatTime = (d: Date | null): string =>
  d ? `<t:${Math.floor(d.getTime() / 1000)}:t>` : "未知";

function buildTonightEmbed(
  loc: LocationInfo,
  weather: WeatherData | null,
  timer7: SevenTimerData | null,
  astro: AstronomyData,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor("#2b2d31")
    .setTitle(`🔭 | 觀測: ${loc.name}, ${loc.country}`)
    .setDescription(`座標: \`${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}\``)
    .setImage("attachment://weather.png")
    .setTimestamp();

  embed.addFields(
    {
      name: `${EMOJIS.eyeline} | 大氣條件`,
      value: timer7
        ? `> 視寧度:\n **${timer7.seeing}**\n> 透明度:\n **${timer7.transparency}**`
        : "> \n **無法獲取數據**",
      inline: true,
    },
    {
      name: `${EMOJIS.moonline} | 月球`,
      value: [
        `> 月相:\n **${astro.moonPhaseName}** (${astro.moonPhasePercent.toFixed(1)}%)`,
        `> 亮度:\n **${astro.moonIllumination.toFixed(1)}%**`,
        `> 距離:\n **${astro.moonDistanceKm.toLocaleString(undefined, { maximumFractionDigits: 0 })} km**`,
        `> 月升月落:\n ${formatTime(astro.moonrise)} | ${formatTime(astro.moonset)}`,
        `> 下次新月:\n ${formatTime(astro.nextNewMoon)}`,
        `> 下次滿月:\n ${formatTime(astro.nextFullMoon)}`,
      ].join("\n"),
      inline: true,
    },
    {
      name: `${EMOJIS.suncloudyline} | 太陽與曙暮光`,
      value: [
        `> 日出日落:\n ${formatTime(astro.sunrise)} | ${formatTime(astro.sunset)}`,
        `> 民用 (-6°):\n ${formatTime(astro.twilightCivilDawn)} | ${formatTime(astro.twilightCivilDusk)}`,
        `> 航海 (-12°):\n ${formatTime(astro.twilightNauticalDawn)} | ${formatTime(astro.twilightNauticalDusk)}`,
        `> 天文 (-18°):\n ${formatTime(astro.twilightAstroDawn)} | ${formatTime(astro.twilightAstroDusk)}`,
      ].join("\n"),
      inline: true,
    },
    {
      name: `${EMOJIS.planetline} | 今晚可見行星`,
      value:
        astro.visiblePlanetsNames.length > 0
          ? `> ${astro.visiblePlanetsNames.join(", ")}`
          : "> *今晚無明顯可見行星*",
      inline: false,
    },
  );

  return embed;
}

async function handleTonight(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const locationQuery = interaction.options.getString("location", true);

  const loc = await geocode(locationQuery);
  if (!loc) {
    await interaction.editReply(
      `${EMOJIS.errorwarningline} | 找不到地點 \`${locationQuery}\`，請嘗試輸入其他名稱。`,
    );
    return;
  }

  const [weather, timer7, astro] = await Promise.all([
    getWeather(loc.lat, loc.lon),
    get7Timer(loc.lat, loc.lon),
    getAstronomyData(loc.lat, loc.lon),
  ]);

  if (!weather) {
    await interaction.editReply(
      `${EMOJIS.errorwarningline} | 無法獲取天氣數據。`,
    );
    return;
  }

  const buildComponents = (activeView: WeatherView) => {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("view_temperature")
        .setLabel("溫度")
        .setEmoji(EMOJIS.temphotfill)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(activeView === "temperature"),
      new ButtonBuilder()
        .setCustomId("view_precipitation")
        .setLabel("降水")
        .setEmoji(EMOJIS.waterpercentline)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(activeView === "precipitation"),
      new ButtonBuilder()
        .setCustomId("view_wind")
        .setLabel("風速")
        .setEmoji(EMOJIS.windyline)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(activeView === "wind"),
      new ButtonBuilder()
        .setCustomId("view_forecast")
        .setLabel("7天預報")
        .setEmoji(EMOJIS.calendarline)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(activeView === "forecast"),
    );
  };

  let currentView: WeatherView = "temperature";
  let imageBuffer = await renderWeatherImage(weather, loc, currentView);
  let attachment = new AttachmentBuilder(imageBuffer, { name: "weather.png" });
  let embed = buildTonightEmbed(loc, weather, timer7, astro);

  const message = await interaction.editReply({
    embeds: [embed],
    files: [attachment],
    components: [buildComponents(currentView)],
  });

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 180000,
  });

  collector.on("collect", async (i) => {
    if (i.user.id !== interaction.user.id) {
      await i.reply({
        content: `${EMOJIS.errorwarningline} | 只有指令發起者可以操作此按鈕。`,
        ephemeral: true,
      });
      return;
    }

    await i.deferUpdate();

    const action = i.customId.replace("view_", "") as WeatherView;
    currentView = action;
    imageBuffer = await renderWeatherImage(weather, loc, currentView);
    attachment = new AttachmentBuilder(imageBuffer, { name: "weather.png" });
    embed = buildTonightEmbed(loc, weather, timer7, astro);

    await i.editReply({
      embeds: [embed],
      files: [attachment],
      components: [buildComponents(currentView)],
    });
  });

  collector.on("end", async () => {
    try {
      await interaction.editReply({
        components: [],
      });
    } catch (error) {}
  });
}

const subcommandHandlers: Record<
  string,
  (i: ChatInputCommandInteraction) => Promise<void>
> = {
  tonight: handleTonight,
};

export const astroCommand = {
  name: "astro",
  category: `${EMOJIS.bookshelfline} | 工具`,
  defer: true,
  data: new SlashCommandBuilder()
    .setName("astro")
    .setDescription("天文與天氣觀測資訊")
    .addSubcommand((sub) =>
      sub
        .setName("tonight")
        .setDescription("查看特定地點的今晚觀測條件與天文數據")
        .addStringOption((opt) =>
          opt
            .setName("location")
            .setDescription("地點名稱 (例如: 台北, Tokyo, New York)")
            .setRequired(true),
        ),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    await subcommandHandlers[interaction.options.getSubcommand()]?.(
      interaction,
    );
  },
};

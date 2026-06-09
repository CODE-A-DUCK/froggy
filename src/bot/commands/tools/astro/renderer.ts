import sharp from "sharp";
import { type WeatherData, type LocationInfo } from "../../../services/astro-service.js";
import { getWeatherIconPath } from "./icon-mapper.js";

export type WeatherView = "temperature" | "precipitation" | "wind" | "forecast";

function formatHour(isoTime: string): string {
  const d = new Date(isoTime);
  const h = d.getHours().toString().padStart(2, "0");
  return `${h}:00`;
}

function formatDay(isoTime: string): string {
  const d = new Date(isoTime);
  const days = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
  return days[d.getDay()];
}

function getBackgroundGradient(hour: number, code: number): string {
  const isRain = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code);
  const isCloudy = [3, 45, 48].includes(code);

  const isMorning = hour >= 5 && hour <= 7;
  const isDay = hour > 7 && hour < 17;
  const isSunset = hour >= 17 && hour <= 18;
  const isNight = hour > 18 || hour < 5;

  if (isRain) {
    if (isNight) {
      return `
        <linearGradient id="bg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#0f172a"/>
          <stop offset="100%" stop-color="#020617"/>
        </linearGradient>
      `;
    }
    return `
      <linearGradient id="bg" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#475569"/>
        <stop offset="100%" stop-color="#1e293b"/>
      </linearGradient>
    `;
  }

  if (isCloudy) {
    if (isNight) {
      return `
        <linearGradient id="bg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#1e293b"/>
          <stop offset="100%" stop-color="#0f172a"/>
        </linearGradient>
      `;
    }
    return `
      <linearGradient id="bg" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#94a3b8"/>
        <stop offset="100%" stop-color="#64748b"/>
      </linearGradient>
    `;
  }

  if (isMorning) {
    return `
      <linearGradient id="bg" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#3b82f6"/>
        <stop offset="60%" stop-color="#f472b6"/>
        <stop offset="100%" stop-color="#fb923c"/>
      </linearGradient>
    `;
  }
  if (isSunset) {
    return `
      <linearGradient id="bg" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#312e81"/>
        <stop offset="50%" stop-color="#be185d"/>
        <stop offset="100%" stop-color="#f59e0b"/>
      </linearGradient>
    `;
  }
  if (isNight) {
    return `
      <linearGradient id="bg" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#020617"/>
        <stop offset="50%" stop-color="#0f172a"/>
        <stop offset="100%" stop-color="#1e1b4b"/>
      </linearGradient>
    `;
  }

  return `
    <linearGradient id="bg" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#2563eb"/>
    </linearGradient>
  `;
}

function getIconFill(code: number): string {
  if (code === 0) return "url(#iconSunny)";
  if ([1, 2].includes(code)) return "url(#iconCloudySunny)";
  if ([3, 45, 48].includes(code)) return "url(#iconCloudy)";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "url(#iconRain)";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "url(#iconSnow)";
  if ([95, 96, 99].includes(code)) return "url(#iconStorm)";
  return "#ffffff";
}

export async function renderWeatherImage(
  weather: WeatherData,
  loc: LocationInfo,
  view: WeatherView
): Promise<Buffer> {
  const width = 800;
  const height = 580;

  const now = new Date();

  let currentIndex = weather.hourly.time.findIndex(t => new Date(t).getTime() >= now.getTime());
  if (currentIndex === -1 || currentIndex > weather.hourly.time.length - 24) currentIndex = 0;

  // Extract local hour properly from the location's ISO time string (YYYY-MM-DDTHH:00)
  const localTimeStr = weather.hourly.time[currentIndex] || "";
  let localHour = parseInt(localTimeStr.substring(11, 13), 10);
  if (isNaN(localHour)) localHour = now.getHours();

  let svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600&amp;display=swap');
        text { font-family: 'Inter', sans-serif; }
        .text-main { fill: #ffffff; }
        .text-muted { fill: rgba(255, 255, 255, 0.6); }
        .text-accent { fill: rgba(255, 255, 255, 0.9); }
        .ultra-light { font-weight: 200; }
        .light { font-weight: 300; }
        .medium { font-weight: 500; }
        .semi-bold { font-weight: 600; }
        .bold { font-weight: 700; }
        .text-hero { font-size: 84px; letter-spacing: -3px; }
        .text-title { font-size: 32px; letter-spacing: -0.5px; }
        .text-lg { font-size: 24px; }
        .text-md { font-size: 16px; }
        .text-sm { font-size: 13px; letter-spacing: 0.5px; }
        .text-xs { font-size: 11px; letter-spacing: 0.2px; }
        .glass { fill: rgba(0, 0, 0, 0.2); stroke: rgba(255, 255, 255, 0.15); stroke-width: 1; }
      </style>
      ${getBackgroundGradient(localHour, weather.weatherCode)}
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.25"/>
      </filter>
      
      <filter id="iconShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000000" flood-opacity="0.25"/>
      </filter>

      <!-- Icon Gradients -->
      <linearGradient id="iconSunny" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#fef08a"/>
        <stop offset="40%" stop-color="#fbbf24"/>
        <stop offset="100%" stop-color="#f59e0b"/>
      </linearGradient>
      <linearGradient id="iconCloudySunny" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#fef08a"/>
        <stop offset="50%" stop-color="#cbd5e1"/>
        <stop offset="100%" stop-color="#94a3b8"/>
      </linearGradient>
      <linearGradient id="iconCloudy" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="50%" stop-color="#e2e8f0"/>
        <stop offset="100%" stop-color="#94a3b8"/>
      </linearGradient>
      <linearGradient id="iconRain" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#bae6fd"/>
        <stop offset="50%" stop-color="#3b82f6"/>
        <stop offset="100%" stop-color="#1d4ed8"/>
      </linearGradient>
      <linearGradient id="iconSnow" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="100%" stop-color="#cbd5e1"/>
      </linearGradient>
      <linearGradient id="iconStorm" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#f0abfc"/>
        <stop offset="50%" stop-color="#a855f7"/>
        <stop offset="100%" stop-color="#7e22ce"/>
      </linearGradient>
    </defs>

    <!-- Dynamic Background -->
    <rect width="${width}" height="${height}" fill="url(#bg)" />
  `;

  // === Hero Section ===
  const todayMax = weather.daily.tempMax.length > 0 ? Math.round(weather.daily.tempMax[0]) : Math.round(weather.temperature + 5);
  const todayMin = weather.daily.tempMin.length > 0 ? Math.round(weather.daily.tempMin[0]) : Math.round(weather.temperature - 5);

  svg += `
    <g transform="translate(400, 0)" filter="url(#shadow)">
      <text x="0" y="55" class="text-main light text-title" text-anchor="middle">${loc.name}</text>
      <text x="0" y="145" class="text-main ultra-light text-hero" text-anchor="middle">${Math.round(weather.temperature)}°</text>
      <text x="0" y="175" class="text-main medium text-md" text-anchor="middle">最高:${todayMax}° 最低:${todayMin}°</text>
    </g>
  `;

  // === Middle Section: Graph or Forecast ===
  svg += `
    <rect x="20" y="200" width="760" height="170" rx="24" class="glass" filter="url(#shadow)" />
  `;

  const graphX = 60;
  const graphY = 250;
  const graphW = 680;
  const graphH = 80;

  if (view === "temperature" || view === "precipitation" || view === "wind") {
    let iconPath = "M12 2C17.52 2 22 6.48 22 12C22 17.52 17.52 22 12 22C6.48 22 2 17.52 2 12C2 6.48 6.48 2 12 2ZM12 4C7.58 4 4 7.58 4 12C4 16.42 7.58 20 12 20C16.42 20 20 16.42 20 12C20 7.58 16.42 4 12 4ZM13 7V11.585L16.242 14.828L14.828 16.242L11 12.414V7H13Z"; // Clock/Time
    let title = "24 小時溫度趨勢";

    if (view === "precipitation") {
      iconPath = "M12 0.269043L5.63604 6.633C2.12132 10.1477 2.12132 15.8462 5.63604 19.3609C9.15076 22.8756 14.8492 22.8756 18.364 19.3609C21.8787 15.8462 21.8787 10.1477 18.364 6.633L12 0.269043ZM16.2427 10.1714L9.17161 17.2425L7.7574 15.8282L14.8285 8.75718L16.2427 10.1714ZM8.11095 9.11073C8.69674 8.52494 9.64648 8.52494 10.2323 9.11073C10.8181 9.69652 10.8181 10.6463 10.2323 11.232C9.64648 11.8178 8.69674 11.8178 8.11095 11.232C7.52516 10.6463 7.52516 9.69652 8.11095 9.11073ZM15.8891 16.8889C15.3033 17.4747 14.3536 17.4747 13.7678 16.8889C13.182 16.3031 13.182 15.3534 13.7678 14.7676C14.3536 14.1818 15.3033 14.1818 15.8891 14.7676C16.4749 15.3534 16.4749 16.3031 15.8891 16.8889Z";
      title = "24 小時降水趨勢";
    } else if (view === "wind") {
      iconPath = "M10.5 17H4V15H10.5C12.433 15 14 16.567 14 18.5C14 20.433 12.433 22 10.5 22C8.99957 22 7.71966 21.0559 7.22196 19.7293L9.09513 19.0268C9.30843 19.5954 9.85696 20 10.5 20C11.3284 20 12 19.3284 12 18.5C12 17.6716 11.3284 17 10.5 17ZM5 11H18.5C20.433 11 22 12.567 22 14.5C22 16.433 20.433 18 18.5 18C16.9996 18 15.7197 17.0559 15.222 15.7293L17.0951 15.0268C17.3084 15.5954 17.857 16 18.5 16C19.3284 16 20 15.3284 20 14.5C20 13.6716 19.3284 13 18.5 13H5C3.34315 13 2 11.6569 2 10C2 8.34315 3.34315 7 5 7H13.5C14.3284 7 15 6.32843 15 5.5C15 4.67157 14.3284 4 13.5 4C12.857 4 12.3084 4.40463 12.0951 4.97317L10.222 4.27073C10.7197 2.94414 11.9996 2 13.5 2C15.433 2 17 3.567 17 5.5C17 7.433 15.433 9 13.5 9H5C4.44772 9 4 9.44772 4 10C4 10.5523 4.44772 11 5 11Z";
      title = "24 小時風速趨勢";
    }

    svg += `
      <svg x="35" y="215" width="14" height="14" viewBox="0 0 24 24">
        <path fill="rgba(255,255,255,0.6)"  d="${iconPath}" />
      </svg>
      <text x="55" y="227" class="text-muted semi-bold text-xs">${title}</text>
    `;

    const dataPoints: number[] = [];
    for (let i = 0; i < 24; i += 3) {
      if (view === "temperature") dataPoints.push(weather.hourly.temperature[currentIndex + i]);
      if (view === "precipitation") dataPoints.push(weather.hourly.precipitationProb[currentIndex + i]);
      if (view === "wind") dataPoints.push(weather.hourly.windSpeed[currentIndex + i]);
    }

    const minVal = Math.min(...dataPoints) - (view === "temperature" ? 5 : 0);
    const maxVal = Math.max(...dataPoints) + (view === "temperature" ? 5 : 10);
    const range = Math.max(maxVal - minVal, 1);

    let pathD = "";
    let fillD = "";

    for (let i = 0; i < dataPoints.length; i++) {
      const x = graphX + i * (graphW / (dataPoints.length - 1));
      const y = graphY + graphH - ((dataPoints[i] - minVal) / range) * graphH;

      if (i === 0) {
        pathD += `M ${x} ${y}`;
        fillD += `M ${x} ${graphY + graphH} L ${x} ${y}`;
      } else {
        const prevX = graphX + (i - 1) * (graphW / (dataPoints.length - 1));
        const prevY = graphY + graphH - ((dataPoints[i - 1] - minVal) / range) * graphH;
        const cp1x = prevX + (x - prevX) / 2;
        const cp1y = prevY;
        const cp2x = prevX + (x - prevX) / 2;
        const cp2y = y;
        pathD += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x} ${y}`;
        fillD += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x} ${y}`;
      }

      svg += `
        <circle cx="${x}" cy="${y}" r="4" fill="#ffffff" filter="url(#shadow)"/>
        <text x="${x}" y="${y - 12}" class="text-main medium text-sm" text-anchor="middle">${Math.round(dataPoints[i])}${view === "precipitation" ? "%" : ""}</text>
        <text x="${x}" y="${graphY + graphH + 20}" class="text-muted medium text-sm" text-anchor="middle">${formatHour(weather.hourly.time[currentIndex + i])}</text>
      `;
    }

    fillD += ` L ${graphX + graphW} ${graphY + graphH} Z`;

    svg += `
      <defs>
        <linearGradient id="fillGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="rgba(255,255,255,0.3)"/>
          <stop offset="100%" stop-color="rgba(255,255,255,0.0)"/>
        </linearGradient>
      </defs>
      <path d="${fillD}" fill="url(#fillGrad)" />
      <path d="${pathD}" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="3" filter="url(#shadow)"/>
    `;

  } else if (view === "forecast") {
    svg += `
      <svg x="35" y="215" width="14" height="14" viewBox="0 0 24 24">
        <path fill="rgba(255,255,255,0.6)"  d="M17 3H21C21.5523 3 22 3.44772 22 4V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3H7V1H9V3H15V1H17V3ZM4 9V19H20V9H4Z" />
      </svg>
      <text x="55" y="227" class="text-muted semi-bold text-xs">七天天氣預報</text>
    `;

    const numDays = Math.min(7, weather.daily.time.length);
    const stepX = graphW / numDays;

    for (let i = 0; i < numDays; i++) {
      const x = graphX + i * stepX + (stepX / 2);
      const dayStr = formatDay(weather.daily.time[i]);
      const iconPath = getWeatherIconPath(weather.daily.weatherCode[i]);
      const maxT = Math.round(weather.daily.tempMax[i]);
      const minT = Math.round(weather.daily.tempMin[i]);

      svg += `
        <g transform="translate(${x - 24}, ${graphY + 10})">
          <text x="24" y="0" class="text-accent medium text-sm" text-anchor="middle">${dayStr}</text>
          <svg x="0" y="15" width="48" height="48" viewBox="0 0 24 24">
        <path fill="${getIconFill(weather.daily.weatherCode[i])}" d="${iconPath}" />
          </svg>
          <text x="24" y="85" class="text-main bold text-lg" text-anchor="middle">${maxT}°</text>
          <text x="24" y="105" class="text-muted medium text-md" text-anchor="middle">${minT}°</text>
        </g>
      `;
    }
  }

  // === Bottom Section: 4 Detail Cards ===
  const cardW = 175;
  const cardH = 140;
  const cardsY = 390;
  const iconColor = "rgba(255,255,255,0.6)";

  // UV Index
  svg += `
    <rect x="20" y="${cardsY}" width="${cardW}" height="${cardH}" rx="24" class="glass" filter="url(#shadow)" />
    <svg x="35" y="${cardsY + 15}" width="16" height="16" viewBox="0 0 24 24">
        <path fill="${iconColor}" d="M12 18C8.68629 18 6 15.3137 6 12C6 8.68629 8.68629 6 12 6C15.3137 6 18 8.68629 18 12C18 15.3137 15.3137 18 12 18ZM11 1H13V4H11V1ZM11 20H13V23H11V20ZM3.51472 4.92893L4.92893 3.51472L7.05025 5.63604L5.63604 7.05025L3.51472 4.92893ZM16.9497 18.364L18.364 16.9497L20.4853 19.0711L19.0711 20.4853L16.9497 18.364ZM19.0711 3.51472L20.4853 4.92893L18.364 7.05025L16.9497 5.63604L19.0711 3.51472ZM5.63604 16.9497L7.05025 18.364L4.92893 20.4853L3.51472 19.0711L5.63604 16.9497ZM23 11V13H20V11H23ZM4 11V13H1V11H4Z"/>
    </svg>
    <text x="57" y="${cardsY + 28}" class="text-muted semi-bold text-xs">紫外線</text>
    <text x="35" y="${cardsY + 70}" class="text-main medium" style="font-size: 32px;">${weather.uvIndex}</text>
  `;

  // Wind
  svg += `
    <rect x="215" y="${cardsY}" width="${cardW}" height="${cardH}" rx="24" class="glass" filter="url(#shadow)" />
    <svg x="230" y="${cardsY + 15}" width="16" height="16" viewBox="0 0 24 24">
        <path fill="${iconColor}" d="M10.5 17H4V15H10.5C12.433 15 14 16.567 14 18.5C14 20.433 12.433 22 10.5 22C8.99957 22 7.71966 21.0559 7.22196 19.7293L9.09513 19.0268C9.30843 19.5954 9.85696 20 10.5 20C11.3284 20 12 19.3284 12 18.5C12 17.6716 11.3284 17 10.5 17ZM5 11H18.5C20.433 11 22 12.567 22 14.5C22 16.433 20.433 18 18.5 18C16.9996 18 15.7197 17.0559 15.222 15.7293L17.0951 15.0268C17.3084 15.5954 17.857 16 18.5 16C19.3284 16 20 15.3284 20 14.5C20 13.6716 19.3284 13 18.5 13H5C3.34315 13 2 11.6569 2 10C2 8.34315 3.34315 7 5 7H13.5C14.3284 7 15 6.32843 15 5.5C15 4.67157 14.3284 4 13.5 4C12.857 4 12.3084 4.40463 12.0951 4.97317L10.222 4.27073C10.7197 2.94414 11.9996 2 13.5 2C15.433 2 17 3.567 17 5.5C17 7.433 15.433 9 13.5 9H5C4.44772 9 4 9.44772 4 10C4 10.5523 4.44772 11 5 11Z"/>
    </svg>
    <text x="252" y="${cardsY + 28}" class="text-muted semi-bold text-xs">風速</text>
    <text x="230" y="${cardsY + 70}" class="text-main medium" style="font-size: 32px;">${weather.windSpeed}</text>
    <text x="230" y="${cardsY + 95}" class="text-muted medium text-md">km/h</text>
    <text x="230" y="${cardsY + 120}" class="text-main medium text-md">${weather.windDirection}風</text>
  `;

  // Humidity
  svg += `
    <rect x="410" y="${cardsY}" width="${cardW}" height="${cardH}" rx="24" class="glass" filter="url(#shadow)" />
    <svg x="425" y="${cardsY + 15}" width="16" height="16" viewBox="0 0 24 24">
        <path fill="${iconColor}" d="M12 0.269043L5.63604 6.633C2.12132 10.1477 2.12132 15.8462 5.63604 19.3609C9.15076 22.8756 14.8492 22.8756 18.364 19.3609C21.8787 15.8462 21.8787 10.1477 18.364 6.633L12 0.269043ZM16.2427 10.1714L9.17161 17.2425L7.7574 15.8282L14.8285 8.75718L16.2427 10.1714ZM8.11095 9.11073C8.69674 8.52494 9.64648 8.52494 10.2323 9.11073C10.8181 9.69652 10.8181 10.6463 10.2323 11.232C9.64648 11.8178 8.69674 11.8178 8.11095 11.232C7.52516 10.6463 7.52516 9.69652 8.11095 9.11073ZM15.8891 16.8889C15.3033 17.4747 14.3536 17.4747 13.7678 16.8889C13.182 16.3031 13.182 15.3534 13.7678 14.7676C14.3536 14.1818 15.3033 14.1818 15.8891 14.7676C16.4749 15.3534 16.4749 16.3031 15.8891 16.8889Z"/>
    </svg>
    <text x="447" y="${cardsY + 28}" class="text-muted semi-bold text-xs">相對濕度</text>
    <text x="425" y="${cardsY + 70}" class="text-main medium" style="font-size: 32px;">${weather.humidity}%</text>
    <text x="425" y="${cardsY + 120}" class="text-main medium text-md">露點 ${Math.round(weather.dewPoint)}°</text>
  `;

  // AQI
  svg += `
    <rect x="605" y="${cardsY}" width="${cardW}" height="${cardH}" rx="24" class="glass" filter="url(#shadow)" />
    <svg x="620" y="${cardsY + 15}" width="16" height="16" viewBox="0 0 24 24">
        <path fill="${iconColor}" d="M20.998 3V5C20.998 14.6274 15.6255 19 8.99805 19L7.0964 18.9999C7.3079 15.9876 8.24541 14.1648 10.6939 11.9989C11.8979 10.9338 11.7965 10.3189 11.2029 10.6721C7.1193 13.1016 5.09114 16.3862 5.00119 21.6302L4.99805 22H2.99805C2.99805 20.6373 3.11376 19.3997 3.34381 18.2682C3.1133 16.9741 2.99805 15.2176 2.99805 13C2.99805 7.47715 7.4752 3 12.998 3C14.998 3 16.998 4 20.998 3Z" />
    </svg>
    <text x="642" y="${cardsY + 28}" class="text-muted semi-bold text-xs">空氣品質</text>
    <text x="620" y="${cardsY + 70}" class="text-main medium" style="font-size: 32px;">${weather.aqi}</text>
    <text x="620" y="${cardsY + 95}" class="text-main medium text-md">${weather.aqiLabel}</text>
  `;

  const dateStr = new Intl.DateTimeFormat("zh-TW", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Taipei"
  }).format(now);

  // Footer?
  svg += `
    <text x="20" y="${580 - 15}" class="text-muted medium text-xs">Froggy • discord.gg/Niggas</text>
    <text x="${width - 20}" y="${580 - 15}" class="text-muted medium text-xs" text-anchor="end">更新於 ${dateStr}</text>
  `;

  svg += `</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
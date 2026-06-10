import { readFileSync } from "fs";
import { join } from "path";

export function getWeatherIconPath(code: number): string {
  let iconName = "sun-line";

  // 不要問爲什麼 3 突然就到 45,因爲這是天氣代碼
  switch (code) {
  case 0:
    iconName = "sun-line";
    break; // Clear sky
  case 1:
  case 2:
    iconName = "sun-cloudy-line";
    break; // Mainly clear, partly cloudy
  case 3:
    iconName = "cloudy-line";
    break; // Overcast
  case 45:
  case 48:
    iconName = "foggy-line";
    break; // Fog
  case 51:
  case 53:
  case 55:
    iconName = "drizzle-line";
    break; // Drizzle
  case 56:
  case 57:
    iconName = "snowy-line";
    break; // Freezing Drizzle
  case 61:
    iconName = "showers-line";
    break; // Rain slight
  case 63:
  case 65:
    iconName = "heavy-showers-line";
    break; // Rain moderate/heavy
  case 66:
  case 67:
    iconName = "hail-line";
    break; // Freezing rain
  case 71:
  case 73:
  case 75:
  case 77:
    iconName = "snowy-line";
    break; // Snow
  case 80:
  case 81:
  case 82:
    iconName = "heavy-showers-line";
    break; // Rain showers
  case 85:
  case 86:
    iconName = "snowy-line";
    break; // Snow showers
  case 95:
    iconName = "thunderstorms-line";
    break; // Thunderstorm
  case 96:
  case 99:
    iconName = "thunderstorms-line";
    break; // Thunderstorm with hail
  default:
    iconName = "sun-line";
  }

  const svgPath = join(
    process.cwd(),
    "node_modules",
    "remixicon",
    "icons",
    "Weather",
    `${iconName}.svg`,
  );
  try {
    const content = readFileSync(svgPath, "utf-8");
    const match = content.match(/<path[^>]*d="([^"]*)"/);
    return match ? match[1] : "";
  } catch (e) {
    console.error(`[Astro] Failed to load icon: ${iconName}`, e);
    return "";
  }
}

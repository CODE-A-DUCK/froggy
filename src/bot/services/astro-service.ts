import {
  Observer, MoonPhase, Illumination,
  SearchRiseSet, SearchAltitude, SearchMoonPhase,
  Equator, Horizon, Constellation, GeoVector,
  Body, AstroTime,
} from "astronomy-engine";

import { getOrFetch } from "./astro-cache.js";

// === Types ===

export interface LocationInfo {
  name: string;
  country: string;
  lat: number;
  lon: number;
}

export interface WeatherData {
  weatherCode: number;
  cloudCover: number;
  cloudLow: number;
  cloudMid: number;
  cloudHigh: number;
  humidity: number;
  windSpeed: number;
  windDirection: string;
  precipitation: number;
  temperature: number;
  dewPoint: number;
  visibility: number;
  uvIndex: number;
  pressure: number;
  aqi: number;
  aqiLabel: string;
  hourly: {
    time: string[];
    temperature: number[];
    precipitationProb: number[];
    windSpeed: number[];
  };
  daily: {
    time: string[];
    weatherCode: number[];
    tempMax: number[];
    tempMin: number[];
  };
}

export interface SevenTimerData {
  seeing: string;
  transparency: string;
}

export interface PlanetData {
  name: string;
  ra: number;
  dec: number;
  altitude: number;
  azimuth: number;
  visible: boolean;
  constellation: string;
}

export interface AstronomyData {
  moonPhaseRaw: number;
  moonPhasePercent: number;
  moonPhaseName: string;
  moonIllumination: number;
  moonDistanceKm: number;
  nextFullMoon: Date | null;
  nextNewMoon: Date | null;
  sunrise: Date | null;
  sunset: Date | null;
  moonrise: Date | null;
  moonset: Date | null;
  twilightCivilDawn: Date | null;
  twilightCivilDusk: Date | null;
  twilightNauticalDawn: Date | null;
  twilightNauticalDusk: Date | null;
  twilightAstroDawn: Date | null;
  twilightAstroDusk: Date | null;
  planets: PlanetData[];
  visiblePlanetsNames: string[];
}

// === Constants ===

const SEEING_LABELS: Record<number, string> = {
  1: "< 0.5\" | 極佳", 2: "0.5\" - 0.75\" | 優秀", 3: "0.75\" - 1\" | 良好", 4: "1\" - 1.5\" | 普通",
  5: "1.5\" - 2\" | 較差", 6: "2\" - 2.5\" | 差", 7: "2.5\" - 3\" | 極差", 8: "> 3\" | 無法觀測",
};

const TRANSPARENCY_LABELS: Record<number, string> = {
  1: "< 0.3 | 極佳", 2: "0.3 - 0.4 | 優秀", 3: "0.4 - 0.5 | 良好", 4: "0.5 - 0.6 | 普通",
  5: "0.6 - 0.7 | 較差", 6: "0.7 - 0.85 | 差", 7: "0.85 - 1 | 極差", 8: "> 1 | 無法觀測",
};

const OBSERVABLE_PLANETS = [
  { body: Body.Mercury, name: "水星" },
  { body: Body.Venus, name: "金星" },
  { body: Body.Mars, name: "火星" },
  { body: Body.Jupiter, name: "木星" },
  { body: Body.Saturn, name: "土星" },
] as const;

const CONSTELLATIONS: Record<string, string> = {
  And: "仙女座", Ant: "唧筒座", Aps: "天燕座", Aqr: "寶瓶座", Aql: "天鷹座", Ara: "天壇座", Ari: "白羊座", Aur: "御夫座", Boo: "牧夫座", Cae: "雕具座",
  Cam: "鹿豹座", Cnc: "巨蟹座", CVn: "獵犬座", CMa: "大犬座", CMi: "小犬座", Cap: "摩羯座", Car: "船底座", Cas: "仙后座", Cen: "半人馬座", Cep: "仙王座",
  Cet: "鯨魚座", Cha: "蝘蜓座", Cir: "圓規座", Col: "天鴿座", Com: "后髮座", CrA: "南冕座", CrB: "北冕座", Crv: "烏鴉座", Crt: "巨爵座", Cru: "南十字座",
  Cyg: "天鵝座", Del: "海豚座", Dor: "劍魚座", Dra: "天龍座", Equ: "小馬座", Eri: "波江座", For: "天爐座", Gem: "雙子座", Gru: "天鶴座", Her: "武仙座",
  Hor: "時鐘座", Hya: "長蛇座", Hyi: "水蛇座", Ind: "印第安座", Lac: "蠍虎座", Leo: "獅子座", LMi: "小獅座", Lep: "天兔座", Lib: "天秤座", Lup: "豺狼座",
  Lyn: "天貓座", Lyr: "天琴座", Men: "山案座", Mic: "顯微鏡座", Mon: "麒麟座", Mus: "蒼蠅座", Nor: "矩尺座", Oct: "南極座", Oph: "蛇夫座", Ori: "獵戶座",
  Pav: "孔雀座", Peg: "飛馬座", Per: "英仙座", Phe: "鳳凰座", Pic: "繪架座", Psc: "雙魚座", PsA: "南魚座", Pup: "船尾座", Pyx: "羅盤座", Ret: "網罟座",
  Sge: "天箭座", Sgr: "人馬座", Sco: "天蠍座", Scl: "玉夫座", Sct: "盾牌座", Ser: "巨蛇座", Sex: "六分儀座", Tau: "金牛座", Tel: "望遠鏡座", Tri: "三角座",
  TrA: "南三角座", Tuc: "杜鵑座", UMa: "大熊座", UMi: "小熊座", Vel: "船帆座", Vir: "室女座", Vol: "飛魚座", Vul: "狐狸座"
};

// === Helpers ===

const locKey = (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

function tryAstroSearch<T extends { date: Date }>(fn: () => T | null): Date | null {
  try { return fn()?.date ?? null; } catch { return null; }
}

function getMoonPhaseName(phase: number): string {
  if (phase < 1.5 || phase > 358.5) return "新月 (朔)";
  if (phase < 88.5) return "上蛾眉月";
  if (phase < 91.5) return "上弦月";
  if (phase < 178.5) return "盈凸月";
  if (phase < 181.5) return "滿月 (望)";
  if (phase < 268.5) return "虧凸月";
  if (phase < 271.5) return "下弦月";
  return "下蛾眉月 (殘月)";
}

// === OpenStreetMap Geocoding ===

export async function geocode(location: string): Promise<LocationInfo | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`;
  return getOrFetch(`geocode:${location.toLowerCase()}`, 86400, async () => {
    const res = await fetch(url, { headers: { "User-Agent": "FroggyDiscordBot/1.0" } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.length) return null;

    const result = data[0];
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    const parts = result.display_name.split(",");
    const country = parts.length > 1 ? parts[parts.length - 1].trim() : "未知";
    const name = parts[0].trim();

    return { name, country, lat, lon };
  });
}

// === Open-Meteo Weather ===

function getWindDir(deg: number): string {
  const dirs = ["北", "東北", "東", "東南", "南", "西南", "西", "西北"];
  return dirs[Math.round(deg / 45) % 8];
}

function getAqiLabel(aqi: number): string {
  if (aqi === 0) return "未知";
  if (aqi <= 50) return "良好";
  if (aqi <= 100) return "普通";
  if (aqi <= 150) return "敏感族群不健康";
  if (aqi <= 200) return "不健康";
  if (aqi <= 300) return "跟 MyIT 一樣不健康";
  return "危害";
}

export async function getWeather(lat: number, lon: number): Promise<WeatherData | null> {
  return getOrFetch(`weather:${locKey(lat, lon)}`, 1800, async () => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,dew_point_2m,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,wind_speed_10m,wind_direction_10m,precipitation,surface_pressure,uv_index,weather_code&hourly=temperature_2m,precipitation_probability,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;
    const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi&timezone=auto`;
    let res: Response | undefined, aqiRes: Response | undefined;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        [res, aqiRes] = await Promise.all([fetch(url), fetch(aqiUrl)]);
        break;
      } catch (e) {
        if (attempt === 3) {
          console.error("[AstroService] getWeather fetch failed after 3 attempts:", e);
          return null;
        }
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }

    if (!res || !res.ok) return null;

    const data = await res.json();
    const c = data.current;
    const h = data.hourly;
    const d = data.daily;
    const aqiData = aqiRes?.ok ? await aqiRes.json() : null;
    const aqi = aqiData?.current?.us_aqi ?? 0;

    return {
      weatherCode: c.weather_code ?? 0,
      cloudCover: c.cloud_cover ?? 0,
      cloudLow: c.cloud_cover_low ?? 0,
      cloudMid: c.cloud_cover_mid ?? 0,
      cloudHigh: c.cloud_cover_high ?? 0,
      humidity: c.relative_humidity_2m ?? 0,
      windSpeed: c.wind_speed_10m ?? 0,
      windDirection: getWindDir(c.wind_direction_10m ?? 0),
      precipitation: c.precipitation ?? 0,
      temperature: c.temperature_2m ?? 0,
      dewPoint: c.dew_point_2m ?? 0,
      visibility: c.visibility ?? 0,
      uvIndex: c.uv_index ?? 0,
      pressure: c.surface_pressure ?? 0,
      aqi,
      aqiLabel: getAqiLabel(aqi),
      hourly: {
        time: h.time ?? [],
        temperature: h.temperature_2m ?? [],
        precipitationProb: h.precipitation_probability ?? [],
        windSpeed: h.wind_speed_10m ?? [],
      },
      daily: {
        time: d.time ?? [],
        weatherCode: d.weather_code ?? [],
        tempMax: d.temperature_2m_max ?? [],
        tempMin: d.temperature_2m_min ?? [],
      }
    };
  });
}

// === 7Timer ===

export async function get7Timer(lat: number, lon: number): Promise<SevenTimerData | null> {
  return getOrFetch(`7timer:${locKey(lat, lon)}`, 3600, async () => {
    const url = `https://www.7timer.info/bin/api.pl?lon=${lon}&lat=${lat}&product=astro&output=json`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch (e) {
      console.error("[AstroService] get7Timer fetch error:", e);
      return null;
    }
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.dataseries?.length) return null;

    const { seeing, transparency } = data.dataseries[0];
    return {
      seeing: SEEING_LABELS[seeing] ?? "未知",
      transparency: TRANSPARENCY_LABELS[transparency] ?? "未知",
    };
  });
}

// === Astronomy Engine ===

export async function getAstronomyData(
  lat: number,
  lon: number,
  jsDate: Date = new Date(),
  elevationMeters = 0,
): Promise<AstronomyData> {
  const date = new AstroTime(jsDate);
  const observer = new Observer(lat, lon, elevationMeters);
  const dayStr = jsDate.toISOString().split("T")[0];

  const sunMoon = await getOrFetch(`sunmoon:${locKey(lat, lon)}:${dayStr}`, 43200, async () => {
    const phaseRaw = MoonPhase(date);
    const geoMoon = GeoVector(Body.Moon, date, true);
    const distKm = Math.sqrt(geoMoon.x ** 2 + geoMoon.y ** 2 + geoMoon.z ** 2) * 149597870.7;

    return {
      moonPhaseRaw: phaseRaw,
      moonPhasePercent: (phaseRaw / 360) * 100,
      moonPhaseName: getMoonPhaseName(phaseRaw),
      moonIllumination: Illumination(Body.Moon, date).phase_fraction * 100,
      moonDistanceKm: distKm,
      nextFullMoon: tryAstroSearch(() => SearchMoonPhase(180, date, 30)),
      nextNewMoon: tryAstroSearch(() => SearchMoonPhase(0, date, 30)),
      sunrise: tryAstroSearch(() => SearchRiseSet(Body.Sun, observer, +1, date, 1)),
      sunset: tryAstroSearch(() => SearchRiseSet(Body.Sun, observer, -1, date, 1)),
      moonrise: tryAstroSearch(() => SearchRiseSet(Body.Moon, observer, +1, date, 1)),
      moonset: tryAstroSearch(() => SearchRiseSet(Body.Moon, observer, -1, date, 1)),
      twilightCivilDawn: tryAstroSearch(() => SearchAltitude(Body.Sun, observer, +1, date, 1, -6)),
      twilightCivilDusk: tryAstroSearch(() => SearchAltitude(Body.Sun, observer, -1, date, 1, -6)),
      twilightNauticalDawn: tryAstroSearch(() => SearchAltitude(Body.Sun, observer, +1, date, 1, -12)),
      twilightNauticalDusk: tryAstroSearch(() => SearchAltitude(Body.Sun, observer, -1, date, 1, -12)),
      twilightAstroDawn: tryAstroSearch(() => SearchAltitude(Body.Sun, observer, +1, date, 1, -18)),
      twilightAstroDusk: tryAstroSearch(() => SearchAltitude(Body.Sun, observer, -1, date, 1, -18)),
    };
  });

  const halfHour = Math.floor(jsDate.getTime() / (30 * 60 * 1000));
  const planets = await getOrFetch(`planets:${locKey(lat, lon)}:${halfHour}`, 1800, async () => {
    const all: PlanetData[] = OBSERVABLE_PLANETS.map(({ body, name }) => {
      const equ = Equator(body, date, observer, true, true);
      const hor = Horizon(date, observer, equ.ra, equ.dec, "normal");
      const constel = Constellation(equ.ra, equ.dec);

      return {
        name,
        ra: equ.ra,
        dec: equ.dec,
        altitude: hor.altitude,
        azimuth: hor.azimuth,
        visible: hor.altitude > 0,
        constellation: CONSTELLATIONS[constel.symbol] || constel.name,
      };
    });

    return {
      planets: all,
      visiblePlanetsNames: all.filter(p => p.visible).map(p => `${p.name}（${p.constellation}）`),
    };
  });

  return { ...sunMoon, ...planets };
}

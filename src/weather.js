const WMO_DESCRIPTIONS = {
  0: "ясно",
  1: "в основном ясно",
  2: "переменная облачность",
  3: "пасмурно",
  45: "туман",
  48: "туман с изморозью",
  51: "лёгкая морось",
  53: "морось",
  55: "сильная морось",
  56: "ледяная морось",
  57: "сильная ледяная морось",
  61: "небольшой дождь",
  63: "дождь",
  65: "сильный дождь",
  66: "ледяной дождь",
  67: "сильный ледяной дождь",
  71: "небольшой снег",
  73: "снег",
  75: "сильный снег",
  77: "снежная крупа",
  80: "небольшой ливень",
  81: "ливень",
  82: "сильный ливень",
  85: "небольшой снегопад",
  86: "сильный снегопад",
  95: "гроза",
  96: "гроза с градом",
  99: "сильная гроза с градом"
};

function describeWeatherCode(code) {
  return WMO_DESCRIPTIONS[code] ?? "погода неопределённая";
}

// Approximate location from the machine's public IP (no GPS on a laptop). Accuracy
// is ISP-dependent — can be off by a city or two, hence the confirmation question
// in the caller rather than acting on it silently.
export async function detectLaptopLocation() {
  const res = await fetch("https://ipwho.is/");
  const data = await res.json();
  if (!data.success) throw new Error("IP geolocation failed: " + (data.message ?? "unknown"));
  return { city: data.city, lat: data.latitude, lon: data.longitude };
}

export async function geocodeCity(name) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=ru&format=json`;
  const res = await fetch(url);
  const data = await res.json();
  const first = data.results?.[0];
  if (!first) return null;
  return { city: first.name, lat: first.latitude, lon: first.longitude };
}

export async function getCurrentWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,apparent_temperature&timezone=auto`;
  const res = await fetch(url);
  const data = await res.json();
  const c = data.current;
  return {
    temperature: Math.round(c.temperature_2m),
    feelsLike: Math.round(c.apparent_temperature),
    windSpeed: Math.round(c.wind_speed_10m),
    humidity: Math.round(c.relative_humidity_2m),
    description: describeWeatherCode(c.weather_code)
  };
}

export function buildWeatherReply(city, weather) {
  return `Погода в городе ${city}: ${weather.description}, ${weather.temperature} градусов, ощущается как ${weather.feelsLike}. Ветер ${weather.windSpeed} километров в час, влажность ${weather.humidity} процентов.`;
}

// Schema/prompt for parsing the follow-up answer to "Это <город>, верно?" —
// separate from the main command schema since it's a different classification task.
export const CONFIRM_CITY_SCHEMA = {
  type: "object",
  properties: {
    confirmed: { type: "boolean" },
    city: {
      type: "string",
      description: "If the user named a different city, its name in nominative case (e.g. 'Казань', not 'в Казани'). Empty if confirmed=true."
    }
  }
};

export const CONFIRM_CITY_PROMPT = `Пользователю задали вопрос "Это [город], верно?" про погоду.
Определи по его ответу на русском языке:
- confirmed: true, если он согласился (да, ага, верно, точно, ну да и т.п.) — тогда city оставь пустым.
- confirmed: false и city — название города в именительном падеже, если он назвал другой город (например ответ "нет, в Казани" -> confirmed: false, city: "Казань").
Отвечай только JSON.`;

const fs = require('fs');
const path = require('path');

const PLACE_TIMEZONE_MAP = {
  "中国": 8, "北京": 8, "上海": 8, "广州": 8, "深圳": 8, "香港": 8, "澳门": 8, "台北": 8,
  "东京": 9, "首尔": 9, "新加坡": 8, "曼谷": 7,
  "伦敦": 0, "巴黎": 1, "柏林": 1, "莫斯科": 3,
  "迪拜": 4, "新德里": 5, "孟买": 5,
  "悉尼": 10, "墨尔本": 10,
  "纽约": -5, "华盛顿": -5, "芝加哥": -6, "丹佛": -7, "洛杉矶": -8, "温哥华": -8,
};

const PLACE_LONGITUDE_MAP = {
  "北京": 116.4, "上海": 121.5, "广州": 113.3, "深圳": 114.1, "台北": 121.5,
  "东京": 139.7, "纽约": -74.0, "伦敦": -0.1, "巴黎": 2.35, "洛杉矶": -118.2,
};

let cachedCities = null;

function loadCities() {
  if (cachedCities) return cachedCities;
  const p = path.join(__dirname, '../../data/cities.json');
  if (fs.existsSync(p)) {
    try {
      cachedCities = JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch (e) {
      console.warn("Failed to load cities.json", e);
      cachedCities = [];
    }
  } else {
    cachedCities = [];
  }
  return cachedCities;
}

function findCityByName(place) {
  const cities = loadCities();
  const lower = place.toLowerCase();
  for (const city of cities) {
    if (city.name.toLowerCase() === lower || city.name.toLowerCase().includes(lower) || lower.includes(city.name.toLowerCase())) {
      return city;
    }
  }
  return null;
}

function guessTimezoneFromLongitude(longitude) {
  return Math.max(-12, Math.min(14, Math.round(longitude / 15.0)));
}

function resolveProfileGeo(profile) {
  const place = (profile.birth_place || "").trim();
  let longitude = profile.longitude;
  let timezone_offset = profile.timezone_offset;
  let tz_source = "explicit";
  let lon_source = longitude !== undefined && longitude !== null ? "explicit" : "default";

  if ((longitude === undefined || longitude === null || timezone_offset === undefined || timezone_offset === null) && place) {
    const city = findCityByName(place);
    if (city) {
      if (longitude === undefined || longitude === null) {
        longitude = city.lon;
        lon_source = "city_db";
      }
      if (timezone_offset === undefined || timezone_offset === null) {
        timezone_offset = city.tz;
        tz_source = "city_db";
      }
    }
  }

  if ((longitude === undefined || longitude === null) && place) {
    for (const [key, lon] of Object.entries(PLACE_LONGITUDE_MAP)) {
      if (place.includes(key)) {
        longitude = lon;
        lon_source = "place_inferred";
        break;
      }
    }
  }
  if (longitude === undefined || longitude === null) {
    longitude = 120.0;
  }

  if ((timezone_offset === undefined || timezone_offset === null) && place) {
    for (const [key, tz] of Object.entries(PLACE_TIMEZONE_MAP)) {
      if (place.includes(key)) {
        timezone_offset = tz;
        tz_source = "place_inferred";
        break;
      }
    }
  }
  if ((timezone_offset === undefined || timezone_offset === null) && longitude !== null) {
    timezone_offset = guessTimezoneFromLongitude(longitude);
    tz_source = "longitude_inferred";
  }
  if (timezone_offset === undefined || timezone_offset === null) {
    timezone_offset = 8;
    tz_source = "default_fallback";
  }

  return {
    birth_place: place,
    resolved_timezone_offset: timezone_offset,
    timezone_source: tz_source,
    resolved_longitude: longitude,
    longitude_source: lon_source,
  };
}

function normalizeBirthTime(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const v = value.trim();
  return v || null;
}

module.exports = {
  resolveProfileGeo,
  normalizeBirthTime,
  guessTimezoneFromLongitude,
  findCityByName,
  loadCities
};

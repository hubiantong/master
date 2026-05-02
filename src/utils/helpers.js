const crypto = require('crypto');

const FIVE_ELEMENTS = ["木", "火", "土", "金", "水"];

const GAN_WUXING = {
  "甲": "木", "乙": "木", "丙": "火", "丁": "火", "戊": "土",
  "己": "土", "庚": "金", "辛": "金", "壬": "水", "癸": "水"
};

const ZHI_WUXING = {
  "子": "水", "丑": "土", "寅": "木", "卯": "木", "辰": "土", "巳": "火",
  "午": "火", "未": "土", "申": "金", "酉": "金", "戌": "土", "亥": "水"
};

const WUXING_SHENG = {"木": "火", "火": "土", "土": "金", "金": "水", "水": "木"};
const WUXING_KE = {"木": "土", "火": "金", "土": "水", "金": "木", "水": "火"};

function inverseMap(mapping) {
  const result = {};
  for (const [k, v] of Object.entries(mapping)) {
    result[v] = k;
  }
  return result;
}

const WUXING_SHENG_INV = inverseMap(WUXING_SHENG);
const WUXING_KE_INV = inverseMap(WUXING_KE);

function isGenerating(e1, e2) {
  return WUXING_SHENG[e1] === e2;
}

function isOvercoming(e1, e2) {
  return WUXING_KE[e1] === e2;
}

function seedFromText(text) {
  const hash = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
  // Use first 16 chars for seed (64-bit int roughly)
  return parseInt(hash.substring(0, 16), 16);
}

// LCG random generator for predictable randoms
function pseudoRandom(seed) {
  let value = seed;
  return function() {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

function getRng(...parts) {
  const key = parts.join('|');
  const seed = seedFromText(key);
  const prng = pseudoRandom(seed);
  return {
    randint: (min, max) => Math.floor(prng() * (max - min + 1)) + min,
    choice: (arr) => arr[Math.floor(prng() * arr.length)],
    sample: (arr, k) => {
      const res = [...arr];
      for (let i = res.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        [res[i], res[j]] = [res[j], res[i]];
      }
      return res.slice(0, k);
    }
  };
}

function getSecureRng() {
  return {
    randint: (min, max) => crypto.randomInt(min, max + 1),
    choice: (arr) => arr[crypto.randomInt(0, arr.length)],
    sample: (arr, k) => {
      const res = [...arr];
      for (let i = res.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [res[i], res[j]] = [res[j], res[i]];
      }
      return res.slice(0, k);
    }
  };
}

function equationOfTimeMinutes(dateObj) {
  const start = new Date(dateObj.getFullYear(), 0, 0);
  const diff = dateObj - start;
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  const b = 2 * Math.PI * (dayOfYear - 81) / 364;
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

const MIN_TIMEZONE_OFFSET = -12;
const MAX_TIMEZONE_OFFSET = 14;

function parseBirthDatetime(birthday, birth_time) {
  // birthday: YYYY-MM-DD, birth_time: HH:MM or HH:MM:SS
  const str = `${birthday}T${birth_time.length === 5 ? birth_time + ':00' : birth_time}`;
  const dt = new Date(str);
  if (isNaN(dt.getTime())) {
    throw new Error("出生日期或时间格式非法，需为 birthday=YYYY-MM-DD, birth_time=HH:MM 或 HH:MM:SS");
  }
  return dt;
}

function chinaDstShiftHours(rawDt, timezoneOffset, longitude) {
  if (timezoneOffset !== 8 || !(73.0 <= longitude && longitude <= 135.0)) {
    return 0;
  }
  const year = rawDt.getFullYear();
  const windows = {
    1986: [new Date(1986, 4, 4, 2, 0), new Date(1986, 8, 14, 2, 0)],
    1987: [new Date(1987, 3, 12, 2, 0), new Date(1987, 8, 13, 2, 0)],
    1988: [new Date(1988, 3, 17, 2, 0), new Date(1988, 8, 11, 2, 0)],
    1989: [new Date(1989, 3, 16, 2, 0), new Date(1989, 8, 17, 2, 0)],
    1990: [new Date(1990, 3, 15, 2, 0), new Date(1990, 8, 16, 2, 0)],
    1991: [new Date(1991, 3, 14, 2, 0), new Date(1991, 8, 15, 2, 0)]
  };
  const period = windows[year];
  if (!period) return 0;
  const [start, end] = period;
  return (rawDt >= start && rawDt < end) ? 1 : 0;
}

function trueSolarDatetime(rawDt, timezoneOffset, longitude) {
  if (timezoneOffset < MIN_TIMEZONE_OFFSET || timezoneOffset > MAX_TIMEZONE_OFFSET) {
    throw new Error(`timezone_offset 超出范围，应在 [${MIN_TIMEZONE_OFFSET}, ${MAX_TIMEZONE_OFFSET}] 内`);
  }
  if (longitude < -180.0 || longitude > 180.0) {
    throw new Error("longitude 超出范围，应在 [-180, 180] 内");
  }
  const dstShift = chinaDstShiftHours(rawDt, timezoneOffset, longitude);
  const effectiveOffset = timezoneOffset + dstShift;
  const standardMeridian = effectiveOffset * 15;
  const longitudeCorrection = (longitude - standardMeridian) * 4;
  const eot = equationOfTimeMinutes(rawDt);
  
  const trueDt = new Date(rawDt.getTime() + (longitudeCorrection + eot) * 60000);
  return trueDt;
}

function computeBaziStrength(ec) {
  const stems = [ec.getYearGan(), ec.getMonthGan(), ec.getDayGan(), ec.getTimeGan()];
  const branches = [ec.getYearZhi(), ec.getMonthZhi(), ec.getDayZhi(), ec.getTimeZhi()];
  
  const scores = {};
  FIVE_ELEMENTS.forEach(e => scores[e] = 0);
  
  stems.forEach(g => {
    scores[GAN_WUXING[g] || "土"] += 2;
  });
  branches.forEach(z => {
    scores[ZHI_WUXING[z] || "土"] += 1;
  });

  const dmElement = GAN_WUXING[ec.getDayGan()] || "土";
  const genDm = WUXING_SHENG_INV[dmElement];
  const controlDm = WUXING_KE_INV[dmElement];
  const leakDm = WUXING_SHENG[dmElement];
  const consumedByDm = WUXING_KE[dmElement];

  const supportScore = scores[dmElement] + scores[genDm];
  const drainScore = scores[controlDm] + scores[leakDm] + scores[consumedByDm];
  const strength = supportScore >= drainScore ? "身强" : "身弱";
  
  let yong_shen, ji_shen;
  if (strength === "身强") {
    yong_shen = scores[leakDm] <= scores[controlDm] ? leakDm : controlDm;
    ji_shen = dmElement;
  } else {
    yong_shen = scores[genDm] >= scores[dmElement] ? genDm : dmElement;
    ji_shen = controlDm;
  }
  return { scores, strength, yong_shen, ji_shen };
}

function pickStrength(scores) {
  let strongest = null, weakest = null;
  let maxV = -Infinity, minV = Infinity;
  for (const [e, v] of Object.entries(scores)) {
    if (v > maxV) { maxV = v; strongest = e; }
    if (v < minV) { minV = v; weakest = e; }
  }
  return { strongest, weakest };
}

module.exports = {
  FIVE_ELEMENTS,
  GAN_WUXING,
  ZHI_WUXING,
  WUXING_SHENG,
  WUXING_KE,
  WUXING_SHENG_INV,
  WUXING_KE_INV,
  isGenerating,
  isOvercoming,
  getRng,
  getSecureRng,
  equationOfTimeMinutes,
  parseBirthDatetime,
  chinaDstShiftHours,
  trueSolarDatetime,
  computeBaziStrength,
  pickStrength
};

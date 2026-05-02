const fs = require('fs');
const path = require('path');
const { Solar } = require('lunar-javascript');
const { parseBirthDatetime, trueSolarDatetime } = require('../utils/helpers');

const ZIWEI_PALACES = [
  "命宫", "兄弟宫", "夫妻宫", "子女宫", "财帛宫", "疾厄宫",
  "迁移宫", "交友宫", "事业宫", "田宅宫", "福德宫", "父母宫"
];

const ZIWEI_STAR_LIBRARY = {
  "紫微": {"五行": "土", "亮度": "帝星", "吉凶": "吉", "象义": "统御、格局、主导力"},
  "天机": {"五行": "木", "亮度": "辅星", "吉凶": "中吉", "象义": "谋略、变化、学习"},
  "太阳": {"五行": "火", "亮度": "主星", "吉凶": "吉", "象义": "外放、名誉、执行"},
  "武曲": {"五行": "金", "亮度": "主星", "吉凶": "中吉", "象义": "财务、决断、纪律"},
  "天同": {"五行": "水", "亮度": "主星", "吉凶": "中", "象义": "福气、调和、享受"},
  "廉贞": {"五行": "火", "亮度": "主星", "吉凶": "中", "象义": "边界、规则、欲望"},
  "天府": {"五行": "土", "亮度": "库星", "吉凶": "吉", "象义": "资源、稳定、守成"},
  "太阴": {"五行": "水", "亮度": "主星", "吉凶": "中吉", "象义": "内在、财库、情绪"},
  "贪狼": {"五行": "木", "亮度": "主星", "吉凶": "中", "象义": "人际、欲望、开创"},
  "巨门": {"五行": "水", "亮度": "主星", "吉凶": "中", "象义": "言语、争议、辨析"},
  "天相": {"五行": "水", "亮度": "辅星", "吉凶": "中吉", "象义": "协作、审慎、公允"},
  "天梁": {"五行": "土", "亮度": "主星", "吉凶": "吉", "象义": "庇护、原则、长辈缘"},
  "七杀": {"五行": "金", "亮度": "将星", "吉凶": "偏凶", "象义": "突破、风险、效率"},
  "破军": {"五行": "水", "亮度": "将星", "吉凶": "偏凶", "象义": "破旧立新、重组"},
};

const FOUR_TRANSFORMATIONS = {
  "甲": {"禄": "廉贞", "权": "破军", "科": "武曲", "忌": "太阳"},
  "乙": {"禄": "天机", "权": "天梁", "科": "紫微", "忌": "太阴"},
  "丙": {"禄": "天同", "权": "天机", "科": "文昌", "忌": "廉贞"},
  "丁": {"禄": "太阴", "权": "天同", "科": "天机", "忌": "巨门"},
  "戊": {"禄": "贪狼", "权": "太阴", "科": "右弼", "忌": "天机"},
  "己": {"禄": "武曲", "权": "贪狼", "科": "天梁", "忌": "文曲"},
  "庚": {"禄": "太阳", "权": "武曲", "科": "太阴", "忌": "天同"},
  "辛": {"禄": "巨门", "权": "太阳", "科": "文曲", "忌": "文昌"},
  "壬": {"禄": "天梁", "权": "紫微", "科": "左辅", "忌": "武曲"},
  "癸": {"禄": "破军", "权": "巨门", "科": "太阴", "忌": "贪狼"},
};

const ZIWEI_SCHOOL_OFFSETS = {
  "sanhe": {
    "紫微": 0, "天机": 1, "太阳": 3, "武曲": 4, "天同": 5, "廉贞": 8,
    "天府": 6, "太阴": 7, "贪狼": 9, "巨门": 10, "天相": 11, "天梁": 2,
    "七杀": 5, "破军": 9,
  },
  "feixing": {
    "紫微": 0, "天机": 2, "太阳": 4, "武曲": 5, "天同": 6, "廉贞": 9,
    "天府": 7, "太阴": 8, "贪狼": 10, "巨门": 11, "天相": 1, "天梁": 3,
    "七杀": 6, "破军": 10,
  }
};

let cachedZiweiStars = null;

function loadZiweiStars() {
  if (cachedZiweiStars) return cachedZiweiStars;
  const p = path.join(__dirname, '../../data/classics/ziwei_stars.json');
  if (fs.existsSync(p)) {
    try {
      cachedZiweiStars = JSON.parse(fs.readFileSync(p, 'utf-8'));
      return cachedZiweiStars;
    } catch (e) {
      console.warn("Failed to load ziwei_stars.json", e);
    }
  }
  return ZIWEI_STAR_LIBRARY;
}

function safeLunarMonthFeatures(lunar) {
  const rawMonth = lunar.getMonth();
  const lunarMonth = Math.abs(rawMonth);
  const isLeapMonth = rawMonth < 0;
  let monthSize = lunarMonth % 2 !== 0 ? 30 : 29;
  if (typeof lunar.getDayCountOfMonth === 'function') {
    try {
      monthSize = lunar.getDayCountOfMonth(rawMonth);
    } catch (e) {}
  }
  return { lunarMonth, isLeapMonth, monthSize };
}

function resolveFourTransformations(ec, scope = "year") {
  const yearGan = ec.getYearGan();
  const base = FOUR_TRANSFORMATIONS[yearGan] || FOUR_TRANSFORMATIONS["甲"];
  const result = { year_gan: yearGan, ...base };
  
  if (scope === "full") {
    const monthGan = ec.getMonthGan();
    const dayGan = ec.getDayGan();
    result.month_gan = monthGan;
    result.day_gan = dayGan;
    result.month_transformations = FOUR_TRANSFORMATIONS[monthGan] || FOUR_TRANSFORMATIONS["甲"];
    result.day_transformations = FOUR_TRANSFORMATIONS[dayGan] || FOUR_TRANSFORMATIONS["甲"];
  }
  return result;
}

function ziweiChart(name, birthday, birth_time, school = "sanhe", transform_scope = "year", timezone_offset = 8, longitude = 120.0) {
  const solarDt = parseBirthDatetime(birthday, birth_time);
  const trueDt = trueSolarDatetime(solarDt, timezone_offset, longitude);
  
  const solar = Solar.fromYmdHms(
    trueDt.getFullYear(), trueDt.getMonth() + 1, trueDt.getDate(),
    trueDt.getHours(), trueDt.getMinutes(), trueDt.getSeconds()
  );
  const lunar = solar.getLunar();
  const ec = lunar.getEightChar();

  const schoolKey = ZIWEI_SCHOOL_OFFSETS[school] ? school : "sanhe";
  const scopeKey = ["year", "full"].includes(transform_scope) ? transform_scope : "year";

  const { lunarMonth, isLeapMonth, monthSize } = safeLunarMonthFeatures(lunar);
  const lunarDay = lunar.getDay();
  const hourZhi = ec.getTimeZhi();
  const hourIndex = "子丑寅卯辰巳午未申酉戌亥".indexOf(hourZhi);
  
  // mod 12 arithmetic
  let mingIdx = (lunarMonth + hourIndex - 2) % 12;
  if (mingIdx < 0) mingIdx += 12;
  
  let shenIdx = (lunarMonth + hourIndex) % 12;
  if (shenIdx < 0) shenIdx += 12;

  const mainStarsOrder = ["紫微", "天机", "太阳", "武曲", "天同", "廉贞", "天府", "太阴", "贪狼", "巨门", "天相", "天梁", "七杀", "破军"];
  const leapAdjust = isLeapMonth ? 1 : 0;
  const monthSizeAdjust = monthSize === 30 ? 1 : 0;
  
  let ziweiBase = (lunarDay + 11 + leapAdjust + monthSizeAdjust) % 12;
  if (ziweiBase < 0) ziweiBase += 12;

  const starOffsets = ZIWEI_SCHOOL_OFFSETS[schoolKey];
  const starLibrary = loadZiweiStars();
  
  const palaceStars = {};
  ZIWEI_PALACES.forEach(p => palaceStars[p] = []);

  mainStarsOrder.forEach(star => {
    let idx = (ziweiBase + starOffsets[star]) % 12;
    if (idx < 0) idx += 12;
    const palace = ZIWEI_PALACES[idx];
    palaceStars[palace].push({
      name: star,
      ...(starLibrary[star] || ZIWEI_STAR_LIBRARY[star] || {})
    });
  });

  const fourHua = resolveFourTransformations(ec, scopeKey);
  const transformedStarNames = new Set([fourHua["禄"], fourHua["权"], fourHua["科"], fourHua["忌"]].filter(Boolean));
  
  if (scopeKey === "full") {
    if (fourHua.month_transformations) {
      transformedStarNames.add(fourHua.month_transformations["禄"]);
      transformedStarNames.add(fourHua.month_transformations["权"]);
      transformedStarNames.add(fourHua.month_transformations["科"]);
      transformedStarNames.add(fourHua.month_transformations["忌"]);
    }
    if (fourHua.day_transformations) {
      transformedStarNames.add(fourHua.day_transformations["禄"]);
      transformedStarNames.add(fourHua.day_transformations["权"]);
      transformedStarNames.add(fourHua.day_transformations["科"]);
      transformedStarNames.add(fourHua.day_transformations["忌"]);
    }
  }

  const transformedStarDetails = {};
  transformedStarNames.forEach(name => {
    if (name) {
      transformedStarDetails[name] = starLibrary[name] || ZIWEI_STAR_LIBRARY[name] || {};
    }
  });

  const svgParts = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="840" height="520" viewBox="0 0 840 520">',
    '<rect x="0" y="0" width="840" height="520" fill="#0f1522" />'
  ];
  
  const boxW = 260;
  const boxH = 120;
  
  ZIWEI_PALACES.forEach((palace, i) => {
    const row = Math.floor(i / 4);
    const col = i % 4;
    const x = 20 + col * (boxW + 10);
    const y = 20 + row * (boxH + 10);
    svgParts.push(`<rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" fill="#131c2d" stroke="#32507a" />`);
    
    const starsText = palaceStars[palace].map(s => s.name).join("、") || "无主星";
    svgParts.push(`<text x="${x+8}" y="${y+22}" fill="#89b4ff" font-size="14">${palace}</text>`);
    svgParts.push(`<text x="${x+8}" y="${y+48}" fill="#d7e5ff" font-size="13">${starsText}</text>`);
  });
  
  svgParts.push('</svg>');

  return {
    module: "紫微斗数排盘",
    name,
    solar_birthday: birthday,
    birth_time,
    timezone_offset,
    longitude,
    lunar_birthday: `${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
    ziwei_config: {
      school: schoolKey,
      transform_scope: scopeKey,
      is_leap_month: isLeapMonth,
      lunar_month_size: monthSize,
      algorithm_version: "v2.1"
    },
    ming_gong: ZIWEI_PALACES[mingIdx],
    shen_gong: ZIWEI_PALACES[shenIdx],
    four_transformations: fourHua,
    transformation_star_details: transformedStarDetails,
    palace_stars: palaceStars,
    star_library_size: Object.keys(starLibrary).length,
    chart_svg: svgParts.join(""),
    insight: "建议优先查看命宫、事业宫、财帛宫，并结合大限阶段做阶段性决策。"
  };
}

module.exports = { ziweiChart };

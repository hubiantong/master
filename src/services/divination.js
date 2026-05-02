const fs = require('fs');
const path = require('path');
const { getSecureRng, isGenerating, isOvercoming } = require('../utils/helpers');

const TRIGRAMS = ["乾", "兑", "离", "震", "巽", "坎", "艮", "坤"];
const TRIGRAM_WUXING = {"乾": "金", "兑": "金", "离": "火", "震": "木", "巽": "木", "坎": "水", "艮": "土", "坤": "土"};

const TRIGRAM_BIN_TO_INDEX = {
  "111": 0, "110": 1, "101": 2, "100": 3,
  "011": 4, "010": 5, "001": 6, "000": 7
};

const KING_WEN_LOOKUP = [
  [1, 43, 14, 34, 9, 5, 26, 11],
  [10, 58, 38, 54, 61, 60, 41, 19],
  [13, 49, 30, 55, 37, 63, 22, 36],
  [25, 17, 21, 51, 42, 3, 27, 24],
  [44, 28, 50, 32, 57, 48, 18, 46],
  [6, 47, 64, 40, 59, 29, 4, 7],
  [33, 31, 56, 62, 53, 39, 52, 15],
  [12, 45, 35, 16, 20, 8, 23, 2]
];

const TAROT_CARDS = [
  "愚者", "魔术师", "女祭司", "皇后", "皇帝", "教皇", "恋人", "战车",
  "力量", "隐者", "命运之轮", "正义", "倒吊人", "死神", "节制", "恶魔",
  "高塔", "星星", "月亮", "太阳", "审判", "世界"
];

const ACTIVITY_MAP = {
  "嫁娶": [["周末", "偶数日"], ["冲日", "破日"]],
  "开业": [["工作日", "三合"], ["月破", "岁破"]],
  "出行": [["晴朗", "吉神"], ["大耗", "天刑"]],
  "签约": [["天德", "月德"], ["劫煞", "灾煞"]],
};

const TRIGRAM_GUACI = {
  "乾": "元亨利贞。君子以自强不息。",
  "坤": "元亨，利牝马之贞。君子以厚德载物。",
  "震": "震来虩虩，后笑言哑哑。",
  "巽": "小亨，利有攸往，利见大人。",
  "坎": "习坎，有孚，维心亨，行有尚。",
  "离": "利贞，亨。畜牝牛，吉。",
  "艮": "艮其背，不获其身；行其庭，不见其人。",
  "兑": "亨，利贞。和而悦。",
};

let cachedIching64 = null;
function loadIching64() {
  if (cachedIching64) return cachedIching64;
  const p = path.join(__dirname, '../../data/classics/iching_64.json');
  if (fs.existsSync(p)) {
    cachedIching64 = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } else {
    cachedIching64 = {};
  }
  return cachedIching64;
}

let cachedTarot = null;
function loadTarotCards() {
  if (cachedTarot) return cachedTarot;
  const p = path.join(__dirname, '../../data/classics/tarot_major.json');
  if (!fs.existsSync(p)) return [];
  const rawCards = JSON.parse(fs.readFileSync(p, 'utf-8'));
  
  const normalize = name => {
    const raw = String(name).split('(')[0].trim();
    return raw === "隐士" ? "隐者" : raw;
  };

  const byName = {};
  rawCards.forEach(item => {
    const cname = normalize(item.name);
    if (cname) byName[cname] = item;
  });

  const ordered = [];
  TAROT_CARDS.forEach((cname, idx) => {
    const card = byName[cname] ? { ...byName[cname] } : { name: cname, upright: {}, reversed: {} };
    card.id = idx;
    card.name_cn = cname;
    ordered.push(card);
  });
  
  cachedTarot = ordered;
  return ordered;
}

function getHexNumberFromLines(coinSums) {
  const bits = coinSums.map(s => [7, 9].includes(s) ? "1" : "0");
  const lowerBin = bits.slice(0, 3).join("");
  const upperBin = bits.slice(3, 6).join("");
  const lowerIdx = TRIGRAM_BIN_TO_INDEX[lowerBin];
  const upperIdx = TRIGRAM_BIN_TO_INDEX[upperBin];
  return KING_WEN_LOOKUP[lowerIdx][upperIdx];
}

function getChangedCoinSums(coinSums) {
  return coinSums.map(s => {
    if (s === 6) return 7;
    if (s === 9) return 8;
    return s;
  });
}

function cycleMovingLine(value) {
  const cycle = { 6: 7, 7: 8, 8: 9, 9: 6 };
  return cycle[value] || value;
}

function getTrigramNameFromBits(bits) {
  const bin = bits.join("");
  const idx = TRIGRAM_BIN_TO_INDEX[bin];
  return TRIGRAMS[idx];
}

function meihuaDecision(question, date) {
  const rnd = getSecureRng();
  const upperNum = rnd.randint(1, 8);
  const lowerNum = rnd.randint(1, 8);
  const movingIdx = rnd.randint(0, 5);

  const trigramMap = {
    1: [7, 7, 7], 2: [7, 7, 8], 3: [7, 8, 7], 4: [7, 8, 8],
    5: [8, 7, 7], 6: [8, 7, 8], 7: [8, 8, 7], 8: [8, 8, 8]
  };

  const baseLines = [...trigramMap[lowerNum], ...trigramMap[upperNum]];
  const primaryCoinSums = [...baseLines];
  const changedCoinSums = [...baseLines];
  changedCoinSums[movingIdx] = cycleMovingLine(changedCoinSums[movingIdx]);

  const primaryNum = getHexNumberFromLines(primaryCoinSums);
  const changedNum = getHexNumberFromLines(changedCoinSums);

  const huLines = [
    [7, 9].includes(primaryCoinSums[1]) ? 7 : 8,
    [7, 9].includes(primaryCoinSums[2]) ? 7 : 8,
    [7, 9].includes(primaryCoinSums[3]) ? 7 : 8,
    [7, 9].includes(primaryCoinSums[2]) ? 7 : 8,
    [7, 9].includes(primaryCoinSums[3]) ? 7 : 8,
    [7, 9].includes(primaryCoinSums[4]) ? 7 : 8,
  ];
  const huNum = getHexNumberFromLines(huLines);

  const cuoLines = primaryCoinSums.map(c => [7, 9].includes(c) ? 8 : 7);
  const cuoNum = getHexNumberFromLines(cuoLines);

  const zongLines = [...primaryCoinSums].reverse().map(c => [7, 9].includes(c) ? 7 : 8);
  const zongNum = getHexNumberFromLines(zongLines);

  const classics = loadIching64();

  const getHexInfo = (num) => {
    const c = classics[String(num)] || {};
    const texts = c.texts || {};
    const orig = texts["原文"] || {};
    return {
      number: num,
      name: c.name || "",
      guaci: orig["卦辞"] || "",
      texts
    };
  };

  const primaryInfo = getHexInfo(primaryNum);
  const changedInfo = getHexInfo(changedNum);
  
  let movingLineText = "";
  const origYaoci = primaryInfo.texts?.["原文"]?.["爻辞"] || {};
  const items = Object.entries(origYaoci);
  if (movingIdx >= 0 && movingIdx < items.length) {
    movingLineText = `${items[movingIdx][0]}：${items[movingIdx][1]}`;
  }

  const upperName = TRIGRAMS[upperNum - 1];
  const lowerName = TRIGRAMS[lowerNum - 1];
  let yongGua, tiGua;
  if (movingIdx >= 3) {
    yongGua = upperName;
    tiGua = lowerName;
  } else {
    yongGua = lowerName;
    tiGua = upperName;
  }

  const tiWx = TRIGRAM_WUXING[tiGua] || "";
  const yongWx = TRIGRAM_WUXING[yongGua] || "";

  let relation = "";
  if (tiWx && yongWx) {
    if (tiWx === yongWx) relation = `体用比和（${tiWx}），吉`;
    else if (isGenerating(tiWx, yongWx)) relation = `体生用（${tiWx}生${yongWx}），泄气、主耗损`;
    else if (isGenerating(yongWx, tiWx)) relation = `用生体（${yongWx}生${tiWx}），进益、大吉`;
    else if (isOvercoming(tiWx, yongWx)) relation = `体克用（${tiWx}克${yongWx}），可控、费力得财`;
    else if (isOvercoming(yongWx, tiWx)) relation = `用克体（${yongWx}克${tiWx}），凶、主阻碍`;
  }

  const TIMING_MAP = {
    "乾": "戌亥日/秋季", "兑": "酉日/秋季", "离": "午日/夏季", 
    "震": "卯日/春季", "巽": "辰巳日/春季", "坎": "子日/冬季", 
    "艮": "丑寅日/冬春", "坤": "未申日/夏秋"
  };
  const timing = TIMING_MAP[yongGua] || "近期";

  return {
    module: "梅花易数每日决策",
    question,
    date,
    hexagrams: {
      primary: primaryInfo,
      hu: getHexInfo(huNum),
      cuo: getHexInfo(cuoNum),
      zong: getHexInfo(zongNum),
      changed: changedInfo
    },
    moving_line: {
      index: movingIdx + 1,
      text: movingLineText
    },
    ti_yong: {
      ti_gua: tiGua, ti_wuxing: tiWx,
      yong_gua: yongGua, yong_wuxing: yongWx,
      relation
    },
    timing,
    conclusion: `本卦${primaryInfo.name}定起始，变卦${changedInfo.name}看结局。${relation}。应期多在${timing}。`
  };
}

function liuyaoDivine(question, date) {
  const rnd = getSecureRng();
  const coinSums = Array.from({ length: 6 }, () => rnd.choice([6, 7, 8, 9]));
  
  const movingLines = coinSums.map((s, idx) => s === 6 || s === 9 ? idx + 1 : null).filter(Boolean);

  const getLineDesc = (v) => {
    if (v === 6) return "老阴（动）";
    if (v === 7) return "少阳（静）";
    if (v === 8) return "少阴（静）";
    return "老阳（动）";
  };

  // Simplified 世应 (Shi / Ying) rule
  const primaryNum = getHexNumberFromLines(coinSums);
  // Basic mock for lines detail since we don't have full Na Jia logic
  const linesDetail = coinSums.map((s, idx) => ({
    line_no: idx + 1,
    coin_sum: s,
    line_type: getLineDesc(s),
    six_relative: "兄弟", // Placeholder
    role: idx === 2 ? "世爻" : (idx === 5 ? "应爻" : null) // Placeholder
  }));

  const changedCoinSums = getChangedCoinSums(coinSums);
  const changedNum = getHexNumberFromLines(changedCoinSums);
  
  const classics = loadIching64();
  const primaryClassic = classics[String(primaryNum)] || {};
  const changedClassic = classics[String(changedNum)] || {};

  const getTrigramNames = (sums) => {
    const bits = sums.map(s => [7, 9].includes(s) ? "1" : "0");
    const inner = getTrigramNameFromBits(bits.slice(0, 3));
    const outer = getTrigramNameFromBits(bits.slice(3, 6));
    return { inner, outer };
  };

  const pTri = getTrigramNames(coinSums);
  const cTri = getTrigramNames(changedCoinSums);

  const primaryName = `${pTri.outer}上${pTri.inner}下`;
  const changedName = `${cTri.outer}上${cTri.inner}下`;

  const primaryTexts = primaryClassic.texts || {};
  const primaryOriginal = primaryTexts["原文"] || {};
  const changedTexts = changedClassic.texts || {};
  const changedOriginal = changedTexts["原文"] || {};

  const guaci = primaryOriginal["卦辞"] || primaryClassic.judgment || `${TRIGRAM_GUACI[pTri.inner] || ''} ${TRIGRAM_GUACI[pTri.outer] || ''}`.trim();
  const xiangCi = primaryClassic.image || "";

  const movingLineTexts = [];
  const primaryLinesMap = primaryOriginal["爻辞"] || primaryClassic.lines || {};
  const primaryLineItems = Object.entries(primaryLinesMap);

  movingLines.forEach(ln => {
    let lineTitle = null;
    let text = null;
    if (primaryLineItems.length >= ln) {
      lineTitle = primaryLineItems[ln - 1][0];
      text = primaryLineItems[ln - 1][1];
    } else if (primaryLinesMap[String(ln)]) {
      text = primaryLinesMap[String(ln)];
    }
    if (text) {
      movingLineTexts.push({ line_no: ln, title: lineTitle, text });
    }
  });

  return {
    module: "六爻占卜",
    method: "铜钱法",
    question,
    date,
    primary_hexagram: {
      number: primaryNum,
      name: primaryName,
      classic_name: primaryClassic.name || primaryClassic.chinese_name || "",
      inner_trigram: pTri.inner,
      outer_trigram: pTri.outer,
      guaci,
      xiang_ci: xiangCi,
      texts: primaryTexts
    },
    changed_hexagram: {
      number: changedNum,
      name: changedName,
      classic_name: changedClassic.name || changedClassic.chinese_name || "",
      inner_trigram: cTri.inner,
      outer_trigram: cTri.outer,
      guaci: changedOriginal["卦辞"] || changedClassic.judgment || "",
      xiang_ci: changedClassic.image || "",
      texts: changedTexts
    },
    moving_lines: movingLines,
    moving_line_texts: movingLineTexts,
    lines: linesDetail,
    interpretation: {
      core: "先看本卦定主势，再以动爻判转机，最后参考之卦看结果落点。",
      decision_template: [
        "若动爻集中于下三爻，先处理内部变量再外推。",
        "若动爻集中于上三爻，外部环境变化更快，宜保留弹性。",
        "若世爻受克，先稳心态与资源；若应爻得生，可主动沟通推进。"
      ]
    }
  };
}

function tarotDivine(question, date) {
  const rnd = getSecureRng();
  let cardsDb = loadTarotCards();
  let selected = [];
  
  if (!cardsDb || cardsDb.length === 0) {
    const selectedNames = rnd.sample(TAROT_CARDS, 3);
    selected = selectedNames.map(n => ({ name: n, upright: {}, reversed: {} }));
  } else {
    selected = rnd.sample(cardsDb, 3);
  }

  const positions = ["过去", "现在", "未来"];
  const cards = positions.map((pos, i) => {
    const cardData = selected[i];
    const isReversed = rnd.choice([true, false]);
    const state = isReversed ? "reversed" : "upright";
    const meaningData = cardData[state] || {};

    return {
      position: pos,
      card: cardData.name_cn || cardData.name,
      is_reversed: isReversed,
      state_name: isReversed ? "逆位" : "正位",
      keywords: meaningData.keywords || "",
      meaning: meaningData.meaning || "",
      love: meaningData.love || "",
      career: meaningData.career || "",
      wealth: meaningData.wealth || "",
      health: meaningData.health || ""
    };
  });

  return {
    module: "塔罗占卜",
    question,
    date,
    cards,
    summary: "结合三张牌的指引，审视过去的影响，把握当下的行动，迎接未来的变化。"
  };
}

function hhuangli(date, activity) {
  const day = new Date(date);
  const rule = ACTIVITY_MAP[activity] || [["平日可行"], ["注意时机"]];
  const [suitable, avoid] = rule;
  
  const parity = day.getDate() % 2 === 0 ? "偶数日" : "奇数日";
  const yi = [...suitable, parity];
  const ji = [...avoid, day.getDate() % 5 === 0 ? "冲日" : "无明显冲煞"];

  return {
    module: "黄历查询",
    date,
    activity,
    yi,
    ji,
    note: "仅作传统文化参考，请结合现实条件与法律规范。"
  };
}

module.exports = { meihuaDecision, liuyaoDivine, tarotDivine, hhuangli };

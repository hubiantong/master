const { Solar } = require('lunar-javascript');
const {
  parseBirthDatetime, trueSolarDatetime, computeBaziStrength,
  ZHI_WUXING, getRng
} = require('../utils/helpers');

const REL_SCORE_CONFIG = {
  "default": {
    "weights": {
      "complementarity": 30,
      "day_master": 20,
      "spouse_palace": 20,
      "children_sync": 15,
      "dayun_sync": 15,
    },
    "base": {
      "complementarity": 15,
      "day_master": 10,
      "spouse_palace": 10,
      "children_sync": 8,
      "dayun_sync": 7,
    },
    "bonus": {
      "left_strong_match": 7,
      "right_strong_match": 8,
      "strength_complement": 10,
      "strength_balanced": 10,
      "spouse_he": 10,
      "spouse_tong": 5,
      "spouse_chong": -5,
      "children_he": 7,
      "children_tong": 4,
      "dayun_element_match": 2,
    },
    "clamp": { "min": 40, "max": 99 },
  }
};

function compatibility(left, right, scene) {
  const scoreCfg = REL_SCORE_CONFIG[scene] || REL_SCORE_CONFIG["default"];
  const weights = scoreCfg.weights;
  const base = scoreCfg.base;
  const bonus = scoreCfg.bonus;
  const clampMin = scoreCfg.clamp.min;
  const clampMax = scoreCfg.clamp.max;

  const getBaziInfo = (p) => {
    const rawDt = parseBirthDatetime(p.birthday, p.birth_time);
    const tz = p.timezone_offset !== undefined ? parseInt(p.timezone_offset, 10) : 8;
    const lon = p.longitude !== undefined ? parseFloat(p.longitude) : 120.0;
    const trueDt = trueSolarDatetime(rawDt, tz, lon);
    
    const solar = Solar.fromYmdHms(
      trueDt.getFullYear(), trueDt.getMonth() + 1, trueDt.getDate(),
      trueDt.getHours(), trueDt.getMinutes(), trueDt.getSeconds()
    );
    const lunar = solar.getLunar();
    const ec = lunar.getEightChar();
    
    const { scores, strength, yong_shen, ji_shen } = computeBaziStrength(ec);
    
    const genderCode = p.gender === "男" ? 1 : 0;
    const daYuns = ec.getYun(genderCode).getDaYun();
    
    return {
      ec, scores, strength, yong_shen, ji_shen, daYuns,
      day_gan: ec.getDayGan(),
      day_zhi: ec.getDayZhi(),
      time_zhi: ec.getTimeZhi()
    };
  };

  const lInfo = getBaziInfo(left);
  const rInfo = getBaziInfo(right);

  const getStrongest = (scores) => {
    let maxV = -Infinity, strongest = null;
    for (const [k, v] of Object.entries(scores)) {
      if (v > maxV) { maxV = v; strongest = k; }
    }
    return strongest;
  };

  const lStrongest = getStrongest(lInfo.scores);
  const rStrongest = getStrongest(rInfo.scores);

  let compScore = base.complementarity;
  if (rInfo.yong_shen === lStrongest) compScore += bonus.left_strong_match;
  if (lInfo.yong_shen === rStrongest) compScore += bonus.right_strong_match;
  compScore = Math.max(0, Math.min(weights.complementarity, compScore));

  let dmScore = base.day_master;
  if (lInfo.strength !== rInfo.strength) {
    dmScore += bonus.strength_complement;
  } else if (lInfo.strength === "中和") {
    dmScore += bonus.strength_balanced;
  }
  dmScore = Math.max(0, Math.min(weights.day_master, dmScore));

  const heRelations = [
    ["子", "丑"], ["寅", "亥"], ["卯", "戌"], 
    ["辰", "酉"], ["巳", "申"], ["午", "未"]
  ];
  const chongRelations = [
    ["子", "午"], ["丑", "未"], ["寅", "申"], 
    ["卯", "酉"], ["辰", "戌"], ["巳", "亥"]
  ];

  const checkRelation = (z1, z2, arr) => {
    return arr.some(pair => (pair[0] === z1 && pair[1] === z2) || (pair[0] === z2 && pair[1] === z1));
  };

  const lDz = lInfo.day_zhi;
  const rDz = rInfo.day_zhi;
  let spScore = base.spouse_palace;
  if (checkRelation(lDz, rDz, heRelations)) spScore += bonus.spouse_he;
  else if (checkRelation(lDz, rDz, chongRelations)) spScore += bonus.spouse_chong;
  else if (lDz === rDz) spScore += bonus.spouse_tong;
  spScore = Math.max(0, Math.min(weights.spouse_palace, spScore));

  const lTz = lInfo.time_zhi;
  const rTz = rInfo.time_zhi;
  let childScore = base.children_sync;
  if (checkRelation(lTz, rTz, heRelations)) childScore += bonus.children_he;
  else if (lTz === rTz) childScore += bonus.children_tong;
  childScore = Math.max(0, Math.min(weights.children_sync, childScore));

  let dySyncScore = base.dayun_sync;
  const lDyBranches = lInfo.daYuns.slice(1, 4).map(dy => dy.getGanZhi().length === 2 ? dy.getGanZhi()[1] : null).filter(Boolean);
  const rDyBranches = rInfo.daYuns.slice(1, 4).map(dy => dy.getGanZhi().length === 2 ? dy.getGanZhi()[1] : null).filter(Boolean);
  
  const matchCount = Array.from({ length: Math.min(lDyBranches.length, rDyBranches.length) }).reduce((acc, _, i) => {
    return acc + (ZHI_WUXING[lDyBranches[i]] === ZHI_WUXING[rDyBranches[i]] ? 1 : 0);
  }, 0);

  dySyncScore += matchCount * bonus.dayun_element_match;
  dySyncScore = Math.max(0, Math.min(weights.dayun_sync, dySyncScore));

  let totalScore = compScore + dmScore + spScore + childScore + dySyncScore;
  totalScore = Math.max(clampMin, Math.min(clampMax, totalScore));

  const strengths = [];
  const risks = [];

  if (compScore > 20) strengths.push(`五行互补度极高，${left.name}的旺势能极大地补足${right.name}的需用。`);
  if (dmScore > 15) strengths.push("日主强弱搭配合理，一方主导时另一方能提供稳定支持。");
  if (spScore > 15) strengths.push("配偶宫相合，两人在深层价值观与家庭观念上高度一致。");
  else if (spScore < 10) risks.push("配偶宫存在相冲，日常相处中容易因生活琐事产生摩擦。");

  if (childScore > 10) strengths.push("子女宫信息同步，在生育观念及晚年规划上步调一致。");
  if (dySyncScore > 10) strengths.push("未来大运走向趋同，能共同面对人生起伏，互相扶持。");
  else if (dySyncScore < 8) risks.push("未来大运节奏存在差异，一方顺利时另一方可能面临挑战，需更多包容。");

  if (risks.length === 0) risks.push("在亲密关系中仍需保持独立空间，避免过度依赖。");

  let rating = "需要磨合";
  if (totalScore >= 85) rating = "天作之合";
  else if (totalScore >= 65) rating = "中等契合";

  return {
    module: scene,
    left,
    right,
    score: totalScore,
    rating,
    dimensions: {
      complementarity: compScore,
      day_master: dmScore,
      spouse_palace: spScore,
      children_sync: childScore,
      dayun_sync: dySyncScore
    },
    scoring_meta: {
      weights,
      clamp: { min: clampMin, max: clampMax },
      explanation: "分值会按边界裁剪，避免极端样本造成误导性过高/过低结果。"
    },
    strengths,
    risks,
    suggestion: "建议在日常沟通中，多从对方的角度理解问题。保持长期的包容与支持，是关系长久的基石。"
  };
}

function relationshipGraph(centerName, relations) {
  const nodes = [{ id: centerName, type: "self" }];
  const edges = [];

  relations.forEach(rel => {
    const rng = getRng(centerName, rel.name, rel.relation_type, "graph");
    const score = rng.randint(55, 95);
    nodes.push({ id: rel.name, type: rel.relation_type });
    edges.push({
      from: centerName,
      to: rel.name,
      relation_type: rel.relation_type,
      score,
      label: score >= 80 ? "稳健" : (score >= 65 ? "可提升" : "需经营")
    });
  });

  return {
    module: "八字关系图谱",
    center: centerName,
    nodes,
    edges
  };
}

module.exports = { compatibility, relationshipGraph };

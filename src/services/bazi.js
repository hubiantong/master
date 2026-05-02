const { Solar } = require('lunar-javascript');
const {
  parseBirthDatetime, trueSolarDatetime, equationOfTimeMinutes, chinaDstShiftHours,
  computeBaziStrength, pickStrength, getRng, GAN_WUXING, ZHI_WUXING
} = require('../utils/helpers');

function baziAnalysis(name, birthday, birth_time, gender, timezone_offset = 8, longitude = 120.0) {
  console.log(`bazi_analysis start name=${name} birthday=${birthday}`);
  const rawDt = parseBirthDatetime(birthday, birth_time);
  const trueDt = trueSolarDatetime(rawDt, timezone_offset, longitude);
  
  const solar = Solar.fromYmdHms(
    trueDt.getFullYear(), trueDt.getMonth() + 1, trueDt.getDate(),
    trueDt.getHours(), trueDt.getMinutes(), trueDt.getSeconds()
  );
  const lunar = solar.getLunar();
  const ec = lunar.getEightChar();
  const prevJie = lunar.getPrevJieQi(true);
  const nextJie = lunar.getNextJieQi(true);

  const { scores, strength, yong_shen, ji_shen } = computeBaziStrength(ec);
  const { strongest, weakest } = pickStrength(scores);

  const pillars = {
    year: { gan_zhi: ec.getYear(), na_yin: ec.getYearNaYin(), shi_shen_gan: ec.getYearShiShenGan(), shi_shen_zhi: ec.getYearShiShenZhi() },
    month: { gan_zhi: ec.getMonth(), na_yin: ec.getMonthNaYin(), shi_shen_gan: ec.getMonthShiShenGan(), shi_shen_zhi: ec.getMonthShiShenZhi() },
    day: { gan_zhi: ec.getDay(), na_yin: ec.getDayNaYin(), shi_shen_gan: ec.getDayShiShenGan(), shi_shen_zhi: ec.getDayShiShenZhi() },
    time: { gan_zhi: ec.getTime(), na_yin: ec.getTimeNaYin(), shi_shen_gan: ec.getTimeShiShenGan(), shi_shen_zhi: ec.getTimeShiShenZhi() }
  };

  return {
    module: "八字分析命盘解析",
    input: {
      name, gender, calendar: "solar", birthday, birth_time, timezone_offset, longitude
    },
    time_correction: {
      raw_local_time: rawDt.toISOString().replace('T', ' ').substring(0, 19),
      true_solar_time: trueDt.toISOString().replace('T', ' ').substring(0, 19),
      equation_of_time_minutes: parseFloat(equationOfTimeMinutes(rawDt).toFixed(2)),
      china_dst_applied: chinaDstShiftHours(rawDt, timezone_offset, longitude) === 1
    },
    solar_lunar: {
      solar: solar.toYmdHms(),
      lunar: `${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
      prev_jieqi: { name: prevJie.getName(), time: prevJie.getSolar().toYmdHms() },
      next_jieqi: { name: nextJie.getName(), time: nextJie.getSolar().toYmdHms() }
    },
    pillars,
    ten_gods: {
      year_gan: ec.getYearShiShenGan(),
      month_gan: ec.getMonthShiShenGan(),
      day_gan: ec.getDayShiShenGan(),
      time_gan: ec.getTimeShiShenGan()
    },
    na_yin: {
      year: ec.getYearNaYin(), month: ec.getMonthNaYin(), day: ec.getDayNaYin(), time: ec.getTimeNaYin()
    },
    wu_xing_distribution: scores,
    structure: {
      day_master: ec.getDayGan(),
      day_master_element: GAN_WUXING[ec.getDayGan()] || "土",
      strength,
      strongest_element: strongest,
      weakest_element: weakest,
      yong_shen,
      ji_shen
    }
  };
}

function dailyFortune(name, gender, birthday, birth_time, date) {
  console.log(`daily_fortune start name=${name} date=${date}`);
  const rawDt = parseBirthDatetime(birthday, birth_time);
  const solar = Solar.fromYmdHms(
    rawDt.getFullYear(), rawDt.getMonth() + 1, rawDt.getDate(),
    rawDt.getHours(), rawDt.getMinutes(), rawDt.getSeconds()
  );
  const lunar = solar.getLunar();
  const ec = lunar.getEightChar();

  const { scores, strength, yong_shen, ji_shen } = computeBaziStrength(ec);

  const targetDt = new Date(`${date}T12:00:00`);
  const targetSolar = Solar.fromYmdHms(
    targetDt.getFullYear(), targetDt.getMonth() + 1, targetDt.getDate(), 12, 0, 0
  );
  const targetLunar = targetSolar.getLunar();
  const targetEc = targetLunar.getEightChar();

  const liuNian = targetEc.getYear();
  const liuYue = targetEc.getMonth();
  const liuRi = targetEc.getDay();

  const genderCode = gender === "男" ? 1 : 0;
  const daYuns = ec.getYun(genderCode).getDaYun();
  
  let currentDy = daYuns[0];
  for (let i = daYuns.length - 1; i >= 0; i--) {
    if (daYuns[i].getStartYear() <= targetDt.getFullYear()) {
      currentDy = daYuns[i];
      break;
    }
  }
  const daYun = currentDy.getGanZhi();

  const elementsInPeriod = [];
  [daYun, liuNian, liuYue, liuRi].forEach(gz => {
    if (gz.length === 2) {
      elementsInPeriod.push(GAN_WUXING[gz[0]] || "");
      elementsInPeriod.push(ZHI_WUXING[gz[1]] || "");
    }
  });

  const yongCount = elementsInPeriod.filter(e => yong_shen === e).length;
  const jiCount = elementsInPeriod.filter(e => ji_shen === e).length;

  const baseScore = 70;
  let netScore = baseScore + (yongCount - jiCount) * 8;
  netScore = Math.max(40, Math.min(99, netScore));

  const pseudoRandomInt = (seedStr, minV, maxV) => {
    const crypto = require('crypto');
    const h = crypto.createHash('sha256').update(seedStr).digest('hex');
    const num = parseInt(h.substring(0, 8), 16);
    return minV + (num % (maxV - minV + 1));
  };

  const overall = netScore;
  const love = Math.max(40, Math.min(99, overall + pseudoRandomInt(`${name}${date}love`, -10, 10)));
  const wealth = Math.max(40, Math.min(99, overall + pseudoRandomInt(`${name}${date}wealth`, -10, 10)));
  const work = Math.max(40, Math.min(99, overall + pseudoRandomInt(`${name}${date}work`, -10, 10)));
  const health = Math.max(40, Math.min(99, overall + pseudoRandomInt(`${name}${date}health`, -10, 10)));

  const bestHourStart = pseudoRandomInt(`${name}${date}hour1`, 7, 11);
  const bestHourEnd = pseudoRandomInt(`${name}${date}hour2`, 13, 21);
  const bestHour = `${String(bestHourStart).padStart(2, '0')}:00-${String(bestHourEnd).padStart(2, '0')}:00`;

  const LUCKY_COLORS = {"木": "青色/绿色", "火": "红色/紫色", "土": "黄色/棕色", "金": "白色/金色", "水": "黑色/蓝色"};
  const LUCKY_NUMBERS = {"木": "3, 8", "火": "2, 7", "土": "5, 0", "金": "4, 9", "水": "1, 6"};

  // Python logic treated yong_shen as a string, but the condition was `for e in yong_shen if e in LUCKY_COLORS`
  // Wait, yong_shen is a string of length 1. So it's just the element itself.
  const luckyColors = [...new Set([yong_shen].map(e => LUCKY_COLORS[e]).filter(Boolean))];
  const luckyNumbers = [...new Set([yong_shen].map(e => LUCKY_NUMBERS[e]).filter(Boolean))];

  let tips = [];
  if (yongCount > jiCount) {
    tips = ["今日五行有利，宜积极推进重要事务。", "把握贵人运，可多沟通协作。"];
  } else {
    tips = ["今日五行有所克制，宜求稳守成。", "注意情绪管理，避免冲动决策。"];
  }

  return {
    module: "每日运势",
    date,
    four_pillars: { da_yun: daYun, liu_nian: liuNian, liu_yue: liuYue, liu_ri: liuRi },
    bazi_basis: { strength, yong_shen, ji_shen },
    scores: { overall, love, wealth, work, health },
    lucky_elements: { colors: luckyColors, numbers: luckyNumbers },
    best_hour: bestHour,
    tips
  };
}

module.exports = { baziAnalysis, dailyFortune };

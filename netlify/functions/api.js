const { z } = require('zod');
const fs = require('fs');
const path = require('path');

const { resolveProfileGeo, normalizeBirthTime } = require('../../src/utils/geo');
const { baziAnalysis, dailyFortune } = require('../../src/services/bazi');
const { compatibility, relationshipGraph } = require('../../src/services/marriage');
const { meihuaDecision, liuyaoDivine, tarotDivine, hhuangli } = require('../../src/services/divination');
const { ziweiChart } = require('../../src/services/ziwei');
const { attachAiLayer, aiSettings } = require('../../src/services/ai');

let cachedCities = null;
function loadCities() {
  if (cachedCities) return cachedCities;
  const possiblePaths = [
    path.join(__dirname, '../../data/cities.json'),
    path.join(__dirname, '../data/cities.json'),
    path.join(process.cwd(), 'data/cities.json'),
    '/var/task/data/cities.json',
  ];
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        cachedCities = JSON.parse(fs.readFileSync(p, 'utf-8'));
        return cachedCities;
      }
    } catch (e) {}
  }
  cachedCities = [];
  return cachedCities;
}

const PersonProfileSchema = z.object({
  name: z.string().min(1, "姓名不能为空"),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "生日格式必须为 YYYY-MM-DD"),
  birth_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "出生时辰格式必须为 HH:MM 或 HH:MM:SS").nullable().optional(),
  gender: z.string().default("未知"),
  birth_place: z.string().default(""),
  timezone_offset: z.number().min(-12).max(14).nullable().optional(),
  longitude: z.number().min(-180.0).max(180.0).nullable().optional(),
  ziwei_school: z.string().default("sanhe"),
  ziwei_transform_scope: z.string().default("year"),
});

const SingleProfileRequestSchema = z.object({ profile: PersonProfileSchema });
const DailyRequestSchema = z.object({
  name: z.string(),
  gender: z.string().default("男"),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  birth_time: z.string().regex(/^\d{2}:\d{2}$/).default("12:00"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});
const PairRequestSchema = z.object({ left: PersonProfileSchema, right: PersonProfileSchema });
const GraphRelationSchema = z.object({ name: z.string(), relation_type: z.string() });
const GraphRequestSchema = z.object({ center_name: z.string(), relations: z.array(GraphRelationSchema) });
const QuestionRequestSchema = z.object({ question: z.string(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const HuangliRequestSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), activity: z.string() });

async function executeAndAttach(moduleName, reqPayload, executor, referenceDate = null) {
  let raw;
  try {
    raw = executor();
  } catch (err) {
    console.error(`Runtime failed module=${moduleName} error=${err.message}`);
    if (err.message.includes('超出范围') || err.message.includes('格式非法')) {
      const e = new Error(err.message);
      e.status = 422;
      throw e;
    }
    const e = new Error("模块执行失败: " + err.message);
    e.status = 500;
    throw e;
  }
  return await attachAiLayer(moduleName, reqPayload, raw, referenceDate);
}

function preparePairPayload(reqBody) {
  const reqPayload = { ...reqBody };
  for (const p of ['left', 'right']) {
    const profile = reqBody[p];
    const geoCtx = resolveProfileGeo(profile);
    const birthTime = normalizeBirthTime(profile.birth_time) || "12:00";
    const birthTimeStatus = normalizeBirthTime(profile.birth_time) ? "explicit" : "assumed_noon_due_to_unknown_hour";
    reqPayload[p] = { ...profile, birth_time: birthTime, timezone_offset: geoCtx.resolved_timezone_offset, longitude: geoCtx.resolved_longitude };
    reqPayload[p].geo_context = geoCtx;
    reqPayload[p].birth_time_status = birthTimeStatus;
  }
  return reqPayload;
}

function jsonResponse(data, status = 200) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    },
    body: JSON.stringify(data)
  };
}

function parseBody(event) {
  if (event.body) {
    try {
      return JSON.parse(event.body);
    } catch (e) {
      return {};
    }
  }
  return {};
}

function getPath(event) {
  const rawPath = event.rawPath || event.path || '';
  return rawPath.replace(/^\/api/, '').replace(/^\//, '');
}

const routes = {
  'cities/search': async (event) => {
    const q = (event.queryStringParameters?.q || '').trim().toLowerCase();
    const cities = loadCities();
    if (!q) return jsonResponse(cities.slice(0, 30));
    const results = cities.filter(c => 
      c.name.toLowerCase().includes(q) || 
      c.country.toLowerCase().includes(q) ||
      `${c.name}${c.country}`.toLowerCase().includes(q)
    ).slice(0, 20);
    return jsonResponse(results);
  },
  'health': async () => jsonResponse({ ok: true, service: "master-node-sim" }),
  'config': async () => {
    const cfg = aiSettings();
    const protocol = cfg.protocol;
    const model = protocol === "anthropic" ? cfg.model_anthropic : cfg.model_openai;
    return jsonResponse({ provider: cfg.provider, protocol, model, deep_thinking_enabled: cfg.deep_thinking === "true", reasoning_effort: cfg.reasoning_effort });
  },
  'bazi/analyze': async (event) => {
    const body = parseBody(event);
    const validated = SingleProfileRequestSchema.parse(body);
    const p = validated.profile;
    const geoCtx = resolveProfileGeo(p);
    const birthTime = normalizeBirthTime(p.birth_time) || "12:00";
    const birthTimeStatus = normalizeBirthTime(p.birth_time) ? "explicit" : "assumed_noon_due_to_unknown_hour";
    const raw = baziAnalysis(p.name, p.birthday, birthTime, p.gender || "未知", geoCtx.resolved_timezone_offset, geoCtx.resolved_longitude);
    const reqPayload = { ...body };
    reqPayload.profile.geo_context = geoCtx;
    reqPayload.profile.birth_time_status = birthTimeStatus;
    const finalRes = await attachAiLayer("八字分析命盘解析", reqPayload, raw);
    return jsonResponse(finalRes);
  },
  'fortune/daily': async (event) => {
    const body = parseBody(event);
    const validated = DailyRequestSchema.parse(body);
    const { name, gender, birthday, birth_time, date } = validated;
    const finalRes = await executeAndAttach("每日运势", body, () => dailyFortune(name, gender, birthday, birth_time, date), date);
    return jsonResponse(finalRes);
  },
  'marriage/analyze': async (event) => {
    const body = parseBody(event);
    const validated = PairRequestSchema.parse(body);
    const reqPayload = preparePairPayload(validated);
    const finalRes = await executeAndAttach("合婚分析", reqPayload, () => compatibility(reqPayload.left, reqPayload.right, "合婚分析"));
    return jsonResponse(finalRes);
  },
  'cooperation/analyze': async (event) => {
    const body = parseBody(event);
    const validated = PairRequestSchema.parse(body);
    const reqPayload = preparePairPayload(validated);
    const finalRes = await executeAndAttach("事业合作分析", reqPayload, () => compatibility(reqPayload.left, reqPayload.right, "事业合作分析"));
    return jsonResponse(finalRes);
  },
  'mother-in-law/analyze': async (event) => {
    const body = parseBody(event);
    const validated = PairRequestSchema.parse(body);
    const reqPayload = preparePairPayload(validated);
    const finalRes = await executeAndAttach("婆媳关系分析", reqPayload, () => compatibility(reqPayload.left, reqPayload.right, "婆媳关系分析"));
    return jsonResponse(finalRes);
  },
  'friend/analyze': async (event) => {
    const body = parseBody(event);
    const validated = PairRequestSchema.parse(body);
    const reqPayload = preparePairPayload(validated);
    const finalRes = await executeAndAttach("知己分析", reqPayload, () => compatibility(reqPayload.left, reqPayload.right, "知己分析"));
    return jsonResponse(finalRes);
  },
  'relationship/graph': async (event) => {
    const body = parseBody(event);
    const validated = GraphRequestSchema.parse(body);
    const finalRes = await executeAndAttach("八字关系图谱", body, () => relationshipGraph(validated.center_name, validated.relations));
    return jsonResponse(finalRes);
  },
  'meihua/daily-decision': async (event) => {
    const body = parseBody(event);
    const validated = QuestionRequestSchema.parse(body);
    const finalRes = await executeAndAttach("梅花易数每日决策", body, () => meihuaDecision(validated.question, validated.date), validated.date);
    return jsonResponse(finalRes);
  },
  'liuyao/divine': async (event) => {
    const body = parseBody(event);
    const validated = QuestionRequestSchema.parse(body);
    const raw = liuyaoDivine(validated.question, validated.date);
    const finalRes = await attachAiLayer("六爻占卜", body, raw, validated.date);
    return jsonResponse(finalRes);
  },
  'tarot/divine': async (event) => {
    const body = parseBody(event);
    const validated = QuestionRequestSchema.parse(body);
    const finalRes = await executeAndAttach("塔罗占卜", body, () => tarotDivine(validated.question, validated.date), validated.date);
    return jsonResponse(finalRes);
  },
  'ziwei/chart': async (event) => {
    const body = parseBody(event);
    const validated = SingleProfileRequestSchema.parse(body);
    const p = validated.profile;
    const birthTime = normalizeBirthTime(p.birth_time);
    if (!birthTime) return jsonResponse({ detail: "紫微斗数排盘需要精确出生时辰（HH:MM 或 HH:MM:SS）。" }, 422);
    const geoCtx = resolveProfileGeo(p);
    const reqPayload = { ...body };
    reqPayload.profile.geo_context = geoCtx;
    const finalRes = await executeAndAttach("紫微斗数排盘", reqPayload, () => ziweiChart(p.name, p.birthday, birthTime, p.ziwei_school || "sanhe", p.ziwei_transform_scope || "year", geoCtx.resolved_timezone_offset, geoCtx.resolved_longitude));
    return jsonResponse(finalRes);
  },
  'ziwei/marriage': async (event) => {
    const body = parseBody(event);
    const validated = PairRequestSchema.parse(body);
    const finalRes = await executeAndAttach("紫微合婚", body, () => compatibility(validated.left, validated.right, "紫微合婚"));
    return jsonResponse(finalRes);
  },
  'huangli': async (event) => {
    const body = parseBody(event);
    const validated = HuangliRequestSchema.parse(body);
    const finalRes = await executeAndAttach("黄历查询", body, () => hhuangli(validated.date, validated.activity), validated.date);
    return jsonResponse(finalRes);
  }
};

exports.handler = async (event, context) => {
  const method = event.httpMethod || event.requestContext?.http?.method || 'GET';
  const path = getPath(event);
  
  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: ''
    };
  }
  
  const routeHandler = routes[path];
  if (!routeHandler) {
    return jsonResponse({ detail: `Route not found: ${path}`, availableRoutes: Object.keys(routes) }, 404);
  }
  
  try {
    return await routeHandler(event);
  } catch (err) {
    console.error(`Error handling ${path}:`, err);
    if (err.name === 'ZodError') {
      return jsonResponse({ detail: err.errors }, 422);
    }
    if (err.status) {
      return jsonResponse({ detail: err.message }, err.status);
    }
    return jsonResponse({ detail: 'Internal Server Error', error: err.message }, 500);
  }
};

const express = require('express');
const cors = require('cors');
const serverless = require('serverless-http');
const { z } = require('zod');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
require('express-async-errors');

const { resolveProfileGeo, normalizeBirthTime } = require('../../src/utils/geo');
const { baziAnalysis, dailyFortune } = require('../../src/services/bazi');
const { compatibility, relationshipGraph } = require('../../src/services/marriage');
const { meihuaDecision, liuyaoDivine, tarotDivine, hhuangli } = require('../../src/services/divination');
const { ziweiChart } = require('../../src/services/ziwei');
const { attachAiLayer, aiSettings } = require('../../src/services/ai');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

const validate = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    next(error);
  }
};

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

app.get('/cities/search', (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  const cities = loadCities();
  if (!q) return res.json(cities.slice(0, 30));
  const results = cities.filter(c => 
    c.name.toLowerCase().includes(q) || 
    c.country.toLowerCase().includes(q) ||
    `${c.name}${c.country}`.toLowerCase().includes(q)
  ).slice(0, 20);
  res.json(results);
});

app.get('/health', (req, res) => res.json({ ok: true, service: "master-node-sim" }));

app.get('/config', (req, res) => {
  const cfg = aiSettings();
  const protocol = cfg.protocol;
  const model = protocol === "anthropic" ? cfg.model_anthropic : cfg.model_openai;
  res.json({ provider: cfg.provider, protocol, model, deep_thinking_enabled: cfg.deep_thinking === "true", reasoning_effort: cfg.reasoning_effort });
});

app.post('/bazi/analyze', validate(SingleProfileRequestSchema), async (req, res) => {
  const p = req.body.profile;
  const geoCtx = resolveProfileGeo(p);
  const birthTime = normalizeBirthTime(p.birth_time) || "12:00";
  const birthTimeStatus = normalizeBirthTime(p.birth_time) ? "explicit" : "assumed_noon_due_to_unknown_hour";
  const raw = baziAnalysis(p.name, p.birthday, birthTime, p.gender || "未知", geoCtx.resolved_timezone_offset, geoCtx.resolved_longitude);
  const reqPayload = { ...req.body };
  reqPayload.profile.geo_context = geoCtx;
  reqPayload.profile.birth_time_status = birthTimeStatus;
  const finalRes = await attachAiLayer("八字分析命盘解析", reqPayload, raw);
  res.json(finalRes);
});

app.post('/fortune/daily', validate(DailyRequestSchema), async (req, res) => {
  const { name, gender, birthday, birth_time, date } = req.body;
  const finalRes = await executeAndAttach("每日运势", req.body, () => dailyFortune(name, gender, birthday, birth_time, date), date);
  res.json(finalRes);
});

app.post('/marriage/analyze', validate(PairRequestSchema), async (req, res) => {
  const reqPayload = preparePairPayload(req.body);
  const finalRes = await executeAndAttach("合婚分析", reqPayload, () => compatibility(reqPayload.left, reqPayload.right, "合婚分析"));
  res.json(finalRes);
});

app.post('/cooperation/analyze', validate(PairRequestSchema), async (req, res) => {
  const reqPayload = preparePairPayload(req.body);
  const finalRes = await executeAndAttach("事业合作分析", reqPayload, () => compatibility(reqPayload.left, reqPayload.right, "事业合作分析"));
  res.json(finalRes);
});

app.post('/mother-in-law/analyze', validate(PairRequestSchema), async (req, res) => {
  const reqPayload = preparePairPayload(req.body);
  const finalRes = await executeAndAttach("婆媳关系分析", reqPayload, () => compatibility(reqPayload.left, reqPayload.right, "婆媳关系分析"));
  res.json(finalRes);
});

app.post('/friend/analyze', validate(PairRequestSchema), async (req, res) => {
  const reqPayload = preparePairPayload(req.body);
  const finalRes = await executeAndAttach("知己分析", reqPayload, () => compatibility(reqPayload.left, reqPayload.right, "知己分析"));
  res.json(finalRes);
});

app.post('/relationship/graph', validate(GraphRequestSchema), async (req, res) => {
  const finalRes = await executeAndAttach("八字关系图谱", req.body, () => relationshipGraph(req.body.center_name, req.body.relations));
  res.json(finalRes);
});

app.post('/meihua/daily-decision', validate(QuestionRequestSchema), async (req, res) => {
  const finalRes = await executeAndAttach("梅花易数每日决策", req.body, () => meihuaDecision(req.body.question, req.body.date), req.body.date);
  res.json(finalRes);
});

app.post('/liuyao/divine', validate(QuestionRequestSchema), async (req, res) => {
  const raw = liuyaoDivine(req.body.question, req.body.date);
  const finalRes = await attachAiLayer("六爻占卜", req.body, raw, req.body.date);
  res.json(finalRes);
});

app.post('/tarot/divine', validate(QuestionRequestSchema), async (req, res) => {
  const finalRes = await executeAndAttach("塔罗占卜", req.body, () => tarotDivine(req.body.question, req.body.date), req.body.date);
  res.json(finalRes);
});

app.post('/ziwei/chart', validate(SingleProfileRequestSchema), async (req, res) => {
  const p = req.body.profile;
  const birthTime = normalizeBirthTime(p.birth_time);
  if (!birthTime) return res.status(422).json({ detail: "紫微斗数排盘需要精确出生时辰（HH:MM 或 HH:MM:SS）。" });
  const geoCtx = resolveProfileGeo(p);
  const reqPayload = { ...req.body };
  reqPayload.profile.geo_context = geoCtx;
  const finalRes = await executeAndAttach("紫微斗数排盘", reqPayload, () => ziweiChart(p.name, p.birthday, birthTime, p.ziwei_school || "sanhe", p.ziwei_transform_scope || "year", geoCtx.resolved_timezone_offset, geoCtx.resolved_longitude));
  res.json(finalRes);
});

app.post('/ziwei/marriage', validate(PairRequestSchema), async (req, res) => {
  const finalRes = await executeAndAttach("紫微合婚", req.body, () => compatibility(req.body.left, req.body.right, "紫微合婚"));
  res.json(finalRes);
});

app.post('/huangli', validate(HuangliRequestSchema), async (req, res) => {
  const finalRes = await executeAndAttach("黄历查询", req.body, () => hhuangli(req.body.date, req.body.activity), req.body.date);
  res.json(finalRes);
});

app.use((err, req, res, next) => {
  console.error(`Unhandled server error path=${req.path}`, err);
  if (err.name === 'ZodError') return res.status(422).json({ detail: err.errors });
  if (err.status) return res.status(err.status).json({ detail: err.message });
  const trace_id = require('crypto').randomUUID().replace(/-/g, '');
  res.status(500).json({ detail: 'Internal Server Error', trace_id });
});

module.exports.handler = serverless(app);

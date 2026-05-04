const axios = require('axios');

const WEEKDAY_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

const AI_KNOWLEDGE = {
  "八字分析命盘解析": [
    "以五行强弱观察个人能量结构，强调平衡而非绝对吉凶。",
    "解释优先采用可行动建议，避免宿命化表达。",
    "分析重点：性格驱动力、压力模式、成长策略。",
  ],
  "每日运势": [
    "日运属于短期趋势观察，适合安排事务优先级。",
    "建议关注情绪稳定、沟通时机与执行节奏。",
  ],
  "合婚分析": [
    "关系分析以沟通模式、边界感、共同目标为核心。",
    "输出需兼顾优势与风险，不做绝对结论。",
  ],
  "事业合作分析": [
    "合作评估重点：决策风格、分工边界、风险共担机制。",
    "建议提供可执行的协作规则。",
  ],
  "婆媳关系分析": [
    "代际关系重点在期待差异与边界协商。",
    "建议使用低冲突表达与周期复盘。",
  ],
  "知己分析": [
    "朋友关系看重价值观匹配与支持方式互补。",
    "建议明确长期互动机制。",
  ],
  "八字关系图谱": [
    "图谱用于识别关系强弱与协作优先级。",
    "适合做关系盘点与行动排序。",
  ],
  "梅花易数每日决策": [
    "决策建议应遵循先验证假设、后投入资源。",
    "强调可逆决策与分步推进。",
  ],
  "六爻占卜": [
    "六爻关注变化节点与关键转折位。",
    "建议输出应包含备选方案。",
  ],
  "塔罗占卜": [
    "塔罗可作为情境反思工具，不替代现实证据。",
    "建议先处理可控问题，再处理情绪波动。",
  ],
  "紫微斗数排盘": [
    "紫微排盘用于结构化观察宫位联动。",
    "重点关注事业、财帛、福德三宫平衡。",
  ],
  "紫微合婚": [
    "双盘对照重在长期相处模式与资源协同。",
    "建议输出应包含现实沟通动作。",
  ],
  "黄历查询": [
    "黄历用于传统文化参考，不能替代现实约束。",
    "建议结合日程、法律与客观条件决策。",
  ],
};

function aiSettings() {
  const protocol = (process.env.LLM_PROTOCOL || "openai").toLowerCase();
  const validProtocol = ["openai", "anthropic"].includes(protocol) ? protocol : "openai";

  const deepThinkingStr = (process.env.LLM_DEEP_THINKING || "false").toLowerCase();
  const deepThinking = ["1", "true", "yes", "on"].includes(deepThinkingStr);
  let reasoningEffort = (process.env.LLM_REASONING_EFFORT || "medium").toLowerCase();
  if (!["low", "medium", "high"].includes(reasoningEffort)) reasoningEffort = "medium";

  return {
    provider: process.env.LLM_PROVIDER || "dashscope",
    protocol: validProtocol,
    base_url_openai: process.env.LLM_BASE_URL_OPENAI || process.env.LLM_BASE_URL || "https://coding.dashscope.aliyuncs.com/v1",
    base_url_anthropic: process.env.LLM_BASE_URL_ANTHROPIC || "https://coding.dashscope.aliyuncs.com/apps/anthropic",
    api_key_openai: process.env.LLM_API_KEY_OPENAI || process.env.LLM_API_KEY || "",
    api_key_anthropic: process.env.LLM_API_KEY_ANTHROPIC || process.env.LLM_API_KEY || "",
    model_openai: process.env.LLM_MODEL_OPENAI || process.env.LLM_MODEL || "qwen3.5-plus",
    model_anthropic: process.env.LLM_MODEL_ANTHROPIC || process.env.LLM_MODEL || "qwen3.5-plus",
    deep_thinking: deepThinking ? "true" : "false",
    reasoning_effort: reasoningEffort,
    thinking_budget_tokens: parseInt(process.env.LLM_THINKING_BUDGET_TOKENS || "1024", 10),
    max_tokens: parseInt(process.env.LLM_MAX_TOKENS || "1024", 10),
    anthropic_version: process.env.LLM_ANTHROPIC_VERSION || "2023-06-01",
    timeout_sec: parseInt(process.env.LLM_TIMEOUT_SEC || "8", 10)
  };
}

function timeContext(referenceDate) {
  const now = new Date();
  let ref = now;
  if (referenceDate) {
    const parsed = new Date(referenceDate);
    if (!isNaN(parsed.getTime())) {
      ref = parsed;
    }
  }
  const hour = now.getHours();
  let period = "夜间";
  if (hour >= 5 && hour < 8) period = "清晨";
  else if (hour >= 8 && hour < 18) period = "白天";

  const month = ref.getMonth() + 1; // 1-12
  let season = "冬季";
  if ([3, 4, 5].includes(month)) season = "春季";
  else if ([6, 7, 8].includes(month)) season = "夏季";
  else if ([9, 10, 11].includes(month)) season = "秋季";

  return {
    current_datetime: now.toISOString().replace('T', ' ').substring(0, 19),
    weekday: WEEKDAY_CN[now.getDay()],
    time_period: period,
    reference_date: ref.toISOString().substring(0, 10),
    season
  };
}

function resultHighlights(result) {
  const points = [];
  if (result.strongest_element && result.weakest_element) {
    points.push(`五行重心：${result.strongest_element}强，${result.weakest_element}弱。`);
  }
  if (result.score !== undefined && result.rating) {
    points.push(`关系评分：${result.score}（${result.rating}）。`);
  }
  if (result.scores && typeof result.scores === 'object') {
    if (result.scores.overall !== undefined) {
      points.push(`综合运势分：${result.scores.overall}。`);
    }
  }
  if (result.hexagram && result.trend) {
    points.push(`卦象：${result.hexagram}，建议：${result.trend}。`);
  }
  if (result.cards && Array.isArray(result.cards)) {
    const cards = result.cards.map(c => c.card).join('、');
    points.push(`抽取牌面：${cards}。`);
  }
  if (result.yi && result.ji) {
    points.push(`黄历宜：${result.yi.slice(0, 2).join('、')}；忌：${result.ji.slice(0, 2).join('、')}。`);
  }
  if (result.insight) {
    points.push(String(result.insight));
  }
  return points.slice(0, 3);
}

function buildAiPrompt(moduleName, userInput, result, referenceDate) {
  const knowledge = AI_KNOWLEDGE[moduleName] || ["理性表达，避免绝对化。", "输出可执行建议。"];
  const timeCtx = timeContext(referenceDate);
  const highlights = resultHighlights(result);
  
  let outputFormat = "请输出：\n1) 综合现状分析\n2) 关键节点与变量\n3) 应对策略与建议。";
  if (moduleName === "每日运势分析") {
    outputFormat = "请输出：1) 今日关键洞察 2) 风险提醒 3) 今日可执行行动（3条）。";
  } else if (["八字分析命盘解析", "紫微斗数排盘"].includes(moduleName)) {
    outputFormat = "请输出：\n1) 命盘综合分析\n2) 事业运势分析\n3) 财富运势分析\n4) 桃花/感情运势分析\n5) 健康运势分析\n6) 总结与建议。";
  } else if (["事业合作分析", "婆媳关系分析", "知己分析", "紫微合婚"].includes(moduleName)) {
    outputFormat = "请输出：\n1) 关系综合评分与定调\n2) 双方命理特质交叉分析\n3) 核心优势与契合点\n4) 潜在冲突与风险点\n5) 改善关系的具体建议。";
  }

  return [
    "你是理性、克制、可执行导向的命理分析助手。",
    "目标：基于输入与计算结果，给出详尽、中立、具体、可落地的多维度分析与建议。",
    "规则：不神化、不恐吓、不做决定替代，避免绝对化语言。",
    `模块：${moduleName}`,
    `时间上下文：${JSON.stringify(timeCtx)}`,
    `领域知识：${JSON.stringify(knowledge)}`,
    `用户输入：${JSON.stringify(userInput)}`,
    `核心结果：${JSON.stringify(highlights)}`,
    outputFormat
  ].join("\n");
}

async function callOpenAiProtocol(systemPrompt, userPrompt, cfg) {
  const apiKey = cfg.api_key_openai;
  if (!apiKey) {
    console.warn("openai protocol call failed: no api key");
    return null;
  }

  const url = `${cfg.base_url_openai.replace(/\/$/, '')}/chat/completions`;
  const timeoutMs = cfg.timeout_sec * 1000;

  console.log(`[AI] Calling OpenAI protocol: url=${url}, model=${cfg.model_openai}, timeout=${timeoutMs}ms`);

  const payload = {
    model: cfg.model_openai,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.5
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[AI] OpenAI protocol failed: status=${response.status}, body=${errorText.substring(0, 500)}`);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    console.log(`[AI] OpenAI protocol success, content length: ${content.length}`);
    return content.trim() || null;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn(`[AI] OpenAI protocol timeout after ${timeoutMs}ms`);
    } else {
      console.warn(`[AI] openai protocol call failed: message=${err.message}`);
    }
    return null;
  }
}

async function* callOpenAiProtocolStream(systemPrompt, userPrompt, cfg) {
  const apiKey = cfg.api_key_openai;
  if (!apiKey) return;

  const url = `${cfg.base_url_openai.replace(/\/$/, '')}/chat/completions`;
  const timeoutMs = cfg.timeout_sec * 1000;

  const payload = {
    model: cfg.model_openai,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.5,
    stream: true
  };

  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };

  try {
    const resp = await axios.post(url, payload, { 
      headers, 
      timeout: timeoutMs,
      responseType: 'stream'
    });

    const stream = resp.data;
    let buffer = '';

    for await (const chunk of stream) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            yield content;
          }
        } catch (e) {}
      }
    }
  } catch (err) {
    console.warn("openai protocol stream call failed:", err.message);
  }
}

async function* callAnthropicProtocolStream(systemPrompt, userPrompt, cfg) {
  const apiKey = cfg.api_key_anthropic;
  if (!apiKey) return;

  const url = `${cfg.base_url_anthropic.replace(/\/$/, '')}/messages`;
  const timeoutMs = cfg.timeout_sec * 1000;

  const payload = {
    model: cfg.model_anthropic,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    max_tokens: cfg.max_tokens,
    stream: true
  };

  const headers = {
    "x-api-key": apiKey,
    "anthropic-version": cfg.anthropic_version,
    "Content-Type": "application/json"
  };

  try {
    const resp = await axios.post(url, payload, { 
      headers, 
      timeout: timeoutMs,
      responseType: 'stream'
    });

    const stream = resp.data;
    let buffer = '';

    for await (const chunk of stream) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta') {
            const text = parsed.delta?.text;
            if (text) yield text;
          }
        } catch (e) {}
      }
    }
  } catch (err) {
    console.warn("anthropic protocol stream call failed:", err.message);
  }
}

async function* callExternalLlmStream(systemPrompt, userPrompt) {
  const cfg = aiSettings();
  if (cfg.protocol === "anthropic") {
    yield* callAnthropicProtocolStream(systemPrompt, userPrompt, cfg);
  } else {
    yield* callOpenAiProtocolStream(systemPrompt, userPrompt, cfg);
  }
}

async function callAnthropicProtocol(systemPrompt, userPrompt, cfg) {
  const apiKey = cfg.api_key_anthropic;
  if (!apiKey) return null;

  const url = `${cfg.base_url_anthropic.replace(/\/$/, '')}/messages`;
  const timeoutMs = cfg.timeout_sec * 1000;
  const deepThinking = cfg.deep_thinking === "true";

  const payloadBase = {
    model: cfg.model_anthropic,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    max_tokens: cfg.max_tokens
  };

  let payloadWithReasoning = { ...payloadBase };
  if (deepThinking) {
    payloadWithReasoning.thinking = {
      type: "enabled",
      budget_tokens: cfg.thinking_budget_tokens
    };
  }

  const headers = {
    "x-api-key": apiKey,
    "anthropic-version": cfg.anthropic_version,
    "Content-Type": "application/json"
  };

  try {
    let resp;
    try {
      resp = await axios.post(url, payloadWithReasoning, { headers, timeout: timeoutMs });
    } catch (err) {
      if (deepThinking && err.response && err.response.status >= 400) {
        resp = await axios.post(url, payloadBase, { headers, timeout: timeoutMs });
      } else {
        throw err;
      }
    }
    
    const contentArr = resp.data.content || [];
    const textParts = contentArr.filter(c => c.type === 'text').map(c => c.text);
    return textParts.join('\n').trim() || null;
  } catch (err) {
    console.warn("anthropic protocol call failed:", err.message);
    return null;
  }
}

async function callExternalLlm(systemPrompt, userPrompt) {
  const cfg = aiSettings();
  if (cfg.protocol === "anthropic") {
    return await callAnthropicProtocol(systemPrompt, userPrompt, cfg);
  }
  return await callOpenAiProtocol(systemPrompt, userPrompt, cfg);
}

function normalizeAiAnalysisLines(lines) {
  const normalized = [];
  for (let raw of lines) {
    let line = raw.trim();
    if (!line || line.startsWith("```")) continue;
    line = line.replace(/^\s{0,3}#{1,6}\s*/, "");
    line = line.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    line = line.replace(/`([^`]+)`/g, "$1");
    line = line.replace(/\*\*([^*]+)\*\*/g, "$1");
    line = line.replace(/\*([^*]+)\*/g, "$1");
    line = line.replace(/^\s*[-*+]\s+/, "• ");
    normalized.push(line);
  }
  return normalized;
}

const SENSITIVE_KEYWORDS = ["api_key", "apikey", "secret", "token"];
function sanitizeResponsePayload(data) {
  if (Array.isArray(data)) {
    return data.map(item => sanitizeResponsePayload(item));
  } else if (data !== null && typeof data === 'object') {
    const cleaned = {};
    for (const [key, value] of Object.entries(data)) {
      const lowered = String(key).toLowerCase();
      if (SENSITIVE_KEYWORDS.some(kw => lowered.includes(kw))) {
        continue;
      }
      cleaned[key] = sanitizeResponsePayload(value);
    }
    return cleaned;
  }
  return data;
}

async function attachAiLayer(moduleName, userInput, result, referenceDate = null) {
  const prompt = buildAiPrompt(moduleName, userInput, result, referenceDate);
  const timeCtx = timeContext(referenceDate);
  const highlights = resultHighlights(result);
  const knowledge = AI_KNOWLEDGE[moduleName] || ["理性表达，避免绝对化。", "输出可执行建议。"];
  
  const aiTextFallback = [
    `结合${timeCtx.weekday}（${timeCtx.time_period}）与当前节律，建议先聚焦最关键的一件事。`,
    "从本次结果看，优先处理“可控变量”，再处理“情绪变量”，会更稳健。",
    "本周行动建议：1) 明确目标与边界 2) 固定复盘节奏 3) 关键沟通提前约定规则。"
  ];
  if (highlights.length > 0) {
    aiTextFallback.unshift(`关键洞察：${highlights[0]}`);
  }

  const systemPrompt = "你是理性、克制、可执行导向的命理分析助手。请使用中文。不要神化、不要绝对化、不要恐吓用户，输出聚焦可执行建议。";

  let llmText = null;
  try {
    llmText = await callExternalLlm(systemPrompt, prompt);
  } catch (err) {
    console.error(`attachAiLayer external llm failed module=${moduleName} error=${err.message}`);
  }

  const finalAnalysisRaw = llmText 
    ? llmText.split('\n').filter(line => line.trim()) 
    : aiTextFallback;
  
  const finalAnalysis = normalizeAiAnalysisLines(finalAnalysisRaw);
  const analysisMarkdown = (llmText || aiTextFallback.join('\n')).trim();

  const merged = { ...result };
  const cfg = aiSettings();
  const activeModel = cfg.protocol === "anthropic" ? cfg.model_anthropic : cfg.model_openai;
  const llmEnabledPublic = ["1", "true", "yes", "on"].includes((process.env.LLM_ENABLED || "true").toLowerCase());

  merged.ai = {
    prompt_version: "v2.2",
    provider: cfg.provider,
    protocol: cfg.protocol,
    model: activeModel,
    deep_thinking_enabled: cfg.deep_thinking === "true",
    reasoning_effort: cfg.reasoning_effort,
    llm_enabled: llmEnabledPublic,
    llm_response_mode: llmText ? "external" : "fallback",
    time_context: timeCtx,
    knowledge_points: knowledge,
    optimized_prompt: prompt,
    analysis_markdown: analysisMarkdown,
    analysis: finalAnalysis
  };

  return sanitizeResponsePayload(merged);
}

module.exports = { attachAiLayer, aiSettings, attachAiLayerStream };

async function attachAiLayerStream(moduleName, userInput, result, referenceDate = null) {
  const prompt = buildAiPrompt(moduleName, userInput, result, referenceDate);
  const timeCtx = timeContext(referenceDate);
  const highlights = resultHighlights(result);
  const knowledge = AI_KNOWLEDGE[moduleName] || ["理性表达，避免绝对化。", "输出可执行建议。"];
  
  const aiTextFallback = [
    `结合${timeCtx.weekday}（${timeCtx.time_period}）与当前节律，建议先聚焦最关键的一件事。`,
    "从本次结果看，优先处理可控变量，再处理情绪变量，会更稳健。",
    "本周行动建议：1) 明确目标与边界 2) 固定复盘节奏 3) 关键沟通提前约定规则。"
  ];
  if (highlights.length > 0) {
    aiTextFallback.unshift(`关键洞察：${highlights[0]}`);
  }

  const systemPrompt = "你是理性、克制、可执行导向的命理分析助手。请使用中文。不要神化、不要绝对化、不要恐吓用户，输出聚焦可执行建议。";

  const merged = { ...result };
  const cfg = aiSettings();
  const activeModel = cfg.protocol === "anthropic" ? cfg.model_anthropic : cfg.model_openai;
  const llmEnabledPublic = ["1", "true", "yes", "on"].includes((process.env.LLM_ENABLED || "true").toLowerCase());

  merged.ai = {
    prompt_version: "v2.2",
    provider: cfg.provider,
    protocol: cfg.protocol,
    model: activeModel,
    deep_thinking_enabled: cfg.deep_thinking === "true",
    reasoning_effort: cfg.reasoning_effort,
    llm_enabled: llmEnabledPublic,
    llm_response_mode: "streaming",
    time_context: timeCtx,
    knowledge_points: knowledge,
    optimized_prompt: prompt,
    analysis_markdown: "",
    analysis: []
  };

  return {
    data: sanitizeResponsePayload(merged),
    stream: callExternalLlmStream(systemPrompt, prompt)
  };
}

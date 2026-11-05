/**
 * 大模型调用封装（OpenAI 兼容协议，默认豆包 · 火山方舟 Ark，可切 DeepSeek）
 * -------------------------------------------------
 * - 真实模式：POST {baseUrl}/chat/completions，Bearer apiKey
 *   供应商通过 config.llm.provider 区分：
 *     ark      → 额外携带 thinking 参数控制深度思考
 *     deepseek → 不发送 thinking（该接口不识别），其余字段完全兼容
 * - 模拟模式：LLM_MOCK=true 时不发任何网络请求，按层级返回固定结构假提示，
 *   保证没有 API Key 也能跑通全流程；MOCK_LEAK=true 可验证"泄露重试/降级"链路
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'
import { stripHtml } from './leakGuard.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/* ---------- 提示词模板加载与渲染 ---------- */

const systemTpl = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'system.txt'), 'utf-8')
const userTpl = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'user.txt'), 'utf-8')

/** 供 hintService 渲染提示词使用（模板文本只读） */
export function promptTemplates() {
  return { systemTpl, userTpl }
}

/** {{变量}} 逐个替换（不存在的变量替换为空串兜底） */
export function renderTemplate(tpl, vars) {
  let out = tpl
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll('{{' + key + '}}', String(value ?? ''))
  }
  return out
}

/* ---------- 真实调用 ---------- */

/**
 * 调用豆包 chat/completions
 * @param {Array<{role,content}>} messages 消息列表
 * @returns {Promise<{content: string, usage: object|null, model: string}>}
 */
async function arkChat(messages, temperature = 0.4) {
  const resp = await fetch(config.llm.baseUrl + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + config.llm.apiKey
    },
    body: JSON.stringify({
      model: config.llm.model,
      messages,
      temperature, // 提示类任务用 0.4（稳定），画像类任务可略高（见 chatText）
      /* 思考开关仅火山方舟支持；DeepSeek 等接口不识别该字段，不能透传 */
      ...(config.llm.provider === 'ark' ? { thinking: { type: config.llm.thinking } } : {})
    }),
    signal: AbortSignal.timeout(config.llm.timeoutMs)
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`Ark接口异常 ${resp.status}: ${body.slice(0, 200)}`)
  }
  const data = await resp.json()
  return {
    content: data.choices?.[0]?.message?.content ?? '',
    usage: data.usage || null,
    model: data.model || config.llm.model
  }
}

/* ---------- 模拟实现 ---------- */

/**
 * 生成固定结构的假提示（文案不含本题答案数值，可通过泄露扫描）
 * @param {number} targetLevel 1~4
 * @param {object} question 题目对象
 */
function mockReply(targetLevel, question) {
  const isCalc = question.type === 'calc'
  const base = { level: targetLevel, knowledge_refs: [], steps: [], solution: null }

  /* MOCK_LEAK=true：第一次输出故意携带答案数值 → 必然未通过泄露校验，
     用于人工验证"重试→仍失败→降级"整条链路 */
  const leakTail = config.llm.mockLeak
    ? (isCalc
        ? ` 参考数值：Y*=${question.answer.Y}，r*=${(question.answer.r * 100).toFixed(2)}%。`
        : ` 正确答案是${'ABCD'[question.correct]}。`)
    : ''

  if (targetLevel === 1) {
    return {
      ...base,
      title: '先定分析框架',
      hint_body: isCalc
        ? '这道题落在<b>两个市场共同均衡</b>的框架里：一个方程管产品市场，另一个方程管货币市场，先想清楚各自由什么条件推出，再考虑怎么把它们"碰头"。' + leakTail
        : '先别急着选：回到<b>曲线的定义与两侧失衡含义</b>去想，判断题目描述的位置/状态落在曲线的哪一侧，再对应到投资储蓄或货币供求的关系。' + leakTail,
      guiding_question: isCalc ? 'IS曲线和LM曲线分别来自哪个市场的均衡条件？' : '题目描述的状态，对应曲线的哪一侧或哪一段？'
    }
  }
  if (targetLevel === 2) {
    return {
      ...base,
      title: '关键条件与知识点',
      hint_body: isCalc
        ? '题干给出的消费函数、投资函数、政府支出与税收对应<b>IS方程</b>的参数；货币需求与实际货币供给对应<b>LM方程</b>的参数。核心知识点：两市场共同均衡的联立求解。' + leakTail
        : '抓题干关键词，对应检索到的核心知识点：<b>曲线的定义、失衡区域的含义、斜率与极端区域</b>。先确认考的是哪个市场的均衡。' + leakTail,
      guiding_question: isCalc ? '哪些参数进IS方程、哪些参数进LM方程？' : '题干关键词对应哪个知识点？',
      knowledge_refs: isCalc ? ['IS曲线的含义和推导', 'LM曲线的含义和推导'] : ['IS曲线及两侧的失衡区域', 'LM曲线的含义']
    }
  }
  if (targetLevel === 3) {
    return {
      ...base,
      title: '思路框架（含留白）',
      hint_body: '按下面的框架推进，最后一步留给你完成。',
      steps: isCalc
        ? [
          '① 由产品市场均衡（Y = C + I + G）代入题干参数，整理成 r 关于 Y 的IS方程；',
          '② 由货币市场均衡（m = ky − hr）代入参数，整理出LM方程；',
          '③ 两式相等，得到关于 Y 的一元方程；',
          '❓请你自己完成：④ 解出均衡产出，再回代任一方程求均衡利率。'
        ]
        : [
          '① 从题干定位所考查的市场与曲线；',
          '② 回忆该曲线的定义式（均衡条件）；',
          '③ 对照题干描述的位置/状态，判断在曲线哪一侧；',
          '❓请你自己完成：④ 把失衡关系翻译回选项，做出判断。'
        ],
      guiding_question: '完成留白步骤后，可以提交答案或继续用仿真器验证。'
    }
  }

  /* targetLevel === 4：模拟完整解析（数值取自题库，保证通过一致性校验） */
  if (isCalc) {
    return {
      ...base,
      title: '完整解析',
      hint_body: '',
      knowledge_refs: ['联立求解：两市场共同均衡'],
      solution: {
        answer: `Y* = ${question.answer.Y}，r* ≈ ${(question.answer.r * 100).toFixed(2)}%`,
        process: '① 产品市场均衡推出IS方程；\n② 货币市场均衡推出LM方程；\n③ 联立求解得均衡产出，回代得均衡利率（逐步过程以题库官方解析为准）。',
        meaning: '两个市场同时均衡决定了唯一的产出与利率组合；任何政策变动都通过两条曲线的移动改变这一均衡。',
        pitfalls: ['r 需统一为小数口径代入方程', '注意平衡预算乘数与简单乘数的区别']
      }
    }
  }
  return {
    ...base,
    title: '完整解析',
    hint_body: '',
    knowledge_refs: ['IS曲线及两侧的失衡区域'],
    solution: {
      answer: 'ABCD'[question.correct],
      process: '以题库官方解析为准：' + stripHtml(question.analysis),
      meaning: '本质是曲线定义与失衡区域含义的直接应用。',
      pitfalls: ['注意区分"曲线上的点"与"曲线两侧区域"的含义']
    }
  }
}

/**
 * 统一入口：发起一次大模型生成
 * @param {object} opts
 * @param {Array<{role,content}>} opts.messages 消息列表
 * @param {number} opts.targetLevel 目标层级（mock 需要）
 * @param {object} opts.question 题目对象（mock 需要）
 */
export async function chatLLM({ messages, targetLevel, question }) {
  /* 真实模式但未配置 API Key：自动回退模拟并提示，避免直接 401 失败 */
  if (!config.llm.mock && !config.llm.apiKey) {
    console.warn('[llm] LLM_MOCK=false 但 ARK_API_KEY 为空，已自动回退本地模拟；请在 .env 填入火山方舟 Key 后重启')
  }
  if (config.llm.mock || !config.llm.apiKey) {
    /* 模拟一点点网络延迟，便于前端 loading 态可见 */
    await new Promise(r => setTimeout(r, 300))
    const reply = mockReply(targetLevel, question)
    return {
      content: JSON.stringify(reply),
      usage: null,
      model: 'mock'
    }
  }
  return arkChat(messages)
}

/* ============================================================
 * 流式对话（SSE 上游）与工具调用（Function Calling）
 * 供 AI 智能体（agentService / routes/agent.js）使用
 * ============================================================ */

/**
 * 真实模式：Ark chat/completions 流式调用（stream: true，SSE 增量返回）
 * @param {Array<{role,content}>} messages
 * @param {Array<object>} [tools] OpenAI 格式工具定义（透传给豆包）
 * @yields {object} 增量事件：
 *   { type:'delta', text }                       内容增量
 *   { type:'tool_calls', toolCalls }             模型请求调用工具（聚合后一次性 yield）
 *   { type:'done', content, model }              流结束
 */
async function* arkChatStream(messages, tools) {
  const resp = await fetch(config.llm.baseUrl + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + config.llm.apiKey
    },
    body: JSON.stringify({
      model: config.llm.model,
      messages,
      temperature: 0.4,
      stream: true,
      /* thinking 仅 Ark 支持，其它供应商透传会 400 */
      ...(config.llm.provider === 'ark' ? { thinking: { type: config.llm.thinking } } : {}),
      ...(tools ? { tools } : {})
    }),
    signal: AbortSignal.timeout(config.llm.timeoutMs + 35000) // 流式总时长放宽
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`Ark流式接口异常 ${resp.status}: ${body.slice(0, 200)}`)
  }

  /* 逐行解析 SSE：data: {...} / data: [DONE] */
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let toolCalls = []   // 聚合各增量里的 tool_calls 片段
  let model = config.llm.model

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    /* 按换行切出完整行（SSE 以 \n 分隔事件） */
    const lines = buffer.split('\n')
    buffer = lines.pop() // 最后一段可能不完整，留到下一轮

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') continue

      let chunk
      try { chunk = JSON.parse(payload) } catch { continue }

      if (chunk.model) model = chunk.model
      const delta = chunk.choices?.[0]?.delta
      if (!delta) continue

      /* 内容增量：立即向外产出（打字机效果的数据源） */
      if (delta.content) {
        content += delta.content
        yield { type: 'delta', text: delta.content }
      }

      /* 工具调用增量：按 index 聚合（id/名称/参数分片到达） */
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0
          if (!toolCalls[idx]) toolCalls[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } }
          if (tc.id) toolCalls[idx].id = tc.id
          if (tc.function?.name) toolCalls[idx].function.name += tc.function.name
          if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments
        }
      }
    }
  }

  if (toolCalls.length > 0) {
    yield { type: 'tool_calls', toolCalls }
  }
  yield { type: 'done', content, model }
}

/**
 * 模拟模式的流式回复：根据用户最后一条消息关键词路由到
 * "调工具讲解"或"普通知识问答"，再把整段文案切成小段逐字 yield（假流式）。
 * mock 下也走真实的工具循环（islm_solve 等），保证无 Key 演示完整智能体链路。
 * @param {string} lastUserText 用户最新消息
 * @yields 同 arkChatStream 的事件结构
 */
export async function* mockChatStream(lastUserText) {
  /* 每段字符数与间隔（毫秒）：合计约 6~8 秒的打字机体验 */
  const CHUNK = 6
  const DELAY = 35

  let full = ''
  const toolCalls = []
  const { mockAgentReply } = await import('./agentService.js')
  const plan = mockAgentReply(lastUserText) // { toolCalls?, text }

  if (plan.toolCalls) {
    toolCalls.push(...plan.toolCalls)
    yield { type: 'tool_calls', toolCalls }
  }
  full = plan.text

  for (let i = 0; i < full.length; i += CHUNK) {
    yield { type: 'delta', text: full.slice(i, i + CHUNK) }
    await new Promise(r => setTimeout(r, DELAY))
  }
  yield { type: 'done', content: full, model: 'mock' }
}

/**
 * 返回一个异步迭代器：按当前模式选择真实流式或 mock 假流式
 * @param {Array<{role,content}>} messages
 * @param {Array<object>} tools
 * @param {string} lastUserText mock 路由用：用户最新一条消息
 */
export async function* chatStream(messages, tools, lastUserText) {
  const useMock = config.llm.mock || !config.llm.apiKey
  if (useMock) {
    yield* mockChatStream(lastUserText)
    return
  }
  yield* arkChatStream(messages, tools)
}

/* ============================================================
 * 通用文本生成（供学生画像 / 学习建议 / 教师端学情总结复用）
 * ------------------------------------------------------------
 * 上课导学链路需要 targetLevel / question 才能走 mock，而画像类任务
 * 的输入是一整份统计数据，因此单独提供一条"通用"通道：
 *   - 真实模式：直接走 arkChat
 *   - 模拟模式：调用调用方传入的 mockFallback()（确定性模板，便于离线演示）
 * ============================================================ */

/**
 * 通用文本生成
 * @param {object} opts
 * @param {Array<{role,content}>} opts.messages 消息列表
 * @param {Function|string} opts.mockFallback 无 Key 时的兜底内容（函数或字符串）
 * @param {number} [opts.temperature] 采样温度（真实模式生效）
 * @returns {Promise<{content:string, usage:object|null, model:string}>}
 */
export async function chatText({ messages, mockFallback, temperature = 0.5 }) {
  const useMock = config.llm.mock || !config.llm.apiKey
  if (useMock) {
    const content = typeof mockFallback === 'function' ? mockFallback() : String(mockFallback || '')
    return { content, usage: null, model: 'mock' }
  }
  return arkChat(messages, temperature)
}

/**
 * 从模型输出中宽松解析 JSON：
 * 模型偶尔会包 ```json 代码块或前后加解释，这里做一次"截取首个 { 到末个 }"的兜底
 * @param {string} text
 * @returns {object|null}
 */
export function parseJsonLoose(text) {
  if (!text) return null
  const cleaned = String(text).replace(/```json/gi, '').replace(/```/g, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) return null
    try {
      return JSON.parse(cleaned.slice(start, end + 1))
    } catch {
      return null
    }
  }
}

/**
 * 读取 prompts/ 目录下的提示词模板（带进程内缓存）
 * @param {string} filename 例如 'profile.txt'
 */
const promptCache = new Map()
export function loadPrompt(filename) {
  if (promptCache.has(filename)) return promptCache.get(filename)
  const text = fs.readFileSync(path.join(__dirname, '..', 'prompts', filename), 'utf-8')
  promptCache.set(filename, text)
  return text
}

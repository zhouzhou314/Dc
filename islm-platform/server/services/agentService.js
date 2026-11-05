/**
 * AI 智能体服务（Function Calling 工具循环）
 * -------------------------------------------------
 * 真实模式：把工具定义透传给豆包（OpenAI tools 协议），模型自主决定
 *          调用哪个工具 → 服务端执行 → 结果回填消息 → 继续生成，
 *          最多 MAX_ROUNDS 轮，防止循环失控。
 * 模拟模式：关键词路由器 mockAgentReply() 在本地完成"选工具→执行→
 *          组稿"，由 llm.js 的 mockChatStream 包装成假流式事件。
 *
 * 对外只暴露一个入口 runAgent()：一边执行一边通过 emit 回调吐出事件，
 * 由 routes/agent.js 转成 SSE 推给前端（打字机 + 工具调用步骤条）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'
import { chatStream } from './llm.js'
import { calcIslmCurves, generateAnalysisNote } from './islmSolver.js'
import { retrieveHybrid } from './retriever.js'
import { query } from '../db.js'
import { DEFAULT_PARAMS } from '../../src/constants/presets.js'
import { questionBank } from '../../src/data/questionBank.js'
import { stripHtml } from './leakGuard.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/* 智能体系统提示词（教学口吻，禁止直接报习题答案数值） */
const AGENT_SYSTEM = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'agent-system.txt'), 'utf-8')

/* 工具循环上限：防止模型反复调用工具不收敛 */
const MAX_ROUNDS = 4

/* ============================================================
 * 工具定义（OpenAI tools 协议格式，透传给豆包）
 * ============================================================ */
export const TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'islm_solve',
      description: '求解 IS-LM 模型：给定九个结构参数，返回 IS/LM 曲线方程、均衡产出 Y*、均衡利率 r* 与经济学解读。用户给出部分参数时其余用默认值。',
      parameters: {
        type: 'object',
        properties: {
          C0: { type: 'number', description: '自主消费' },
          c: { type: 'number', description: '边际消费倾向（0~1）' },
          I0: { type: 'number', description: '自主投资' },
          d: { type: 'number', description: '投资利率敏感度' },
          G: { type: 'number', description: '政府支出' },
          T: { type: 'number', description: '税收' },
          MP: { type: 'number', description: '实际货币供给 M/P' },
          k: { type: 'number', description: '货币交易需求系数' },
          h: { type: 'number', description: '货币投机需求系数' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'knowledge_search',
      description: '在课程知识库（第十一章 IS-LM 模型）中检索知识块。回答概念辨析、图像含义、政策分析等问题前先调用它。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索关键词或完整问题' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'question_query',
      description: '查询题库中的练习题（按知识点/难度/题型筛选，返回题干摘要，不含答案）。',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: '知识点：IS曲线/LM曲线/IS-LM均衡/政策运用/模型评析' },
          difficulty: { type: 'string', description: '难度：easy/medium/hard' },
          keyword: { type: 'string', description: '题干关键词' },
          limit: { type: 'number', description: '返回数量，默认 3' }
        },
        required: []
      }
    }
  }
]

/* ============================================================
 * 工具执行器
 * ============================================================ */

/**
 * 执行一个工具调用
 * @param {string} name 工具名
 * @param {object} args 参数（JSON 解析后）
 * @returns {Promise<{summary:string, data:object}>} summary 给前端展示，data 回填给模型
 */
export async function executeTool(name, args) {
  if (name === 'islm_solve') {
    /* 缺失参数用平台默认参数补齐，避免模型漏参导致求解失败 */
    const params = { ...DEFAULT_PARAMS, ...args }
    const result = calcIslmCurves(params)
    if (!result.valid) {
      return { summary: '参数无效', data: { error: result.reason } }
    }
    const note = generateAnalysisNote(params, result)
    const { Y, r } = result.equilibrium
    return {
      summary: `Y*=${Y}，r*=${(r * 100).toFixed(2)}%`,
      data: {
        equilibrium: { Y, rPct: +(r * 100).toFixed(2) },
        isCurveEquation: `r = ${result.alphaIS.toFixed(4)} - ${result.betaIS.toFixed(6)}·Y`,
        lmCurveEquation: `r = ${result.betaLM.toFixed(6)}·Y - ${result.alphaLM.toFixed(4)}`,
        note
      }
    }
  }

  if (name === 'knowledge_search') {
    /* 智能体检索没有"题目"上下文，构造一个只有 query 的伪题目对象 */
    const results = await retrieveHybrid({
      question: { question: args.query || '' },
      allowSolution: false
    })
    return {
      summary: `命中 ${results.length} 个知识块：${results.map(r => r.title).join('、')}`,
      data: results.map(r => ({ title: r.title, content: r.content.slice(0, 300) }))
    }
  }

  if (name === 'question_query') {
    let pool = questionBank
    if (args.topic) pool = pool.filter(q => q.topic === args.topic)
    if (args.difficulty) pool = pool.filter(q => q.difficulty === args.difficulty)
    if (args.keyword) pool = pool.filter(q => stripHtml(q.question).includes(args.keyword))
    const limit = Math.min(Number(args.limit) || 3, 8)
    /* 只回题干摘要，绝不回答案字段（防泄露红线） */
    return {
      summary: `找到 ${Math.min(pool.length, limit)} 道题`,
      data: pool.slice(0, limit).map(q => ({
        id: q.id, topic: q.topic, difficulty: q.difficulty, type: q.type,
        preview: stripHtml(q.question).slice(0, 60)
      }))
    }
  }

  return { summary: '未知工具', data: { error: `unknown tool: ${name}` } }
}

/* ============================================================
 * 模拟模式：关键词路由器（无 Key 也能演示完整智能体链路）
 * ============================================================ */

/**
 * 根据用户消息本地决定"调哪个工具 + 最终回复文案"
 * @param {string} userText 用户最新消息
 * @returns {{toolCalls?: Array<{name,args,summary}>, text: string}}
 */
export function mockAgentReply(userText) {
  const text = String(userText || '')

  /* 1) 求解类 → islm_solve（提取消息里的数字没意义，直接用默认参数演示，
        并在文案中说明"当前使用平台默认参数"） */
  if (/求解|均衡|Y\*|r\*|is-?lm|islm|计算|算出/i.test(text)) {
    const params = { ...DEFAULT_PARAMS }
    const r = calcIslmCurves(params)
    const note = generateAnalysisNote(params, r)
    return {
      toolCalls: [{ name: 'islm_solve', args: {}, summary: `Y*=${r.equilibrium.Y}，r*=${(r.equilibrium.r * 100).toFixed(2)}%` }],
      text:
        '我已调用 <b>IS-LM 求解器</b>，用平台默认参数（C₀=100，c=0.8，I₀=200，d=2000，G=100，T=50，M/P=200，k=0.2，h=1000）为你演示联立求解：\n\n' +
        `IS 方程：r = ${r.alphaIS.toFixed(4)} - ${r.betaIS.toFixed(6)}·Y\n` +
        `LM 方程：r = ${r.betaLM.toFixed(6)}·Y - ${r.alphaLM.toFixed(4)}\n\n` +
        `联立解得：均衡产出 <b>Y* = ${r.equilibrium.Y}</b>，均衡利率 <b>r* ≈ ${(r.equilibrium.r * 100).toFixed(2)}%</b>。\n\n` +
        note + '\n\n想换参数再算一次吗？告诉我九个参数的取值即可（也可以去"仿真验证"页面手动调节）。'
    }
  }

  /* 2) 找题/练习类 → question_query */
  if (/题|练习|推荐|刷/.test(text)) {
    const found = questionBank.slice(0, 3).map(q => ({
      id: q.id, topic: q.topic, difficulty: q.difficulty, preview: stripHtml(q.question).slice(0, 50)
    }))
    return {
      toolCalls: [{ name: 'question_query', args: { limit: 3 }, summary: `找到 ${found.length} 道题` }],
      text:
        '我已调用 <b>题库查询</b> 工具，为你挑了 3 道练习题（不含答案，先自己想想）：\n\n' +
        found.map(q => `第 ${q.id} 题｜${q.topic}｜${q.difficulty}：${q.preview}……`).join('\n\n') +
        '\n\n可以直接去"题库练习"页面完成它们，做题时我会按 L1→L4 分级给你提示。'
    }
  }

  /* 3) 其余 → knowledge_search（同步版演示：直接给概念讲解） */
  return {
    toolCalls: [{ name: 'knowledge_search', args: { query: text.slice(0, 60) }, summary: '检索知识库' }],
    text:
      '我已调用 <b>知识库检索</b> 工具。这里用通俗的话解释：\n\n' +
      'IS 曲线描述<b>产品市场</b>均衡时利率与产出的关系（利率越低投资越高、产出越大，向右下方倾斜）；' +
      'LM 曲线描述<b>货币市场</b>均衡的关系（产出越高交易性货币需求越大，利率越高，向右上方倾斜）。\n\n' +
      '两条曲线的交点就是"两个市场同时均衡"的（Y*，r*）。财政政策移动 IS，货币政策移动 LM。\n\n' +
      '（当前为本地模拟模式：接入豆包 API Key 后，我会基于真实知识块检索给出更精准的讲解。想看实际求解演示，可以问我"帮我求解 IS-LM 均衡"。）'
  }
}

/* ============================================================
 * 主循环：runAgent
 * ============================================================ */

/**
 * 运行智能体（一边执行一边 emit 事件，由路由层转 SSE）
 * @param {object} opts
 * @param {string} opts.userId 用户标识（日志用）
 * @param {Array<{role,content}>} opts.messages 前端消息历史（不含 system）
 * @param {Function} opts.emit 事件回调 emit(event, payload)
 * @returns {Promise<{content:string, model:string, toolCalls:Array}>}
 */
export async function runAgent({ userId, messages, emit }) {
  const lastUserText = [...messages].reverse().find(m => m.role === 'user')?.content || ''
  const isMock = config.llm.mock || !config.llm.apiKey

  /* 用户消息落日志（答辩可回放） */
  await query('INSERT INTO agent_log (user_id, role, content) VALUES (?, ?, ?)', [userId, 'user', String(lastUserText).slice(0, 2000)]).catch(() => {})

  const usedTools = []

  if (isMock) {
    /* ---------- 模拟模式：一次性产出（工具→文稿） ---------- */
    for await (const ev of chatStream(messages, TOOL_DEFS, lastUserText)) {
      if (ev.type === 'tool_calls') {
        for (const tc of ev.toolCalls) {
          emit('tool_call', { name: tc.name, args: tc.args || {} })
          const { summary, data } = await executeTool(tc.name, tc.args || {})
          usedTools.push({ name: tc.name, args: tc.args, summary })
          emit('tool_result', { name: tc.name, summary })
          void data // mock 文稿已包含结果，data 仅留作日志
        }
      } else if (ev.type === 'delta') {
        emit('delta', { text: ev.text })
      } else if (ev.type === 'done') {
        await logAssistant(userId, ev.content, usedTools)
        return { content: ev.content, model: ev.model, toolCalls: usedTools }
      }
    }
    return { content: '', model: 'mock', toolCalls: usedTools }
  }

  /* ---------- 真实模式：工具循环（最多 MAX_ROUNDS 轮） ---------- */
  const msgs = [{ role: 'system', content: AGENT_SYSTEM }, ...messages]
  let finalContent = ''

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let roundContent = ''
    let pendingCalls = null
    let streamed = false

    for await (const ev of chatStream(msgs, TOOL_DEFS, lastUserText)) {
      if (ev.type === 'delta') {
        roundContent += ev.text
        emit('delta', { text: ev.text }) // 打字机流出（工具轮的引导语也会流出）
        streamed = true
      } else if (ev.type === 'tool_calls') {
        pendingCalls = ev.toolCalls
      } else if (ev.type === 'done') {
        roundContent = ev.content || roundContent
      }
    }

    /* 本轮没有工具调用 → 最终答案已生成，结束 */
    if (!pendingCalls || pendingCalls.length === 0) {
      finalContent = roundContent
      break
    }

    /* 本轮中途请求了工具：通知前端清掉刚流出的半截引导文本，再执行工具 */
    if (streamed) emit('reset', {})

    /* 有工具调用：执行并把结果回填消息列表，进入下一轮 */
    msgs.push({ role: 'assistant', content: roundContent, tool_calls: pendingCalls })
    for (const tc of pendingCalls) {
      let args = {}
      try { args = JSON.parse(tc.function.arguments || '{}') } catch { /* 参数解析失败按空参处理 */ }
      emit('tool_call', { name: tc.function.name, args })
      const { summary, data } = await executeTool(tc.function.name, args)
      usedTools.push({ name: tc.function.name, args, summary })
      emit('tool_result', { name: tc.function.name, summary })
      msgs.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(data).slice(0, 4000) // 控制回填长度
      })
    }
  }

  /* 超过轮数上限时，用已有内容兜底（若为空则给出固定说明） */
  if (!finalContent) {
    finalContent = '（本次回答涉及多步工具调用，已达单轮上限。请把问题拆小一点再问我。）'
    emit('delta', { text: finalContent })
  }

  await logAssistant(userId, finalContent, usedTools)
  return { content: finalContent, model: config.llm.model, toolCalls: usedTools }
}

/** 助手回复落日志 */
async function logAssistant(userId, content, toolCalls) {
  await query(
    'INSERT INTO agent_log (user_id, role, content, tool_calls) VALUES (?, ?, ?, ?)',
    [userId, 'assistant', String(content).slice(0, 6000), toolCalls.length ? JSON.stringify(toolCalls) : null]
  ).catch(() => {})
}

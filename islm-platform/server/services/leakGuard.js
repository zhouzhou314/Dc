/**
 * 防泄露校验模块（阶梯导学的"安全闸"）
 * -------------------------------------------------
 * 目标：防止 L1~L3 的提示输出中出现"照抄级泄露"——
 *   最终答案数值（Y*、r*）、正确选项字母/原文。
 *
 * 两道防线：
 *   1）检索侧（retriever 使用 buildLeakTokens）：把含答案数值的知识块
 *      从 L1~L3 检索池中剔除（因为本章知识讲解正文里就藏着习题答案数值）；
 *   2）输出侧（checkOutput）：对模型返回的 JSON 做结构与泄露扫描，
 *      不合格 → 追加提醒重试 1 次 → 仍不合格 → 降级直出知识块原文。
 *
 * 边界说明：字符串检测只能拦截"数值/字母/原文"级别的硬泄露；
 * 概念性重述（如把答案含义换个说法）无法靠字符串根除，
 * 由 System Prompt 的层级铁律兜底。
 */
import { exercises } from '../../src/data/chapter11.js'

/** 题目字典：id → exercise（模块加载时构建一次） */
export const questionMap = new Map(exercises.map(ex => [ex.id, ex]))

/** 去除 HTML 标签（题干/解析/选项里含 <b> 等内联标签） */
export function stripHtml(text) {
  return String(text || '').replace(/<[^>]+>/g, '')
}

/**
 * 生成一个数值的全部"文本变体"，用于泄露匹配。
 * 例：1266.67 → '1266.67' / '1266.7' / '1267'；0.0533 → '0.0533'（百分数另算）
 */
function numberVariants(value) {
  if (!Number.isFinite(value)) return []
  return [...new Set([value.toFixed(2), value.toFixed(1), String(Math.round(value))])]
}

/**
 * 预计算某道题的"泄露 token"集合（模块内按题缓存，只算一次）
 * 返回 { numberTokens: string[], sentenceTokens: string[] }
 *  - numberTokens：答案数值变体（小写、含小数点或长度≥3，避免 '2' 这种过短误杀）
 *  - sentenceTokens：正确选项原文（仅长度≥8 的选项参与整句匹配，
 *    防止"正相关"这类短选项把讲解知识块的正常文本误杀）
 */
const leakTokenCache = new Map()
export function buildLeakTokens(question) {
  if (leakTokenCache.has(question.id)) return leakTokenCache.get(question.id)

  const numberTokens = []
  const sentenceTokens = []

  if (question.type === 'calc' && question.answer && Number.isFinite(question.answer.r)) {
    /* 产出 Y*：1266.67 / 1433.33 / 1600 */
    for (const v of numberVariants(question.answer.Y)) {
      if (v.includes('.') || v.length >= 3) numberTokens.push(v.toLowerCase())
    }
    /* 利率：小数口径 0.0533 与百分数口径 5.33（均带小数点才收录） */
    for (const v of [question.answer.r, question.answer.r * 100]) {
      for (const s of [v.toFixed(4), v.toFixed(2), v.toFixed(1)]) {
        if (s.includes('.') && !numberTokens.includes(s)) numberTokens.push(s)
      }
    }
  } else if (Array.isArray(question.options) && Number.isInteger(question.correct)) {
    /* 防御：智能体知识检索传入的伪题目（只有 question 字段）没有选项，
     * 跳过泄露闸——伪题目无答案可泄露，不应阻断检索 */
    const optText = stripHtml(question.options[question.correct] || '').toLowerCase()
    if (optText.length >= 8) sentenceTokens.push(optText)
  }

  const result = { numberTokens, sentenceTokens }
  leakTokenCache.set(question.id, result)
  return result
}

/* 正确选项字母的"答案语义"模式：只认"正确答案/选/应选…"附近的字母，
   避免正文里普通的 A、B 等字母造成误杀 */
const LETTER_PATTERN = /(正确答案|正确选项|应选|答案|选)\s*[:：是为]?\s*([A-D])(?![A-Za-z])/

/**
 * 对一段文本做泄露扫描
 * @returns {{ leak: boolean, token?: string }} 命中的泄露内容
 */
export function scanLeak(text, question) {
  const plain = stripHtml(text).toLowerCase()
  const { numberTokens, sentenceTokens } = buildLeakTokens(question)

  for (const t of numberTokens) {
    if (plain.includes(t)) return { leak: true, token: t }
  }
  for (const t of sentenceTokens) {
    if (plain.includes(t)) return { leak: true, token: t }
  }
  const m = plain.match(LETTER_PATTERN)
  if (m) return { leak: true, token: '选项字母' }

  return { leak: false }
}

/**
 * 从模型原始输出中提取并解析 JSON（容忍 ```json 代码围栏等包裹）
 */
function extractJson(rawText) {
  const start = rawText.indexOf('{')
  const end = rawText.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(rawText.slice(start, end + 1))
  } catch {
    return null
  }
}

/**
 * L4 专项：完整解析的答案必须"包含"标准答案（防模型给错答案）。
 * 计算题：answer 文本需含 Y* 或 r* 的任一数值变体；
 * 单选题：answer 需含正确选项字母（独立字母）或正确选项原文。
 */
function answerMatchesStandard(solution, question) {
  const answerText = String(solution?.answer || '').toLowerCase()
  if (!answerText) return false
  const { numberTokens, sentenceTokens } = buildLeakTokens(question)

  if (question.type === 'calc') {
    /* 只校验百分数口径（5.33）或产出（1266.67），模型任写其一即可 */
    return numberTokens.some(t => answerText.includes(t))
  }
  const letter = 'ABCD'[question.correct]
  const letterHit = new RegExp(`(^|[^A-Da-d])${letter}([^A-Da-d]|$)`).test(answerText)
  return letterHit || sentenceTokens.some(t => answerText.includes(t))
}

/**
 * 校验模型输出是否合格（结构 + 层级匹配 + 泄露扫描）
 * @param {number} targetLevel 目标层级 1~4
 * @param {string} rawText 模型原始输出
 * @param {object} question 题目对象
 * @returns {{ ok: boolean, parsed: object|null, reason: string }}
 */
export function checkOutput(targetLevel, rawText, question) {
  const parsed = extractJson(rawText)
  if (!parsed) return { ok: false, parsed: null, reason: '输出不是合法JSON' }

  if (parsed.level !== targetLevel) {
    return { ok: false, parsed, reason: `层级不匹配：要求${targetLevel}，实际${parsed.level}` }
  }

  if (targetLevel <= 3) {
    /* L1~L3：必有提示正文与引导问题；L3 必有步骤数组（末步留白只警告不拒） */
    if (typeof parsed.hint_body !== 'string' || !parsed.hint_body.trim()) {
      return { ok: false, parsed, reason: '缺少 hint_body' }
    }
    if (typeof parsed.guiding_question !== 'string') {
      return { ok: false, parsed, reason: '缺少 guiding_question' }
    }
    if (targetLevel === 3 && (!Array.isArray(parsed.steps) || parsed.steps.length === 0)) {
      return { ok: false, parsed, reason: 'L3缺少 steps 步骤数组' }
    }
    const scanText = [parsed.hint_body, ...(parsed.steps || []), parsed.guiding_question].join('\n')
    const leak = scanLeak(scanText, question)
    if (leak.leak) return { ok: false, parsed, reason: `疑似泄露答案：${leak.token}` }
  } else {
    /* L4：必有完整 solution，且答案必须与标准答案一致 */
    if (!parsed.solution || typeof parsed.solution.answer !== 'string' || typeof parsed.solution.process !== 'string') {
      return { ok: false, parsed, reason: 'L4缺少 solution.answer/process' }
    }
    if (!answerMatchesStandard(parsed.solution, question)) {
      return { ok: false, parsed, reason: 'L4答案与题库标准答案不一致' }
    }
  }

  return { ok: true, parsed, reason: '' }
}

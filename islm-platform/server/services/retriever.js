/**
 * 关键词 RAG 检索模块
 * -------------------------------------------------
 * 检索流程：
 *  1) tokenize：领域词典最长匹配 + 2-gram 兜底（见 dictionary.js）
 *  2) 过滤：L1~L3 检索池做"两道闸"——排除'习题解析'类 chunk +
 *     数值泄露闸（含本题答案数值的知识块一律剔除，因知识正文内嵌答案数值）
 *  3) 打分：简化 TF-IDF（语料约 40 条，df 现场统计一次后缓存）
 *  4) 取 top-k=4，命中不足 2 条时回补通用框架兜底 chunk
 *
 * 快照复用由 hintService 负责：首次检索结果固化为 rag_snapshot，L2/L3 不重检。
 */
import { allChunks, fallbackChunks } from '../knowledge/chunks.js'
import { DICT, STOP_BIGRAMS, STOP_CHARS } from '../knowledge/dictionary.js'
import { buildLeakTokens, stripHtml } from './leakGuard.js'

/* ---------- 分词 ---------- */

/**
 * 中文+符号混合分词：
 *  1) 词典贪心最长匹配（命中即摘出，防止短词吃掉长词）
 *  2) 剩余文本中的英文/数字/算式串整体成 token（Y*、0.8、1266.67 是强信号）
 *  3) 剩余中文剔除单字停用字后切 2-gram，并过滤虚词组合
 * @returns {string[]} token 数组
 */
export function tokenize(rawText) {
  const text = stripHtml(rawText)
    .toLowerCase()
    .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/<[^>]+>/g, ' ')

  const tokens = []
  let rest = ''
  let i = 0
  while (i < text.length) {
    let matched = null
    /* 词典按长度降序，取第一个能从 i 位置匹配的词 */
    for (const word of DICT) {
      if (text.startsWith(word, i)) { matched = word; break }
    }
    if (matched) {
      if (rest) { tokens.push(...splitRest(rest)); rest = '' }
      tokens.push(matched)
      i += matched.length
    } else {
      rest += text[i]
      i += 1
    }
  }
  if (rest) tokens.push(...splitRest(rest))
  return tokens
}

/** 对"词典未覆盖的碎片"切分：算式/数字串整体保留，中文切 2-gram */
function splitRest(fragment) {
  const out = []
  /* 英文/数字/常用数学符号连串作为一个 token */
  const asciiRuns = fragment.match(/[a-z0-9][a-z0-9.\-*/+=%']*/g) || []
  out.push(...asciiRuns.filter(t => t.length >= 1 && /[a-z0-9]/.test(t)))

  /* 中文部分：去停用字后切 bigram */
  const han = [...fragment.replace(/[^一-鿿]/g, '')].filter(ch => !STOP_CHARS.has(ch))
  for (let j = 0; j < han.length - 1; j++) {
    const bigram = han[j] + han[j + 1]
    if (!STOP_BIGRAMS.has(bigram)) out.push(bigram)
  }
  return out
}

/* ---------- 打分（简化 TF-IDF） ---------- */

/** 每个 chunk 的词频表（懒计算并缓存到 chunk 对象上） */
function termsOf(chunk) {
  if (!chunk._terms) {
    const map = new Map()
    for (const t of tokenize(chunk.text)) map.set(t, (map.get(t) || 0) + 1)
    chunk._terms = map
  }
  return chunk._terms
}

/** 文档频率表（懒计算：token → 包含该 token 的 chunk 数） */
let dfMap = null
function docFreq() {
  if (!dfMap) {
    dfMap = new Map()
    for (const chunk of allChunks) {
      for (const t of new Set(termsOf(chunk).keys())) {
        dfMap.set(t, (dfMap.get(t) || 0) + 1)
      }
    }
  }
  return dfMap
}

/**
 * 对单个 chunk 打分：
 * raw = Σ idf(t) × min(tf,3) × (命中标题 ×2)；score = raw / 查询token数（归一化）
 */
function scoreChunk(queryTokens, queryTokenSet, chunk) {
  const df = docFreq()
  const n = allChunks.length
  const terms = termsOf(chunk)
  let raw = 0
  for (const t of queryTokenSet) {
    const tf = terms.get(t)
    if (!tf) continue
    const idf = Math.log(1 + n / (df.get(t) || 1))
    raw += idf * Math.min(tf, 3) * (chunk.title.toLowerCase().includes(t) ? 2 : 1)
  }
  return raw / Math.max(queryTokens.length, 1)
}

/* ---------- 对外检索入口 ---------- */

/** 检索参数 */
const TOP_K = 4
const MIN_SCORE = 0.15
const CONTENT_TRUNCATE = 600

/**
 * RAG 检索
 * @param {object} opts
 * @param {object} opts.question 题目对象（chapter11.exercises 成员）
 * @param {string} [opts.studentAnswerText] 学生作答文本（参与查询）
 * @param {string} [opts.confusionText] 学生困惑描述（参与查询）
 * @param {boolean} [opts.allowSolution] 是否放开'习题解析'类 chunk（仅 L4 = true）
 * @param {number} [opts.topK] 返回条数（默认 TOP_K=4；混合检索粗召回时会取更多）
 * @returns {Array<{chunkId,title,type,score,content}>} top-k 知识块
 */
export function retrieve({ question, studentAnswerText = '', confusionText = '', allowSolution = false, topK = TOP_K }) {
  /* 1) 组装查询文本并分词去重 */
  const queryText = [
    stripHtml(question.question),
    studentAnswerText,
    confusionText
  ].filter(Boolean).join(' ')
  const queryTokens = tokenize(queryText)
  const queryTokenSet = new Set(queryTokens)

  /* 2) 构建该题的检索池 */
  let pool = allChunks
  if (!allowSolution) {
    const { numberTokens, sentenceTokens } = buildLeakTokens(question)
    const hitLeak = chunk =>
      numberTokens.some(t => chunk.text.includes(t)) ||
      sentenceTokens.some(t => chunk.text.includes(t))
    /* 闸① 排除习题解析；闸② 数值泄露闸 */
    pool = allChunks.filter(c => c.type !== '习题解析' && !hitLeak(c))
  }

  /* 3) 打分、过滤、取 top-k */
  let results = pool
    .map(chunk => ({ chunk, score: scoreChunk(queryTokens, queryTokenSet, chunk) }))
    .filter(r => r.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(r => ({ chunkId: r.chunk.chunkId, title: r.chunk.title, type: r.chunk.type, score: Number(r.score.toFixed(3)), content: r.chunk.content.slice(0, CONTENT_TRUNCATE) }))

  /* 4) 命中不足补兜底 chunk（保证模型至少有通用框架可引用） */
  if (results.length < 2) {
    for (const fb of fallbackChunks) {
      if (results.length >= 2) break
      if (results.some(r => r.chunkId === fb.chunkId)) continue
      results.push({ chunkId: fb.chunkId, title: fb.title, type: fb.type, score: 0, content: fb.content.slice(0, CONTENT_TRUNCATE) })
    }
  }
  return results
}

/**
 * 把检索结果拼成注入 User Prompt 的 rag_context 文本
 */
export function buildRagContext(results) {
  if (!results || results.length === 0) {
    return '（本次检索未命中足够相关知识块）'
  }
  return results
    .map((r, i) => `[${i + 1}] 来源：${r.type} | 标题：${r.title} | 相关度：${r.score}\n内容：${r.content}`)
    .join('\n\n')
}

/* ---------- 混合检索（TF-IDF + 向量余弦，大创 AI 增强亮点） ---------- */

import { embedText, getVectors, cosine } from './embeddingService.js'

/** 混合打分权重：语义相似度与关键词分数各占一半 */
const W_TFIDF = 0.5
const W_VEC = 0.5
/** 先用 TF-IDF 粗筛出这么多候选，再用向量重排（召回宽、排序精） */
const COARSE_K = 12

/**
 * 混合检索：TF-IDF 粗召回 → 向量余弦重排 → top-k
 * 向量表不可用 / 知识块缺向量时自动退化为纯 TF-IDF，接口形态与 retrieve() 一致
 *
 * @param {object} opts 与 retrieve() 相同
 * @returns {Promise<Array<{chunkId,title,type,score,content}>>}
 */
export async function retrieveHybrid(opts) {
  /* 1) TF-IDF 粗召回（比最终多取一些，给重排留余地） */
  const coarse = retrieve({ ...opts, topK: COARSE_K })
  if (coarse.length === 0) return coarse

  try {
    /* 2) 查询文本与候选块的向量 */
    const queryText = [
      opts.question ? stripHtml(opts.question.question) : '',
      opts.studentAnswerText || '',
      opts.confusionText || ''
    ].filter(Boolean).join(' ')

    const queryVec = await embedText(queryText)
    const vecMap = await getVectors(coarse.map(r => r.chunkId))
    if (vecMap.size === 0 || !queryVec) return coarse.slice(0, TOP_K) // 无向量可退化

    /* 3) 混合打分：TF-IDF 归一化后与余弦加权融合 */
    const maxScore = Math.max(...coarse.map(r => r.score), 1e-9)
    const reranked = coarse
      .map(r => {
        const vec = vecMap.get(r.chunkId)
        const sim = vec ? cosine(queryVec, vec) : 0
        return { ...r, score: Number(((W_TFIDF * r.score / maxScore) + W_VEC * Math.max(sim, 0)).toFixed(3)), vecSim: Number(Math.max(sim, 0).toFixed(3)) }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K)

    /* 4) 兜底：重排后命中不足仍补通用框架 chunk（与 retrieve 口径一致） */
    if (reranked.length < 2) {
      for (const fb of fallbackChunks) {
        if (reranked.length >= 2) break
        if (reranked.some(r => r.chunkId === fb.chunkId)) continue
        reranked.push({ chunkId: fb.chunkId, title: fb.title, type: fb.type, score: 0, content: fb.content.slice(0, CONTENT_TRUNCATE) })
      }
    }
    return reranked
  } catch (e) {
    /* 数据库异常等：整体退化为纯 TF-IDF 结果，保证提示管线永不中断 */
    console.warn('[retriever] 混合检索退化（向量阶段失败）：', e.message)
    return coarse.slice(0, TOP_K)
  }
}

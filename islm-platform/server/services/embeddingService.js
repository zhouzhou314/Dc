/**
 * Embedding 向量服务（RAG 语义检索的底座）
 * -------------------------------------------------
 * 双模式设计（与 llm.js 一致的兜底红线）：
 *  - 真实模式：调火山方舟 Ark /embeddings 接口（OpenAI 兼容协议）
 *  - 模拟模式：LLM_MOCK=true 或无 Key 时，用"确定性本地伪向量"
 *    （字符 bigram 哈希到 256 维后 L2 归一化）——同一段文本永远得到同一个
 *    向量，语义相近的文本（共享大量 bigram）余弦相似度更高，
 *    保证没有 API Key 也能演示完整的向量检索流程。
 *
 * 向量存储：knowledge_embedding 表（JSON 列存浮点数组），
 * 服务启动时若表内向量缺失/不全则自动构建。
 */
import { query } from '../db.js'
import { config } from '../config.js'
import { allChunks } from '../knowledge/chunks.js'
import { stripHtml } from './leakGuard.js'

/* 伪向量维度（真实模式以接口返回维度为准，此值仅用于 mock） */
const PSEUDO_DIM = 256

/* ================= 余弦相似度 ================= */

/**
 * 计算两个向量的余弦相似度（范围 -1~1，文本向量通常 0~1）
 */
export function cosine(a, b) {
  let dot = 0
  let na = 0
  let nb = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/* ================= 模拟模式：确定性伪向量 ================= */

/** 简单字符串哈希（FNV-1a 变体），把 token 映射到向量维度下标 */
function hashIdx(token, dim) {
  let h = 2166136261
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h) % dim
}

/**
 * 生成文本的伪向量：
 *  1) 中文按相邻两字切 bigram，英文/数字按连续串切 token
 *  2) 每个 token 哈希到 256 维中的某一位并累加（词袋思想）
 *  3) L2 归一化，使不同长度的文本可公平比较余弦
 */
export function pseudoEmbed(text) {
  const clean = stripHtml(String(text)).toLowerCase()
  const vec = new Array(PSEUDO_DIM).fill(0)

  /* 英文/数字 token */
  for (const t of clean.match(/[a-z0-9][a-z0-9.\-*/+=%]*/g) || []) {
    vec[hashIdx(t, PSEUDO_DIM)] += 1
  }
  /* 中文 bigram */
  const han = [...clean.replace(/[^一-鿿]/g, '')]
  for (let i = 0; i < han.length - 1; i++) {
    vec[hashIdx(han[i] + han[i + 1], PSEUDO_DIM)] += 1
  }

  /* L2 归一化 */
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1
  return vec.map(v => +(v / norm).toFixed(6))
}

/* ================= 真实模式：Ark Embeddings ================= */

/**
 * 批量调用 Ark /embeddings
 * @param {string[]} texts 文本数组
 * @returns {Promise<number[][]>} 与输入顺序一致的向量数组
 */
async function arkEmbedBatch(texts) {
  const resp = await fetch(config.llm.baseUrl + '/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + config.llm.apiKey
    },
    body: JSON.stringify({ model: config.embedding.model, input: texts }),
    signal: AbortSignal.timeout(30000)
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`Ark embeddings 异常 ${resp.status}: ${body.slice(0, 200)}`)
  }
  const data = await resp.json()
  /* OpenAI 兼容格式：{ data: [{ embedding: [...] }, ...] }，按 index 排序保险 */
  return data.data
    .sort((a, b) => a.index - b.index)
    .map(d => d.embedding)
}

/* ================= 向量构建与查询 ================= */

/* Ark embeddings 连续不可用时置为 true（如账号未开通 embedding 模型），
 * 之后所有调用直接走伪向量，避免每次 RAG 查询都白等一次失败请求 */
let arkEmbedDown = false
function markArkEmbedDown(err) {
  if (arkEmbedDown) return
  arkEmbedDown = true
  console.warn('[embedding] Ark embedding 接口不可用（' + err.message + '），本次运行期内自动改用本地伪向量；开通 embedding 模型后重启即可恢复')
}

/** 当前是否走真实 embedding（mock 开关 + Key 判断 + 供应商能力 + 接口可用性） */
export function embeddingMode() {
  /* DeepSeek 等厂商没有 /embeddings 接口，config.embedding.remote 为 false 时直接走伪向量 */
  if (config.llm.mock || !config.llm.apiKey || !config.embedding.remote) return 'pseudo'
  return arkEmbedDown ? 'pseudo' : 'ark'
}

/**
 * 对一段查询文本生成向量（自动选择真实/伪向量模式）
 */
export async function embedText(text) {
  if (embeddingMode() === 'ark') {
    try {
      const [vec] = await arkEmbedBatch([text])
      return vec
    } catch (e) {
      markArkEmbedDown(e)
    }
  }
  return pseudoEmbed(text)
}

/**
 * 构建全部知识块的向量（幂等：只补缺失的 chunk）
 * 启动时自动调用；也可通过 /api/admin/embeddings/rebuild 手动全量重建
 * @param {boolean} force true=清空重建（切换模式后需要）
 * @returns {{rebuilt: number, mode: string}}
 */
export async function ensureEmbeddings(force = false) {
  const mode = embeddingMode()

  if (force) {
    await query('DELETE FROM knowledge_embedding')
  }

  /* 找出尚未建向量的知识块 */
  const existing = await query('SELECT chunk_id FROM knowledge_embedding')
  const have = new Set(existing.map(r => r.chunk_id))
  const todo = allChunks.filter(c => !have.has(c.chunkId))
  if (todo.length === 0) return { rebuilt: 0, mode }

  /* 逐批向量化（真实模式控制批量大小，伪向量直接算） */
  const BATCH = 16
  let rebuilt = 0
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH)
    const texts = batch.map(c => c.title + '\n' + c.content)

    let vectors
    if (mode === 'ark') {
      try {
        vectors = await arkEmbedBatch(texts)
      } catch (e) {
        /* 接口不可用（未开通 embedding 模型等）：标记降级，本批及后续改用伪向量 */
        markArkEmbedDown(e)
        vectors = texts.map(t => pseudoEmbed(t))
      }
    } else {
      vectors = texts.map(t => pseudoEmbed(t))
    }

    for (let j = 0; j < batch.length; j++) {
      await query(
        `INSERT INTO knowledge_embedding (chunk_id, model, dim, vector) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE model = VALUES(model), dim = VALUES(dim), vector = VALUES(vector)`,
        [batch[j].chunkId, mode === 'ark' ? config.embedding.model : 'pseudo', vectors[j].length, JSON.stringify(vectors[j])]
      )
      rebuilt++
    }
  }
  return { rebuilt, mode }
}

/**
 * 读取若干知识块的向量
 * @returns {Map<string, number[]>} chunkId → 向量
 */
export async function getVectors(chunkIds) {
  if (chunkIds.length === 0) return new Map()
  const marks = chunkIds.map(() => '?').join(',')
  const rows = await query(`SELECT chunk_id, vector FROM knowledge_embedding WHERE chunk_id IN (${marks})`, chunkIds)
  /* vector 列为 JSON 类型：mysql2 驱动会自动解析成数组；兼容存成字符串的旧数据 */
  return new Map(rows.map(r => [r.chunk_id, Array.isArray(r.vector) ? r.vector : JSON.parse(r.vector)]))
}

/**
 * 知识节点掌握度服务（Node-level Knowledge Tracing）
 * ================================================================
 * 与 bktService 的关系：
 *   bktService 维护"5 个知识点（topic）"粒度的掌握度，用于雷达图与题库推荐；
 *   本服务维护"25 个知识节点（node）"粒度的掌握度，用于知识图谱着色、
 *   薄弱节点定位与强化学习的状态输入。
 *   两者共用同一套 BKT 更新公式（bktUpdate），只是统计粒度不同。
 */
import { query, safeQuery } from '../db.js'
import { bktUpdate } from './bktService.js'
import { knowledgeNodes, nodeMap } from '../knowledge/graph.js'

/** BKT 先验（与 mastery_state 默认值保持一致） */
const PRIOR = 0.15

/**
 * 读取某学生的全部节点掌握度
 * @param {string} userId
 * @returns {Promise<Map<string, {pKnown:number, attempts:number, correctCount:number}>>}
 */
export async function getNodeMastery(userId) {
  const rows = await safeQuery(
    'SELECT node_id, p_known, attempts, correct_count FROM node_mastery WHERE user_id = ?',
    [userId]
  )
  const map = new Map()
  for (const r of rows) {
    map.set(r.node_id, {
      pKnown: Number(r.p_known),
      attempts: r.attempts,
      correctCount: r.correct_count
    })
  }
  return map
}

/**
 * 取纯粹的"节点 ID → 掌握概率"映射（图谱着色 / RL 状态用）
 * 未作答节点不写入，调用方按先验 0.15 处理（graph.frontierNodes 已内置）
 */
export async function getNodeMasteryMap(userId) {
  const detail = await getNodeMastery(userId)
  const map = new Map()
  for (const [nodeId, v] of detail) map.set(nodeId, v.pKnown)
  return map
}

/**
 * 记录一次节点级作答：BKT 更新 + UPSERT
 * @param {{userId:string, nodeId:string, topic:string, isCorrect:boolean}} rec
 * @returns {Promise<{nodeId:string, pKnown:number, attempts:number}|null>}
 */
export async function recordNodeAnswer({ userId, nodeId, topic, isCorrect }) {
  const node = nodeMap.get(nodeId)
  if (!node) return null

  const rows = await query(
    'SELECT p_known, attempts, correct_count FROM node_mastery WHERE user_id = ? AND node_id = ?',
    [userId, nodeId]
  )
  const prev = rows[0] || { p_known: PRIOR, attempts: 0, correct_count: 0 }
  const prevPKnown = Number(prev.p_known)
  const pKnown = bktUpdate(prevPKnown, !!isCorrect)
  const attempts = prev.attempts + 1
  const correctCount = prev.correct_count + (isCorrect ? 1 : 0)

  await query(
    `INSERT INTO node_mastery (user_id, node_id, topic, p_known, attempts, correct_count)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       p_known = VALUES(p_known), attempts = VALUES(attempts), correct_count = VALUES(correct_count)`,
    [userId, nodeId, topic || node.topic, pKnown.toFixed(4), attempts, correctCount]
  )

  return { nodeId, pKnown, prevPKnown, attempts, correctCount }
}

/**
 * 节点掌握度明细（按教学顺序返回全部节点，未作答为 null）
 * @param {string} userId
 */
export async function nodeMasteryDetail(userId) {
  const detail = await getNodeMastery(userId)
  return knowledgeNodes.map((n) => {
    const v = detail.get(n.id)
    return {
      id: n.id,
      name: n.name,
      topic: n.topic,
      section: n.section,
      difficulty: n.difficulty,
      pKnown: v ? v.pKnown : null,
      attempts: v ? v.attempts : 0,
      correctCount: v ? v.correctCount : 0
    }
  })
}

/**
 * 全班节点掌握度聚合（教师端"知识点热力图"）
 * @param {string[]} [userIds] 限定学生范围，不传则统计全班
 */
export async function classNodeMastery(userIds = null) {
  let rows
  if (Array.isArray(userIds) && userIds.length > 0) {
    const placeholders = userIds.map(() => '?').join(',')
    rows = await safeQuery(
      `SELECT node_id, AVG(p_known) avg_p, SUM(attempts) attempts, COUNT(DISTINCT user_id) learners
         FROM node_mastery WHERE user_id IN (${placeholders}) GROUP BY node_id`,
      userIds
    )
  } else {
    rows = await safeQuery(
      `SELECT node_id, AVG(p_known) avg_p, SUM(attempts) attempts, COUNT(DISTINCT user_id) learners
         FROM node_mastery GROUP BY node_id`
    )
  }
  const map = new Map(rows.map((r) => [r.node_id, r]))
  return knowledgeNodes.map((n) => {
    const r = map.get(n.id)
    return {
      id: n.id,
      name: n.name,
      topic: n.topic,
      avgMastery: r ? Math.round(Number(r.avg_p) * 1000) / 1000 : null,
      attempts: r ? Number(r.attempts) : 0,
      learners: r ? Number(r.learners) : 0
    }
  })
}

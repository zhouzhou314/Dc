/**
 * BKT 贝叶斯知识追踪服务（Bayesian Knowledge Tracing）
 * -------------------------------------------------
 * 教育数据挖掘经典模型：把"学生对某知识点是否掌握"建模为一个隐藏概率
 * pKnown，每作答一题就按贝叶斯公式更新一次。
 *
 * 四个经典参数（教学演示常用取值，含义见下）：
 *   P(L0) = 0.15  先验：从未作答时估计的已掌握概率
 *   T     = 0.10  学习转移：做一题之间"从没掌握→掌握"的概率
 *   G     = 0.20  猜测率：没掌握也可能蒙对的概率（选择题约 1/4，取略高）
 *   S     = 0.10  失误率：已掌握也可能粗心做错的概率
 *
 * 更新公式（两步）：
 *   ① 条件后验：
 *      答对 → pL = pKnown*(1-S) / (pKnown*(1-S) + (1-pKnown)*G)
 *      答错 → pL = pKnown*S     / (pKnown*S     + (1-pKnown)*(1-G))
 *   ② 学习转移：pKnown' = pL + (1 - pL) * T
 */
import { query } from '../db.js'

/* BKT 模型参数（定死常量，注释即文档） */
const BKT_PARAMS = {
  PRIOR: 0.15, // P(L0) 初始掌握概率（与 mastery_state.p_known 默认值一致）
  LEARN: 0.10, // T  学习转移概率
  GUESS: 0.20, // G  猜测概率
  SLIP: 0.10   // S  失误概率
}

/**
 * 单次作答的 BKT 更新（纯函数，便于单元演示）
 * @param {number} pKnown 更新前的掌握概率 0~1
 * @param {boolean} isCorrect 是否答对
 * @returns {number} 更新后的掌握概率 0~1
 */
export function bktUpdate(pKnown, isCorrect) {
  const { LEARN: T, GUESS: G, SLIP: S } = BKT_PARAMS
  const p = Math.min(Math.max(pKnown, 0), 1) // 防越界
  let postL
  if (isCorrect) {
    postL = (p * (1 - S)) / (p * (1 - S) + (1 - p) * G) // 答对：排除猜对的可能
  } else {
    postL = (p * S) / (p * S + (1 - p) * (1 - G)) // 答错：保留"会但失误"的可能
  }
  return postL + (1 - postL) * T // 学一题长一点本事
}

/**
 * 记录一次作答：落 answer_record 表 + 更新 mastery_state 的 BKT 掌握度
 * @param {{userId, questionId, topic, qType, difficulty, isCorrect, studentAnswer?, durationMs?}} rec
 * @returns {{topic, pKnown, attempts}} 更新后的掌握状态
 */
export async function recordAnswer(rec) {
  /* 1. 作答明细落库（answer_record），供后续分析与回放 */
  await query(
    `INSERT INTO answer_record (user_id, question_id, topic, q_type, difficulty, is_correct, student_answer, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      rec.userId, rec.questionId, rec.topic, rec.qType, rec.difficulty,
      rec.isCorrect ? 1 : 0,
      rec.studentAnswer ? JSON.stringify(rec.studentAnswer) : null,
      rec.durationMs || null
    ]
  )

  /* 2. 取当前掌握状态（没有则初始化为先验） */
  const rows = await query('SELECT p_known, attempts, correct_count FROM mastery_state WHERE user_id = ? AND topic = ?', [rec.userId, rec.topic])
  const prev = rows[0] || { p_known: BKT_PARAMS.PRIOR, attempts: 0, correct_count: 0 }

  /* 3. BKT 更新掌握概率 */
  const newP = bktUpdate(Number(prev.p_known), rec.isCorrect)
  const attempts = prev.attempts + 1
  const correctCount = prev.correct_count + (rec.isCorrect ? 1 : 0)

  /* 4. UPSERT 掌握状态 */
  await query(
    `INSERT INTO mastery_state (user_id, topic, p_known, attempts, correct_count)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE p_known = VALUES(p_known), attempts = VALUES(attempts), correct_count = VALUES(correct_count)`,
    [rec.userId, rec.topic, newP.toFixed(4), attempts, correctCount]
  )

  return { topic: rec.topic, pKnown: newP, attempts, correctCount }
}

/**
 * 读取某用户全部知识点的掌握度（雷达图数据源）
 * 无记录的知识点返回先验 0.15，保证雷达图始终有完整五个维度
 * @param {string[]} allTopics 平台全部知识点（来自题库 TOPICS）
 */
export async function getMastery(userId, allTopics) {
  const rows = await query('SELECT topic, p_known, attempts, correct_count FROM mastery_state WHERE user_id = ?', [userId])
  const map = new Map(rows.map((r) => [r.topic, r]))

  const topics = allTopics.map((topic) => {
    const r = map.get(topic)
    return {
      topic,
      pKnown: r ? Number(r.p_known) : BKT_PARAMS.PRIOR,
      attempts: r ? r.attempts : 0,
      correctCount: r ? r.correct_count : 0,
      rate: r && r.attempts > 0 ? Math.round((r.correct_count / r.attempts) * 100) : null
    }
  })

  /* 找最薄弱知识点（有作答记录的里 pKnown 最低者） */
  const practiced = topics.filter((t) => t.attempts > 0)
  const weakest = practiced.length > 0
    ? practiced.reduce((a, b) => (a.pKnown <= b.pKnown ? a : b)).topic
    : null

  return { topics, weakest }
}

/**
 * 自适应推题服务
 * -------------------------------------------------
 * 策略（三规则加权，简单可解释，答辩时讲得清）：
 *   1. 薄弱优先：BKT 掌握概率最低的知识点出题占比 60%
 *   2. 难度阶梯：优先与该知识点历史正确率匹配的难度
 *      （正确率 <40% 出 easy，<70% 出 medium，否则 hard）
 *   3. 少做优先：同条件下优先选作答次数少的题（探索新题）
 */
import { query } from '../db.js'
import { questionBank } from '../../src/data/questionBank.js'
import { getMastery } from './bktService.js'

/** 按正确率定目标难度 */
function targetDifficulty(rate) {
  if (rate === null) return 'easy'      // 没做过：从简单起步
  if (rate < 40) return 'easy'
  if (rate < 70) return 'medium'
  return 'hard'
}

/** 难度阶梯相邻容差：先精确匹配，不够再放宽一档 */
const NEAR = { easy: ['medium'], medium: ['easy', 'hard'], hard: ['medium'] }

/**
 * 推荐一批题目（只回题目 id 与推荐理由，题目内容由前端题库按 id 取）
 * @param {string} userId 用户标识
 * @param {string[]} allTopics 全部知识点
 * @param {number} count 推荐数量（默认 5）
 */
export async function recommendQuestions(userId, allTopics, count = 5) {
  const { topics, weakest } = await getMastery(userId, allTopics)
  const byTopic = new Map(topics.map((t) => [t.topic, t]))

  /* 该用户的作答统计：每题做过几次（answer_record 聚合） */
  const countRows = await query(
    'SELECT question_id, COUNT(*) AS n FROM answer_record WHERE user_id = ? GROUP BY question_id',
    [userId]
  )
  const doneCount = new Map(countRows.map((r) => [r.question_id, r.n]))

  /* 出题知识点序列：薄弱点占 60%，其余按掌握度升序轮转 */
  const practiced = topics.filter((t) => t.attempts > 0)
  const sorted = practiced.length > 0
    ? [...practiced].sort((a, b) => a.pKnown - b.pKnown)
    : [...topics].sort(() => Math.random() - 0.5) // 全新用户：随机铺开
  const plan = []
  for (let i = 0; plan.length < count; i++) {
    const t = sorted[i % sorted.length]
    plan.push(t)
    if (i > count * 4) break // 防死循环
  }
  /* 把最薄弱的知识点排到前 60% 位置 */
  if (weakest) {
    const wIdx = plan.findIndex((t) => t.topic === weakest)
    if (wIdx > -1 && wIdx >= Math.ceil(count * 0.6)) {
      plan.splice(wIdx, 1)
      plan.unshift(byTopic.get(weakest))
    }
  }

  /* 按计划逐知识点选从未做过/少做的题 */
  const picked = []
  const usedIds = new Set()
  for (const t of plan) {
    if (picked.length >= count) break
    const stat = byTopic.get(t.topic)
    const want = targetDifficulty(stat.rate)

    /* 候选池：该知识点、难度匹配（精确→放宽）、未被选过 */
    const candidates = (diffList) => questionBank.filter(
      (q) => q.topic === t.topic && diffList.includes(q.difficulty) && !usedIds.has(q.id)
    )
    let pool = candidates([want])
    if (pool.length === 0) pool = candidates(NEAR[want])
    if (pool.length === 0) pool = questionBank.filter((q) => q.topic === t.topic && !usedIds.has(q.id))
    if (pool.length === 0) continue

    /* 少做优先（没做过排最前，其次按做题次数升序），同次数随机打散 */
    pool.sort((a, b) => (doneCount.get(a.id) || 0) - (doneCount.get(b.id) || 0))
    const least = doneCount.get(pool[0].id) || 0
    const ties = pool.filter((q) => (doneCount.get(q.id) || 0) === least)
    const chosen = ties[Math.floor(Math.random() * ties.length)]

    usedIds.add(chosen.id)
    picked.push({
      id: chosen.id,
      topic: chosen.topic,
      difficulty: chosen.difficulty,
      reason: weakest === chosen.topic
        ? `薄弱知识点「${chosen.topic}」，配合${{ easy: '基础', medium: '进阶', hard: '挑战' }[chosen.difficulty]}题巩固`
        : `知识点「${chosen.topic}」${{ easy: '基础巩固', medium: '进阶练习', hard: '挑战提升' }[chosen.difficulty]}`
    })
  }

  return { questions: picked, strategy: { weakTopic: weakest, rule: '薄弱优先60% + 难度阶梯 + 少做优先' } }
}

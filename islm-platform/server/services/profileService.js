/**
 * 学生画像服务（Student Profile）
 * ================================================================
 * 职责：把散落在各张表里的学习行为聚合成一份"可读、可算、可展示"的画像。
 *
 * 数据来源（全部为本系统真实产生的行为数据）：
 *   answer_record   题库作答（对错、耗时、知识点）
 *   mastery_state   BKT 知识点掌握度
 *   node_mastery    BKT 知识节点掌握度
 *   hint_log        阶梯导学使用情况（层级、是否直取解析、反馈）
 *   learning_event  两游戏与学习行为事件流
 *   game1_session   游戏一（单机政策模拟）对局
 *   game_decision   游戏二（多人博弈）决策序列
 *   wrong_book      错题本
 *
 * 画像结构：
 *   radar       六维能力（知识掌握 / 正确率 / 活跃度 / 学习自主 / 游戏决策 / 学习韧性）
 *   dimensions  细分维度（知识点、习惯、提示、游戏、节点）
 *   tags        规则标签
 *   narrative   AI（或规则模板）生成的文字画像
 *
 * 设计取舍：先用规则算出**确定性的量化画像**（答辩可复核、不依赖大模型），
 * 再让大模型只负责"把数字讲成人话"，避免模型编造数据。
 */
import { query, safeQuery } from '../db.js'
import { config } from '../config.js'
import { TOPICS } from '../../src/data/questionBank.js'
import { knowledgeNodes, nodeMap } from '../knowledge/graph.js'
import { getMastery } from './bktService.js'
import { getNodeMastery } from './nodeMasteryService.js'
import { chatText, loadPrompt, parseJsonLoose } from './llm.js'

/** 画像缓存有效期：30 分钟内直接复用，避免每次进页面都跑一遍聚合 */
export const PROFILE_TTL_MS = 30 * 60 * 1000

/** 安全转数字（mysql2 的 SUM/AVG 可能返回字符串或 null） */
function num(v, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** JSON 列兼容：mysql2 一般已解析，个别版本返回字符串 */
function asJson(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'object') return v
  try {
    return JSON.parse(v)
  } catch {
    return null
  }
}

/** 保留 3 位小数（画像数字统一精度） */
function r3(v) {
  return Math.round(v * 1000) / 1000
}

/** 百分比取整 */
function pct(v) {
  return Math.round(Math.max(0, Math.min(1, v)) * 100)
}

/* ================================================================
 * 一、原始信号采集
 * ================================================================ */

/**
 * 采集某学生的全部学习信号（只做聚合，不做评价）
 * @param {string} userId
 * @returns {Promise<object>} signals
 */
export async function collectSignals(userId) {
  if (!userId) throw new Error('collectSignals 需要 userId')

  /* 1. 作答总量与耗时 */
  const answerRows = await safeQuery(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(is_correct), 0) AS correct,
            AVG(duration_ms) AS avgDuration,
            MIN(created_at) AS firstAt,
            MAX(created_at) AS lastAt
       FROM answer_record WHERE user_id = ?`,
    [userId]
  )
  const answerAgg = answerRows[0] || {}

  /* 2. 近 7 天表现（判断趋势） */
  const recentRows = await safeQuery(
    `SELECT COUNT(*) AS total, COALESCE(SUM(is_correct), 0) AS correct
       FROM answer_record
      WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
    [userId]
  )
  const recent = recentRows[0] || {}

  /* 3. 活跃天数与连续打卡 */
  const dayRows = await safeQuery(
    `SELECT DATE(created_at) AS d FROM answer_record
      WHERE user_id = ? GROUP BY DATE(created_at) ORDER BY d DESC LIMIT 60`,
    [userId]
  )
  const activeDays = dayRows.length
  const streak = calcStreak(dayRows.map((r) => r.d))

  /* 4. 提示使用情况 */
  const hintRows = await safeQuery(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(level = 4), 0) AS l4,
            COALESCE(SUM(degraded), 0) AS degraded,
            COALESCE(SUM(feedback = 'up'), 0) AS up,
            COALESCE(SUM(feedback = 'down'), 0) AS down
       FROM hint_log WHERE user_id = ?`,
    [userId]
  )
  const hintAgg = hintRows[0] || {}
  const levelRows = await safeQuery(
    'SELECT level, COUNT(*) AS n FROM hint_log WHERE user_id = ? GROUP BY level',
    [userId]
  )
  const hintByLevel = { 1: 0, 2: 0, 3: 0, 4: 0 }
  for (const r of levelRows) hintByLevel[r.level] = num(r.n)

  /* 5. 行为事件流（两游戏 + 学习 + AI） */
  const eventRows = await safeQuery(
    'SELECT source, COUNT(*) AS n, MAX(created_at) AS lastAt FROM learning_event WHERE user_id = ? GROUP BY source',
    [userId]
  )
  const eventsBySource = { game1: 0, game2: 0, learning: 0, ai: 0 }
  let eventLastAt = null
  for (const r of eventRows) {
    eventsBySource[r.source] = num(r.n)
    if (!eventLastAt || new Date(r.lastAt) > new Date(eventLastAt)) eventLastAt = r.lastAt
  }
  const eventTypeRows = await safeQuery(
    'SELECT event_type, COUNT(*) AS n FROM learning_event WHERE user_id = ? GROUP BY event_type ORDER BY n DESC LIMIT 12',
    [userId]
  )

  /* 6. 游戏一对局（单机政策模拟） */
  const game1Rows = await safeQuery(
    `SELECT COUNT(*) AS sessions,
            MAX(total_score) AS bestScore,
            AVG(total_score) AS avgScore,
            COALESCE(SUM(policy_count), 0) AS policies,
            COALESCE(SUM(quiz_correct), 0) AS quizCorrect,
            COALESCE(SUM(quiz_total), 0) AS quizTotal,
            MAX(finished_at) AS lastAt,
            GROUP_CONCAT(DISTINCT mode) AS modes
       FROM game1_session WHERE user_id = ?`,
    [userId]
  )
  const game1 = game1Rows[0] || {}
  const modesUsed = String(game1.modes || '').split(',').filter(Boolean)

  /* 游戏一用过的政策类别（从事件负载里取，去重） */
  const policyRows = await safeQuery(
    `SELECT payload FROM learning_event
      WHERE user_id = ? AND event_type = 'game1.policy' ORDER BY id DESC LIMIT 200`,
    [userId]
  )
  const policyCats = new Set()
  for (const r of policyRows) {
    const p = asJson(r.payload)
    if (p && p.category) policyCats.add(p.category)
  }

  /* 7. 游戏二（多人博弈） */
  const g2DecisionRows = await safeQuery(
    'SELECT COUNT(*) AS n, COUNT(DISTINCT role) AS roles FROM game_decision WHERE user_id = ?',
    [userId]
  )
  const g2RoomRows = await safeQuery(
    'SELECT COUNT(*) AS n FROM game_room WHERE host_user_id = ?',
    [userId]
  )
  const g2ChatRows = await safeQuery(
    'SELECT COUNT(*) AS n FROM game_chat WHERE user_id = ?',
    [userId]
  )

  /* 8. 错题本 */
  const wrongRows = await safeQuery('SELECT COUNT(*) AS n FROM wrong_book WHERE user_id = ?', [userId])

  /* 9. 知识点与节点掌握度 */
  const { topics, weakest } = await getMastery(userId, TOPICS)
  const nodeDetail = await getNodeMastery(userId)

  /* 10. 纠错能力：错过一次后是否做对过（同一题） */
  const retryRows = await safeQuery(
    `SELECT question_id, is_correct FROM answer_record
      WHERE user_id = ? ORDER BY created_at ASC LIMIT 500`,
    [userId]
  )
  const retry = calcRetry(retryRows)

  return {
    userId,
    answers: {
      total: num(answerAgg.total),
      correct: num(answerAgg.correct),
      accuracy: num(answerAgg.total) > 0 ? num(answerAgg.correct) / num(answerAgg.total) : 0,
      avgDurationMs: answerAgg.avgDuration ? num(answerAgg.avgDuration) : null,
      firstAt: answerAgg.firstAt || null,
      lastAt: answerAgg.lastAt || null,
      recent7: { total: num(recent.total), correct: num(recent.correct) }
    },
    activity: {
      activeDays,
      streak,
      lastAt: answerAgg.lastAt || eventLastAt || null
    },
    mastery: topics,
    weakestTopic: weakest,
    nodeDetail,
    nodeAttemptedCount: nodeDetail.size,
    hints: {
      total: num(hintAgg.total),
      byLevel: hintByLevel,
      directL4: num(hintAgg.l4),
      degraded: num(hintAgg.degraded),
      feedbackUp: num(hintAgg.up),
      feedbackDown: num(hintAgg.down)
    },
    events: {
      total: Object.values(eventsBySource).reduce((a, b) => a + b, 0),
      bySource: eventsBySource,
      topTypes: eventTypeRows.map((r) => ({ type: r.event_type, count: num(r.n) }))
    },
    game1: {
      sessions: num(game1.sessions),
      bestScore: game1.bestScore === null || game1.bestScore === undefined ? null : r3(num(game1.bestScore)),
      avgScore: game1.avgScore === null || game1.avgScore === undefined ? null : r3(num(game1.avgScore)),
      policies: num(game1.policies),
      quizCorrect: num(game1.quizCorrect),
      quizTotal: num(game1.quizTotal),
      modes: modesUsed.length,
      modesUsed,
      policyCategories: [...policyCats],
      lastAt: game1.lastAt || null
    },
    game2: {
      decisions: num(g2DecisionRows[0]?.n),
      roles: num(g2DecisionRows[0]?.roles),
      rooms: num(g2RoomRows[0]?.n),
      chats: num(g2ChatRows[0]?.n)
    },
    wrongBook: { count: num(wrongRows[0]?.n) },
    retry
  }
}

/** 计算连续打卡天数（从最后一天往前数） */
function calcStreak(dayList) {
  if (!dayList.length) return 0
  const fmt = (d) => {
    const dt = new Date(d)
    return `${dt.getFullYear()}-${dt.getMonth() + 1}-${dt.getDate()}`
  }
  const set = new Set(dayList.map(fmt))
  let streak = 0
  const cursor = new Date()
  /* 允许"今天还没做"也算连续：从今天或昨天起算 */
  if (!set.has(fmt(cursor))) cursor.setDate(cursor.getDate() - 1)
  while (set.has(fmt(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

/** 纠错能力：做错的题里，后来做对的比例 */
function calcRetry(rows) {
  const seenWrong = new Set()
  let wrongCount = 0
  let fixedCount = 0
  for (const r of rows) {
    const id = r.question_id
    if (num(r.is_correct) === 0) {
      if (!seenWrong.has(id)) {
        seenWrong.add(id)
        wrongCount += 1
      }
    } else if (seenWrong.has(id)) {
      if (!seenWrong.has(`fixed_${id}`)) {
        seenWrong.add(`fixed_${id}`)
        fixedCount += 1
      }
    }
  }
  return {
    wrongCount,
    fixedCount,
    rate: wrongCount > 0 ? fixedCount / wrongCount : null
  }
}

/* ================================================================
 * 二、画像构建
 * ================================================================ */

/**
 * 六维雷达：把信号压成 0~100 的六个可解释维度
 */
export function radarFromSignals(s) {
  const masteryAvg = s.mastery.length
    ? s.mastery.reduce((a, m) => a + m.pKnown, 0) / s.mastery.length
    : 0
  const hintDependence = Math.min(1, s.hints.directL4 * 0.25 + s.hints.total * 0.06)
  const activityScore = Math.min(1,
    Math.min(1, s.activity.activeDays / 14) * 0.5 + Math.min(1, s.answers.total / 60) * 0.5)
  const gameScore = Math.min(1,
    ((s.game1.bestScore || 0) / 100) * 0.6 + Math.min(1, s.game2.decisions / 12) * 0.4)
  const persistence = s.retry.rate === null ? 0.5 : s.retry.rate

  return [
    { key: 'knowledge', name: '知识掌握', value: pct(masteryAvg) },
    { key: 'accuracy', name: '答题正确率', value: pct(s.answers.accuracy) },
    { key: 'activity', name: '学习活跃度', value: pct(activityScore) },
    { key: 'autonomy', name: '学习自主性', value: pct(1 - hintDependence) },
    { key: 'game', name: '游戏决策力', value: pct(gameScore) },
    { key: 'persistence', name: '学习韧性', value: pct(persistence) }
  ]
}

/** 规则标签（可解释、可复核，不依赖大模型） */
function buildTags(s, radar) {
  const tags = []
  const byKey = Object.fromEntries(radar.map((r) => [r.key, r.value]))

  if (s.answers.total === 0) tags.push('新同学·尚无作答')
  if (s.weakestTopic) {
    const w = s.mastery.find((m) => m.topic === s.weakestTopic)
    if (w && w.pKnown < 0.45 && w.attempts > 0) tags.push(`「${s.weakestTopic}」薄弱`)
  }
  if (s.answers.total >= 5 && s.answers.accuracy < 0.5) tags.push('正确率待提升')
  if (s.answers.total >= 20 && s.answers.accuracy >= 0.8) tags.push('基础扎实')
  if (s.hints.directL4 >= 2) tags.push('倾向直接看解析')
  else if (s.hints.total >= 6 && s.hints.directL4 === 0) tags.push('坚持逐级思考')
  if (s.activity.streak >= 3) tags.push(`连续学习${s.activity.streak}天`)
  if (s.game1.sessions > 0) tags.push('政策模拟玩家')
  if (s.game1.bestScore !== null && s.game1.bestScore >= 75) tags.push('宏观调控手感好')
  if (s.game2.decisions > 0) tags.push('多人博弈参与者')
  if (byKey.persistence >= 60) tags.push('纠错能力强')
  if (s.wrongBook.count >= 5) tags.push('错题积累较多')

  /* 去重并限制 5 个，保持前端展示整洁 */
  return [...new Set(tags)].slice(0, 5)
}

/** 薄弱节点：优先取"做过且掌握低"的节点，其次取学习前沿 */
function buildWeakNodes(s) {
  const attempted = [...s.nodeDetail.entries()]
    .map(([id, v]) => ({ id, ...v, node: nodeMap.get(id) }))
    .filter((x) => x.node)
    .sort((a, b) => a.pKnown - b.pKnown)

  const weak = attempted.filter((x) => x.pKnown < 0.5).slice(0, 5)
  if (weak.length > 0) {
    return weak.map((x) => ({
      id: x.id,
      name: x.node.name,
      topic: x.node.topic,
      pKnown: r3(x.pKnown),
      attempts: x.attempts
    }))
  }
  /* 没有明显薄弱节点时，给"尚未练习、且先修已具备"的节点作为待开发区 */
  const untouched = knowledgeNodes
    .filter((n) => !s.nodeDetail.has(n.id))
    .filter((n) => n.prereq.every((p) => {
      const v = s.nodeDetail.get(p)
      return !v || v.pKnown >= 0.6
    }))
    .slice(0, 4)
  return untouched.map((n) => ({ id: n.id, name: n.name, topic: n.topic, pKnown: null, attempts: 0 }))
}

/** 规则版画像文案（无大模型时的确定性兜底，也用于拼装提示词输入） */
export function ruleNarrative(profile, s) {
  const weakTopic = s.weakestTopic
  const weakNodes = profile.weakNodes.map((w) => w.name).slice(0, 3)
  const g1 = s.game1
  const g2 = s.game2

  const p1 = s.answers.total === 0
    ? '你还没有留下作答记录，系统暂时把你当作新同学：建议先做一轮基础题，让画像有据可依。'
    : `你已经完成 ${s.answers.total} 道题，整体正确率 ${pct(s.answers.accuracy)}%，` +
      (weakTopic ? `其中「${weakTopic}」是最需要补的一块。` : '各知识点发展比较均衡。')

  const p2 = `学习习惯上，你累计活跃 ${s.activity.activeDays} 天${s.activity.streak >= 2 ? `、当前连续 ${s.activity.streak} 天` : ''}，` +
    `阶梯提示共使用 ${s.hints.total} 次${s.hints.directL4 > 0 ? `（含 ${s.hints.directL4} 次直接查看完整解析）` : '，且没有直接查看完整解析'}。`

  const p3 = g1.sessions > 0 || g2.decisions > 0
    ? `在游戏里，你完成了 ${g1.sessions} 局政策模拟${g1.bestScore !== null ? `（最高评分 ${g1.bestScore}）` : ''}，` +
      `并在多人博弈中做出 ${g2.decisions} 次决策${s.game1.policyCategories.length ? `，偏好${s.game1.policyCategories.slice(0, 3).join('、')}类政策` : ''}。`
    : '你还没有进入游戏模块，建议用游戏一的政策模拟直观感受曲线如何移动。'

  const focus = weakNodes.length ? `下一步优先补：${weakNodes.join('、')}。` : '下一步可以挑战更高难度的综合题。'
  return `${p1}\n\n${p2}\n\n${p3}${focus}`
}

/**
 * 构建（或复用缓存的）学生画像
 * @param {string} userId
 * @param {{force?:boolean, useLLM?:boolean}} options
 */
export async function buildProfile(userId, { force = false, useLLM = true } = {}) {
  const cached = await getProfile(userId)
  if (cached && !force) {
    const age = Date.now() - new Date(cached.generatedAt).getTime()
    if (age < PROFILE_TTL_MS) return cached
  }

  const signals = await collectSignals(userId)
  const radar = radarFromSignals(signals)
  const tags = buildTags(signals, radar)
  const weakNodes = buildWeakNodes(signals)

  const dimensions = {
    knowledge: signals.mastery.map((m) => ({
      topic: m.topic,
      pKnown: r3(m.pKnown),
      attempts: m.attempts,
      accuracy: m.rate === null ? null : m.rate
    })),
    habits: {
      answers: signals.answers.total,
      correct: signals.answers.correct,
      accuracy: pct(signals.answers.accuracy),
      avgDurationSec: signals.answers.avgDurationMs
        ? Math.round(signals.answers.avgDurationMs / 1000)
        : null,
      activeDays: signals.activity.activeDays,
      streak: signals.activity.streak,
      recent7: signals.answers.recent7,
      wrongBook: signals.wrongBook.count,
      retry: signals.retry
    },
    hint: {
      total: signals.hints.total,
      byLevel: signals.hints.byLevel,
      directL4: signals.hints.directL4,
      degraded: signals.hints.degraded,
      feedbackUp: signals.hints.feedbackUp,
      feedbackDown: signals.hints.feedbackDown
    },
    game: {
      game1: signals.game1,
      game2: signals.game2,
      events: signals.events.bySource
    },
    nodes: {
      attempted: signals.nodeAttemptedCount,
      total: knowledgeNodes.length,
      weak: weakNodes
    }
  }

  const profile = {
    userId,
    radar,
    dimensions,
    tags,
    weakNodes,
    narrative: '',
    summary: '',
    source: 'rule',
    modelName: null,
    generatedAt: new Date().toISOString()
  }

  /* 先用规则文案兜底，保证任何情况下都有内容 */
  profile.narrative = ruleNarrative(profile, signals)
  profile.summary = buildSummary(profile, signals)

  /* 再尝试用大模型润色；失败不抛错，保留规则版本 */
  if (useLLM) {
    try {
      const ai = await llmProfile(profile, signals)
      if (ai && ai.narrative) {
        profile.narrative = String(ai.narrative).slice(0, 1200)
        profile.summary = String(ai.summary || profile.summary).slice(0, 60)
        if (Array.isArray(ai.tags) && ai.tags.length) {
          profile.tags = [...new Set([...ai.tags.map(String), ...tags])].slice(0, 5)
        }
        profile.source = 'llm'
        profile.modelName = config.llm.mock || !config.llm.apiKey ? 'mock' : `${config.llm.provider}/${config.llm.model}`
      }
    } catch (e) {
      console.warn('[profile] 大模型画像生成失败，保留规则版本：', e.message)
    }
  }

  await saveProfile(profile)
  return profile
}

/** 一句话摘要（规则版） */
function buildSummary(profile, s) {
  if (s.answers.total === 0 && s.game1.sessions === 0) return '新同学，尚未产生学习数据'
  const knowledge = profile.radar.find((r) => r.key === 'knowledge').value
  const level = knowledge >= 75 ? '掌握扎实' : knowledge >= 50 ? '基础成形' : '仍在起步'
  const weak = s.weakestTopic ? `，短板在${s.weakestTopic}` : ''
  return `${level}${weak}`
}

/** 组装提示词并请求大模型（输入为压缩后的统计 JSON，避免超长） */
async function llmProfile(profile, signals) {
  const system = loadPrompt('profile.txt')
  const input = {
    knowledge: profile.dimensions.knowledge,
    nodes: {
      attempted: signals.nodeAttemptedCount,
      total: knowledgeNodes.length,
      weak: profile.weakNodes
    },
    habits: profile.dimensions.habits,
    hint: profile.dimensions.hint,
    game: profile.dimensions.game,
    radar: profile.radar
  }
  const { content } = await chatText({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: '学生统计数据：\n' + JSON.stringify(input) }
    ],
    mockFallback: () => JSON.stringify({
      summary: profile.summary,
      narrative: profile.narrative,
      tags: profile.tags,
      strengths: [],
      weaknesses: profile.weakNodes.map((w) => w.name).slice(0, 3),
      focus_nodes: profile.weakNodes.map((w) => w.name).slice(0, 3)
    }),
    temperature: 0.6
  })
  return parseJsonLoose(content)
}

/** 画像落库（按 user_id 覆盖） */
async function saveProfile(p) {
  await query(
    `INSERT INTO student_profile
       (user_id, radar, dimensions, tags, weak_nodes, narrative, summary, source, model_name, generated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       radar = VALUES(radar), dimensions = VALUES(dimensions), tags = VALUES(tags),
       weak_nodes = VALUES(weak_nodes), narrative = VALUES(narrative), summary = VALUES(summary),
       source = VALUES(source), model_name = VALUES(model_name), generated_at = NOW()`,
    [
      p.userId,
      JSON.stringify(p.radar),
      JSON.stringify(p.dimensions),
      JSON.stringify(p.tags),
      JSON.stringify(p.weakNodes),
      p.narrative,
      p.summary,
      p.source,
      p.modelName
    ]
  )
}

/**
 * 读取已保存的画像（不重新计算）
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function getProfile(userId) {
  const rows = await safeQuery('SELECT * FROM student_profile WHERE user_id = ? LIMIT 1', [userId])
  if (rows.length === 0) return null
  const r = rows[0]
  return {
    userId: r.user_id,
    radar: asJson(r.radar) || [],
    dimensions: asJson(r.dimensions) || {},
    tags: asJson(r.tags) || [],
    weakNodes: asJson(r.weak_nodes) || [],
    narrative: r.narrative || '',
    summary: r.summary || '',
    source: r.source,
    modelName: r.model_name,
    generatedAt: r.generated_at
  }
}

/**
 * 教师端学情服务（Teacher Analytics）
 * ================================================================
 * 面向"任课教师"的数据视图，回答三个问题：
 *   1. 这个班整体学得怎么样？（概览 + 知识点热力 + 活跃趋势）
 *   2. 哪些学生需要我重点关注？（风险分级 + 排序）
 *   3. 某个学生具体卡在哪？（详情：画像 / 建议 / 作答 / 游戏 / 提示记录）
 *
 * 数据口径说明（重要）：
 *   教师端只统计**已注册学生**（users.role='student'）。匿名用户的数据虽然也会记录，
 *   但无法归属到具体学生，因此不进入班级统计，避免把"匿名"算成一个学生。
 *   平台内业务表的 user_id 形如 'u_12'，与 users.id 通过前缀映射。
 */
import { query, safeQuery } from '../db.js'
import { TOPICS } from '../../src/data/questionBank.js'
import { buildProfile } from './profileService.js'
import { getLatestAdvice, generateAdvice } from './adviceService.js'
import { nodeMasteryDetail, classNodeMastery } from './nodeMasteryService.js'
import { frontierNodes } from '../knowledge/graph.js'
import { getNodeMasteryMap } from './nodeMasteryService.js'
import { chatText, loadPrompt, parseJsonLoose } from './llm.js'

/** users.id → 业务表 user_id */
export function toUserId(id) {
  return `u_${id}`
}

/** 业务表 user_id → users.id（非 u_ 前缀返回 null） */
export function parseUserId(userId) {
  const m = /^u_(\d+)$/.exec(String(userId || ''))
  return m ? Number(m[1]) : null
}

/** 保留 3 位小数 */
function r3(v) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null
}

/** 风险分级：依据掌握度、正确率与最近活跃 */
function riskOf(row) {
  const total = Number(row.answerTotal) || 0
  const mastery = Number(row.avgMastery)
  const accuracy = total > 0 ? Number(row.correct) / total : null
  const lastAt = row.lastAnswerAt || row.lastEventAt || row.createdAt
  const idleDays = lastAt ? Math.floor((Date.now() - new Date(lastAt).getTime()) / 86400000) : null

  if (total === 0) return { level: 'new', label: '未开始', reason: '尚无作答记录' }
  if (mastery < 0.35 || (accuracy !== null && accuracy < 0.4)) {
    return { level: 'high', label: '重点关注', reason: `掌握度 ${Math.round(mastery * 100)}%，正确率 ${Math.round((accuracy || 0) * 100)}%` }
  }
  if (mastery < 0.55 || (idleDays !== null && idleDays >= 7)) {
    return {
      level: 'medium',
      label: '需要跟进',
      reason: idleDays !== null && idleDays >= 7 ? `已 ${idleDays} 天未学习` : `掌握度 ${Math.round(mastery * 100)}%`
    }
  }
  return { level: 'low', label: '状态良好', reason: `掌握度 ${Math.round(mastery * 100)}%` }
}

/* ================================================================
 * 一、学生列表与班级概览
 * ================================================================ */

/**
 * 学生列表（含画像摘要、风险分级）
 * @param {{className?:string, limit?:number}} options
 */
export async function listStudents({ className = null, limit = 200 } = {}) {
  /* 单条 SQL 聚合多表，避免 N+1 查询：班级规模在百人级完全够用 */
  const sql = `
    SELECT u.id, u.username, u.display_name, u.class_name, u.created_at,
           COALESCE(ar.total, 0)   AS answerTotal,
           COALESCE(ar.correct, 0) AS correct,
           ar.lastAt               AS lastAnswerAt,
           COALESCE(ms.avg_p, 0.15) AS avgMastery,
           COALESCE(g1.sessions, 0) AS game1Sessions,
           COALESCE(g2.decisions, 0) AS game2Decisions,
           COALESCE(le.events, 0)   AS eventCount,
           le.lastAt                AS lastEventAt,
           sp.summary               AS profileSummary,
           sp.tags                  AS profileTags
      FROM users u
      LEFT JOIN (SELECT user_id, COUNT(*) total, SUM(is_correct) correct, MAX(created_at) lastAt
                   FROM answer_record GROUP BY user_id) ar ON ar.user_id = CONCAT('u_', u.id)
      LEFT JOIN (SELECT user_id, AVG(p_known) avg_p FROM mastery_state GROUP BY user_id) ms
                 ON ms.user_id = CONCAT('u_', u.id)
      LEFT JOIN (SELECT user_id, COUNT(*) sessions FROM game1_session GROUP BY user_id) g1
                 ON g1.user_id = CONCAT('u_', u.id)
      LEFT JOIN (SELECT user_id, COUNT(*) decisions FROM game_decision GROUP BY user_id) g2
                 ON g2.user_id = CONCAT('u_', u.id)
      LEFT JOIN (SELECT user_id, COUNT(*) events, MAX(created_at) lastAt FROM learning_event GROUP BY user_id) le
                 ON le.user_id = CONCAT('u_', u.id)
      LEFT JOIN student_profile sp ON sp.user_id = CONCAT('u_', u.id)
     WHERE u.role = 'student'
       ${className ? 'AND u.class_name = ?' : ''}
     ORDER BY (ar.lastAt IS NULL) ASC, ar.lastAt DESC
     LIMIT ?`

  const params = className ? [className, limit] : [limit]
  const rows = await safeQuery(sql, params)

  return rows.map((row) => {
    const risk = riskOf(row)
    let tags = []
    try {
      tags = row.profileTags ? (typeof row.profileTags === 'string' ? JSON.parse(row.profileTags) : row.profileTags) : []
    } catch {
      tags = []
    }
    return {
      userId: toUserId(row.id),
      id: row.id,
      username: row.username,
      displayName: row.display_name || row.username,
      className: row.class_name || '默认班级',
      createdAt: row.created_at,
      answers: Number(row.answerTotal) || 0,
      correct: Number(row.correct) || 0,
      accuracy: Number(row.answerTotal) > 0
        ? Math.round((Number(row.correct) / Number(row.answerTotal)) * 100)
        : null,
      avgMastery: r3(row.avgMastery),
      game1Sessions: Number(row.game1Sessions) || 0,
      game2Decisions: Number(row.game2Decisions) || 0,
      events: Number(row.eventCount) || 0,
      lastActiveAt: row.lastAnswerAt || row.lastEventAt || null,
      profileSummary: row.profileSummary || null,
      tags,
      risk
    }
  })
}

/**
 * 班级概览（教师端首屏）
 * @param {{className?:string}} options
 */
export async function classOverview({ className = null } = {}) {
  const students = await listStudents({ className })
  const registered = students.length

  /* 指标聚合 */
  const withAnswers = students.filter((s) => s.answers > 0)
  const avgMastery = withAnswers.length
    ? withAnswers.reduce((a, s) => a + (s.avgMastery || 0), 0) / withAnswers.length
    : 0
  const avgAccuracy = withAnswers.length
    ? withAnswers.reduce((a, s) => a + (s.accuracy || 0), 0) / withAnswers.length / 100
    : 0

  const riskStats = { high: 0, medium: 0, low: 0, new: 0 }
  for (const s of students) riskStats[s.risk.level] += 1

  /* 近 7 天活跃（按日作答数） */
  const activityRows = await safeQuery(
    `SELECT DATE(created_at) AS d, COUNT(*) AS answers, COUNT(DISTINCT user_id) AS users
       FROM answer_record
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY DATE(created_at) ORDER BY d ASC`
  )

  /* 知识点平均掌握度（班级热力） */
  const topicRows = await safeQuery(
    `SELECT topic, AVG(p_known) AS avg_p, SUM(attempts) AS attempts, COUNT(*) AS learners
       FROM mastery_state GROUP BY topic`
  )
  const topicMap = new Map(topicRows.map((r) => [r.topic, r]))
  const topics = TOPICS.map((t) => {
    const r = topicMap.get(t)
    return {
      topic: t,
      avgMastery: r ? r3(r.avg_p) : 0.15,
      attempts: r ? Number(r.attempts) : 0,
      learners: r ? Number(r.learners) : 0
    }
  })
  const weakestTopic = [...topics].sort((a, b) => a.avgMastery - b.avgMastery)[0]

  /* 提示使用（整体） */
  const hintRows = await safeQuery(
    `SELECT COUNT(*) AS total, COALESCE(SUM(level = 4), 0) AS directL4,
            COALESCE(SUM(degraded), 0) AS degraded
       FROM hint_log`
  )
  const hint = hintRows[0] || {}

  /* 游戏参与 */
  const g1Rows = await safeQuery('SELECT COUNT(*) AS sessions, AVG(total_score) AS avgScore FROM game1_session')
  const g2Rows = await safeQuery('SELECT COUNT(DISTINCT room_id) AS rooms FROM game_decision')

  return {
    className: className || '全部班级',
    registered,
    activeStudents: withAnswers.length,
    avgMastery: r3(avgMastery),
    avgAccuracy: Math.round(avgAccuracy * 100),
    riskStats,
    activity: activityRows.map((r) => ({ date: r.d, answers: Number(r.answers), users: Number(r.users) })),
    topics,
    weakestTopic: weakestTopic ? weakestTopic.topic : null,
    hint: {
      total: Number(hint.total) || 0,
      directL4: Number(hint.directL4) || 0,
      degraded: Number(hint.degraded) || 0
    },
    game: {
      game1Sessions: Number(g1Rows[0]?.sessions) || 0,
      game1AvgScore: g1Rows[0]?.avgScore ? r3(g1Rows[0].avgScore) : null,
      game2Rooms: Number(g2Rows[0]?.rooms) || 0
    },
    focusStudents: students
      .filter((s) => s.risk.level === 'high' || s.risk.level === 'medium')
      .slice(0, 6)
      .map((s) => ({
        userId: s.userId,
        displayName: s.displayName,
        risk: s.risk,
        avgMastery: s.avgMastery,
        answers: s.answers
      }))
  }
}

/* ================================================================
 * 二、单个学生详情
 * ================================================================ */

/**
 * 学生详情（教师端抽屉）
 * @param {string} userId 形如 'u_12'
 */
export async function studentDetail(userId) {
  const uid = parseUserId(userId)
  if (!uid) throw new Error('非法的学生标识')

  const userRows = await safeQuery(
    'SELECT id, username, display_name, class_name, created_at FROM users WHERE id = ?',
    [uid]
  )
  if (userRows.length === 0) throw new Error('学生不存在')
  const user = userRows[0]
  const bizId = toUserId(uid)

  /* 画像与建议（画像走缓存；建议若从未生成过，这里补生成一次，
   * 保证教师打开学生详情就能看到可执行建议，而不是一片空白） */
  const profile = await buildProfile(bizId, { force: false, useLLM: true })
  let advice = await getLatestAdvice(bizId)
  if (!advice) {
    try {
      advice = await generateAdvice(bizId, { force: false, useLLM: true })
    } catch (e) {
      console.warn('[teacher] 学生建议自动生成失败：', e.message)
    }
  }
  const nodes = await nodeMasteryDetail(bizId)
  const nodeMapMastery = await getNodeMasteryMap(bizId)

  /* 近期作答（带题目主题） */
  const answers = await safeQuery(
    `SELECT question_id, topic, q_type, difficulty, is_correct, duration_ms, created_at
       FROM answer_record WHERE user_id = ? ORDER BY id DESC LIMIT 20`,
    [bizId]
  )

  /* 阶梯导学记录 */
  const hints = await safeQuery(
    `SELECT level, trigger_type, degraded, feedback, created_at
       FROM hint_log WHERE user_id = ? ORDER BY id DESC LIMIT 12`,
    [bizId]
  )

  /* 游戏一对局 */
  const game1 = await safeQuery(
    `SELECT mode, quarters, total_score, policy_count, quiz_correct, quiz_total, radar, finished_at
       FROM game1_session WHERE user_id = ? ORDER BY id DESC LIMIT 5`,
    [bizId]
  )

  /* 游戏二决策 */
  const game2 = await safeQuery(
    `SELECT round_no, role, decision, created_at
       FROM game_decision WHERE user_id = ? ORDER BY id DESC LIMIT 10`,
    [bizId]
  )

  /* 行为事件（两游戏操作流） */
  const events = await safeQuery(
    `SELECT source, event_type, payload, created_at
       FROM learning_event WHERE user_id = ? ORDER BY id DESC LIMIT 20`,
    [bizId]
  )

  /* 学习前沿：该生下一步可以攻的节点（供教师指定任务） */
  const frontier = frontierNodes(nodeMapMastery, 0.6, 5)

  return {
    user: {
      id: uid,
      userId: bizId,
      username: user.username,
      displayName: user.display_name || user.username,
      className: user.class_name || '默认班级',
      createdAt: user.created_at
    },
    profile,
    advice,
    nodes,
    frontier,
    recent: {
      answers: answers.map((a) => ({
        questionId: a.question_id,
        topic: a.topic,
        type: a.q_type,
        difficulty: a.difficulty,
        correct: !!a.is_correct,
        durationSec: a.duration_ms ? Math.round(a.duration_ms / 1000) : null,
        at: a.created_at
      })),
      hints: hints.map((h) => ({
        level: h.level,
        trigger: h.trigger_type,
        degraded: !!h.degraded,
        feedback: h.feedback,
        at: h.created_at
      })),
      game1: game1.map((g) => ({
        mode: g.mode,
        quarters: g.quarters,
        score: g.total_score === null ? null : Number(g.total_score),
        policies: g.policy_count,
        quizCorrect: g.quiz_correct,
        quizTotal: g.quiz_total,
        radar: typeof g.radar === 'string' ? safeJson(g.radar) : g.radar,
        at: g.finished_at
      })),
      game2: game2.map((g) => ({
        round: g.round_no,
        role: g.role,
        decision: typeof g.decision === 'string' ? safeJson(g.decision) : g.decision,
        at: g.created_at
      })),
      events: events.map((e) => ({
        source: e.source,
        type: e.event_type,
        payload: typeof e.payload === 'string' ? safeJson(e.payload) : e.payload,
        at: e.created_at
      }))
    }
  }
}

function safeJson(v) {
  try {
    return JSON.parse(v)
  } catch {
    return null
  }
}

/* ================================================================
 * 三、班级 AI 学情简报
 * ================================================================ */

/**
 * 生成"关键数字"清单
 * 大模型在写班级简报时容易把 3 人说成 4 人、凭空虚增分类，
 * 因此把它必须原样引用的计数单独列出来，并配合提示词铁律约束
 */
function factsText(o) {
  const rs = o.riskStats || {}
  return [
    '【关键数字】（以下数值必须原样引用，不得改写）',
    `注册学生 ${o.registered} 人；有作答记录 ${o.activeStudents} 人`,
    `平均掌握度 ${Math.round((o.avgMastery || 0) * 100)}%；平均正确率 ${o.avgAccuracy}%`,
    `风险分布：重点关注 ${rs.high || 0} 人、需要跟进 ${rs.medium || 0} 人、状态良好 ${rs.low || 0} 人、未开始 ${rs.new || 0} 人`
  ].join('\n')
}

/**
 * 生成班级学情简报（大模型总结，规则兜底）
 * @param {{className?:string}} options
 */
export async function classInsight({ className = null } = {}) {
  const overview = await classOverview({ className })

  /* 规则兜底文案：任何情况下教师都能看到结论 */
  const mock = () => {
    const weakest = overview.topics.slice().sort((a, b) => a.avgMastery - b.avgMastery)[0]
    const high = overview.riskStats.high
    return JSON.stringify({
      headline: `${overview.className}共 ${overview.registered} 人，整体掌握度 ${Math.round(overview.avgMastery * 100)}%`,
      overview:
        `当前注册学生 ${overview.registered} 人，其中 ${overview.activeStudents} 人有作答记录，` +
        `平均正确率 ${overview.avgAccuracy}%，班级知识点平均掌握度 ${Math.round(overview.avgMastery * 100)}%。` +
        `最薄弱的是「${weakest ? weakest.topic : '—'}」（${Math.round((weakest ? weakest.avgMastery : 0) * 100)}%），` +
        `${high} 名学生需要重点关注。`,
      problems: [
        `「${weakest ? weakest.topic : '—'}」整体掌握度偏低`,
        overview.game.game1Sessions === 0 ? '游戏模块参与度低，缺少仿真直观体验' : '提示依赖度需持续观察'
      ],
      actions: [
        `课堂上用 10 分钟重讲「${weakest ? weakest.topic : '薄弱知识点'}」的推导与常见错误`,
        '布置 1 组游戏一沙盘任务（扩张性财政 → 观察挤出效应），课后提交截图',
        '对重点关注学生逐一查看画像，安排对应知识节点的专项练习'
      ],
      focus_students: overview.focusStudents.slice(0, 5).map((s) => ({
        name: s.displayName,
        reason: s.risk.reason
      }))
    })
  }

  let data = safeJson(mock())
  try {
    const system = loadPrompt('teacher.txt')
    const input = {
      className: overview.className,
      registered: overview.registered,
      activeStudents: overview.activeStudents,
      avgMastery: overview.avgMastery,
      avgAccuracy: overview.avgAccuracy,
      riskStats: overview.riskStats,
      topics: overview.topics,
      hint: overview.hint,
      game: overview.game,
      activity: overview.activity,
      focusStudents: overview.focusStudents
    }
    const { content } = await chatText({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: factsText(overview) + '\n班级数据：\n' + JSON.stringify(input) }
      ],
      mockFallback: mock,
      temperature: 0.6
    })
    const parsed = parseJsonLoose(content)
    if (parsed && parsed.overview) data = parsed
  } catch (e) {
    console.warn('[teacher] 班级简报生成失败，使用规则版本：', e.message)
  }

  return { ...data, generatedAt: new Date().toISOString(), classData: overview }
}

/* ================================================================
 * 四、导出（CSV，便于教师存档）
 * ================================================================ */

/**
 * 导出学生学情 CSV 文本（Excel 可直接打开）
 * @param {{className?:string}} options
 */
export async function exportStudentsCsv({ className = null } = {}) {
  const students = await listStudents({ className })
  const header = ['姓名', '用户名', '班级', '作答题数', '正确率(%)', '平均掌握度', '游戏一对局', '游戏二决策', '行为事件', '最近活跃', '风险等级', '画像摘要']
  const lines = [header.join(',')]
  for (const s of students) {
    const cells = [
      s.displayName,
      s.username,
      s.className,
      s.answers,
      s.accuracy === null ? '' : s.accuracy,
      s.avgMastery === null ? '' : Math.round(s.avgMastery * 100),
      s.game1Sessions,
      s.game2Decisions,
      s.events,
      s.lastActiveAt ? new Date(s.lastActiveAt).toLocaleString('zh-CN') : '',
      s.risk.label,
      s.profileSummary || ''
    ]
    /* CSV 转义：包含逗号/引号/换行的字段用双引号包裹 */
    lines.push(cells.map((c) => {
      const v = String(c ?? '')
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
    }).join(','))
  }
  /* BOM 头：让 Excel 正确识别 UTF-8 中文 */
  return '\ufeff' + lines.join('\r\n')
}

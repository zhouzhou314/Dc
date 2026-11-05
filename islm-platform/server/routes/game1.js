/**
 * 游戏一（经济舵手·单机政策模拟）路由 /api/game1
 * ================================================================
 * 该游戏的引擎完全在前端运行（14 个季度、44 张政策卡、六步传导动画），
 * 后端只负责两件事：
 *   1. 保存终局快照（game1_session）——供画像的"游戏决策力"维度使用
 *   2. 提供历史查询——学生可回看自己的政策路线与评分变化
 *
 * 过程中的细粒度操作（每张政策、每次答题）走 /api/event 事件流，
 * 避免把高频操作写成数据库大事务。
 */
import { Router } from 'express'
import { query, safeQuery } from '../db.js'
import { resolveUserId } from '../middleware/auth.js'

const router = Router()

/** 数值裁剪（防止前端异常数据把统计拉飞） */
function clampNum(v, min, max, fallback = 0) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

/**
 * POST /api/game1/session
 * body: {
 *   mode:'learn'|'sandbox', quarters, totalScore, radar, kpiSeries,
 *   achievements, policyCount, quizCorrect, quizTotal, nickname, startedAt
 * }
 */
router.post('/session', async (req, res, next) => {
  try {
    const userId = resolveUserId(req)
    const b = req.body || {}
    const mode = b.mode === 'sandbox' ? 'sandbox' : 'learn'

    const result = await query(
      `INSERT INTO game1_session
         (user_id, nickname, mode, quarters, total_score, radar, kpi_series,
          achievements, policy_count, quiz_correct, quiz_total, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        userId,
        b.nickname ? String(b.nickname).slice(0, 50) : null,
        mode,
        clampNum(b.quarters, 0, 60, 14),
        b.totalScore === undefined || b.totalScore === null ? null : clampNum(b.totalScore, 0, 100, 0),
        b.radar ? JSON.stringify(b.radar) : null,
        b.kpiSeries ? JSON.stringify(Array.isArray(b.kpiSeries) ? b.kpiSeries.slice(0, 60) : []) : null,
        b.achievements ? JSON.stringify(Array.isArray(b.achievements) ? b.achievements.slice(0, 30) : []) : null,
        clampNum(b.policyCount, 0, 999, 0),
        clampNum(b.quizCorrect, 0, 999, 0),
        clampNum(b.quizTotal, 0, 999, 0),
        b.startedAt ? new Date(b.startedAt) : null
      ]
    )

    res.json({ success: true, code: 'OK', message: '', data: { id: result.insertId } })
  } catch (e) { next(e) }
})

/**
 * GET /api/game1/sessions?limit=10
 * 当前学生的历史对局（最新在前）
 */
router.get('/sessions', async (req, res, next) => {
  try {
    const userId = resolveUserId(req)
    const limit = Math.min(Number(req.query.limit) || 10, 50)
    const rows = await safeQuery(
      `SELECT id, mode, quarters, total_score, radar, policy_count, quiz_correct, quiz_total,
              achievements, finished_at
         FROM game1_session WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
      [userId, limit]
    )
    const asObj = (v) => {
      if (!v) return null
      if (typeof v === 'object') return v
      try { return JSON.parse(v) } catch { return null }
    }
    res.json({
      success: true,
      code: 'OK',
      message: '',
      data: {
        list: rows.map((r) => ({
          id: r.id,
          mode: r.mode,
          quarters: r.quarters,
          score: r.total_score === null ? null : Number(r.total_score),
          radar: asObj(r.radar),
          achievements: asObj(r.achievements) || [],
          policyCount: r.policy_count,
          quizCorrect: r.quiz_correct,
          quizTotal: r.quiz_total,
          finishedAt: r.finished_at
        }))
      }
    })
  } catch (e) { next(e) }
})

/**
 * GET /api/game1/stats
 * 当前学生的游戏一汇总（画像页/首页卡片用）
 */
router.get('/stats', async (req, res, next) => {
  try {
    const userId = resolveUserId(req)
    const rows = await safeQuery(
      `SELECT COUNT(*) AS sessions, MAX(total_score) AS best, AVG(total_score) AS avgScore,
              SUM(policy_count) AS policies, SUM(quiz_correct) AS quizCorrect,
              SUM(quiz_total) AS quizTotal, MAX(finished_at) AS lastAt
         FROM game1_session WHERE user_id = ?`,
      [userId]
    )
    const r = rows[0] || {}
    res.json({
      success: true,
      code: 'OK',
      message: '',
      data: {
        sessions: Number(r.sessions) || 0,
        bestScore: r.best === null || r.best === undefined ? null : Math.round(Number(r.best) * 10) / 10,
        avgScore: r.avgScore === null || r.avgScore === undefined ? null : Math.round(Number(r.avgScore) * 10) / 10,
        policies: Number(r.policies) || 0,
        quizCorrect: Number(r.quizCorrect) || 0,
        quizTotal: Number(r.quizTotal) || 0,
        lastAt: r.lastAt || null
      }
    })
  } catch (e) { next(e) }
})

export default router

/**
 * 错题复习路由 /api/review（SM-2 间隔重复）
 * -------------------------------------------------
 * GET  /api/review/due   今天到期的复习队列（按到期先后，上限 20）
 * POST /api/review/grade 复习评分：remember/fuzzy/forgot → SM-2 调度下次复习
 */
import { Router } from 'express'
import { query } from '../db.js'
import { resolveUserId } from '../middleware/auth.js'
import { sm2Schedule, GRADE_MAP } from '../services/reviewService.js'

const router = Router()

/* 到期复习队列 */
router.get('/due', async (req, res, next) => {
  try {
    const userId = resolveUserId(req)
    const rows = await query(
      `SELECT question_id, snapshot, my_answer, reason, times, ease_factor, interval_days, repetitions, due_date
       FROM wrong_book
       WHERE user_id = ? AND due_date <= CURDATE()
       ORDER BY due_date ASC
       LIMIT 20`,
      [userId]
    )
    const list = rows.map((r) => ({
      questionId: r.question_id,
      snapshot: r.snapshot,
      myAnswer: r.my_answer,
      reason: r.reason,
      times: r.times,
      dueDate: r.due_date
    }))
    res.json({ success: true, code: 'OK', message: '', data: { list } })
  } catch (e) { next(e) }
})

/* 复习评分：三档按钮 → SM-2 计算下次到期日 */
router.post('/grade', async (req, res, next) => {
  try {
    const userId = resolveUserId(req)
    const { questionId, grade } = req.body || {}
    if (questionId === undefined || !GRADE_MAP[grade]) {
      return res.status(400).json({ success: false, code: 'PARAM_ERROR', message: '缺少 questionId 或 grade 非法（remember/fuzzy/forgot）', data: null })
    }

    /* 取当前调度状态 */
    const rows = await query(
      'SELECT ease_factor, interval_days, repetitions FROM wrong_book WHERE user_id = ? AND question_id = ?',
      [userId, Number(questionId)]
    )
    if (rows.length === 0) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: '错题不存在', data: null })
    }
    const row = rows[0]

    /* SM-2 计算新调度 */
    const next = sm2Schedule(
      { easeFactor: Number(row.ease_factor), intervalDays: row.interval_days, repetitions: row.repetitions },
      GRADE_MAP[grade]
    )

    await query(
      `UPDATE wrong_book
       SET ease_factor = ?, interval_days = ?, repetitions = ?, due_date = ?, last_review_at = NOW()
       WHERE user_id = ? AND question_id = ?`,
      [next.easeFactor, next.intervalDays, next.repetitions, next.dueDate, userId, Number(questionId)]
    )

    res.json({
      success: true, code: 'OK', message: '',
      data: { nextDueDate: next.dueDate, intervalDays: next.intervalDays, easeFactor: next.easeFactor }
    })
  } catch (e) { next(e) }
})

export default router

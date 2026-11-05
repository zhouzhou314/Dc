/**
 * 云端错题本路由 /api/wrongbook
 * -------------------------------------------------
 * 登录用户的错题本存 MySQL（多端同步）；匿名用户前端继续用 localStorage，
 * 是否调用云接口由前端根据登录态决定，后端不强制。
 *
 *  GET  /api/wrongbook/list    我的错题列表（含 SM-2 调度字段）
 *  POST /api/wrongbook/add     收入错题（UPSERT：重复错 times+1 并重置复习计划）
 *  POST /api/wrongbook/remove  移除错题
 *  POST /api/wrongbook/reason  标注错误原因
 */
import { Router } from 'express'
import { query } from '../db.js'
import { resolveUserId } from '../middleware/auth.js'

const router = Router()

/** 明天的日期串 YYYY-MM-DD（错题重置后明天开始复习） */
function tomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

/* 错题列表 */
router.get('/list', async (req, res, next) => {
  try {
    const userId = resolveUserId(req)
    const rows = await query(
      `SELECT question_id, snapshot, my_answer, reason, times, ease_factor, interval_days, repetitions, due_date, last_review_at
       FROM wrong_book WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    )
    const list = rows.map((r) => ({
      questionId: r.question_id,
      snapshot: r.snapshot,
      myAnswer: r.my_answer,
      reason: r.reason,
      times: r.times,
      easeFactor: Number(r.ease_factor),
      intervalDays: r.interval_days,
      repetitions: r.repetitions,
      dueDate: r.due_date,
      lastReviewAt: r.last_review_at
    }))
    res.json({ success: true, code: 'OK', message: '', data: { list } })
  } catch (e) { next(e) }
})

/* 收入错题（UPSERT：已存在则次数+1、重置 SM-2 计划） */
router.post('/add', async (req, res, next) => {
  try {
    const userId = resolveUserId(req)
    const { questionId, snapshot, myAnswer, reason } = req.body || {}
    if (questionId === undefined || !snapshot) {
      return res.status(400).json({ success: false, code: 'PARAM_ERROR', message: '缺少 questionId 或题目快照', data: null })
    }

    await query(
      `INSERT INTO wrong_book (user_id, question_id, snapshot, my_answer, reason, times, due_date)
       VALUES (?, ?, ?, ?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE
         times = times + 1,
         my_answer = VALUES(my_answer),
         reason = COALESCE(VALUES(reason), reason),
         ease_factor = 2.50, interval_days = 0, repetitions = 0,
         due_date = VALUES(due_date), last_review_at = NULL`,
      [
        userId, Number(questionId),
        JSON.stringify(snapshot),
        myAnswer !== undefined && myAnswer !== null ? JSON.stringify(myAnswer) : null,
        reason || null,
        tomorrow()
      ]
    )
    res.json({ success: true, code: 'OK', message: '', data: { added: true } })
  } catch (e) { next(e) }
})

/* 移除错题 */
router.post('/remove', async (req, res, next) => {
  try {
    const userId = resolveUserId(req)
    const { questionId } = req.body || {}
    if (questionId === undefined) {
      return res.status(400).json({ success: false, code: 'PARAM_ERROR', message: '缺少 questionId', data: null })
    }
    await query('DELETE FROM wrong_book WHERE user_id = ? AND question_id = ?', [userId, Number(questionId)])
    res.json({ success: true, code: 'OK', message: '', data: { removed: true } })
  } catch (e) { next(e) }
})

/* 标注错误原因 */
router.post('/reason', async (req, res, next) => {
  try {
    const userId = resolveUserId(req)
    const { questionId, reason } = req.body || {}
    if (questionId === undefined) {
      return res.status(400).json({ success: false, code: 'PARAM_ERROR', message: '缺少 questionId', data: null })
    }
    await query('UPDATE wrong_book SET reason = ? WHERE user_id = ? AND question_id = ?', [reason || null, userId, Number(questionId)])
    res.json({ success: true, code: 'OK', message: '', data: { updated: true } })
  } catch (e) { next(e) }
})

export default router

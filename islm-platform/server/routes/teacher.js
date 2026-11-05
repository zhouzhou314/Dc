/**
 * 教师端路由 /api/teacher（全部要求教师角色）
 * ================================================================
 *   GET  /api/teacher/overview            班级概览（首屏指标 + 知识点热力 + 活跃趋势）
 *   GET  /api/teacher/students            学生列表（含风险分级）
 *   GET  /api/teacher/student/:userId     单个学生详情（画像/建议/作答/游戏/提示）
 *   POST /api/teacher/student/:userId/advice  重新生成该生学习建议
 *   POST /api/teacher/insight             AI 班级学情简报
 *   GET  /api/teacher/export              导出学情 CSV
 *   GET  /api/teacher/classes             班级列表（下拉筛选用）
 *   GET  /api/teacher/activity            最近行为流（课堂实时看板）
 */
import { Router } from 'express'
import { query, safeQuery } from '../db.js'
import { requireTeacher } from '../middleware/teacher.js'
import {
  classOverview, listStudents, studentDetail, classInsight, exportStudentsCsv, parseUserId
} from '../services/teacherService.js'
import { generateAdvice } from '../services/adviceService.js'

const router = Router()

/* 该路由组内所有接口都要求教师身份 */
router.use(requireTeacher)

/** 班级概览 */
router.get('/overview', async (req, res, next) => {
  try {
    const className = req.query.className ? String(req.query.className) : null
    res.json({ success: true, code: 'OK', message: '', data: await classOverview({ className }) })
  } catch (e) { next(e) }
})

/** 学生列表 */
router.get('/students', async (req, res, next) => {
  try {
    const className = req.query.className ? String(req.query.className) : null
    const limit = Math.min(Number(req.query.limit) || 200, 500)
    const list = await listStudents({ className, limit })
    res.json({ success: true, code: 'OK', message: '', data: { list, total: list.length } })
  } catch (e) { next(e) }
})

/** 学生详情 */
router.get('/student/:userId', async (req, res, next) => {
  try {
    const detail = await studentDetail(req.params.userId)
    res.json({ success: true, code: 'OK', message: '', data: detail })
  } catch (e) {
    if (e.message === '学生不存在' || e.message === '非法的学生标识') {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: e.message, data: null })
    }
    next(e)
  }
})

/** 为该生重新生成学习建议（教师点"一键生成指导"） */
router.post('/student/:userId/advice', async (req, res, next) => {
  try {
    const uid = parseUserId(req.params.userId)
    if (!uid) {
      return res.status(400).json({ success: false, code: 'PARAM_ERROR', message: '非法的学生标识', data: null })
    }
    const advice = await generateAdvice(`u_${uid}`, { force: true, useLLM: true })
    res.json({ success: true, code: 'OK', message: '', data: advice })
  } catch (e) { next(e) }
})

/** 班级 AI 学情简报 */
router.post('/insight', async (req, res, next) => {
  try {
    const className = req.body?.className ? String(req.body.className) : null
    res.json({ success: true, code: 'OK', message: '', data: await classInsight({ className }) })
  } catch (e) { next(e) }
})

/** 导出 CSV */
router.get('/export', async (req, res, next) => {
  try {
    const className = req.query.className ? String(req.query.className) : null
    const csv = await exportStudentsCsv({ className })
    const filename = encodeURIComponent(`学情导出_${className || '全部班级'}_${new Date().toISOString().slice(0, 10)}.csv`)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`)
    res.send(csv)
  } catch (e) { next(e) }
})

/** 班级列表 */
router.get('/classes', async (_req, res, next) => {
  try {
    const rows = await safeQuery(
      `SELECT COALESCE(class_name, '默认班级') AS name, COUNT(*) AS students
         FROM users WHERE role = 'student' GROUP BY class_name ORDER BY students DESC`
    )
    res.json({ success: true, code: 'OK', message: '', data: { list: rows } })
  } catch (e) { next(e) }
})

/** 最近行为流（课堂看板：谁在玩什么、做到哪一步） */
router.get('/activity', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100)
    const rows = await safeQuery(
      `SELECT e.user_id, u.display_name, e.source, e.event_type, e.payload, e.created_at
         FROM learning_event e
         LEFT JOIN users u ON CONCAT('u_', u.id) = e.user_id
        ORDER BY e.id DESC LIMIT ?`,
      [limit]
    )
    const list = rows.map((r) => ({
      userId: r.user_id,
      name: r.display_name || (r.user_id === 'anonymous' ? '匿名学生' : r.user_id),
      source: r.source,
      type: r.event_type,
      payload: typeof r.payload === 'string' ? safeJson(r.payload) : r.payload,
      at: r.created_at
    }))
    res.json({ success: true, code: 'OK', message: '', data: { list } })
  } catch (e) { next(e) }
})

/** 教师端首页所需的"待办"计数（重点学生 + 今日活跃） */
router.get('/summary', async (_req, res, next) => {
  try {
    const rows = await query(
      `SELECT COUNT(*) AS total FROM users WHERE role = 'student'`
    )
    const todayRows = await safeQuery(
      `SELECT COUNT(DISTINCT user_id) AS n FROM answer_record WHERE DATE(created_at) = CURDATE()`
    )
    res.json({
      success: true,
      code: 'OK',
      message: '',
      data: {
        students: Number(rows[0]?.total) || 0,
        activeToday: Number(todayRows[0]?.n) || 0
      }
    })
  } catch (e) { next(e) }
})

function safeJson(v) {
  try { return JSON.parse(v) } catch { return null }
}

export default router

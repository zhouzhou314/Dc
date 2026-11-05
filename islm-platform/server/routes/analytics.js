/**
 * 学习分析路由 /api/analytics
 * -------------------------------------------------
 * GET /api/analytics/mastery    各知识点 BKT 掌握度（雷达图数据源）
 * GET /api/analytics/recommend  自适应推题（返回题 id + 推荐理由）
 */
import { Router } from 'express'
import { getMastery } from '../services/bktService.js'
import { recommendQuestions } from '../services/recommendService.js'
import { resolveUserId } from '../middleware/auth.js'
import { TOPICS } from '../../src/data/questionBank.js'

const router = Router()

/* 掌握度：五个知识点全部返回（无记录的给 BKT 先验），雷达图可直接渲染 */
router.get('/mastery', async (req, res, next) => {
  try {
    const userId = resolveUserId(req)
    const data = await getMastery(userId, TOPICS)
    res.json({ success: true, code: 'OK', message: '', data })
  } catch (e) { next(e) }
})

/* 自适应推题：?count=5 可选 */
router.get('/recommend', async (req, res, next) => {
  try {
    const userId = resolveUserId(req)
    const count = Math.min(Number(req.query.count) || 5, 10)
    const data = await recommendQuestions(userId, TOPICS, count)
    res.json({ success: true, code: 'OK', message: '', data })
  } catch (e) { next(e) }
})

export default router

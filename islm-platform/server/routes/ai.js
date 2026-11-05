/**
 * AI 能力路由 /api/ai
 * ================================================================
 *   GET  /api/ai/profile      学生画像（带 30 分钟缓存，?force=1 强制重算）
 *   GET  /api/ai/advice       针对性学习建议（画像 + 强化学习策略）
 *   GET  /api/ai/recommend    单次动作推荐（供"下一步学什么"卡片）
 *   GET  /api/ai/model        DQN 模型与训练数据状态（前端"AI 引擎"卡片）
 *   POST /api/ai/train        用历史经验离线训练（管理/演示用，需登录）
 *
 * 说明：画像与建议的生成会调用大模型（无 Key 自动走确定性模板），
 * 因此这里用 30s 超时保护；单次请求内不会重复训练模型。
 */
import { Router } from 'express'
import { requireAuth, resolveUserId } from '../middleware/auth.js'
import { buildProfile } from '../services/profileService.js'
import { generateAdvice, getLatestAdvice } from '../services/adviceService.js'
import { recommend, modelStatus, trainFromHistory } from '../services/rlService.js'

const router = Router()

/** 学生画像 */
router.get('/profile', async (req, res, next) => {
  try {
    const userId = resolveUserId(req)
    const force = req.query.force === '1' || req.query.force === 'true'
    const profile = await buildProfile(userId, { force, useLLM: true })
    res.json({ success: true, code: 'OK', message: '', data: profile })
  } catch (e) { next(e) }
})

/** 学习建议（GET 时若已有建议可只读；?refresh=1 重新生成） */
router.get('/advice', async (req, res, next) => {
  try {
    const userId = resolveUserId(req)
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true'
    if (!refresh) {
      const latest = await getLatestAdvice(userId)
      if (latest) {
        return res.json({ success: true, code: 'OK', message: '', data: latest })
      }
    }
    const advice = await generateAdvice(userId, { force: refresh, useLLM: true })
    res.json({ success: true, code: 'OK', message: '', data: advice })
  } catch (e) { next(e) }
})

/** 单次推荐（不重新生成建议，只返回策略动作） */
router.get('/recommend', async (req, res, next) => {
  try {
    const userId = resolveUserId(req)
    const data = await recommend(userId, { record: req.query.record !== '0' })
    res.json({ success: true, code: 'OK', message: '', data })
  } catch (e) { next(e) }
})

/** 模型状态 */
router.get('/model', async (_req, res, next) => {
  try {
    res.json({ success: true, code: 'OK', message: '', data: await modelStatus() })
  } catch (e) { next(e) }
})

/** 离线训练（登录后可触发，用于演示"训练 → 推荐变化"） */
router.post('/train', requireAuth, async (req, res, next) => {
  try {
    const steps = Math.max(10, Math.min(Number(req.body?.steps) || 200, 2000))
    const scope = req.body?.scope === 'all' ? null : resolveUserId(req)
    const result = await trainFromHistory(steps, scope)
    res.json({ success: true, code: 'OK', message: '', data: result })
  } catch (e) { next(e) }
})

export default router

/**
 * 学习行为事件采集路由 /api/event
 * ================================================================
 * 两游戏与学习页面的操作统一走这里落库（learning_event 表），
 * 是"AI 能读取学生在游戏中的操作"的数据入口。
 *
 * 设计要点：
 *   - 批量上报：前端按 1~2 秒攒批，减少请求数（游戏动画期间事件密集）
 *   - 白名单校验：source 只允许 game1/game2/learning/ai，避免脏数据污染画像
 *   - 负载裁剪：payload 序列化后超过 2000 字符直接截断，防止恶意/异常大包
 *   - 匿名可用：未登录学生也能上报（user_id 用 hintUserId），登录后自动归到 u_<id>
 */
import { Router } from 'express'
import { query } from '../db.js'
import { resolveUserId } from '../middleware/auth.js'

const router = Router()

/** 允许的事件来源 */
const SOURCES = new Set(['game1', 'game2', 'learning', 'ai'])
/** 单次上报最多事件数 */
const MAX_BATCH = 60
/** payload 序列化后的最大长度 */
const MAX_PAYLOAD = 2000

/** 校验并规整单条事件 */
function normalizeEvent(raw) {
  if (!raw || typeof raw !== 'object') return null
  const source = String(raw.source || '')
  if (!SOURCES.has(source)) return null
  const type = String(raw.type || '').slice(0, 40)
  if (!type) return null

  let payload = null
  if (raw.payload && typeof raw.payload === 'object') {
    try {
      const text = JSON.stringify(raw.payload)
      payload = text.length > MAX_PAYLOAD ? text.slice(0, MAX_PAYLOAD) : text
    } catch {
      payload = null
    }
  }
  const duration = Number(raw.durationMs)
  return [
    source,
    type,
    payload,
    Number.isFinite(duration) && duration >= 0 ? Math.min(duration, 24 * 3600 * 1000) : null
  ]
}

/**
 * POST /api/event/batch
 * body: { events: [{ source, type, payload?, durationMs? }], hintUserId? }
 */
router.post('/batch', async (req, res, next) => {
  try {
    const list = Array.isArray(req.body?.events) ? req.body.events : []
    if (list.length === 0) {
      return res.status(400).json({ success: false, code: 'PARAM_ERROR', message: 'events 不能为空', data: null })
    }
    const userId = resolveUserId(req)
    const rows = list.slice(0, MAX_BATCH).map(normalizeEvent).filter(Boolean)
    if (rows.length === 0) {
      return res.status(400).json({ success: false, code: 'PARAM_ERROR', message: '没有合法事件', data: null })
    }

    /* 多值 INSERT：一次往返写入整批事件 */
    const placeholders = rows.map(() => '(?, ?, ?, ?, ?)').join(', ')
    const params = []
    for (const [source, type, payload, duration] of rows) {
      params.push(userId, source, type, payload, duration)
    }
    await query(
      `INSERT INTO learning_event (user_id, source, event_type, payload, duration_ms)
       VALUES ${placeholders}`,
      params
    )

    res.json({ success: true, code: 'OK', message: '', data: { accepted: rows.length } })
  } catch (e) { next(e) }
})

/**
 * POST /api/event/one
 * 单条上报（低频事件，如游戏结束时的一次性上报）
 */
router.post('/one', async (req, res, next) => {
  try {
    const row = normalizeEvent(req.body)
    if (!row) {
      return res.status(400).json({ success: false, code: 'PARAM_ERROR', message: '事件格式不正确', data: null })
    }
    const userId = resolveUserId(req)
    await query(
      `INSERT INTO learning_event (user_id, source, event_type, payload, duration_ms)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, ...row]
    )
    res.json({ success: true, code: 'OK', message: '', data: { accepted: 1 } })
  } catch (e) { next(e) }
})

export default router

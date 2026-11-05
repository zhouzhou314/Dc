/**
 * 多人博弈游戏 · REST 辅助路由（对局报告查询）
 * -------------------------------------------------
 * WebSocket 负责实时对局，这里只做事后查询：
 *  - GET /api/game/reports?userId=xxx   我的历史对局列表（画像"游戏表现"数据源）
 *  - GET /api/game/report/:code         单局详情（决策序列 + 聊天 + 雷达图）
 */
import { Router } from 'express'
import { query } from '../db.js'

const router = Router()

/* 我的历史对局（按时间倒序，默认最近 20 局） */
router.get('/reports', async (req, res, next) => {
  try {
    const userId = req.query.userId
    if (!userId) {
      return res.json({ success: false, code: 'PARAM_ERROR', message: '缺少 userId', data: null })
    }
    /* 一个玩家可能在一局中留下多条决策，用 DISTINCT 去重取对局 */
    const rows = await query(
      `SELECT DISTINCT r.id, r.room_code, r.total_rounds, r.final_metrics, r.report, r.created_at
       FROM game_room r
       JOIN game_decision d ON d.room_id = r.id
       WHERE d.user_id = ?
       ORDER BY r.created_at DESC
       LIMIT 20`,
      [userId]
    )
    res.json({
      success: true, code: 'OK', message: '',
      data: rows.map(r => ({
        id: r.id,
        code: r.room_code,
        rounds: r.total_rounds,
        metrics: r.final_metrics,
        verdict: r.report?.verdict || null,
        radar: r.report?.radar || null,
        createdAt: r.created_at
      }))
    })
  } catch (e) {
    next(e)
  }
})

/* 单局详情（复盘用：决策序列 + 聊天 + 完整报告） */
router.get('/report/:code', async (req, res, next) => {
  try {
    const [room] = await query(
      'SELECT id, room_code, total_rounds, final_metrics, report, created_at FROM game_room WHERE room_code = ?',
      [req.params.code]
    )
    if (!room) {
      return res.json({ success: false, code: 'NOT_FOUND', message: '对局不存在', data: null })
    }
    const decisions = await query(
      'SELECT round_no, role, nickname, decision, metrics_after FROM game_decision WHERE room_id = ? ORDER BY round_no, FIELD(role, "government", "bank", "enterprise", "consumer")',
      [room.id]
    )
    const chat = await query(
      'SELECT nickname, role, text, created_at FROM game_chat WHERE room_id = ? ORDER BY id',
      [room.id]
    )
    res.json({
      success: true, code: 'OK', message: '',
      data: { room, decisions, chat }
    })
  } catch (e) {
    next(e)
  }
})

export default router

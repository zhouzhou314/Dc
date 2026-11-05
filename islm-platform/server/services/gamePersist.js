/**
 * 多人博弈游戏 · 结果落库
 * -------------------------------------------------
 * 终局时一次性把对局写入 MySQL 三张表（供"个性化画像"和教师复盘读取）：
 *  - game_room     对局主表（含完整报告 JSON）
 *  - game_decision 每回合每个角色的决策序列（画像的"决策风格"数据源）
 *  - game_chat     协商对话记录（需求：小组博弈报告要记录对话内容）
 *
 * 失败只打日志不影响玩家（游戏数据已在内存跑完并广播）。
 */
import { pool } from '../db.js'

/**
 * 把一个已结束的房间写入数据库
 * @param {Object} room gameStore 里的 room（需已完成 finishGame）
 */
export async function persistGameResult(room) {
  if (room.status !== 'finished') return

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    /* 1. 对局主表 */
    const [res] = await conn.query(
      `INSERT INTO game_room (room_code, host_user_id, status, total_rounds, final_metrics, report)
       VALUES (?, ?, 'finished', ?, ?, ?)`,
      [
        room.code,
        room.players.government?.type === 'human' ? room.players.government.userId : null,
        room.totalRounds,
        JSON.stringify(room.metrics || {}),
        JSON.stringify(room.report || {})
      ]
    )
    const roomId = res.insertId

    /* 2. 决策序列：每回合 × 每角色一条（从 history.decisions 取，已含全部回合） */
    for (const h of room.history) {
      for (const [role, changes] of Object.entries(h.decisions || {})) {
        const seat = room.players[role] || {}
        await conn.query(
          `INSERT INTO game_decision (room_id, round_no, role, user_id, nickname, decision, metrics_after)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            roomId, h.round, role,
            seat.type === 'human' ? seat.userId : null,
            seat.nickname || role,
            JSON.stringify(changes),
            JSON.stringify(h.metrics || {})
          ]
        )
      }
    }

    /* 3. 聊天记录 */
    for (const msg of room.chat) {
      const seat = room.players[msg.role] || {}
      await conn.query(
        `INSERT INTO game_chat (room_id, user_id, nickname, role, text)
         VALUES (?, ?, ?, ?, ?)`,
        [roomId, seat.type === 'human' ? seat.userId : null, msg.nickname, msg.role, msg.text]
      )
    }

    await conn.commit()
    console.log(`[game] 对局 ${room.code} 已落库（决策 ${room.history.length} 回合，聊天 ${room.chat.length} 条）`)
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
  }
}

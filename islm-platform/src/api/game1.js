/**
 * 游戏一（经济舵手）前端接口层
 * -------------------------------------------------
 * 引擎在前端跑，这里只负责"终局上报"与"历史查询"。
 * 过程中的细粒度操作走 @/api/event 事件流。
 */
import request from './request'
import { getAnonUserId } from '@/utils/identity'

/**
 * 保存一局的终局快照
 * @param {object} session { mode, quarters, totalScore, radar, kpiSeries, achievements,
 *                           policyCount, quizCorrect, quizTotal, nickname, startedAt }
 */
export function saveGame1Session(session) {
  return request.post('/game1/session', { ...session, hintUserId: getAnonUserId() })
}

/** 当前学生的历史对局 */
export function fetchGame1Sessions(limit = 10) {
  return request.get('/game1/sessions', { params: { limit, userId: getAnonUserId() } })
}

/** 当前学生的游戏一汇总 */
export function fetchGame1Stats() {
  return request.get('/game1/stats', { params: { userId: getAnonUserId() } })
}

/**
 * 阶梯导学前端接口层
 * -------------------------------------------------
 * 独立于 islm.js（那边 timeout 15s 且实例未导出）：
 * 大模型生成提示较慢，这里把超时放宽到 30s。
 * 所有请求经 Vite 代理（/api → http://localhost:3001），同源无需 CORS。
 */
import axios from 'axios'
import { ssePost } from './sse'

const request = axios.create({
  baseURL: '/api',
  timeout: 30000
})

/**
 * 逐级获取提示（L1→L2→L3），或在卡片内填困惑后按当前层级重新生成
 * @param {string} userId 学生标识（localStorage 持久化）
 * @param {number} questionId 题目编号 1~8
 * @param {string} [confusionText] 学生困惑描述（填写时走"困惑重试"，层级不递增）
 * @param {object} [studentAnswer] 作答快照：单选 {choice}；计算 {y, r}（r 为百分数）
 * @param {string} [judgeResult] 'correct' | 'wrong' | 'unsolved'
 */
export function getHint(userId, questionId, confusionText = '', studentAnswer = null, judgeResult = 'unsolved') {
  return request.post('/hint', { userId, questionId, confusionText, studentAnswer, judgeResult })
}

/**
 * 流式获取提示（SSE 打字机）：POST /api/hint/stream
 * -------------------------------------------------
 * 后端先完整跑现有 getHint 管线（泄露校验/重试/降级全部保留），
 * 再把定稿 hint_body 分段回放：meta（结构化载荷）→ delta* → done / error。
 * fetch 层异常时 reject，调用方回落旧 POST /api/hint。
 * @param {object} params 同 getHint 入参 {userId, questionId, confusionText, studentAnswer, judgeResult}
 * @param {(event: string, payload: object) => void} onEvent 事件回调
 */
export function streamHint(params, onEvent) {
  return ssePost('/api/hint/stream', params, onEvent)
}

/**
 * 查看完整解析（L4）。前端必须先弹出确认框，用户确认后才调用（confirm: true）
 */
export function getSolution(userId, questionId) {
  return request.post('/hint/solution', { userId, questionId, confirm: true })
}

/** 拉取该学生全部题目的导学状态（刷新恢复：每题的层级 + 历史提示卡片） */
export function getHintState(userId) {
  return request.get('/hint/state', { params: { userId } })
}

/** 对某条提示反馈是否有帮助 */
export function sendFeedback(userId, questionId, hintLogId, feedback) {
  return request.post('/hint/feedback', { userId, questionId, hintLogId, feedback })
}

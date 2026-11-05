/**
 * AI 能力前端接口层
 * -------------------------------------------------
 * 画像、学习建议、强化学习推荐、模型状态与离线训练。
 * 统一经 request 实例自动带 JWT；匿名时后端用 hintUserId 归集数据，
 * 因此这里在请求里附带 hintUserId。
 */
import request from './request'
import { getAnonUserId } from '@/utils/identity'

/** 携带匿名标识的查询参数 */
function withAnon(params = {}) {
  return { ...params, userId: getAnonUserId() }
}

/**
 * 拉取学生画像
 * @param {{force?:boolean}} options force=true 绕过 30 分钟缓存重新计算
 */
export function fetchProfile({ force = false } = {}) {
  return request.get('/ai/profile', { params: withAnon(force ? { force: 1 } : {}) })
}

/**
 * 拉取学习建议
 * @param {{refresh?:boolean}} options refresh=true 重新生成（否则优先返回最近一次）
 */
export function fetchAdvice({ refresh = false } = {}) {
  return request.get('/ai/advice', { params: withAnon(refresh ? { refresh: 1 } : {}) })
}

/** 单次推荐（强化学习策略动作） */
export function fetchRecommend({ record = true } = {}) {
  return request.get('/ai/recommend', { params: withAnon(record ? {} : { record: 0 }) })
}

/** 模型与训练数据状态 */
export function fetchModelStatus() {
  return request.get('/ai/model')
}

/** 触发离线训练（需登录） */
export function trainModel(steps = 200, scope = 'self') {
  return request.post('/ai/train', { steps, scope })
}

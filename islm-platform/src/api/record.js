/**
 * 学习分析前端接口层：作答上报 / BKT 掌握度 / 自适应推荐
 * 复用共享 request 实例（自动带 JWT token）
 */
import request from './request'

/**
 * 上报一次作答（后端落 answer_record 并更新 BKT 掌握度）
 * @param {object} payload { questionId, topic, qType, difficulty, isCorrect, studentAnswer, durationMs }
 */
export function reportAnswer(payload) {
  return request.post('/record/answer', payload)
}

/** 拉取各知识点 BKT 掌握度（雷达图数据源） */
export function getMastery() {
  return request.get('/analytics/mastery')
}

/** 拉取自适应推荐题（返回题 id + 推荐理由） */
export function getRecommend(count = 5) {
  return request.get('/analytics/recommend', { params: { count } })
}

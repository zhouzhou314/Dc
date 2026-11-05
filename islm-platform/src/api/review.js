/**
 * 云端错题本 / SM-2 复习前端接口层
 * 登录用户才调用（由 learning store / 视图判断），匿名模式走 localStorage
 */
import request from './request'

/* ---------- 错题本云端 CRUD ---------- */

/** 拉取云端错题列表 */
export function getWrongCloud() {
  return request.get('/wrongbook/list')
}

/** 收入云端错题（snapshot 为题目完整快照） */
export function addWrongCloud(payload) {
  return request.post('/wrongbook/add', payload)
}

/** 从云端移除错题 */
export function removeWrongCloud(questionId) {
  return request.post('/wrongbook/remove', { questionId })
}

/** 标注云端错题的错误原因 */
export function setWrongReasonCloud(questionId, reason) {
  return request.post('/wrongbook/reason', { questionId, reason })
}

/* ---------- SM-2 复习 ---------- */

/** 今天到期的复习队列 */
export function getDueList() {
  return request.get('/review/due')
}

/** 复习评分：grade = 'remember' | 'fuzzy' | 'forgot' */
export function gradeReview(questionId, grade) {
  return request.post('/review/grade', { questionId, grade })
}

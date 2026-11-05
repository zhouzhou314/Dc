/**
 * 教师端前端接口层
 * -------------------------------------------------
 * 所有接口都要求教师角色（后端 requireTeacher 校验），
 * 非教师账号调用会得到 403，前端据此提示"当前账号无教师权限"。
 */
import request from './request'

/** 班级概览 */
export function fetchOverview(className = null) {
  return request.get('/teacher/overview', { params: className ? { className } : {} })
}

/** 学生列表 */
export function fetchStudents(className = null) {
  return request.get('/teacher/students', { params: className ? { className } : {} })
}

/** 学生详情 */
export function fetchStudent(userId) {
  return request.get(`/teacher/student/${userId}`)
}

/** 为该生重新生成学习建议 */
export function regenerateAdvice(userId) {
  return request.post(`/teacher/student/${userId}/advice`)
}

/** AI 班级学情简报 */
export function fetchClassInsight(className = null) {
  return request.post('/teacher/insight', className ? { className } : {})
}

/** 班级列表 */
export function fetchClasses() {
  return request.get('/teacher/classes')
}

/** 最近行为流 */
export function fetchActivity(limit = 30) {
  return request.get('/teacher/activity', { params: { limit } })
}

/** 导出 CSV 的下载地址（直接 window.open 即可，浏览器会带 Cookie/头部的场景不适用，
 * 因此这里返回后端路径，由页面用 fetch + blob 下载以携带 JWT） */
export const EXPORT_PATH = '/api/teacher/export'

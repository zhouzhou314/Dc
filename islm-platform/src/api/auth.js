/**
 * 认证前端接口层：注册 / 登录 / 当前用户
 * 复用共享 request 实例（自动带 token）
 */
import request from './request'

/** 注册（成功返回 { token, user }，自动登录） */
export function registerApi(username, password, displayName) {
  return request.post('/auth/register', { username, password, displayName })
}

/** 登录 */
export function loginApi(username, password) {
  return request.post('/auth/login', { username, password })
}

/** 用 token 反查当前用户（校验登录态是否过期） */
export function fetchMe() {
  return request.get('/auth/me')
}

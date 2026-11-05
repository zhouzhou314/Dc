/**
 * 可选认证中间件
 * -------------------------------------------------
 * 设计原则（本项目最小化中间件）：
 *  - 有 Authorization: Bearer <token>  → 校验 JWT，解出 req.user
 *  - 没有 token / token 无效           → 匿名放行（req.user = null），绝不报错
 *
 * 为什么"可选"：平台支持双模式——未登录用户继续用 localStorage 匿名体验，
 * 登录用户的数据（错题本/学习记录）才云端同步。因此大部分路由挂这个中间件
 * 只是"尽力识别身份"，而不是强制拦截。
 */
import jwt from 'jsonwebtoken'
import { config } from '../config.js'

/**
 * 从请求头解析 Bearer token，成功返回负载对象，失败返回 null
 */
function parseToken(req) {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) return null
  const token = header.slice(7)
  try {
    return jwt.verify(token, config.jwt.secret) // 无效/过期会抛异常，被 catch 住
  } catch {
    return null
  }
}

/**
 * 可选认证：把 req.user 挂上（可能为 null），永远放行
 */
export function optionalAuth(req, _res, next) {
  const payload = parseToken(req)
  req.user = payload ? { id: payload.uid, username: payload.username } : null
  next()
}

/**
 * 强制认证：未登录直接 401（目前仅 /api/auth/me 使用）
 */
export function requireAuth(req, res, next) {
  const payload = parseToken(req)
  if (!payload) {
    return res.status(401).json({
      success: false, code: 'AUTH_ERROR', message: '请先登录', data: null
    })
  }
  req.user = { id: payload.uid, username: payload.username }
  next()
}

/**
 * 统一的用户标识口径：
 *  - 登录用户  → 'u_' + users.id（多端一致的云端身份）
 *  - 匿名用户  → 前端 localStorage 生成的 hintUserId（保持旧体验）
 * 业务路由里用它作为 answer_record / wrong_book 等表的 user_id
 */
export function resolveUserId(req) {
  if (req.user && req.user.id) return `u_${req.user.id}`
  // 匿名时允许前端在 body/query 里带上 hintUserId
  return (req.body && req.body.hintUserId) || (req.query && req.query.userId) || 'anonymous'
}

/**
 * 教师权限中间件
 * ================================================================
 * 平台的认证是"可选认证"（匿名也能用），教师端则必须严格校验：
 *   1. 必须登录（req.user 由全局 optionalAuth 解析）
 *   2. users.role 必须为 'teacher'
 *
 * 角色存在数据库而不是 JWT 里：教师身份变更（如撤销权限）能立即生效，
 * 不用等 7 天令牌过期。代价是每次请求多一次主键查询，量级可忽略。
 */
import { query } from '../db.js'

/**
 * 要求教师权限
 * 通过后在 req.teacher 挂上教师信息，供路由使用
 */
export async function requireTeacher(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false, code: 'AUTH_ERROR', message: '请先用教师账号登录', data: null
      })
    }
    const rows = await query(
      'SELECT id, username, display_name, role, class_name FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    )
    const user = rows[0]
    if (!user || user.role !== 'teacher') {
      return res.status(403).json({
        success: false, code: 'FORBIDDEN', message: '该功能仅教师账号可用', data: null
      })
    }
    req.teacher = {
      id: user.id,
      username: user.username,
      displayName: user.display_name || user.username,
      className: user.class_name || null
    }
    next()
  } catch (e) {
    next(e)
  }
}

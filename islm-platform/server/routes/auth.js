/**
 * 认证路由 /api/auth
 * -------------------------------------------------
 *  POST /api/auth/register  注册（用户名重复 → 409 USER_EXISTS）
 *  POST /api/auth/login     登录（密码错误 → 401 AUTH_ERROR）
 *  GET  /api/auth/me        用 token 反查当前用户（强制认证）
 */
import { Router } from 'express'
import { register, login, getUserById } from '../services/userService.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

/** 统一包装：service 返回 { ok, code?, message?, data? } → HTTP 响应 */
function send(res, result) {
  if (result.ok) {
    return res.json({ success: true, code: 'OK', message: '', data: result.data })
  }
  const status = result.code === 'USER_EXISTS' ? 409 : result.code === 'AUTH_ERROR' ? 401 : 400
  return res.status(status).json({ success: false, code: result.code, message: result.message, data: null })
}

/* 注册 */
router.post('/register', async (req, res, next) => {
  try {
    send(res, await register(req.body || {}))
  } catch (e) { next(e) }
})

/* 登录 */
router.post('/login', async (req, res, next) => {
  try {
    send(res, await login(req.body || {}))
  } catch (e) { next(e) }
})

/* 当前登录用户信息（requireAuth：未登录 401） */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await getUserById(req.user.id)
    if (!user) {
      return res.status(401).json({ success: false, code: 'AUTH_ERROR', message: '账号不存在', data: null })
    }
    res.json({ success: true, code: 'OK', message: '', data: { user } })
  } catch (e) { next(e) }
})

export default router

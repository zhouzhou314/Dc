/**
 * 用户服务：注册 / 登录业务逻辑
 * -------------------------------------------------
 *  - 密码用 bcryptjs 哈希存储（纯 JS 实现，Windows 无需编译原生模块）
 *  - 登录成功后用 jsonwebtoken 签发 JWT（7 天有效，见 config.jwt）
 *  - 统一响应结构 { success, code, message, data }
 *
 * 角色体系（V6.0 新增）：
 *  - student：学生（默认），可用游戏、学习、AI 画像全部功能
 *  - teacher：教师，额外可用教师端学情看板
 *  注册 teacher 需要携带 .env 中的 TEACHER_INVITE_CODE 邀请码，
 *  避免学生误选角色导致权限混乱；令牌里只放 uid/username，
 *  角色每次请求现查数据库，撤销权限可即时生效。
 */
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from '../db.js'
import { config } from '../config.js'

/** 用户名/密码基础校验规则 */
const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5]{3,20}$/

/** 合法角色 */
const ROLES = new Set(['student', 'teacher'])

/**
 * 注册新用户
 * @param {{username:string, password:string, displayName?:string, role?:string,
 *          inviteCode?:string, className?:string}} body
 * @returns {{ok:boolean, code?:string, message?:string, data?:object}}
 */
export async function register({ username, password, displayName, role, inviteCode, className }) {
  if (!username || !USERNAME_RE.test(username)) {
    return { ok: false, code: 'PARAM_ERROR', message: '用户名需 3~20 位字母、数字、下划线或中文' }
  }
  if (!password || password.length < 6 || password.length > 32) {
    return { ok: false, code: 'PARAM_ERROR', message: '密码长度需 6~32 位' }
  }

  /* 角色校验：教师必须出示邀请码 */
  const finalRole = ROLES.has(role) ? role : 'student'
  if (finalRole === 'teacher' && String(inviteCode || '') !== config.teacher.inviteCode) {
    return { ok: false, code: 'INVITE_INVALID', message: '教师邀请码不正确，请联系管理员获取' }
  }

  /* 用户名查重 */
  const exists = await query('SELECT id FROM users WHERE username = ?', [username])
  if (exists.length > 0) {
    return { ok: false, code: 'USER_EXISTS', message: '用户名已被注册' }
  }

  /* bcrypt 哈希（cost=10，约几十毫秒，安全与性能均衡） */
  const hash = await bcrypt.hash(password, 10)
  const name = displayName || username
  const result = await query(
    'INSERT INTO users (username, password_hash, display_name, role, class_name) VALUES (?, ?, ?, ?, ?)',
    [username, hash, name, finalRole, className ? String(className).slice(0, 50) : '默认班级']
  )

  return { ok: true, data: issueToken(result.insertId, username, name, finalRole, className) }
}

/**
 * 登录校验
 * @param {{username:string, password:string}} body
 */
export async function login({ username, password }) {
  const rows = await query(
    'SELECT id, username, password_hash, display_name, role, class_name FROM users WHERE username = ?',
    [username]
  )
  if (rows.length === 0) {
    return { ok: false, code: 'AUTH_ERROR', message: '用户名或密码错误' }
  }
  const user = rows[0]
  const match = await bcrypt.compare(password || '', user.password_hash)
  if (!match) {
    return { ok: false, code: 'AUTH_ERROR', message: '用户名或密码错误' }
  }

  return {
    ok: true,
    data: issueToken(user.id, user.username, user.display_name || user.username, user.role || 'student', user.class_name)
  }
}

/**
 * 用 users.id 反查用户信息（/api/auth/me 用）
 */
export async function getUserById(id) {
  const rows = await query(
    'SELECT id, username, display_name, role, class_name, created_at FROM users WHERE id = ?',
    [id]
  )
  return rows[0] || null
}

/**
 * 签发 JWT 并组装前端需要的用户信息
 * payload 里只放 uid（数字 id）与 username，尽量小；角色由后端实时查库
 */
function issueToken(uid, username, displayName, role = 'student', className = null) {
  const token = jwt.sign(
    { uid, username },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresInSeconds }
  )
  return {
    token,
    user: { id: uid, username, displayName, role, className: className || '默认班级' }
  }
}

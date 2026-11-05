/**
 * 认证状态（全局单例 store）
 * -------------------------------------------------
 * 保存 JWT token 与当前用户信息，持久化到 localStorage（key: islm_auth）。
 * 未登录时 isLoggedIn = false，所有学习数据仍走原来的 localStorage 本地模式；
 * 登录后 learning store 会自动把错题本等数据同步到云端 MySQL（多端一致）。
 */
import { reactive } from 'vue'
import { loadLocal, saveLocal, removeLocal } from '@/utils/storage'
import { loginApi, registerApi, fetchMe } from '@/api/auth'

/* 初始状态：从 localStorage 恢复上次登录态 */
const state = reactive({
  token: '',
  user: null, // { id, username, displayName }
  ...loadLocal('auth', {})
})

/* 是否已登录（token 与用户信息齐全才视为有效） */
const isLoggedIn = () => !!(state.token && state.user)

/**
 * 登录：调后端换取 token，成功后本地持久化
 * @returns {{ok:boolean, message?:string}}
 */
async function login(username, password) {
  try {
    const res = await loginApi(username, password)
    state.token = res.data.data.token
    state.user = res.data.data.user
    persist()
    return { ok: true }
  } catch (e) {
    return { ok: false, message: pickErrMsg(e) }
  }
}

/**
 * 注册（成功后自动登录）
 */
async function register(username, password, displayName) {
  try {
    const res = await registerApi(username, password, displayName)
    state.token = res.data.data.token
    state.user = res.data.data.user
    persist()
    return { ok: true }
  } catch (e) {
    return { ok: false, message: pickErrMsg(e) }
  }
}

/**
 * 校验 token 是否仍有效（刷新页面后调一次 /auth/me）
 * 失效则自动退出，避免拿着过期 token 同步数据
 */
async function checkToken() {
  if (!state.token) return
  try {
    const res = await fetchMe()
    state.user = { ...state.user, ...res.data.data.user }
    persist()
  } catch {
    logout()
  }
}

/** 退出登录：清空本地登录态（学习数据保留在本地，不删除） */
function logout() {
  state.token = ''
  state.user = null
  removeLocal('auth')
}

/** 登录态写回 localStorage */
function persist() {
  saveLocal('auth', { token: state.token, user: state.user })
}

/** 从 axios 错误里提取后端 message，兜底通用文案 */
function pickErrMsg(e) {
  return (e.response && e.response.data && e.response.data.message) || '网络异常，请稍后再试'
}

export const authStore = { state, isLoggedIn, login, register, logout, checkToken }

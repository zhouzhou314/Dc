/**
 * 共享 axios 实例（带 JWT 自动附带头）
 * -------------------------------------------------
 * 供 auth / record / review / wrongbook 等新接口层复用：
 *  - baseURL /api，走 Vite 代理同源，免 CORS
 *  - 请求拦截器：已登录时自动带上 Authorization: Bearer <token>
 *    （后端 optionalAuth 中间件据此识别身份，未登录不带头也不报错）
 */
import axios from 'axios'
import { authStore } from '@/store/auth'

const request = axios.create({
  baseURL: '/api',
  timeout: 30000
})

/* 请求拦截：自动附加 token */
request.interceptors.request.use((config) => {
  if (authStore.state.token) {
    config.headers.Authorization = `Bearer ${authStore.state.token}`
  }
  return config
})

export default request

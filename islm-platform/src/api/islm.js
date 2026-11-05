/**
 * IS-LM 仿真平台 API 层
 * -------------------------------------------------
 * 双模式：仿真计算优先请求后端正式接口（/api/islm/simulate、/api/islm/compare，
 * 后端服务见 server/routes/islm.js）；后端不可用或返回异常时自动回落本地
 * calcIslmCurves 纯前端计算，保证"关掉后端前端仍可玩"。历史记录仍存 localStorage。
 */
import axios from 'axios'
import { calcIslmCurves, generateAnalysisNote } from '@/utils/islmCalc'

// 创建 axios 实例（走 Vite 代理 /api → http://localhost:3001，同源免 CORS）
const request = axios.create({
  baseURL: '/api',
  timeout: 15000
})

// 响应拦截器：直接返回响应体 { success, code, message, data }
request.interceptors.response.use(
  res => res.data,
  err => Promise.reject(err)
)

/* ---------- 本地回落实现（离线兜底，与后端同一套纯数学逻辑） ---------- */

function localSimulate(params) {
  const result = calcIslmCurves(params)
  if (!result.valid) {
    return { success: false, message: result.reason, data: result }
  }
  return {
    success: true,
    data: { ...result, note: generateAnalysisNote(params, result) }
  }
}

function localCompare(base, shock) {
  const baseResult = calcIslmCurves(base)
  const shockResult = calcIslmCurves(shock)
  if (!baseResult.valid) return { success: false, message: '基准组：' + baseResult.reason }
  if (!shockResult.valid) return { success: false, message: '冲击后组：' + shockResult.reason }
  return {
    success: true,
    data: { base: baseResult, shock: shockResult, note: generateAnalysisNote(base, baseResult, shockResult) }
  }
}

/**
 * 单情景仿真：先请求后端，异常/业务失败回落本地计算
 * @param {Object} params 仿真参数
 * @returns {Promise<{success:boolean, data:Object}>}
 */
export async function simulate(params) {
  try {
    const res = await request.post('/islm/simulate', params)
    if (res?.success) return res
    return localSimulate(params)
  } catch {
    return localSimulate(params)
  }
}

/**
 * 对比仿真（基准组 vs 冲击后组）：先请求后端，异常/业务失败回落本地计算
 * @param {Object} base 基准组参数
 * @param {Object} shock 冲击后组参数
 * @returns {Promise<{success:boolean, data:Object}>}
 */
export async function compare(base, shock) {
  try {
    const res = await request.post('/islm/compare', { base, shock })
    if (res?.success) return res
    return localCompare(base, shock)
  } catch {
    return localCompare(base, shock)
  }
}

/**
 * 保存仿真记录
 * 正式接口：POST /api/islm/history/save
 * @param {Object} payload { params, result, studentNote }
 */
export async function saveHistory(payload) {
  // ====== 正式环境使用以下真实请求 ======
  // return request.post('/islm/history/save', payload)

  // 前端 mock：返回成功（实际数据由组件维护在内存/localStorage）
  await new Promise(r => setTimeout(r, 200))
  return { success: true, data: { id: Date.now() } }
}

/**
 * 查询历史仿真记录列表
 * 正式接口：GET /api/islm/history/list
 * @param {Object} params { pageNum, pageSize }
 */
export async function fetchHistory(params = { pageNum: 1, pageSize: 100 }) {
  // ====== 正式环境使用以下真实请求 ======
  // return request.get('/islm/history/list', { params })

  // 前端 mock：从 localStorage 读取
  await new Promise(r => setTimeout(r, 200))
  const list = JSON.parse(localStorage.getItem('islm_history') || '[]')
  return { success: true, data: { list, total: list.length } }
}

/**
 * 删除单条历史记录
 * 正式接口：DELETE /api/islm/history/:id
 */
export async function deleteHistory(id) {
  // ====== 正式环境使用以下真实请求 ======
  // return request.delete(`/islm/history/${id}`)

  await new Promise(r => setTimeout(r, 200))
  return { success: true }
}

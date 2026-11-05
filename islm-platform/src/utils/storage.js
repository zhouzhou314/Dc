/**
 * localStorage 封装工具
 * -------------------------------------------------
 * 统一管理浏览器本地存储的读写，带 JSON 序列化与默认值兜底。
 * 所有学习数据（错题本、课程表、待办、学习记录等）都通过这里持久化，
 * 刷新页面后数据不丢失。
 */

const PREFIX = 'islm_' // 键名前缀，避免与其他应用冲突

/**
 * 读取本地存储
 * @param {string} key 键名（不含前缀）
 * @param {*} defaultValue 默认值：键不存在 / 解析失败时返回
 * @returns {*} 解析后的数据或默认值
 */
export function loadLocal(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return defaultValue
    return JSON.parse(raw)
  } catch (e) {
    console.warn('[storage] 读取失败：', key, e)
    return defaultValue
  }
}

/**
 * 写入本地存储（自动 JSON 序列化）
 * @param {string} key 键名（不含前缀）
 * @param {*} value 任意可序列化数据
 */
export function saveLocal(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch (e) {
    console.warn('[storage] 写入失败：', key, e)
  }
}

/**
 * 删除本地存储
 * @param {string} key 键名（不含前缀）
 */
export function removeLocal(key) {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch (e) {
    console.warn('[storage] 删除失败：', key, e)
  }
}

/**
 * 生成今天的日期字符串（YYYY-MM-DD），用于学习日志按天归档
 * @returns {string}
 */
export function todayStr() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * 计算距离目标日期的天数（向上取整）
 * @param {string} dateStr 目标日期 'YYYY-MM-DD'
 * @returns {number} 剩余天数（负数表示已过期）
 */
export function daysUntil(dateStr) {
  const target = new Date(dateStr + 'T00:00:00')
  const now = new Date(todayStr() + 'T00:00:00')
  return Math.round((target - now) / (24 * 3600 * 1000))
}

/** 生成简易唯一 id */
export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

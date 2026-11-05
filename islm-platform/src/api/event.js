/**
 * 学习行为事件上报（前端采集层）
 * -------------------------------------------------
 * 为什么需要攒批：游戏一在播放"六步传导演示"时 2~3 秒内会产生十几次
 * 状态变化，逐条 POST 会把后端打满，也会拖慢动画。
 *
 * 策略：
 *   - reportEvent() 只入队，不等待网络（调用方零阻塞）
 *   - 每 1.5s 或满 20 条自动 flush 一次
 *   - 页面隐藏 / 卸载时同步 flush（用 sendBeacon 兜底，避免丢最后一批）
 *   - 任何失败静默丢弃：事件采集不能影响学生正常使用
 */
import request from './request'
import { getAnonUserId } from '@/utils/identity'

/** 待上报队列 */
const queue = []
/** 定时器句柄 */
let timer = null
/** 是否正在发送（避免并发重复提交同一批） */
let flushing = false

const MAX_BATCH = 20
const FLUSH_DELAY = 1500

/** 真正发送一批事件 */
async function send(batch) {
  try {
    await request.post('/event/batch', { events: batch, hintUserId: getAnonUserId() })
  } catch {
    /* 后端不可用时静默丢弃：学习功能本身不受影响 */
  }
}

/**
 * 立即发送队列中的事件
 * @param {boolean} useBeacon 页面卸载时用 sendBeacon（不保证响应，但能发出去）
 */
export function flushEvents(useBeacon = false) {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (queue.length === 0) return

  const batch = queue.splice(0, MAX_BATCH)
  if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    try {
      const blob = new Blob(
        [JSON.stringify({ events: batch, hintUserId: getAnonUserId() })],
        { type: 'application/json' }
      )
      navigator.sendBeacon('/api/event/batch', blob)
      return
    } catch {
      /* 落回普通请求 */
    }
  }
  if (flushing) {
    /* 已有请求在飞：把这批放回队首，下一轮再发 */
    queue.unshift(...batch)
    return
  }
  flushing = true
  send(batch).finally(() => {
    flushing = false
    if (queue.length > 0) schedule()
  })
}

function schedule() {
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    flushEvents()
  }, FLUSH_DELAY)
}

/**
 * 上报一条行为事件
 * @param {'game1'|'game2'|'learning'|'ai'} source 事件来源
 * @param {string} type 事件类型，如 game1.policy
 * @param {object|null} payload 负载（会被 JSON 序列化）
 * @param {number|null} durationMs 本次行为耗时（可选）
 */
export function reportEvent(source, type, payload = null, durationMs = null) {
  queue.push({ source, type, payload, durationMs })
  if (queue.length >= MAX_BATCH) flushEvents()
  else schedule()
}

/** 安装页面卸载钩子（在 App.vue 挂载时调用一次） */
export function installEventFlusher() {
  if (typeof window === 'undefined') return
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushEvents(true)
  })
  window.addEventListener('pagehide', () => flushEvents(true))
}

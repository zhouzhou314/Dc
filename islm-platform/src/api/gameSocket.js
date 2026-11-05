/**
 * 多人博弈游戏 · WebSocket 客户端封装
 * -------------------------------------------------
 * 与后端 server/ws/gameGateway.js 的协议一一对应：
 *  发送：game:create / game:join / game:pick_role / game:start / game:ready / game:chat / game:decide / game:leave
 *  接收：game:state（房间全量状态）/ game:notice（阶段提示）/ game:error（错误）
 *
 * 设计：单例 + 回调注册（非 Vue store，保持与现有项目"轻 store"风格一致）。
 * 断线自动重连（最多 5 次），重连成功后重新 join 原房间。
 */
import { authStore } from '@/store/auth'
import { genId } from '@/utils/storage'

/* 单例连接状态 */
let ws = null
let anonId = localStorage.getItem('islm_anon_id')
if (!anonId) {
  anonId = genId()
  localStorage.setItem('islm_anon_id', anonId)
}

/**
 * 获取"我的"用户标识（与后端 gameGateway 解析 userId 的口径一致）：
 *  - 登录用户 → 'u_' + users.id
 *  - 匿名用户 → anonId
 * 前端据此在 room.players 里识别自己坐的座位
 */
export function getMyId() {
  if (authStore.state.user && authStore.state.user.id) {
    return `u_${authStore.state.user.id}`
  }
  return anonId
}

/* 回调表 */
const handlers = {
  state: [],   // (view) => {}
  notice: [],  // (notice) => {}
  error: [],   // (message) => {}
  open: [],    // () => {}
  close: []    // (code) => {}
}

/* 重连信息：记录上次所在房间，断线后尝试重新 join */
let lastRoomCode = null
let lastNickname = null
let reconnectTimes = 0

/** 构造 WebSocket 连接地址（携带身份：登录用户带 token，匿名带 anon id） */
function buildUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const params = new URLSearchParams()
  if (authStore.state.token) {
    params.set('token', authStore.state.token)
  } else {
    params.set('anon', anonId)
  }
  return `${proto}://${location.host}/ws?${params.toString()}`
}

/** 连接 / 重连 */
export function connect() {
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return ws
  ws = new WebSocket(buildUrl())

  ws.onopen = () => {
    reconnectTimes = 0
    /* 断线重连成功后，自动回到原房间（后端按 userId 换绑 socket） */
    if (lastRoomCode && lastNickname) {
      send('game:join', { code: lastRoomCode, nickname: lastNickname })
    }
    handlers.open.forEach(fn => fn())
  }

  ws.onmessage = (ev) => {
    let msg
    try { msg = JSON.parse(ev.data) } catch { return }
    if (msg.type === 'game:state') handlers.state.forEach(fn => fn(msg.payload))
    else if (msg.type === 'game:notice') handlers.notice.forEach(fn => fn(msg.payload))
    else if (msg.type === 'game:error') handlers.error.forEach(fn => fn(msg.payload.message || '未知错误'))
  }

  ws.onclose = () => {
    handlers.close.forEach(fn => fn(ws?.code))
    ws = null
    /* 简单自动重连（最多 5 次，间隔递增） */
    if (reconnectTimes < 5 && lastRoomCode) {
      reconnectTimes++
      setTimeout(connect, Math.min(1000 * reconnectTimes, 5000))
    }
  }

  ws.onerror = () => { /* onclose 会跟进处理 */ }
  return ws
}

/** 发送消息（未连接时自动连接） */
export function send(type, payload = {}) {
  if (!ws || ws.readyState !== 1) {
    connect()
    /* 连接未就绪时短暂等待后重发 */
    setTimeout(() => {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type, payload }))
    }, 200)
    return
  }
  ws.send(JSON.stringify({ type, payload }))
}

/** 关闭连接（离开游戏时调用，断开自动重连） */
export function disconnect() {
  reconnectTimes = 5 // 阻止自动重连
  lastRoomCode = null
  if (ws) { try { ws.close() } catch { /* 忽略 */ } }
  ws = null
}

/** 登记房间信息（join/create 成功后调用，供断线重连） */
export function rememberRoom(code, nickname) {
  lastRoomCode = code
  lastNickname = nickname
}

/* ==================== 便捷动作封装 ==================== */

export const gameActions = {
  create(nickname, rounds, aiFill) {
    rememberRoom(null, nickname)
    send('game:create', { nickname, rounds, aiFill })
  },
  join(code, nickname) {
    send('game:join', { code, nickname })
  },
  pickRole(role) { send('game:pick_role', { role }) },
  start() { send('game:start', {}) },
  ready() { send('game:ready', {}) },
  chat(text) { send('game:chat', { text }) },
  decide(changes) { send('game:decide', { changes }) },
  sync() { send('game:sync', {}) },
  leave() { send('game:leave', {}); disconnect() }
}

/* ==================== 回调注册（返回解绑函数） ==================== */

export function onState(fn) { handlers.state.push(fn); return () => { const i = handlers.state.indexOf(fn); if (i >= 0) handlers.state.splice(i, 1) } }
export function onNotice(fn) { handlers.notice.push(fn); return () => { const i = handlers.notice.indexOf(fn); if (i >= 0) handlers.notice.splice(i, 1) } }
export function onError(fn) { handlers.error.push(fn); return () => { const i = handlers.error.indexOf(fn); if (i >= 0) handlers.error.splice(i, 1) } }
export function onOpen(fn) { handlers.open.push(fn); return () => { const i = handlers.open.indexOf(fn); if (i >= 0) handlers.open.splice(i, 1) } }
export function onClose(fn) { handlers.close.push(fn); return () => { const i = handlers.close.indexOf(fn); if (i >= 0) handlers.close.splice(i, 1) } }

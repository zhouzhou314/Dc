/**
 * 多人博弈游戏 · WebSocket 网关
 * -------------------------------------------------
 * 对应需求 4.2 多人同步技术：
 *  - 采用 WebSocket（ws 库）实现长连接，确保 4 人实时同步
 *  - 服务端是唯一权威状态（gameStore），每次变化全量广播 game:state
 *
 * 协议（JSON 消息，统一 { type, payload } 结构）：
 *  客户端 → 服务端：
 *    game:create   { nickname, rounds, aiFill }      创建房间（默认坐政府位）
 *    game:join     { code, nickname }                加入房间 / 断线重连
 *    game:pick_role { role }                          等待阶段换角色
 *    game:start     {}                                开始对局（任何玩家可发起）
 *    game:ready     {}                                协商阶段点击"准备决策"
 *    game:chat      { text }                          公共聊天（协商）
 *    game:decide    { changes }                      提交当前角色决策
 *    game:leave     {}                                主动离开
 *    game:sync      {}                                主动拉取当前房间全量状态（进入房间页/刷新恢复）
 *  服务端 → 客户端：
 *    game:state     { view }                          房间全量状态（高频）
 *    game:notice    { kind, ... }                     阶段切换/事件/结算提示
 *    game:chat      { msg }                           单条聊天增量
 *    game:error     { message }                       错误提示
 */
import { WebSocketServer } from 'ws'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import {
  createRoom, joinRoom, pickRole, startGame, submitDecision,
  markConsultReady, pushChat, playerOffline, findRoom,
  setUpdateListener, publicView
} from '../services/gameStore.js'

/* roomCode -> Set<ws>：房间内的所有连接（含观战位） */
const roomSockets = new Map()
/* ws -> 绑定信息：{ roomCode, userId, nickname, role }（ws.data 上也存一份便于排查） */
function bindingOf(ws) { return ws.data || null }

/** 给单个客户端安全发消息（连接可能已关闭） */
function send(ws, type, payload = {}) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type, payload }))
  }
}

/** 广播房间状态：state 全量 + notice 增量提示 */
function broadcastRoom(room, extra = null) {
  const set = roomSockets.get(room.code)
  if (!set) return
  const view = publicView(room)
  for (const ws of set) {
    send(ws, 'game:state', view)
    if (extra) send(ws, 'game:notice', extra)
  }
}

/* gameStore 状态变化 → 广播（唯一入口，保证所有人同步） */
setUpdateListener(broadcastRoom)

/** 加入房间的连接集合 */
function joinRoomSockets(ws, roomCode) {
  leaveRoomSockets(ws) // 先退出旧房间
  if (!roomSockets.has(roomCode)) roomSockets.set(roomCode, new Set())
  roomSockets.get(roomCode).add(ws)
  ws.data = { ...ws.data, roomCode }
}

/** 从当前房间连接集合移除 */
function leaveRoomSockets(ws) {
  const b = bindingOf(ws)
  if (!b || !b.roomCode) return
  const set = roomSockets.get(b.roomCode)
  if (set) {
    set.delete(ws)
    if (set.size === 0) roomSockets.delete(b.roomCode)
  }
  ws.data = { ...ws.data, roomCode: null }
}

/**
 * 挂载 WebSocket 网关到 HTTP 服务器
 * @param {http.Server} server Express 的 http 实例
 */
export function attachGameGateway(server) {
  const wss = new WebSocketServer({ server, path: '/ws' })

  /* 心跳：30 秒一轮，无响应的连接直接断开（触发掉线保护） */
  const interval = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) { ws.terminate(); continue }
      ws.isAlive = false
      ws.ping()
    }
  }, 30_000)
  wss.on('close', () => clearInterval(interval))

  wss.on('connection', (ws, req) => {
    ws.isAlive = true
    ws.on('pong', () => { ws.isAlive = true })

    /* 身份解析：URL 带 ?token=<JWT>（登录用户）或 ?anon=<本地ID>（匿名） */
    const url = new URL(req.url, 'http://localhost')
    let userId = null
    let nickname = null
    const token = url.searchParams.get('token')
    if (token) {
      try {
        const payload = jwt.verify(token, config.jwt.secret)
        userId = `u_${payload.uid}`
        nickname = payload.username
      } catch { /* token 无效按匿名处理 */ }
    }
    if (!userId) {
      userId = url.searchParams.get('anon') || `guest_${Date.now() % 1e6}`
    }
    ws.data = { userId, nickname }

    /* ---------- 消息分发 ---------- */
    ws.on('message', (raw) => {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch { return send(ws, 'game:error', { message: '消息格式错误' }) }

      const b = bindingOf(ws) || {}
      const player = { userId: b.userId || ws.data.userId, nickname: msg.payload?.nickname || b.nickname || ws.data.nickname }

      try {
      switch (msg.type) {
        /* 创建房间 */
        case 'game:create': {
          const room = createRoom(player, {
            rounds: msg.payload?.rounds,
            aiFill: msg.payload?.aiFill
          })
          joinRoomSockets(ws, room.code)
          ws.data = { ...ws.data, role: 'government' }
          /* 补发：createRoom 内部 emit 时 socket 尚未入房，需在入房后重新广播给自己 */
          broadcastRoom(room)
          send(ws, 'game:notice', { kind: 'created', code: room.code })
          break
        }

        /* 加入房间（或断线重连） */
        case 'game:join': {
          const res = joinRoom(msg.payload?.code, player)
          if (!res.ok) return send(ws, 'game:error', { message: res.message })
          joinRoomSockets(ws, res.room.code)
          ws.data = { ...ws.data, role: res.role }
          /* 补发：joinRoom 内部 emit 时 socket 尚未入房 */
          broadcastRoom(res.room)
          send(ws, 'game:notice', { kind: 'joined', code: res.room.code, role: res.role, rejoin: !!res.rejoin })
          break
        }

        /* 换角色（等待阶段） */
        case 'game:pick_role': {
          const room = findRoom(b.roomCode)
          if (!room) return send(ws, 'game:error', { message: '房间不存在' })
          const res = pickRole(room, player, msg.payload?.role)
          if (!res.ok) return send(ws, 'game:error', { message: res.message })
          ws.data = { ...ws.data, role: msg.payload.role }
          break
        }

        /* 开始对局（房间内任何玩家都可发起） */
        case 'game:start': {
          const room = findRoom(b.roomCode)
          if (!room) return send(ws, 'game:error', { message: '房间不存在' })
          const res = startGame(room)
          if (!res.ok) send(ws, 'game:error', { message: res.message })
          break
        }

        /* 协商阶段：准备决策 */
        case 'game:ready': {
          const room = findRoom(b.roomCode)
          if (!room) return
          const seatRole = myRoleInRoom(room, player.userId)
          if (seatRole) markConsultReady(room, seatRole)
          break
        }

        /* 公共聊天 */
        case 'game:chat': {
          const room = findRoom(b.roomCode)
          if (!room) return
          const seatRole = myRoleInRoom(room, player.userId)
          const seat = seatRole ? room.players[seatRole] : null
          if (seatRole && room.phase !== 'seating') {
            pushChat(room, seatRole, seat?.nickname || player.nickname, msg.payload?.text || '')
          }
          break
        }

        /* 提交决策（只能提交自己座位的角色，且轮到自己） */
        case 'game:decide': {
          const room = findRoom(b.roomCode)
          if (!room) return
          const seatRole = myRoleInRoom(room, player.userId)
          if (!seatRole) return send(ws, 'game:error', { message: '你不在对局中' })
          const res = submitDecision(room, seatRole, msg.payload?.changes || {})
          if (!res.ok) send(ws, 'game:error', { message: res.message })
          break
        }

        /* 主动同步：把当前房间状态单发给请求者（解决"挂载时错过广播"） */
        case 'game:sync': {
          const room = findRoom(b.roomCode)
          if (room) send(ws, 'game:state', publicView(room))
          else send(ws, 'game:error', { message: '房间不存在或已解散' })
          break
        }

        /* 主动离开 */
        case 'game:leave': {
          const room = findRoom(b.roomCode)
          if (room) playerOffline(room, player.userId)
          leaveRoomSockets(ws)
          break
        }

        default:
          send(ws, 'game:error', { message: `未知消息类型：${msg.type}` })
      }
      } catch (e) {
        console.error('[ws] 处理消息异常：', msg.type, e.message)
        send(ws, 'game:error', { message: '服务器处理异常：' + e.message })
      }
    })

    /* 断线：标记离线（对局中走 AI 托管，等待阶段无真人则解散） */
    ws.on('close', () => {
      const b = bindingOf(ws)
      if (b && b.roomCode) {
        const room = findRoom(b.roomCode)
        leaveRoomSockets(ws)
        if (room) playerOffline(room, b.userId)
      }
    })
  })

  console.log('[ws] 多人博弈 WebSocket 网关已挂载：/ws')
  return wss
}

/** 某用户在房间里的座位角色（找不到返回 null） */
function myRoleInRoom(room, userId) {
  for (const [role, seat] of Object.entries(room.players)) {
    if (seat && seat.userId === userId) return role
  }
  return null
}

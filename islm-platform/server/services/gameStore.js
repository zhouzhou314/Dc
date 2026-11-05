/**
 * 多人博弈游戏 · 房间状态机（服务端唯一权威）
 * -------------------------------------------------
 * 对应需求文档"模块二"完整流程：
 *   阶段0 入座分角色 → 阶段1 事件发布 → 阶段2 协商回合 → 阶段3 轮流决策
 *   → 阶段4 系统反馈（自动） → 阶段5 通关判定 + 雷达图 + 博弈报告
 *
 * 同步机制（需求 4.2）：
 *   - "所有人都提交后才计算下一轮"：轮流决策按 政府→央行→企业→消费者，
 *     消费者提交完毕才结算
 *   - 掉线保护：轮到真人超时 60 秒未提交 → AI 托管自动决策
 *   - 每次状态变化全量广播 room_state（状态很小，全量同步最可靠）
 *
 * 房间只存内存（课堂一局 20 分钟，无需持久化运行态）；
 * 终局时把对局报告、决策序列、聊天记录一次性写入 MySQL（供画像/复盘用）。
 */
import {
  BASE_PARAMS, computeMetrics, applyDecision, applyShock,
  computeRadar, computeCurves, judgeVerdict
} from './gameEngine.js'
import { pickInitialEvent, maybeShockEvent, FEEDBACKS } from './gameEvents.js'
import { aiDecide } from './gameAi.js'
import { persistGameResult } from './gamePersist.js'

/* 四个角色固定轮流顺序（新角色体系：政府（含央行） → 银行 → 企业 → 消费者） */
export const TURN_ORDER = ['government', 'bank', 'enterprise', 'consumer']
export const ROLE_NAMES = {
  government: '政府（含央行）', bank: '银行', enterprise: '企业', consumer: '消费者'
}

/* 阶段时长（毫秒）——课堂演示可加快 */
const PHASE_MS = {
  event: 10_000,      // 阶段1 事件发布：停留 10 秒读新闻
  consult: 120_000,   // 阶段2 协商：最长 2 分钟（全员点"准备决策"可提前结束）
  turn: 60_000        // 阶段3 每人决策限时 60 秒
}

/* ==================== 房间存储 ==================== */

const rooms = new Map() // code -> room

/** 生成 4 位不冲突的房间码（去掉易混字符 0/O/1/I） */
function genRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  for (let tries = 0; tries < 100; tries++) {
    let code = ''
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)]
    if (!rooms.has(code)) return code
  }
  return 'R' + Date.now() % 10000
}

/* 状态变化回调：由 WebSocket 网关注册，用于广播 */
let onRoomUpdate = () => { }
export function setUpdateListener(fn) { onRoomUpdate = fn }

/** 通知房间所有人（含触发方自己）状态更新 */
function emit(room, extra = null) {
  onRoomUpdate(room, extra)
}

/* 计时器统一管理，切阶段/销毁时必须清理 */
function clearTimer(room) {
  if (room.timer) { clearTimeout(room.timer); room.timer = null }
}

/* ==================== 房间生命周期 ==================== */

/**
 * 创建房间
 * @param {Object} creator { userId, nickname }
 * @param {Object} opts     { rounds: 2~4, aiFill: boolean }
 */
export function createRoom(creator, opts = {}) {
  const code = genRoomCode()
  const room = {
    code,
    createdAt: Date.now(),
    status: 'waiting',          // waiting / running / finished
    phase: 'seating',           // seating / event / consult / decision / finished
    round: 0,
    totalRounds: Math.min(4, Math.max(2, Number(opts.rounds) || 3)),
    aiFill: !!opts.aiFill,
    players: {},                // role -> { userId, nickname, type: human/ai, online }
    params: null,               // 当前 IS-LM 参数（开局后才有）
    initEvent: null,
    currentEvent: null,         // 本回合黑天鹅事件（可 null）
    metrics: null,
    history: [],                // 每回合结算快照
    chat: [],
    currentTurn: null,
    decisionsThisRound: {},     // role -> changes（结算前不广播，人人只见自己）
    debtTotal: 0,               // 累计新增国债
    verdict: null,
    radar: null,
    timer: null
  }
  rooms.set(code, room)
  /* 创建者默认入座政府 */
  seatPlayer(room, creator, 'government')
  /* AI 补位：空缺角色立即由 AI 入座 */
  if (room.aiFill) fillWithAi(room)
  emit(room)
  return room
}

/** 查找房间（不存在返回 null） */
export function findRoom(code) {
  return rooms.get(String(code || '').toUpperCase()) || null
}

/** AI 补位所有空缺角色 */
function fillWithAi(room) {
  for (const role of TURN_ORDER) {
    if (!room.players[role]) {
      room.players[role] = {
        userId: `ai_${role}`, nickname: `AI·${ROLE_NAMES[role]}`, type: 'ai', online: true
      }
    }
  }
}

/** 玩家入座某个角色槽（等待阶段可用；重复入座=重连换绑） */
function seatPlayer(room, player, role) {
  if (!TURN_ORDER.includes(role)) return { ok: false, message: '角色不存在' }
  const seat = room.players[role]
  /* 重连：同 userId 已在座 → 换绑 socket 在网关层处理，这里只更新昵称 */
  if (seat && seat.userId === player.userId) {
    seat.nickname = player.nickname || seat.nickname
    seat.online = true
    return { ok: true, rebind: true }
  }
  if (seat && seat.type === 'ai' && !seat.locked) {
    /* 覆盖 AI 座位（真人优先） */
    room.players[role] = { userId: player.userId, nickname: player.nickname, type: 'human', online: true }
    return { ok: true }
  }
  if (seat) return { ok: false, message: '该角色已被占用' }
  room.players[role] = { userId: player.userId, nickname: player.nickname, type: 'human', online: true }
  return { ok: true }
}

/** 加入房间（等待阶段） */
export function joinRoom(code, player) {
  const room = findRoom(code)
  if (!room) return { ok: false, message: '房间不存在或已解散' }
  if (room.status !== 'waiting') {
    /* 运行中允许断线重连：同 userId 的座位重新上线 */
    for (const role of TURN_ORDER) {
      const seat = room.players[role]
      if (seat && seat.userId === player.userId) {
        seat.online = true
        emit(room)
        return { ok: true, room, role, rejoin: true }
      }
    }
    return { ok: false, message: '对局进行中，无法加入新玩家' }
  }
  /* 重连/重复加入 */
  for (const role of TURN_ORDER) {
    const seat = room.players[role]
    if (seat && seat.userId === player.userId) {
      seat.online = true
      emit(room)
      return { ok: true, room, role, rejoin: true }
    }
  }
  /* 自动分配空位 */
  for (const role of TURN_ORDER) {
    if (!room.players[role]) {
      seatPlayer(room, player, role)
      emit(room)
      return { ok: true, room, role }
    }
  }
  /* 没空位了：若还有 AI 座位可顶替 */
  for (const role of TURN_ORDER) {
    const seat = room.players[role]
    if (seat && seat.type === 'ai') {
      seatPlayer(room, player, role)
      emit(room)
      return { ok: true, room, role }
    }
  }
  return { ok: false, message: '房间已满（4/4）' }
}

/** 指定角色入座（等待阶段换座位） */
export function pickRole(room, player, role) {
  if (room.status !== 'waiting') return { ok: false, message: '对局已开始，不能换角色' }
  /* 先把自己从旧座位移除 */
  for (const r of TURN_ORDER) {
    const seat = room.players[r]
    if (seat && seat.userId === player.userId && r !== role) delete room.players[r]
  }
  const res = seatPlayer(room, player, role)
  if (room.aiFill) fillWithAi(room)
  emit(room)
  return res
}

/** 玩家离线标记（断线时由网关调用；等待阶段最后一人离开即解散） */
export function playerOffline(room, userId) {
  for (const role of TURN_ORDER) {
    const seat = room.players[role]
    if (seat && seat.userId === userId) seat.online = false
  }
  /* 等待阶段且无任何在线真人 → 延迟解散 */
  if (room.status === 'waiting') {
    const anyHumanOnline = TURN_ORDER.some(r => room.players[r]?.type === 'human' && room.players[r]?.online)
    if (!anyHumanOnline) {
      clearTimer(room)
      rooms.delete(room.code)
    }
  }
  emit(room)
}

/* ==================== 对局流程 ==================== */

/** 全员就绪？（4 个角色都有人且真人都在线） */
function allSeated(room) {
  return TURN_ORDER.every(r => room.players[r])
}

/** 开始游戏（阶段0 → 阶段1）：房间内任何玩家都可发起 */
export function startGame(room) {
  if (room.status !== 'waiting') return { ok: false, message: '对局已开始' }
  if (room.aiFill) fillWithAi(room)
  if (!allSeated(room)) return { ok: false, message: '还有角色空缺，请等待玩家入座或开启AI补位' }

  room.status = 'running'
  room.params = { ...BASE_PARAMS }
  room.initEvent = pickInitialEvent()
  room.round = 1
  room.debtTotal = 0

  enterEventPhase(room, room.initEvent, true)
  return { ok: true }
}

/** 进入事件发布阶段（阶段1）：展示新闻 → 定时进入协商 */
function enterEventPhase(room, event) {
  room.phase = 'event'
  room.currentEvent = event
  if (event && event.shock) {
    room.params = applyShock(room.params, event.shock)
  }
  room.metrics = computeMetrics(room.params)
  emit(room, { kind: 'event', event })

  clearTimer(room)
  room.timer = setTimeout(() => enterConsultPhase(room), PHASE_MS.event)
}

/** 进入协商阶段（阶段2）：全员点"准备决策"或超时 → 进入轮流决策 */
function enterConsultPhase(room) {
  room.phase = 'consult'
  room.consultReady = {} // role -> true
  emit(room, { kind: 'phase', phase: 'consult' })
  clearTimer(room)
  room.timer = setTimeout(() => enterDecisionPhase(room), PHASE_MS.consult)
}

/** 协商阶段点击"准备决策"（真人全点齐立即开始） */
export function markConsultReady(room, role) {
  if (room.phase !== 'consult') return
  room.consultReady[role] = true
  const humansPending = TURN_ORDER.filter(r => {
    const seat = room.players[r]
    return seat?.type === 'human' && seat.online && !room.consultReady[r]
  })
  if (humansPending.length === 0) {
    enterDecisionPhase(room)
  } else {
    emit(room)
  }
}

/** 进入轮流决策阶段（阶段3）：政府 → 央行 → 企业 → 消费者 */
function enterDecisionPhase(room) {
  room.phase = 'decision'
  room.decisionsThisRound = {}
  room.currentTurn = TURN_ORDER[0]
  emit(room, { kind: 'phase', phase: 'decision' })
  scheduleTurn(room)
}

/**
 * 当前回合轮到某角色：
 *  - AI / 掉线玩家 → 1.5 秒后自动托管决策（有"系统在思考"的节奏感）
 *  - 在线真人     → 60 秒决策限时，超时 AI 托管
 */
function scheduleTurn(room) {
  clearTimer(room)
  const role = room.currentTurn
  const seat = room.players[role]
  if (!seat) { advanceTurn(room); return }

  if (seat.type === 'ai' || !seat.online) {
    room.timer = setTimeout(() => autoDecide(room, role), 1500)
  } else {
    room.timer = setTimeout(() => autoDecide(room, role), PHASE_MS.turn)
  }
}

/** AI 托管决策（AI 座位 / 真人超时 / 真人掉线 共用入口） */
function autoDecide(room, role) {
  if (room.phase !== 'decision' || room.currentTurn !== role) return
  const changes = aiDecide(role, room.params, room.metrics)
  submitDecision(room, role, changes, true)
}

/**
 * 提交决策（真人点击 / AI 托管统一走这里）
 * @param {boolean} byAi 是否为 AI 托管提交（用于回放标注）
 */
export function submitDecision(room, role, changes, byAi = false) {
  if (room.phase !== 'decision' || room.currentTurn !== role) {
    return { ok: false, message: '当前不是你的决策回合' }
  }
  /* 政府发债记账：政府购买增量 + 公债发行 视为国债融资（简化口径） */
  if (role === 'government') {
    const dG = Number(changes.dG) || 0
    const dDebt = Number(changes.dDebt) || 0
    if (dG > 0) room.debtTotal += dG
    room.debtTotal += dDebt
  }
  room.decisionsThisRound[role] = { changes, byAi, at: Date.now() }

  /* 前进一步轮次 */
  advanceTurn(room)
  return { ok: true }
}

/** 轮到下一个角色；四人都交齐 → 结算 */
function advanceTurn(room) {
  const idx = TURN_ORDER.indexOf(room.currentTurn)
  if (idx < TURN_ORDER.length - 1) {
    room.currentTurn = TURN_ORDER[idx + 1]
    emit(room, { kind: 'turn', turn: room.currentTurn })
    scheduleTurn(room)
  } else {
    settleRound(room)
  }
}

/** 回合结算（阶段4）：计算新均衡 + 生成三层反馈 + 决定下一回合 */
function settleRound(room) {
  const decisions = {}
  for (const role of TURN_ORDER) {
    decisions[role] = room.decisionsThisRound[role]?.changes || {}
  }

  /* 按决策顺序依次应用（政府→央行→企业→消费者，顺序影响最终参数一致） */
  let params = room.params
  for (const role of TURN_ORDER) {
    params = applyDecision(params, role, decisions[role])
  }
  const metrics = computeMetrics(params)
  room.params = params
  room.metrics = metrics

  /* 生成三层反馈（每角色一张卡：表层/中层/深层按方向取模板） */
  const feedbacks = {}
  for (const role of TURN_ORDER) {
    feedbacks[role] = buildFeedback(role, decisions[role], room)
  }

  room.history.push({
    round: room.round,
    event: room.currentEvent ? { id: room.currentEvent.id, title: room.currentEvent.title } : null,
    decisions,
    params: { ...params },
    metrics: { ...metrics },
    debtTotal: room.debtTotal,
    feedbacks
  })

  /* 判定：是继续下一回合，还是终局 */
  const isFinal = room.round >= room.totalRounds
  const verdict = judgeVerdict(metrics, isFinal)
  emit(room, { kind: 'round_result', round: room.round, metrics, verdict, feedbacks })

  if (isFinal) {
    finishGame(room, verdict)
  } else {
    room.round += 1
    /* 下一回合事件：35% 概率黑天鹅，否则平稳开局直接协商 */
    const shock = maybeShockEvent()
    if (shock) {
      setTimeout(() => enterEventPhase(room, shock), 1500)
    } else {
      room.currentEvent = null
      setTimeout(() => enterConsultPhase(room), 1500)
    }
  }
}

/** 按角色决策方向挑选三层反馈模板（扩张=expand / 紧缩=tighten） */
function buildFeedback(role, changes, room) {
  const fb = FEEDBACKS[role]
  if (!fb) return null
  let expand = true
  if (role === 'government') {
    /* 财政（G+Debt-T+Tr）与货币（MP）合成方向：任一扩张即视为扩张 */
    const fisDir = ((changes.dG || 0) + (changes.dDebt || 0) - (changes.dT || 0) + (changes.dTr || 0))
    const monDir = (changes.dMP || 0)
    expand = (fisDir + monDir) >= 0
  } else if (role === 'bank') {
    /* 信贷方向：信贷+流动性-准备金 */
    expand = ((changes.dCredit || 0) + (changes.dLiquidity || 0) - (changes.dReserve || 0)) >= 0
  } else if (role === 'enterprise') {
    /* 经营方向：投资+雇佣+融资 */
    expand = ((changes.dI0 || 0) + (changes.dLabor || 0) + (changes.dFinance || 0)) >= 0
  } else if (role === 'consumer') {
    /* 消费方向：消费+资产+借贷-储蓄 */
    expand = ((changes.dC0 || 0) + (changes.dAsset || 0) + (changes.dBorrow || 0) - (changes.dSave || 0)) >= 0
  }
  const tpl = expand ? fb.expand : fb.tighten
  const seat = room.players[role]
  return { ...tpl, role, by: seat ? seat.nickname : ROLE_NAMES[role] }
}

/** 终局（阶段5）：判定 + 雷达图 + 报告落库 */
function finishGame(room, verdict) {
  clearTimer(room)
  room.phase = 'finished'
  room.status = 'finished'
  room.currentTurn = null
  room.verdict = verdict
  room.radar = computeRadar(room.history)

  /* 博弈报告（需求：记录对话内容、决策序列、协商过程） */
  room.report = {
    initEvent: { id: room.initEvent.id, title: room.initEvent.title, news: room.initEvent.news },
    events: room.history.map(h => ({ round: h.round, event: h.event })),
    decisions: room.history.map(h => ({ round: h.round, decisions: h.decisions })),
    metricsTrail: room.history.map(h => ({ round: h.round, ...h.metrics })),
    radar: room.radar,
    verdict
  }

  emit(room, { kind: 'finished', verdict, radar: room.radar })

  /* 异步落库（失败不影响玩家看结果） */
  persistGameResult(room).catch(e => {
    console.warn('[game] 对局结果落库失败：', e.message)
  })

  /* 30 分钟后清理内存中的终局房间 */
  setTimeout(() => rooms.delete(room.code), 30 * 60 * 1000)
}

/** 聊天（协商阶段与决策阶段都可以聊），写入后广播 */
export function pushChat(room, role, nickname, text) {
  const msg = { role, nickname, text: String(text).slice(0, 300), ts: Date.now() }
  room.chat.push(msg)
  if (room.chat.length > 200) room.chat.splice(0, room.chat.length - 200)
  emit(room, { kind: 'chat', msg })
  return msg
}

/* ==================== 客户端视图序列化 ==================== */

/**
 * 房间公共视图（广播给所有人）：
 *  - 决策面板是各自本地的，结算前 decisionsThisRound 不下发（人人只见自己的面板）
 *  - chat 全量公开；history（已结算回合）全量公开
 */
export function publicView(room) {
  return {
    code: room.code,
    status: room.status,
    phase: room.phase,
    round: room.round,
    totalRounds: room.totalRounds,
    aiFill: room.aiFill,
    players: room.players,
    initEvent: room.initEvent,
    currentEvent: room.currentEvent,
    metrics: room.metrics,
    params: room.params ? { ...room.params } : null,
    curves: room.params ? computeCurves(room.params) : null,
    history: room.history,
    chat: room.chat,
    currentTurn: room.currentTurn,
    consultReady: room.consultReady || {},
    debtTotal: room.debtTotal,
    verdict: room.verdict,
    radar: room.radar,
    report: room.report
  }
}

/** 列出等待中的房间（大厅展示用，可选） */
export function listWaitingRooms() {
  return [...rooms.values()]
    .filter(r => r.status === 'waiting')
    .map(r => ({
      code: r.code,
      players: Object.values(r.players).length,
      aiFill: r.aiFill,
      createdAt: r.createdAt
    }))
}

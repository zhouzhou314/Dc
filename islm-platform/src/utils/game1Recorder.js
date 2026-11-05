/**
 * 游戏一会话记录器
 * -------------------------------------------------
 * Game1View 通过 `emit('event', { type, payload })` 把内核事件抛给外层，
 * 本模块负责在内存里累计一局的统计量，并在 `game1.finish` 时组装成
 * 后端 `POST /api/game1/session` 需要的终局快照。
 *
 * 为什么要单独一层：
 *   1. 事件流（learning_event）负责"过程"，会话快照（game1_session）负责"结果"，
 *      两者字段口径不同，混在组件里会让组件承担业务聚合职责；
 *   2. 累计逻辑可单测、可在教师端复用时直接调用。
 */

/**
 * 创建一个会话记录器
 * @returns {{handle:(type:string, payload:object)=>(object|null), snapshot:()=>object}}
 */
export function createGame1Recorder() {
  /** 当前这局的累计状态 */
  const acc = {
    mode: null,
    startedAt: null,
    policyCount: 0,
    policyCategories: new Set(),
    quizTotal: 0,
    quizCorrect: 0,
    quarters: 0,
    lastKpi: null
  }

  /** 重置（开始新的一局时） */
  function reset() {
    acc.mode = null
    acc.startedAt = null
    acc.policyCount = 0
    acc.policyCategories = new Set()
    acc.quizTotal = 0
    acc.quizCorrect = 0
    acc.quarters = 0
    acc.lastKpi = null
  }

  /**
   * 处理一条内核事件
   * @param {string} type 事件类型
   * @param {object} payload 事件负载
   * @returns {object|null} 若本事件触发结算，返回可上报的会话快照；否则 null
   */
  function handle(type, payload = {}) {
    switch (type) {
      case 'game1.start':
        reset()
        acc.mode = payload.mode === 'sandbox' ? 'sandbox' : 'learn'
        acc.startedAt = new Date().toISOString()
        return null

      case 'game1.policy':
        acc.policyCount += 1
        if (payload.category) acc.policyCategories.add(payload.category)
        return null

      case 'game1.quiz':
        acc.quizTotal += 1
        if (payload.correct) acc.quizCorrect += 1
        return null

      case 'game1.quarter':
        acc.quarters = Math.max(acc.quarters, Number(payload.quarter) || 0)
        if (payload.kpi) acc.lastKpi = payload.kpi
        return null

      case 'game1.finish':
        return buildSession(payload)

      default:
        return null
    }
  }

  /** 组装终局快照（字段与后端 game1.js 对齐） */
  function buildSession(payload = {}) {
    const session = {
      mode: payload.mode || acc.mode || 'learn',
      quarters: Number(payload.quarters) || acc.quarters || 0,
      totalScore: payload.totalScore ?? null,
      radar: payload.radar || null,
      kpiSeries: payload.kpiSeries || null,
      achievements: payload.achievements || [],
      policyCount: acc.policyCount,
      quizCorrect: acc.quizCorrect,
      quizTotal: acc.quizTotal,
      policyCategories: [...acc.policyCategories],
      startedAt: acc.startedAt
    }
    reset()
    return session
  }

  /** 只读快照（调试/教师端查看进行中的局面用） */
  function snapshot() {
    return {
      mode: acc.mode,
      quarters: acc.quarters,
      policyCount: acc.policyCount,
      quizTotal: acc.quizTotal,
      quizCorrect: acc.quizCorrect,
      policyCategories: [...acc.policyCategories],
      lastKpi: acc.lastKpi
    }
  }

  return { handle, snapshot }
}

/**
 * 组装上报给 /api/game1/session 的负载
 * （补上昵称，方便教师端在未登录场景下也能辨认是谁打的这一局）
 * @param {object} session createGame1Recorder 产出的快照
 * @param {string} nickname 学生昵称
 */
export function withNickname(session, nickname) {
  return { ...session, nickname: nickname || null }
}

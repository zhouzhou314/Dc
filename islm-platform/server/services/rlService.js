/**
 * 强化学习推荐服务（DQN 落地层）
 * ================================================================
 * 把 DQN 智能体接到真实业务上，完成四件事：
 *
 *   1. 状态编码   collectSignals → encodeState → 16 维向量
 *   2. 动作选择   25 个知识节点（知识图谱）中选一个
 *   3. 奖励回收   学生真的做了题 → 用 BKT 掌握度增量 + 对错构造 reward
 *   4. 离线训练   定时/按需从 rl_transition 表回放训练，权重存 rl_model
 *
 * 冷启动策略（工程上必须处理）：
 *   模型没有足够训练步数（< MIN_TRAIN_STEPS）时，用"知识图谱学习前沿 + 掌握度最低"
 *   的启发式规则选节点，但仍然照常记录转移，让模型边用边学（behavior policy 数据）。
 *
 * 奖励函数（可在答辩中逐项解释）：
 *   reward = 3.0 × ΔpKnown            // 掌握度真实提升，主信号
 *          + 0.6 / −0.4（对/错）      // 单题结果，即时反馈
 *          + 0.1 × (难度 − 2)         // 挑战性加成：难题做对有额外收益
 *   裁剪到 [−2, 3]，避免异常样本把 Q 值拉爆。
 */
import { query, safeQuery } from '../db.js'
import { DQNAgent } from '../ml/dqn.js'
import { STATE_DIM, encodeState } from '../ml/encoder.js'
import { knowledgeNodes, nodeMap, nodeIndex, nodeOfQuestion, frontierNodes, topoOrder } from '../knowledge/graph.js'
import { collectSignals } from './profileService.js'
import { getNodeMasteryMap } from './nodeMasteryService.js'

/** 模型标识（换结构时改版本号，避免加载到维度不符的旧权重） */
const MODEL_NAME = 'islm-dqn-v1'
/** 动作维度 = 知识节点数，必须与图保持一致 */
const ACTION_DIM = knowledgeNodes.length
/** 训练步数低于该值时走启发式（冷启动） */
const MIN_TRAIN_STEPS = 30
/** 每训练多少次保存一次权重 */
const SAVE_EVERY = 10
/** 回收转移的时间窗：超过 6 小时的推荐不再与作答配对 */
const MATCH_WINDOW_HOURS = 6

/** 进程内单例智能体（懒加载，避免每次请求反序列化权重） */
let _agent = null
let _loading = null
let _lastSavedStep = 0

/* ================================================================
 * 一、模型加载 / 保存
 * ================================================================ */

/** 创建全新智能体 */
function createAgent() {
  return new DQNAgent({
    stateDim: STATE_DIM,
    actionDim: ACTION_DIM,
    hidden: [64, 64],
    /* 教学场景样本量小（几十到几百条），学习率取 1e-3 比 5e-3 更稳，
     * 配合 Huber 损失与 TD 目标裁剪，避免小样本上反复回放导致 Q 值发散 */
    learningRate: 1e-3,
    gamma: 0.9,
    epsilon: 0.2,
    epsilonMin: 0.05,
    epsilonDecay: 0.995,
    batchSize: 32,
    targetSyncEvery: 50,
    capacity: 3000
  })
}

/** 从 rl_model 表加载权重（不存在则新建） */
async function loadAgent() {
  if (_agent) return _agent
  if (_loading) return _loading
  _loading = (async () => {
    const rows = await safeQuery('SELECT weights, train_steps FROM rl_model WHERE model_name = ?', [MODEL_NAME])
    if (rows.length > 0) {
      try {
        const data = JSON.parse(rows[0].weights)
        if (data.stateDim !== STATE_DIM || data.actionDim !== ACTION_DIM) {
          console.warn('[rl] 存档维度与当前图谱不一致，已重新初始化模型')
          _agent = createAgent()
        } else {
          _agent = DQNAgent.fromJSON(data)
          _lastSavedStep = Number(rows[0].train_steps) || 0
          console.log(`[rl] 已加载 DQN 模型：训练步数 ${_agent.trainSteps}，探索率 ${_agent.epsilon.toFixed(3)}`)
        }
      } catch (e) {
        console.warn('[rl] 模型存档解析失败，已重新初始化：', e.message)
        _agent = createAgent()
      }
    } else {
      _agent = createAgent()
      console.log('[rl] 未找到模型存档，已初始化全新 DQN（冷启动走启发式推荐）')
    }
    _loading = null
    return _agent
  })()
  return _loading
}

/** 保存权重到 rl_model（覆盖式） */
export async function saveModel() {
  const agent = await loadAgent()
  const data = agent.toJSON()
  /* 只持久化最近 1200 条经验，控制单行体积（LONGTEXT 上限远高于此） */
  data.buffer = data.buffer.slice(-1200)
  const meta = {
    hidden: [64, 64],
    stateDim: STATE_DIM,
    actionDim: ACTION_DIM,
    graphNodes: ACTION_DIM,
    savedAt: new Date().toISOString()
  }
  await query(
    `INSERT INTO rl_model (model_name, state_dim, action_dim, weights, train_steps, avg_reward, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       weights = VALUES(weights), train_steps = VALUES(train_steps),
       avg_reward = VALUES(avg_reward), meta = VALUES(meta)`,
    [MODEL_NAME, STATE_DIM, ACTION_DIM, JSON.stringify(data), agent.trainSteps, null, JSON.stringify(meta)]
  )
  _lastSavedStep = agent.trainSteps
}

/* ================================================================
 * 二、推荐（动作选择）
 * ================================================================ */

/**
 * 生成推荐理由（把 Q 值与节点信息翻译成人话）
 */
function buildReason({ node, q, top, isHeuristic }) {
  if (isHeuristic) {
    return `当前最该补的是「${node.name}」（${node.topic}），它的先修节点你已基本具备，属于最近发展区。`
  }
  const runnerUp = top[1]
  const base = `策略网络在 25 个知识节点中选择了「${node.name}」，预期收益 Q=${q.toFixed(3)}`
  return runnerUp
    ? `${base}，高于次优节点「${nodeMap.get(runnerUp.nodeId)?.name || runnerUp.nodeId}」的 ${runnerUp.q.toFixed(3)}。`
    : `${base}。`
}

/**
 * 选择一个知识节点作为下一步学习目标
 * @param {string} userId
 * @param {{record?:boolean, explore?:boolean}} options record=true 时写入 rl_transition 供事后回收奖励
 */
export async function recommend(userId, { record = true, explore = false } = {}) {
  const agent = await loadAgent()
  const signals = await collectSignals(userId)
  const state = encodeState(signals)
  const nodeMastery = await getNodeMasteryMap(userId)

  const coldStart = agent.trainSteps < MIN_TRAIN_STEPS
  let action
  let qValues
  let source

  if (coldStart) {
    /* 冷启动：用图谱前沿启发式，但动作仍是合法的知识节点下标 */
    const frontier = frontierNodes(nodeMastery, 0.6, 6)
    const pool = frontier.length > 0 ? frontier : topoOrder().slice(0, 6)
    const chosenId = pool[0]
    action = nodeIndex.get(chosenId)
    qValues = agent.qValues(state)
    source = 'heuristic'
  } else {
    const res = agent.act(state, explore)
    action = res.action
    qValues = res.q
    source = 'rl'
  }

  const node = knowledgeNodes[action]
  /* Q 值前 3 名（前端展示"策略在几个候选上的估值"） */
  const top = qValues
    .map((q, i) => ({ nodeId: knowledgeNodes[i].id, q }))
    .sort((a, b) => b.q - a.q)
    .slice(0, 3)

  const reason = buildReason({ node, q: qValues[action], top, isHeuristic: source === 'heuristic' })

  let transitionId = null
  if (record) {
    const result = await query(
      `INSERT INTO rl_transition (user_id, state, action, node_id) VALUES (?, ?, ?, ?)`,
      [userId, JSON.stringify(state.map((v) => Math.round(v * 10000) / 10000)), action, node.id]
    )
    transitionId = result.insertId
  }

  return {
    transitionId,
    action,
    source,
    node: {
      id: node.id,
      name: node.name,
      topic: node.topic,
      section: node.section,
      difficulty: node.difficulty,
      summary: node.summary,
      formula: node.formula,
      questionIds: node.questionIds
    },
    q: Math.round(qValues[action] * 1000) / 1000,
    top: top.map((t) => ({ ...t, q: Math.round(t.q * 1000) / 1000 })),
    reason,
    state,
    epsilon: agent.epsilon,
    trainSteps: agent.trainSteps
  }
}

/* ================================================================
 * 三、奖励回收（把真实作答变成训练样本）
 * ================================================================ */

/**
 * 作答前：记录决策时刻的状态（用于构造 (s, a, r, s') 中的 s）
 * @param {string} userId
 * @param {number} questionId
 * @returns {Promise<{state:number[]|null, nodeId:string|null, pending:object|null}>}
 */
export async function prepareAnswer(userId, questionId) {
  const nodeId = nodeOfQuestion(questionId)
  if (!nodeId) return { state: null, nodeId: null, pending: null }

  const signals = await collectSignals(userId)
  const state = encodeState(signals)

  /* 找该学生最近一条"尚未回收奖励"的推荐；若推荐的正是本题节点则形成完整转移 */
  const pendingRows = await safeQuery(
    `SELECT id, node_id, action, state FROM rl_transition
      WHERE user_id = ? AND reward IS NULL
        AND created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
      ORDER BY id DESC LIMIT 1`,
    [userId, MATCH_WINDOW_HOURS]
  )
  const pending = pendingRows[0] || null
  return { state, nodeId, pending }
}

/**
 * 奖励函数（独立导出，训练脚本与线上回收共用同一口径）
 *   reward = 3.0 × ΔpKnown + 对错奖惩 + 难度加成，裁剪到 [-2, 3]
 * @param {{prevPKnown:number, pKnown:number, isCorrect:boolean, difficulty:string}} rec
 * @returns {number}
 */
export function computeReward({ prevPKnown, pKnown, isCorrect, difficulty }) {
  const delta = Number(pKnown) - Number(prevPKnown || 0.15)
  const diffLevel = difficulty === 'hard' ? 3 : difficulty === 'easy' ? 1 : 2
  let reward = 3.0 * delta + (isCorrect ? 0.6 : -0.4) + 0.1 * (diffLevel - 2)
  reward = Math.max(-2, Math.min(3, reward))
  return Math.round(reward * 10000) / 10000
}

/**
 * 作答后：计算奖励并落库，同时把样本推入回放缓冲区
 * @param {object} rec
 * @param {string} rec.userId
 * @param {string} rec.nodeId 题目映射到的知识节点
 * @param {boolean} rec.isCorrect 是否答对
 * @param {string} rec.difficulty easy/medium/hard
 * @param {number} rec.prevPKnown 作答前节点掌握概率
 * @param {number} rec.pKnown 作答后节点掌握概率
 * @param {number[]|null} rec.stateBefore 作答前状态向量
 */
export async function settleAnswer({ userId, nodeId, isCorrect, difficulty, prevPKnown, pKnown, stateBefore }) {
  if (!nodeId) return null
  const agent = await loadAgent()

  const reward = computeReward({ prevPKnown, pKnown, isCorrect, difficulty })

  /* 状态 s'：作答后的最新状态（再算一次，包含本次变化的掌握度） */
  const signalsAfter = await collectSignals(userId)
  const stateAfter = encodeState(signalsAfter)

  if (!stateBefore) {
    /* 没有决策前状态（学生自主练习而非接受推荐）时，用 s' 近似 s，
     * 属 off-policy 数据的常规处理，仅用于扩充样本、不用于评估策略 */
    stateBefore = stateAfter
  }

  /* 1. 优先填补已有推荐记录 */
  const pendingRows = await safeQuery(
    `SELECT id, node_id FROM rl_transition
      WHERE user_id = ? AND reward IS NULL
        AND created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
      ORDER BY id DESC LIMIT 1`,
    [userId, MATCH_WINDOW_HOURS]
  )
  let filled = false
  if (pendingRows.length > 0) {
    const row = pendingRows[0]
    /* 推荐节点与本题节点一致才配对；不一致则把推荐样本按"未观测"丢弃 */
    if (row.node_id === nodeId) {
      await query(
        `UPDATE rl_transition SET reward = ?, next_state = ?, filled_at = NOW() WHERE id = ?`,
        [reward, JSON.stringify(stateAfter.map((v) => Math.round(v * 10000) / 10000)), row.id]
      )
      filled = true
    } else {
      await query(
        `UPDATE rl_transition SET reward = ?, next_state = ?, done = 1, filled_at = NOW() WHERE id = ?`,
        [0, JSON.stringify(stateAfter.map((v) => Math.round(v * 10000) / 10000)), row.id]
      )
    }
  }

  /* 2. 未配对则新建一条完整转移（学生自主练习产生样本） */
  if (!filled) {
    await query(
      `INSERT INTO rl_transition (user_id, state, action, node_id, reward, next_state, filled_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        userId,
        JSON.stringify(stateBefore.map((v) => Math.round(v * 10000) / 10000)),
        nodeIndex.get(nodeId) ?? 0,
        nodeId,
        reward,
        JSON.stringify(stateAfter.map((v) => Math.round(v * 10000) / 10000))
      ]
    )
  }

  /* 3. 进入回放缓冲区并训练若干步（每次作答轻量训练 2 步，避免阻塞请求） */
  agent.remember({ s: stateBefore, a: nodeIndex.get(nodeId) ?? 0, r: reward, s2: stateAfter, done: false })
  let loss = 0
  for (let i = 0; i < 2; i++) loss = agent.trainStep()

  /* 4. 周期性保存 */
  if (agent.trainSteps - _lastSavedStep >= SAVE_EVERY) {
    saveModel().catch((e) => console.warn('[rl] 模型保存失败：', e.message))
  }

  return { reward, loss: Math.round(loss * 10000) / 10000, trainSteps: agent.trainSteps }
}

/* ================================================================
 * 四、离线训练与监控
 * ================================================================ */

/**
 * 用历史转移做批量回放训练（管理端/定时任务调用）
 * @param {number} steps 训练步数
 * @param {string|null} userId 只训练某个学生（null = 全部）
 */
export async function trainFromHistory(steps = 200, userId = null) {
  const agent = await loadAgent()
  const rows = userId
    ? await safeQuery(
      `SELECT state, action, reward, next_state FROM rl_transition
        WHERE user_id = ? AND reward IS NOT NULL ORDER BY id DESC LIMIT 2000`,
      [userId]
    )
    : await safeQuery(
      `SELECT state, action, reward, next_state FROM rl_transition
        WHERE reward IS NOT NULL ORDER BY id DESC LIMIT 3000`
    )

  let loaded = 0
  for (const r of rows) {
    try {
      /* mysql2 会把 JSON 列直接解析成对象，个别配置下是字符串，两种都要兼容 */
      const s = typeof r.state === 'string' ? JSON.parse(r.state) : r.state
      const s2 = r.next_state
        ? (typeof r.next_state === 'string' ? JSON.parse(r.next_state) : r.next_state)
        : s
      if (!Array.isArray(s) || s.length !== STATE_DIM) continue
      if (!Array.isArray(s2) || s2.length !== STATE_DIM) continue
      agent.remember({ s, a: Number(r.action), r: Number(r.reward), s2, done: false })
      loaded += 1
    } catch {
      /* 单条脏数据跳过 */
    }
  }

  let loss = 0
  for (let i = 0; i < steps; i++) loss = agent.trainStep()
  await saveModel()

  return {
    loaded,
    steps,
    trainSteps: agent.trainSteps,
    loss: Math.round(loss * 10000) / 10000,
    epsilon: Math.round(agent.epsilon * 1000) / 1000
  }
}

/** 模型与训练数据概况（前端"AI 引擎状态"卡片） */
export async function modelStatus() {
  const agent = await loadAgent()
  const rows = await safeQuery(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(reward IS NOT NULL), 0) AS filled,
            AVG(reward) AS avgReward
       FROM rl_transition`
  )
  const r = rows[0] || {}
  return {
    modelName: MODEL_NAME,
    stateDim: STATE_DIM,
    actionDim: ACTION_DIM,
    trainSteps: agent.trainSteps,
    epsilon: Math.round(agent.epsilon * 1000) / 1000,
    lastLoss: Math.round(agent.lastLoss * 10000) / 10000,
    bufferSize: agent.buffer.size,
    transitions: Number(r.total) || 0,
    filledTransitions: Number(r.filled) || 0,
    avgReward: r.avgReward === null || r.avgReward === undefined ? null : Math.round(Number(r.avgReward) * 1000) / 1000,
    coldStart: agent.trainSteps < MIN_TRAIN_STEPS,
    epsilonGreedy: 'ε 随训练衰减，服务时纯利用'
  }
}

/**
 * DQN 深度 Q 网络智能体（Deep Q-Network）
 * ================================================================
 * 用在哪里：把"给某个学生推荐下一个知识节点"建模为强化学习问题。
 *
 *   智能体 Agent      = 教学推荐策略
 *   状态   state      = 学生当前画像向量（知识点掌握、正确率、提示依赖、游戏表现…）
 *   动作   action     = 从知识图谱的 25 个节点中选一个作为"下一步学习目标"
 *   奖励   reward     = 学习该节点后的收益（掌握度提升 + 答对 + 保持活跃，见 rlService）
 *   目标   Q(s,a)     = 在状态 s 下选动作 a 的长期期望收益
 *
 * 关键工程点（均可在答辩中解释）：
 *   1. 经验回放（Replay Buffer）：把 (s,a,r,s') 存进环形缓冲区，训练时随机抽样，
 *      打破"连续推荐"带来的强相关性，避免网络在最近几条样本上过拟合；
 *   2. 目标网络（Target Network）：用一份延迟同步的副本计算 TD 目标
 *      y = r + γ·max Q_target(s',·)，抑制自举（bootstrapping）导致的 Q 值发散；
 *   3. ε-贪心探索：训练时以 ε 概率随机探索，ε 线性衰减；
 *      线上服务时 ε=0（纯利用），但保留"最小探索率"防止完全固化；
 *   4. Huber 损失（smooth L1）：对异常奖励更稳健，梯度在 |δ|>1 时截断。
 */

import { MLP, argmax } from './neuralNet.js'

/** 经验回放缓冲区（固定容量，满了覆盖最旧样本） */
export class ReplayBuffer {
  constructor(capacity = 5000, stateDim = 0, actionDim = 0) {
    this.capacity = capacity
    this.stateDim = stateDim
    this.actionDim = actionDim
    this.items = []
    this.cursor = 0
  }

  get size() {
    return this.items.length
  }

  /**
   * 存入一条转移
   * @param {{s:number[], a:number, r:number, s2:number[], done:boolean}} t
   */
  push(t) {
    if (t.s.length !== this.stateDim) {
      throw new Error(`状态维度不符：期望 ${this.stateDim}，实际 ${t.s.length}`)
    }
    if (t.a < 0 || t.a >= this.actionDim) {
      throw new Error(`动作越界：${t.a}（动作空间 ${this.actionDim}）`)
    }
    const item = { s: t.s, a: t.a, r: t.r, s2: t.s2, done: !!t.done }
    if (this.items.length < this.capacity) {
      this.items.push(item)
    } else {
      this.items[this.cursor] = item
      this.cursor = (this.cursor + 1) % this.capacity
    }
  }

  /** 随机抽一批（不足 batchSize 时有多少抽多少） */
  sample(batchSize) {
    const n = Math.min(batchSize, this.items.length)
    const out = []
    const used = new Set()
    while (out.length < n) {
      const idx = Math.floor(Math.random() * this.items.length)
      if (used.has(idx)) continue
      used.add(idx)
      out.push(this.items[idx])
    }
    return out
  }

  /** 导出为普通数组（落库持久化用） */
  toJSON() {
    return this.items.map((t) => ({
      s: Array.from(t.s).map((v) => round4(v)),
      a: t.a,
      r: round4(t.r),
      s2: Array.from(t.s2).map((v) => round4(v)),
      done: t.done
    }))
  }
}

/** 保留 4 位小数，压缩存储体积 */
function round4(v) {
  return Math.round(v * 10000) / 10000
}

/** DQN 智能体 */
export class DQNAgent {
  /**
   * @param {object} opts
   * @param {number} opts.stateDim 状态维度
   * @param {number} opts.actionDim 动作维度
   * @param {number[]} [opts.hidden] 隐层结构
   * @param {number} [opts.learningRate] 学习率
   * @param {number} [opts.gamma] 折扣因子
   * @param {number} [opts.epsilon] 当前探索率
   * @param {number} [opts.epsilonMin] 最小探索率
   * @param {number} [opts.epsilonDecay] 每次训练后的衰减系数
   * @param {number} [opts.batchSize] 批大小
   * @param {number} [opts.targetSyncEvery] 目标网络同步间隔（训练步数）
   * @param {number} [opts.capacity] 回放容量
   * @param {number} [opts.seed] 随机种子
   */
  constructor({
    stateDim,
    actionDim,
    hidden = [64, 64],
    learningRate = 5e-3,
    gamma = 0.9,
    epsilon = 0.2,
    epsilonMin = 0.05,
    epsilonDecay = 0.995,
    batchSize = 32,
    targetSyncEvery = 50,
    capacity = 5000,
    seed = 20260101
  }) {
    this.stateDim = stateDim
    this.actionDim = actionDim
    this.gamma = gamma
    this.epsilon = epsilon
    this.epsilonMin = epsilonMin
    this.epsilonDecay = epsilonDecay
    this.batchSize = batchSize
    this.targetSyncEvery = targetSyncEvery

    /* 在线网络（学习）与目标网络（估值），结构一致、参数独立 */
    const sizes = [stateDim, ...hidden, actionDim]
    this.online = new MLP(sizes, { learningRate, seed })
    this.target = MLP.fromJSON(this.online.toJSON())

    this.buffer = new ReplayBuffer(capacity, stateDim, actionDim)
    this.trainSteps = 0
    this.lastLoss = 0
  }

  /**
   * 选动作：训练模式走 ε-贪心，服务模式（explore=false）走纯贪心
   * @param {number[]} state
   * @param {boolean} explore
   * @returns {{action:number, q:number[], epsilon:number}}
   */
  act(state, explore = false) {
    const q = Array.from(this.online.predict(state))
    const eps = explore ? this.epsilon : 0
    let action
    if (explore && Math.random() < eps) {
      action = Math.floor(Math.random() * this.actionDim)
    } else {
      action = argmax(q)
    }
    return { action, q, epsilon: eps }
  }

  /** 只算 Q 值（前端/接口展示"每个候选节点的预期收益"） */
  qValues(state) {
    return Array.from(this.online.predict(state))
  }

  /** 记一条经验 */
  remember({ s, a, r, s2, done }) {
    this.buffer.push({ s, a, r, s2, done })
  }

  /**
   * 从回放缓冲区采样并训练一步
   * TD 目标：y = r + γ·max_a' Q_target(s', a')（终止状态去掉自举项）
   * 损失：Huber( Q_online(s,a) − y )
   * @returns {number} 本步平均损失（样本不足返回 0）
   */
  trainStep() {
    if (this.buffer.size < Math.min(this.batchSize, 8)) return 0
    const batch = this.buffer.sample(this.batchSize)
    let lossSum = 0

    for (const t of batch) {
      const qOnline = Array.from(this.online.predict(t.s))
      const qNext = Array.from(this.target.predict(t.s2))
      const bootstrap = t.done ? 0 : this.gamma * Math.max(...qNext)
      /* TD 目标裁剪：奖励本身在 [-2,3]，理论 Q 上界约 r/(1−γ)=30，
       * 这里再收紧到 ±10，防止早期自举误差把网络推飞 */
      const tdTarget = Math.max(-10, Math.min(10, t.r + bootstrap))
      const targetQ = qOnline.slice()
      targetQ[t.a] = tdTarget
      lossSum += this.online.trainStepHuber(t.s, targetQ, 1)
    }

    this.trainSteps += 1
    this.lastLoss = lossSum / batch.length

    /* 目标网络延迟同步 */
    if (this.trainSteps % this.targetSyncEvery === 0) this.syncTarget()

    /* ε 衰减到下限为止 */
    this.epsilon = Math.max(this.epsilonMin, this.epsilon * this.epsilonDecay)
    return this.lastLoss
  }

  /** 同步目标网络参数 */
  syncTarget() {
    this.target = MLP.fromJSON(this.online.toJSON())
  }

  /** 序列化（含缓冲区，支持"重启后继续训练"） */
  toJSON() {
    return {
      type: 'DQN',
      stateDim: this.stateDim,
      actionDim: this.actionDim,
      gamma: this.gamma,
      epsilon: this.epsilon,
      epsilonMin: this.epsilonMin,
      epsilonDecay: this.epsilonDecay,
      batchSize: this.batchSize,
      targetSyncEvery: this.targetSyncEvery,
      trainSteps: this.trainSteps,
      lastLoss: this.lastLoss,
      online: this.online.toJSON(),
      target: this.target.toJSON(),
      buffer: this.buffer.toJSON()
    }
  }

  /** 从序列化数据恢复 */
  static fromJSON(data) {
    const agent = new DQNAgent({
      stateDim: data.stateDim,
      actionDim: data.actionDim,
      gamma: data.gamma,
      epsilon: data.epsilon,
      epsilonMin: data.epsilonMin,
      epsilonDecay: data.epsilonDecay,
      batchSize: data.batchSize,
      targetSyncEvery: data.targetSyncEvery
    })
    agent.online = MLP.fromJSON(data.online)
    agent.target = MLP.fromJSON(data.target)
    agent.trainSteps = data.trainSteps || 0
    agent.lastLoss = data.lastLoss || 0
    /* 恢复回放缓冲区（不校验维度，信任自身写入格式） */
    if (Array.isArray(data.buffer)) {
      for (const t of data.buffer) {
        try {
          agent.buffer.push(t)
        } catch {
          /* 单条脏数据跳过，不影响整体加载 */
        }
      }
    }
    return agent
  }
}

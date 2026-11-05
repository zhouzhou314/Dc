/**
 * 轻量多层感知机（MLP）· 纯 JavaScript 实现（零第三方依赖）
 * ================================================================
 * 为什么自己写而不用 TensorFlow/PyTorch：
 *   本项目要部署在只装了 Node 的教学服务器上，不能引入原生编译依赖；
 *   同时软著申报需要"自研算法代码"，纯 JS 实现便于逐行说明。
 *
 * 网络结构：全连接 + ReLU（隐层）+ 线性输出（价值函数不需要 softmax）
 *   input(dimIn) → hidden[0] → ... → hidden[n-1] → output(dimOut)
 *
 * 训练：均方误差（MSE）+ 反向传播（BP）+ Adam 优化器 + 梯度裁剪
 *   前向：z = W·x + b，a = ReLU(z)
 *   反向：δ_out = (a_out − y)；δ_h = (Wᵀδ) ⊙ 1[z>0]
 *
 * 数值稳定性：权重用 He 初始化（适合 ReLU），学习率默认 5e-3，
 * 梯度按全局范数裁剪到 [-CLIP, CLIP]，避免 DQN 自举发散。
 */

/** 全局梯度裁剪阈值 */
const CLIP = 5

/**
 * 确定性伪随机数生成器（mulberry32）
 * 用固定种子保证"同一份训练数据 → 同一套权重"，便于复现与答辩演示
 */
function createRandom(seed = 20260101) {
  let a = seed >>> 0
  return function random() {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 高斯分布采样（Box-Muller），用于 He 初始化 */
function gaussian(random) {
  let u = 0
  let v = 0
  while (u === 0) u = random()
  while (v === 0) v = random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** ReLU */
const relu = (x) => (x > 0 ? x : 0)

/** 一层全连接参数 */
class Layer {
  /**
   * @param {number} nIn 输入维度
   * @param {number} nOut 输出维度
   * @param {Function} random 随机源
   */
  constructor(nIn, nOut, random) {
    this.nIn = nIn
    this.nOut = nOut
    /* He 初始化：std = sqrt(2/nIn)，适配 ReLU 的方差传播 */
    const std = Math.sqrt(2 / nIn)
    this.W = new Float64Array(nIn * nOut)
    for (let i = 0; i < this.W.length; i++) this.W[i] = gaussian(random) * std
    this.b = new Float64Array(nOut)
    /* Adam 一阶/二阶矩（与参数同形） */
    this.mW = new Float64Array(nIn * nOut)
    this.vW = new Float64Array(nIn * nOut)
    this.mB = new Float64Array(nOut)
    this.vB = new Float64Array(nOut)
    /* 反向传播缓存 */
    this.x = null
    this.z = new Float64Array(nOut)
    this.a = new Float64Array(nOut)
    this.dW = new Float64Array(nIn * nOut)
    this.db = new Float64Array(nOut)
  }

  /** 前向：a = act(Wx + b) */
  forward(x, useRelu) {
    this.x = x
    const { W, b, z, a, nIn, nOut } = this
    for (let o = 0; o < nOut; o++) {
      let sum = b[o]
      const base = o * nIn
      for (let i = 0; i < nIn; i++) sum += W[base + i] * x[i]
      z[o] = sum
      a[o] = useRelu ? relu(sum) : sum
    }
    return a
  }

  /** 反向：给定本层输出梯度 dA，累计 dW/db 并返回输入梯度 dX */
  backward(dA, useRelu) {
    const { W, x, z, dW, db, nIn, nOut } = this
    const dX = new Float64Array(nIn)
    for (let o = 0; o < nOut; o++) {
      /* ReLU 导数：z>0 时 1，否则 0 */
      const d = useRelu && z[o] <= 0 ? 0 : dA[o]
      if (d === 0) continue
      const base = o * nIn
      db[o] += d
      for (let i = 0; i < nIn; i++) {
        dW[base + i] += d * x[i]
        dX[i] += W[base + i] * d
      }
    }
    return dX
  }

  /** Adam 更新（t 为全局步数，从 1 开始） */
  step(lr, t, beta1 = 0.9, beta2 = 0.999, eps = 1e-8) {
    const bc1 = 1 - Math.pow(beta1, t)
    const bc2 = 1 - Math.pow(beta2, t)
    const clipGrad = (g) => Math.max(-CLIP, Math.min(CLIP, g))

    for (let i = 0; i < this.W.length; i++) {
      const g = clipGrad(this.dW[i])
      this.mW[i] = beta1 * this.mW[i] + (1 - beta1) * g
      this.vW[i] = beta2 * this.vW[i] + (1 - beta2) * g * g
      this.W[i] -= lr * (this.mW[i] / bc1) / (Math.sqrt(this.vW[i] / bc2) + eps)
    }
    for (let i = 0; i < this.b.length; i++) {
      const g = clipGrad(this.db[i])
      this.mB[i] = beta1 * this.mB[i] + (1 - beta1) * g
      this.vB[i] = beta2 * this.vB[i] + (1 - beta2) * g * g
      this.b[i] -= lr * (this.mB[i] / bc1) / (Math.sqrt(this.vB[i] / bc2) + eps)
    }
  }

  /** 清空累计梯度（每步训练前调用） */
  zeroGrad() {
    this.dW.fill(0)
    this.db.fill(0)
  }

  /** 序列化为普通数组 */
  toJSON() {
    return {
      nIn: this.nIn,
      nOut: this.nOut,
      W: Array.from(this.W),
      b: Array.from(this.b)
    }
  }

  /** 从普通数组恢复（Adam 矩重置，用于加载已保存模型） */
  static fromJSON(data) {
    const layer = new Layer(data.nIn, data.nOut, createRandom(1))
    layer.W = Float64Array.from(data.W)
    layer.b = Float64Array.from(data.b)
    return layer
  }
}

/** 多层感知机 */
export class MLP {
  /**
   * @param {number[]} sizes 形如 [12, 64, 64, 25]（首项输入维，末项输出维）
   * @param {{learningRate?:number, seed?:number}} options
   */
  constructor(sizes, { learningRate = 5e-3, seed = 20260101 } = {}) {
    if (!Array.isArray(sizes) || sizes.length < 2) {
      throw new Error('MLP 需要至少两层尺寸，例如 [12, 25]')
    }
    const random = createRandom(seed)
    this.sizes = [...sizes]
    this.learningRate = learningRate
    this.layers = []
    for (let i = 0; i < sizes.length - 1; i++) {
      this.layers.push(new Layer(sizes[i], sizes[i + 1], random))
    }
    this.stepCount = 0
    this.lastLoss = 0
  }

  /** 输入维度 */
  get dimIn() {
    return this.sizes[0]
  }

  /** 输出维度 */
  get dimOut() {
    return this.sizes[this.sizes.length - 1]
  }

  /**
   * 前向推理（不保留梯度缓存，可直接对外服务）
   * @param {number[]|Float64Array} input
   * @returns {Float64Array} 输出层激活值
   */
  predict(input) {
    if (input.length !== this.dimIn) {
      throw new Error(`输入维度不符：期望 ${this.dimIn}，实际 ${input.length}`)
    }
    let x = Float64Array.from(input)
    for (let i = 0; i < this.layers.length; i++) {
      const isLast = i === this.layers.length - 1
      x = Float64Array.from(this.layers[i].forward(x, !isLast))
    }
    return x
  }

  /**
   * 单样本训练一步（MSE）
   * @param {number[]|Float64Array} input 输入
   * @param {number[]|Float64Array} target 目标输出（同维）
   * @returns {number} 该样本的 MSE 损失
   */
  trainStep(input, target) {
    return this._trainStep(input, target, 'mse')
  }

  /**
   * 单样本训练一步（Huber / smooth-L1）
   * DQN 用它而不是 MSE：TD 误差偶尔会很大（自举放大），
   * Huber 在 |误差| > δ 时把梯度截成常数，避免 Q 值发散
   * @param {number[]|Float64Array} input
   * @param {number[]|Float64Array} target
   * @param {number} delta Huber 阈值（默认 1）
   * @returns {number} 该样本的 Huber 损失（按输出维平均）
   */
  trainStepHuber(input, target, delta = 1) {
    return this._trainStep(input, target, 'huber', delta)
  }

  /**
   * 训练核心：前向 → 计算损失与输出梯度 → 反向 → Adam 更新
   * @param {'mse'|'huber'} mode
   */
  _trainStep(input, target, mode, delta = 1) {
    const out = this.predict(input)
    let grad = new Float64Array(out.length)
    let loss = 0

    for (let i = 0; i < out.length; i++) {
      const e = out[i] - target[i]
      if (mode === 'huber') {
        /* δ=1：|e|≤1 时 0.5e²，否则 δ(|e|−0.5δ)；梯度为 e 或 sign(e)·δ */
        loss += Math.abs(e) <= delta ? 0.5 * e * e : delta * (Math.abs(e) - 0.5 * delta)
        grad[i] = Math.max(-delta, Math.min(delta, e))
      } else {
        loss += e * e
        grad[i] = e
      }
    }
    this.lastLoss = loss / out.length

    /* 逐层反向 */
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const isLast = i === this.layers.length - 1
      grad = this.layers[i].backward(grad, !isLast)
    }

    /* 参数更新 */
    this.stepCount += 1
    for (const layer of this.layers) {
      layer.step(this.learningRate, this.stepCount)
      layer.zeroGrad()
    }
    return this.lastLoss
  }

  /**
   * 批量训练（按样本平均梯度不可行于本实现，采用逐样本更新，随机打乱）
   * @param {Array<{x:number[], y:number[]}>} samples
   * @param {number} epochs
   * @returns {{avgLoss:number, steps:number}}
   */
  fit(samples, epochs = 1) {
    if (!samples.length) return { avgLoss: 0, steps: 0 }
    const order = samples.map((_, i) => i)
    let lossSum = 0
    let steps = 0
    for (let e = 0; e < epochs; e++) {
      /* Fisher-Yates 打乱，降低样本顺序带来的相关性 */
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[order[i], order[j]] = [order[j], order[i]]
      }
      for (const idx of order) {
        const { x, y } = samples[idx]
        lossSum += this.trainStep(x, y)
        steps += 1
      }
    }
    return { avgLoss: lossSum / steps, steps }
  }

  /** 序列化：只存权重与超参，可 JSON 化后入库 */
  toJSON() {
    return {
      type: 'MLP',
      sizes: this.sizes,
      learningRate: this.learningRate,
      stepCount: this.stepCount,
      layers: this.layers.map((l) => l.toJSON())
    }
  }

  /** 反序列化 */
  static fromJSON(data) {
    const net = new MLP(data.sizes, { learningRate: data.learningRate })
    net.layers = data.layers.map((l) => Layer.fromJSON(l))
    net.stepCount = data.stepCount || 0
    return net
  }
}

/** 取数组中最大值的下标（DQN 选动作） */
export function argmax(arr) {
  let best = 0
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > arr[best]) best = i
  }
  return best
}

/** 均值（供特征归一化与统计复用） */
export function mean(arr) {
  if (!arr.length) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

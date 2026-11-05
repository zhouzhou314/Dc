/**
 * 神经网络与强化学习自检脚本（不依赖数据库，可单独运行）
 * ================================================================
 * 运行：node server/ml/selftest.js
 *
 * 两项检查：
 *   1. MLP 能否学会一个简单的非线性映射（验证前向/反向/Adam 正确）
 *   2. DQN 能否在"单状态双动作老虎机"上把正确动作的 Q 值拉高（验证 TD 更新）
 *
 * 该脚本同时用于软著材料中的"算法自测记录"，输出可直接截图。
 */
import { MLP } from './neuralNet.js'
import { DQNAgent } from './dqn.js'

/** 固定种子的伪随机，保证每次运行结果一致 */
let seed = 42
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

function testMLP() {
  /* 任务：输入 x∈[0,1]，输出 [sin(2πx) 的粗略拟合]（1→8→8→1） */
  const net = new MLP([1, 8, 8, 1], { learningRate: 0.02 })
  const samples = []
  for (let i = 0; i < 200; i++) {
    const x = rand()
    samples.push({ x: [x], y: [Math.sin(2 * Math.PI * x)] })
  }
  const before = net.lastLoss
  const first = net.fit(samples, 1)
  const later = net.fit(samples, 40)

  const improved = later.avgLoss < first.avgLoss * 0.5
  console.log('【MLP】首轮损失 =', first.avgLoss.toFixed(4), '｜40 轮后 =', later.avgLoss.toFixed(4))
  console.log('【MLP】', improved ? '✅ 收敛正常（损失下降 >50%）' : '❌ 未收敛，请检查反向传播')
  return improved
}

function testDQN() {
  /* 环境：单状态，动作 0 奖励 +1，动作 1 奖励 −1（确定性老虎机） */
  const agent = new DQNAgent({
    stateDim: 4,
    actionDim: 2,
    hidden: [16],
    learningRate: 0.01,
    gamma: 0.0, // 单步决策，不做自举
    epsilon: 1.0,
    epsilonMin: 0.05,
    epsilonDecay: 0.9,
    batchSize: 8,
    targetSyncEvery: 10
  })
  const s = [0.5, 0.2, 0.9, 0.1]
  for (let i = 0; i < 300; i++) {
    agent.remember({ s, a: 0, r: 1, s2: s, done: true })
    agent.remember({ s, a: 1, r: -1, s2: s, done: true })
    agent.trainStep()
  }
  const q = agent.qValues(s)
  const ok = q[0] > q[1] && q[0] > 0.3
  console.log('【DQN】Q(动作0) =', q[0].toFixed(3), '｜Q(动作1) =', q[1].toFixed(3), '｜ε =', agent.epsilon.toFixed(3))
  console.log('【DQN】', ok ? '✅ 正确动作已被学会' : '❌ 未学会，请检查 TD 更新')
  return ok
}

console.log('===== 算法自检开始 =====')
const a = testMLP()
const b = testDQN()
console.log('===== 结论：' + (a && b ? '全部通过' : '存在失败项') + ' =====')
process.exit(a && b ? 0 : 1)

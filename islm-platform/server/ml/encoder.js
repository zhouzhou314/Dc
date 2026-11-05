/**
 * 学生状态编码器（State Encoder）
 * ================================================================
 * 把"一个学生的多维学习行为"压成一个固定长度的数值向量，作为神经网络的输入。
 * 编码原则：
 *   1. 全部维度归一化到 [0,1]（趋势维映射到 [0,1]，0.5 表示无变化），
 *      避免某维数量级过大主导梯度；
 *   2. 维度顺序永久固定（STATE_DIM 常量 + 注释），已训练模型才能复用；
 *   3. 只依赖传入的 signals 对象，不查库 → 纯函数、可单测、可解释。
 *
 * 维度定义（共 16 维）：
 *   0  平均掌握度           五个知识点 BKT pKnown 的均值
 *   1  最弱掌握度           最小值（代表短板）
 *   2  掌握度离散度         (max − min)，越大越偏科
 *   3   IS曲线 掌握度
 *   4   LM曲线 掌握度
 *   5   IS-LM均衡 掌握度
 *   6   政策运用 掌握度
 *   7   模型评析 掌握度
 *   8  答题正确率           correct / total
 *   9  提示依赖度           直取 L4 与提示次数加权，越大越依赖
 *   10 学习活跃度           活跃天数 + 做题量
 *   11 做题强度             总量归一化
 *   12 游戏决策表现         游戏一评分 / 游戏二表现
 *   13 游戏行为多样性       参与过的游戏与政策类别数
 *   14 近期趋势             近 7 天正确率 − 总正确率，映射到 [0,1]
 *   15 知识节点覆盖率       有作答记录的节点 / 总节点数
 */

import { knowledgeNodes } from '../knowledge/graph.js'
import { TOPICS } from '../../src/data/questionBank.js'

/** 状态维度（改动此常量会让已训练模型失效，必须同步更新模型版本号） */
export const STATE_DIM = 16

/** 分数裁剪到 [0,1] */
function unit(v) {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(1, v))
}

/** 取某知识点的掌握度（无记录按 BKT 先验 0.15） */
function topicMastery(signals, topic) {
  const item = (signals.mastery || []).find((m) => m.topic === topic)
  return item ? unit(item.pKnown) : 0.15
}

/**
 * 编码学生状态
 * @param {object} signals profileService.collectSignals() 的返回值
 * @returns {number[]} 长度 STATE_DIM 的数组
 */
export function encodeState(signals) {
  const s = signals || {}
  const masteryList = TOPICS.map((t) => topicMastery(s, t))
  const avg = masteryList.reduce((a, b) => a + b, 0) / masteryList.length
  const min = Math.min(...masteryList)
  const max = Math.max(...masteryList)

  const ans = s.answers || { total: 0, correct: 0 }
  const accuracy = ans.total > 0 ? unit(ans.correct / ans.total) : 0
  const recent = ans.recent7 || { total: 0, correct: 0 }
  const recentAcc = recent.total > 0 ? unit(recent.correct / recent.total) : accuracy

  const hint = s.hints || {}
  /* 提示依赖度：直取 L4（抄答案风险）权重最高，其次普通提示频次 */
  const hintDependence = unit(
    (hint.directL4 || 0) * 0.25 + (hint.total || 0) * 0.06
  )

  const act = s.activity || {}
  const activityScore = unit(
    Math.min(1, (act.activeDays || 0) / 14) * 0.5 + Math.min(1, (ans.total || 0) / 60) * 0.5
  )

  const game1 = s.game1 || {}
  const game2 = s.game2 || {}
  /* 游戏表现：游戏一最好评分（满分 100）与游戏二对局完成度各占一半 */
  const gameScore = unit(
    ((game1.bestScore || 0) / 100) * 0.6 + Math.min(1, (game2.decisions || 0) / 12) * 0.4
  )
  const gameDiversity = unit(
    Math.min(1, (game1.modes || 0) / 2) * 0.4 + Math.min(1, (game1.policyCategories || 0) / 4) * 0.3 +
    Math.min(1, (game2.roles || 0) / 4) * 0.3
  )

  /* 趋势：正=进步，负=退步，映射到 0~1（0.5 为持平） */
  const trend = unit((recentAcc - accuracy) * 2 + 0.5)

  const nodeCoverage = unit((s.nodeAttemptedCount || 0) / knowledgeNodes.length)

  return [
    unit(avg),
    unit(min),
    unit(max - min),
    masteryList[0],
    masteryList[1],
    masteryList[2],
    masteryList[3],
    masteryList[4],
    accuracy,
    hintDependence,
    activityScore,
    unit((ans.total || 0) / 100),
    gameScore,
    gameDiversity,
    trend,
    nodeCoverage
  ]
}

/** 维度中文名（前端"画像向量"可视化、文档说明都用它） */
export const STATE_DIM_NAMES = [
  '平均掌握度', '最弱掌握度', '掌握度离散度',
  'IS曲线掌握', 'LM曲线掌握', 'IS-LM均衡掌握', '政策运用掌握', '模型评析掌握',
  '答题正确率', '提示依赖度', '学习活跃度', '做题强度',
  '游戏决策表现', '行为多样性', '近期趋势', '知识节点覆盖率'
]

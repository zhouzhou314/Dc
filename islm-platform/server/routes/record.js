/**
 * 作答上报路由 /api/record
 * ================================================================
 * POST /api/record/answer
 * 前端判题后 fire-and-forget 上报，一次请求内完成四件事：
 *   1. answer_record 落库（明细）
 *   2. mastery_state 按知识点做 BKT 更新（5 个 topic 口径）
 *   3. node_mastery 按知识节点做 BKT 更新（25 个 node 口径，图谱用）
 *   4. 强化学习奖励回收：把这次作答变成 DQN 的一条训练样本
 * 另写一条 learning_event（source=learning），让行为事件流保持完整。
 *
 * 工程约束：3、4 两件事失败不能让"作答上报"整体失败——前端是 fire-and-forget，
 * 失败不应影响学生做题，所以都做了降级保护。
 */
import { Router } from 'express'
import { recordAnswer } from '../services/bktService.js'
import { recordNodeAnswer } from '../services/nodeMasteryService.js'
import { prepareAnswer, settleAnswer } from '../services/rlService.js'
import { nodeOfQuestion } from '../knowledge/graph.js'
import { query } from '../db.js'
import { resolveUserId } from '../middleware/auth.js'

const router = Router()

router.post('/answer', async (req, res, next) => {
  try {
    const { questionId, topic, qType, difficulty, isCorrect, studentAnswer, durationMs } = req.body || {}
    /* 关键字段校验（系统边界处做防御） */
    if (questionId === undefined || !topic || isCorrect === undefined) {
      return res.status(400).json({ success: false, code: 'PARAM_ERROR', message: '缺少 questionId/topic/isCorrect', data: null })
    }

    const userId = resolveUserId(req) // 登录用户 u_xxx，匿名 hintUserId
    const qid = Number(questionId)
    const correct = !!isCorrect
    const nodeId = nodeOfQuestion(qid)

    /* ① 强化学习：先记录"决策时刻"的状态（作答前后对比才能算出奖励） */
    let prepared = null
    if (nodeId) {
      try {
        prepared = await prepareAnswer(userId, qid)
      } catch (e) {
        console.warn('[record] RL 状态采集失败（不影响作答上报）：', e.message)
      }
    }

    /* ② 知识点级 BKT */
    const mastery = await recordAnswer({
      userId,
      questionId: qid,
      topic,
      qType: qType || 'choice',
      difficulty: difficulty || 'medium',
      isCorrect: correct,
      studentAnswer: studentAnswer ?? null,
      durationMs: durationMs ? Number(durationMs) : null
    })

    /* ③ 知识节点级 BKT + ④ 奖励回收 */
    let nodeMastery = null
    let rl = null
    if (nodeId) {
      try {
        const before = await query(
          'SELECT p_known FROM node_mastery WHERE user_id = ? AND node_id = ?',
          [userId, nodeId]
        )
        const prevPKnown = before.length ? Number(before[0].p_known) : 0.15
        nodeMastery = await recordNodeAnswer({ userId, nodeId, topic, isCorrect: correct })
        rl = await settleAnswer({
          userId,
          nodeId,
          isCorrect: correct,
          difficulty: difficulty || 'medium',
          prevPKnown,
          pKnown: nodeMastery.pKnown,
          stateBefore: prepared ? prepared.state : null
        })
      } catch (e) {
        console.warn('[record] 节点 / 强化学习更新失败（不影响作答上报）：', e.message)
      }
    }

    /* ⑤ 行为事件流（统一口径，供画像与教师端看板） */
    try {
      await query(
        `INSERT INTO learning_event (user_id, source, event_type, payload, duration_ms)
         VALUES (?, 'learning', 'learning.answer', ?, ?)`,
        [
          userId,
          JSON.stringify({
            questionId: qid,
            topic,
            difficulty: difficulty || 'medium',
            isCorrect: correct,
            nodeId
          }),
          durationMs ? Number(durationMs) : null
        ]
      )
    } catch (e) {
      console.warn('[record] 事件流写入失败（忽略）：', e.message)
    }

    res.json({
      success: true,
      code: 'OK',
      message: '',
      data: { mastery, nodeMastery, reward: rl ? rl.reward : null }
    })
  } catch (e) { next(e) }
})

export default router

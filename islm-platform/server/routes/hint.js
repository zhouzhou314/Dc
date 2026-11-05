/**
 * 阶梯导学路由（只做参数校验与错误映射，业务在 hintService）
 * 挂载于 /api/hint：
 *   POST /api/hint          逐级提示 L1→L2→L3（或困惑重试）
 *   POST /api/hint/solution L4 完整解析（需 confirm:true）
 *   GET  /api/hint/state    拉取该用户全部导学状态（刷新恢复）
 *   POST /api/hint/feedback 提示反馈 up/down
 */
import { Router } from 'express'
import { getHint, getSolution, getState, sendFeedback, HintError } from '../services/hintService.js'

const router = Router()

/** 统一包裹：HintError 按 status/code 返回，其余按 DB_ERROR 返回 */
function wrap(handler) {
  return async (req, res) => {
    try {
      const data = await handler(req)
      res.json({ success: true, code: 'OK', message: '', data })
    } catch (e) {
      if (e instanceof HintError) {
        res.status(e.status).json({ success: false, code: e.code, message: e.message, data: e.data })
      } else {
        console.error('[hint] 服务异常：', e)
        res.status(500).json({ success: false, code: 'DB_ERROR', message: '存储异常，请稍后再试', data: null })
      }
    }
  }
}

/* ---------- POST /api/hint 逐级提示 ---------- */
router.post('/', wrap(async req => {
  const { userId, questionId, confusionText, studentAnswer, judgeResult } = req.body || {}
  if (!userId || !questionId) {
    throw new HintError('PARAM_ERROR', 400, '缺少 userId 或 questionId')
  }
  return getHint({
    userId: String(userId).slice(0, 64),
    questionId,
    confusionText: typeof confusionText === 'string' && confusionText.trim() ? confusionText.trim().slice(0, 500) : '',
    studentAnswer: studentAnswer || null,
    judgeResult: judgeResult || 'unsolved'
  })
}))

/* ---------- POST /api/hint/solution 完整解析 ---------- */
router.post('/solution', wrap(async req => {
  const { userId, questionId, confirm } = req.body || {}
  if (!userId || !questionId) {
    throw new HintError('PARAM_ERROR', 400, '缺少 userId 或 questionId')
  }
  return getSolution({ userId: String(userId).slice(0, 64), questionId, confirm: confirm === true })
}))

/* ---------- GET /api/hint/state 状态恢复 ---------- */
router.get('/state', wrap(async req => {
  const { userId } = req.query
  if (!userId) throw new HintError('PARAM_ERROR', 400, '缺少 userId')
  return getState(String(userId).slice(0, 64))
}))

/* ---------- POST /api/hint/feedback 提示反馈 ---------- */
router.post('/feedback', wrap(async req => {
  const { userId, questionId, hintLogId, feedback } = req.body || {}
  if (!userId || !questionId || !hintLogId) {
    throw new HintError('PARAM_ERROR', 400, '缺少 userId / questionId / hintLogId')
  }
  return sendFeedback({ userId: String(userId).slice(0, 64), questionId, hintLogId, feedback })
}))

/* ---------- POST /api/hint/stream 流式提示（SSE 打字机回放） ----------
 * 设计说明：泄露校验必须针对"完整生成文本"进行（流式中途无法扫描），
 * 因此先完整跑 getHint() 管线（含泄露重试/降级），再把定稿的 hint_body
 * 通过 SSE 分段回放 —— 前端呈现打字机效果，且安全链路 100% 保留。
 * 事件流：meta（完整结构化载荷）→ delta*（hint_body 分段）→ done */
router.post('/stream', async (req, res) => {
  /* SSE 头部（与 agent 路由同款） */
  res.status(200)
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })
  res.flushHeaders()

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000)
  const send = (event, payload) => res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)

  try {
    const { userId, questionId, confusionText, studentAnswer, judgeResult } = req.body || {}
    if (!userId || !questionId) throw new HintError('PARAM_ERROR', 400, '缺少 userId 或 questionId')

    /* 1) 完整跑现有管线（泄露校验/重试/降级全部保留） */
    const hint = await getHint({
      userId: String(userId).slice(0, 64),
      questionId,
      confusionText: typeof confusionText === 'string' && confusionText.trim() ? confusionText.trim().slice(0, 500) : '',
      studentAnswer: studentAnswer || null,
      judgeResult: judgeResult || 'unsolved'
    })

    /* 2) 先发结构化 meta（前端据此渲染完整卡片） */
    send('meta', hint)

    /* 3) 把 hint_body 切成 30~40 字的小段，40ms/段逐段回放（打字机） */
    const body = String(hint.hintBody || '')
    const STEP = 36
    for (let i = 0; i < body.length; i += STEP) {
      send('delta', { text: body.slice(i, i + STEP) })
      await new Promise(r => setTimeout(r, 40))
    }

    send('done', { hintLogId: hint.hintLogId })
  } catch (e) {
    if (e instanceof HintError) {
      send('error', { code: e.code, message: e.message })
    } else {
      console.error('[hint] 流式服务异常：', e)
      send('error', { code: 'DB_ERROR', message: '服务异常，请稍后再试' })
    }
  } finally {
    clearInterval(heartbeat)
    res.end()
  }
})

export default router

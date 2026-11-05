/**
 * AI 智能体路由 /api/agent（SSE 流式）
 * -------------------------------------------------
 * POST /api/agent/chat
 * 入参：{ userId, messages: [{role, content}] }
 * 事件流（text/event-stream，每条事件一行 `data: {json}\n\n`）：
 *   { event:'tool_call',   {name, args} }   模型请求调用工具
 *   { event:'tool_result', {name, summary} } 工具执行完成
 *   { event:'delta',       {text} }         回答文本增量（打字机）
 *   { event:'reset',       {} }             丢弃当前半截文本（工具轮开始前）
 *   { event:'done',        {model, toolCalls} } 回答结束
 *   { event:'error',       {message} }      异常
 * 另每 15s 发一行 `: ping` 心跳，防止代理空闲断连。
 */
import { Router } from 'express'
import { runAgent } from '../services/agentService.js'
import { resolveUserId } from '../middleware/auth.js'

const router = Router()

/** SSE 基础响应头 */
function sseHeaders(res) {
  res.status(200)
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no' // 告诉 nginx 类代理不要缓冲
  })
  res.flushHeaders()
}

/** 发送一条 SSE 事件 */
function sseSend(res, event, payload) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
}

router.post('/chat', async (req, res) => {
  sseHeaders(res)

  const { messages } = req.body || {}
  if (!Array.isArray(messages) || messages.length === 0) {
    sseSend(res, 'error', { message: 'messages 不能为空' })
    return res.end()
  }

  const userId = resolveUserId(req)

  /* 心跳定时器：SSE 空闲期发注释行保活 */
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000)

  try {
    /* runAgent 边执行边 emit，这里转成 SSE 事件 */
    const result = await runAgent({
      userId,
      messages: messages.slice(-12), // 最多带最近 12 条上下文，控制 token
      emit: (event, payload) => sseSend(res, event, payload)
    })
    sseSend(res, 'done', { model: result.model, toolCalls: result.toolCalls })
  } catch (e) {
    console.error('[agent] 对话异常：\n', e.stack || e)
    sseSend(res, 'error', { message: '智能体暂时不可用，请稍后再试' })
  } finally {
    clearInterval(heartbeat)
    res.end()
  }
})

export default router

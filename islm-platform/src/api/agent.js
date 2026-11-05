/**
 * AI 智能体对话接口层（SSE 流式）
 * -------------------------------------------------
 * POST /api/agent/chat 事件流协议：
 *   tool_call   {name, args}    模型请求调用工具（前端步骤条进入"执行中"）
 *   tool_result {name, summary} 工具执行完成（步骤条显示结果摘要）
 *   delta       {text}          回答文本增量（打字机追加）
 *   reset       {}              丢弃当前半截文本（下一轮工具调用开始前）
 *   done        {model, toolCalls} 回答结束
 *   error       {message}       异常
 */
import { ssePost } from './sse'

/**
 * 与智能体对话（流式）
 * @param {Array<{role:string, content:string}>} messages 消息历史（不含 system，后端会注入）
 * @param {object} handlers 回调集合 onToolCall/onToolResult/onDelta/onReset/onDone/onError
 * @param {{signal?: AbortSignal}} [opts]
 * @returns {Promise<void>} fetch 层异常时 reject（调用方据此走离线兜底）
 */
export function agentChat(messages, handlers = {}, opts = {}) {
  return ssePost('/api/agent/chat', { messages }, (event, payload) => {
    if (event === 'tool_call') handlers.onToolCall?.(payload)
    else if (event === 'tool_result') handlers.onToolResult?.(payload)
    else if (event === 'delta') handlers.onDelta?.(payload.text || '')
    else if (event === 'reset') handlers.onReset?.()
    else if (event === 'done') handlers.onDone?.(payload)
    else if (event === 'error') handlers.onError?.(payload)
  }, opts)
}

/**
 * SSE 读取器（fetch + ReadableStream，零依赖）
 * -------------------------------------------------
 * 为什么不用 EventSource：它只支持 GET、不能自定义 JSON body/headers，
 * 而提示 / 智能体接口都是 POST + JSON。这里用 fetch 手动解析
 * `event: xxx\ndata: {json}\n\n` 事件流，并自动附带 JWT。
 * 服务端每 15s 发一行 `: ping` 心跳注释，解析时自动忽略。
 */
import { authStore } from '@/store/auth'

/**
 * @param {string} path 接口路径（/api/...，走 Vite 代理同源）
 * @param {object} body POST JSON body
 * @param {(event: string, payload: object) => void} onEvent 事件回调
 * @param {{signal?: AbortSignal}} [opts] 可选中止信号
 * @returns {Promise<void>} 流正常结束 resolve；网络/HTTP 异常 reject（调用方自行兜底）
 */
export async function ssePost(path, body, onEvent, opts = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (authStore.isLoggedIn()) headers.Authorization = `Bearer ${authStore.state.token}`

  const resp = await fetch(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: opts.signal
  })
  if (!resp.ok || !resp.body) throw new Error('SSE_HTTP_' + resp.status)

  const reader = resp.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buf = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })

    /* 事件以空行（\n\n）分隔，逐块解析 */
    let idx
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      let event = 'message'
      let data = ''
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
        /* 其余行（`: ping` 心跳注释、空行）忽略 */
      }
      if (!data) continue
      try {
        onEvent(event, JSON.parse(data))
      } catch { /* 非 JSON 载荷忽略，不让单条坏事件中断整个流 */ }
    }
  }
}

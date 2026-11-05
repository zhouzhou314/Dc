/**
 * 临时复现脚本：直接调 runAgent / executeTool 抓完整堆栈（排查后删除）
 * 用法：cd server && node _repro_agent.mjs
 */
import { runAgent, executeTool } from './services/agentService.js'

process.on('unhandledRejection', e => { console.error('[unhandledRejection]', e.stack || e); process.exit(1) })

console.log('===== 第一步：隔离测试三个工具 =====')
for (const [name, args] of [
  ['knowledge_search', { query: 'IS曲线的含义' }],
  ['islm_solve', {}],
  ['question_query', { limit: 2 }]
]) {
  try {
    const r = await executeTool(name, args)
    console.log(`[tool:${name}] OK →`, r.summary)
  } catch (e) {
    console.error(`[tool:${name}] 抛错：\n`, e.stack || e)
  }
}

console.log('\n===== 第二步：完整 runAgent（真实模式工具循环）=====')
try {
  const result = await runAgent({
    userId: 'repro-debug',
    messages: [{ role: 'user', content: 'IS曲线是什么？帮我详细讲讲，再推荐几道练习题' }],
    emit: (event, payload) => console.log('[emit]', event, JSON.stringify(payload).slice(0, 150))
  })
  console.log('=== runAgent 完成 ===')
  console.log('model:', result.model, '| content 长度:', result.content.length)
  console.log('toolCalls:', JSON.stringify(result.toolCalls, null, 2))
} catch (e) {
  console.error('=== runAgent 抛错 ===\n', e.stack || e)
}
process.exit(0)

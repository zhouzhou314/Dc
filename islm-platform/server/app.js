/**
 * 阶梯导学后端服务入口
 * -------------------------------------------------
 * 启动：npm run server（等价 node --watch server/app.js）
 * 端口：3001（前端 Vite 开发服务器通过 /api 代理到本服务）
 *
 * 职责：
 *  1. 启动时自检数据库（幂等建表）
 *  2. 挂载导学路由 /api/hint*
 *  3. 统一错误处理：任何未捕获异常都以 { success:false, code:'DB_ERROR', ... } 返回，
 *     绝不把堆栈细节或答案内容抛给前端
 */
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { config } from './config.js'
import { initDatabase } from './db.js'
import hintRouter from './routes/hint.js'
import authRouter from './routes/auth.js'
import recordRouter from './routes/record.js'
import analyticsRouter from './routes/analytics.js'
import wrongbookRouter from './routes/wrongbook.js'
import reviewRouter from './routes/review.js'
import islmRouter from './routes/islm.js'
import agentRouter from './routes/agent.js'
import embeddingRouter from './routes/embedding.js'
import gameRouter from './routes/game.js'
import game1Router from './routes/game1.js'
import eventRouter from './routes/event.js'
import knowledgeRouter from './routes/knowledge.js'
import aiRouter from './routes/ai.js'
import teacherRouter from './routes/teacher.js'
import { attachGameGateway } from './ws/gameGateway.js'
import { optionalAuth } from './middleware/auth.js'
import { ensureEmbeddings } from './services/embeddingService.js'
import { modelStatus } from './services/rlService.js'

const app = express()

/* 解析 JSON 请求体（最简中间件，不额外引入 CORS —— 开发期走 Vite 代理同源） */
app.use(express.json({ limit: '64kb' }))

/* 可选认证：识别 Bearer token，登录用户挂 req.user，匿名放行 */
app.use(optionalAuth)

/* 健康检查：前端/脚本可用来判断后端是否在线 */
app.get('/api/health', (req, res) => {
  res.json({ success: true, code: 'OK', message: '', data: { uptime: process.uptime() } })
})

/* 导学业务路由 */
app.use('/api/hint', hintRouter)

/* 认证路由（注册/登录/当前用户） */
app.use('/api/auth', authRouter)

/* 学习分析：作答上报 / BKT 掌握度 / 自适应推荐 */
app.use('/api/record', recordRouter)
app.use('/api/analytics', analyticsRouter)

/* 云端错题本与 SM-2 复习 */
app.use('/api/wrongbook', wrongbookRouter)
app.use('/api/review', reviewRouter)

/* IS-LM 仿真后端计算 / AI 智能体（SSE 流式）/ 向量重建（管理端） */
app.use('/api/islm', islmRouter)
app.use('/api/agent', agentRouter)
app.use('/api/admin/embeddings', embeddingRouter)

/* 多人博弈游戏：对局报告查询（实时对局走 /ws WebSocket） */
app.use('/api/game', gameRouter)

/* 游戏一（单机政策模拟）：终局快照与历史 */
app.use('/api/game1', game1Router)

/* 学习行为事件流（两游戏操作 + 学习行为统一采集） */
app.use('/api/event', eventRouter)

/* 知识图谱（知识点学习部分的结构化数据） */
app.use('/api/knowledge', knowledgeRouter)

/* AI 能力：学生画像 / 学习建议 / 强化学习推荐 / 模型状态 */
app.use('/api/ai', aiRouter)

/* 教师端：班级学情看板（要求教师角色） */
app.use('/api/teacher', teacherRouter)

/* 生产模式：托管前端构建产物 dist（存在时）。
 * SPA 回退用匿名中间件判断（Express 5 的 path-to-regexp 不支持 '*' 通配路由）：
 * GET 且非 /api 路径 → 返回 index.html，其余交给 404 */
const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(distDir, 'index.html'))
    }
    next()
  })
  console.log('[server] 已启用生产模式：托管 dist 静态资源')
}

/* 404 */
app.use((req, res) => {
  res.status(404).json({ success: false, code: 'NOT_FOUND', message: '接口不存在', data: null })
})

/* 统一错误处理：防止堆栈/敏感信息外泄 */
app.use((err, req, res, next) => {
  console.error('[server] 未处理异常：', err.message)
  res.status(500).json({ success: false, code: 'DB_ERROR', message: '服务器内部异常，请稍后再试', data: null })
})

/* 启动：先确保数据库就绪（容器内 MySQL 可能晚启动，内部带重试），
 * 再自动构建缺失的知识向量，最后创建 HTTP 服务并挂载 WebSocket 博弈网关 */
async function start() {
  try {
    await initDatabase()
    await ensureEmbeddings()
  } catch (e) {
    console.error('[db] 数据库初始化失败，请检查 MySQL 是否启动、.env 密码是否正确：', e.message)
    process.exit(1)
  }
  /* 预加载强化学习模型（冷启动时初始化随机网络，不阻塞服务启动） */
  try {
    const rl = await modelStatus()
    console.log(`[rl] DQN 就绪：训练步数 ${rl.trainSteps}，样本 ${rl.transitions}（已回收 ${rl.filledTransitions}），冷启动=${rl.coldStart}`)
  } catch (e) {
    console.warn('[rl] 模型预加载失败（将按冷启动处理）：', e.message)
  }
  /* Express 挂到显式 HTTP 实例上，同一端口同时提供 REST 与 WebSocket(/ws) */
  const server = http.createServer(app)
  attachGameGateway(server)
  server.listen(config.port, () => {
    console.log(`[server] 阶梯导学服务已启动：http://localhost:${config.port}`)
    console.log(`[server] 大模型模式：${config.llm.mock ? 'MOCK（本地模拟，不调用外部接口）' : `真实调用 ${config.llm.provider} / ${config.llm.model}`}`)
  })
}

start()

/**
 * 向量索引管理路由 /api/admin/embeddings
 * -------------------------------------------------
 * POST /api/admin/embeddings/rebuild  全量重建知识块向量（force=true）
 * （服务启动时 ensureEmbeddings() 已自动补齐缺失向量，此接口用于
 *   切换真实/伪向量模式后手动重建，教学项目未加鉴权）
 */
import { Router } from 'express'
import { ensureEmbeddings, embeddingMode } from '../services/embeddingService.js'

const router = Router()

router.post('/rebuild', async (_req, res, next) => {
  try {
    const result = await ensureEmbeddings(true)
    res.json({ success: true, code: 'OK', message: '', data: result })
  } catch (e) { next(e) }
})

/* 当前向量模式查询 */
router.get('/mode', (_req, res) => {
  res.json({ success: true, code: 'OK', message: '', data: { mode: embeddingMode() } })
})

export default router

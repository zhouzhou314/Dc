/**
 * IS-LM 后端计算路由 /api/islm
 * -------------------------------------------------
 * POST /api/islm/simulate  单情景求解（曲线点 + 均衡点 + 解读文本）
 * POST /api/islm/compare   基准/冲击双情景对比
 * 补齐前端 src/api/islm.js 注释里预留的"正式接口"，
 * 前端调用失败时仍会回落本地计算，保证离线可玩。
 */
import { Router } from 'express'
import { calcIslmCurves, generateAnalysisNote } from '../services/islmSolver.js'

const router = Router()

/** 必填九参数校验（非负 + 数字化） */
function sanitizeParams(raw) {
  const KEYS = ['C0', 'c', 'I0', 'd', 'G', 'T', 'MP', 'k', 'h']
  const p = {}
  for (const k of KEYS) {
    const v = Number(raw?.[k])
    if (raw?.[k] === undefined || raw?.[k] === null || Number.isNaN(v) || v < 0) return null
    p[k] = v
  }
  return p
}

/* 单情景求解 */
router.post('/simulate', (req, res) => {
  const p = sanitizeParams(req.body)
  if (!p) {
    return res.status(400).json({ success: false, code: 'PARAM_ERROR', message: '参数缺失或非法（九个参数必须为非负数字）', data: null })
  }
  const result = calcIslmCurves(p)
  if (!result.valid) {
    return res.status(400).json({ success: false, code: 'PARAM_ERROR', message: result.reason, data: null })
  }
  const note = generateAnalysisNote(p, result)
  res.json({ success: true, code: 'OK', message: '', data: { ...result, note } })
})

/* 基准/冲击对比 */
router.post('/compare', (req, res) => {
  const base = sanitizeParams(req.body?.base)
  const shock = sanitizeParams(req.body?.shock)
  if (!base || !shock) {
    return res.status(400).json({ success: false, code: 'PARAM_ERROR', message: 'base/shock 参数缺失或非法', data: null })
  }
  const baseResult = calcIslmCurves(base)
  const shockResult = calcIslmCurves(shock)
  if (!baseResult.valid) {
    return res.status(400).json({ success: false, code: 'PARAM_ERROR', message: '基准参数无效：' + baseResult.reason, data: null })
  }
  if (!shockResult.valid) {
    return res.status(400).json({ success: false, code: 'PARAM_ERROR', message: '冲击参数无效：' + shockResult.reason, data: null })
  }
  const note = generateAnalysisNote(base, baseResult, shockResult)
  res.json({ success: true, code: 'OK', message: '', data: { base: baseResult, shock: shockResult, note } })
})

export default router

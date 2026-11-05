/**
 * 知识图谱路由 /api/knowledge
 * ================================================================
 * 提供"知识点学习"部分的结构化数据：
 *   GET /api/knowledge/graph        整张图谱（节点 + 边 + 本人节点掌握度）
 *   GET /api/knowledge/stats        图谱规模指标
 *   GET /api/knowledge/nodes/:id    节点详情（教材原文块 + 关联题目 + 先修/后继）
 *   GET /api/knowledge/path         本人的推荐学习路径（学习前沿 + 拓扑序）
 *   GET /api/knowledge/search?q=    关键词检索节点
 *
 * 掌握度口径：node_mastery 表（BKT 节点级）；未作答节点返回 null，
 * 前端用浅灰显示"未学"，与"已学但薄弱"区分开。
 */
import { Router } from 'express'
import { resolveUserId } from '../middleware/auth.js'
import { getNodeMasteryMap } from '../services/nodeMasteryService.js'
import {
  knowledgeNodes, knowledgeEdges, nodeMap, graphForClient, graphStats,
  frontierNodes, topoOrder, TOPIC_TO_NODES
} from '../knowledge/graph.js'
import { allChunks } from '../knowledge/chunks.js'
import { questionBank } from '../../src/data/questionBank.js'

const router = Router()

/** chunkId → chunk（节点详情展示教材原文用） */
const chunkMap = new Map(allChunks.map((c) => [c.chunkId, c]))
/** questionId → 题目（节点详情展示关联练习用） */
const questionMap = new Map(questionBank.map((q) => [q.id, q]))

/** 题目脱敏：只保留题干与考点，去掉选项判定与答案数值 */
function safeQuestion(q) {
  return {
    id: q.id,
    topic: q.topic,
    type: q.type,
    difficulty: q.difficulty,
    question: q.question,
    examPoint: q.examPoint,
    relatedSection: q.relatedSection
  }
}

/** 图谱（含学生掌握度） */
router.get('/graph', async (req, res, next) => {
  try {
    const userId = resolveUserId(req)
    const mastery = await getNodeMasteryMap(userId)
    const graph = graphForClient(mastery)

    /* 附加：每个节点的先修/后继，前端点击节点时可高亮链路 */
    const children = new Map(knowledgeNodes.map((n) => [n.id, []]))
    for (const e of knowledgeEdges) {
      if (e.type === 'prereq') children.get(e.source).push(e.target)
    }
    for (const n of graph.nodes) {
      n.prereq = (nodeMap.get(n.id)?.prereq) || []
      n.children = children.get(n.id) || []
    }

    res.json({
      success: true,
      code: 'OK',
      message: '',
      data: { ...graph, stats: { ...graphStats(), chunks: allChunks.length, exercises: questionBank.length }, topicsMap: Object.fromEntries(TOPIC_TO_NODES) }
    })
  } catch (e) { next(e) }
})

/** 图谱规模指标（含知识库块数，说明"知识库 + 知识图谱"两层结构） */
router.get('/stats', (_req, res) => {
  res.json({
    success: true,
    code: 'OK',
    message: '',
    data: {
      ...graphStats(),
      chunks: allChunks.length,
      exercises: questionBank.length,
      chunkTypes: [...new Set(allChunks.map((c) => c.type))]
    }
  })
})

/** 节点详情 */
router.get('/nodes/:id', async (req, res, next) => {
  try {
    const userId = resolveUserId(req)
    const node = nodeMap.get(req.params.id)
    if (!node) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: '知识节点不存在', data: null })
    }
    const mastery = await getNodeMasteryMap(userId)

    /* 教材原文块（保留标题与正文，供"展开看教材"） */
    const chunks = node.chunkIds
      .map((cid) => chunkMap.get(cid))
      .filter(Boolean)
      .map((c) => ({ chunkId: c.chunkId, title: c.title, type: c.type, content: c.content.slice(0, 1200) }))

    /* 后继节点（学完这个下一步能学什么） */
    const children = knowledgeEdges
      .filter((e) => e.type === 'prereq' && e.source === node.id)
      .map((e) => nodeMap.get(e.target))
      .filter(Boolean)
      .map((n) => ({ id: n.id, name: n.name }))

    res.json({
      success: true,
      code: 'OK',
      message: '',
      data: {
        ...node,
        prereqNodes: node.prereq.map((id) => ({ id, name: nodeMap.get(id)?.name })).filter((x) => x.name),
        children,
        chunks,
        questions: node.questionIds.map((qid) => questionMap.get(qid)).filter(Boolean).map(safeQuestion),
        mastery: mastery.has(node.id) ? mastery.get(node.id) : null
      }
    })
  } catch (e) { next(e) }
})

/**
 * 推荐学习路径
 * 结合两件事：
 *   1. 图结构：拓扑序保证先修关系（不会推荐"还没学基础就去学极端情形"）
 *   2. 个人掌握度：前沿节点优先、掌握度低的排前面
 */
router.get('/path', async (req, res, next) => {
  try {
    const userId = resolveUserId(req)
    const mastery = await getNodeMasteryMap(userId)
    const frontier = frontierNodes(mastery, 0.6, 8)
    const order = topoOrder()

    const path = frontier.map((id, idx) => {
      const n = nodeMap.get(id)
      return {
        step: idx + 1,
        id: n.id,
        name: n.name,
        topic: n.topic,
        section: n.section,
        difficulty: n.difficulty,
        mastery: mastery.has(id) ? Math.round(mastery.get(id) * 1000) / 1000 : null,
        reason: mastery.has(id) ? '先修已具备，且当前掌握度最低' : '先修已具备，尚未开始学习'
      }
    })

    /* 全部节点的拓扑顺序（前端可画"学习地图"） */
    const fullPath = order.map((id, idx) => {
      const n = nodeMap.get(id)
      return {
        index: idx + 1,
        id,
        name: n.name,
        difficulty: n.difficulty,
        mastery: mastery.has(id) ? Math.round(mastery.get(id) * 1000) / 1000 : null
      }
    })

    res.json({ success: true, code: 'OK', message: '', data: { frontier: path, order: fullPath } })
  } catch (e) { next(e) }
})

/** 关键词检索节点（按名称/摘要/关键词匹配，返回相关度排序） */
router.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase()
  if (!q) {
    return res.json({ success: true, code: 'OK', message: '', data: { list: [] } })
  }
  const scored = knowledgeNodes.map((n) => {
    const fields = [n.name, n.summary, n.topic, ...n.keywords].map((s) => String(s).toLowerCase())
    let score = 0
    for (const f of fields) {
      if (f === q) score += 3
      else if (f.includes(q)) score += 2
      else if (q.includes(f) && f.length >= 2) score += 1
    }
    return { node: n, score }
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 10)

  res.json({
    success: true,
    code: 'OK',
    message: '',
    data: {
      list: scored.map((x) => ({
        id: x.node.id,
        name: x.node.name,
        topic: x.node.topic,
        section: x.node.section,
        summary: x.node.summary,
        score: x.score
      }))
    }
  })
})

export default router

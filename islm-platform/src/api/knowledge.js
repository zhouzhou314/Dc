/**
 * 知识图谱前端接口层
 * -------------------------------------------------
 * 供"知识点学习"页与知识图谱页使用：整图、节点详情、学习路径、搜索。
 */
import request from './request'
import { getAnonUserId } from '@/utils/identity'

/** 整张知识图谱（含本人节点掌握度） */
export function fetchGraph() {
  return request.get('/knowledge/graph', { params: { userId: getAnonUserId() } })
}

/** 图谱规模指标 */
export function fetchGraphStats() {
  return request.get('/knowledge/stats')
}

/** 节点详情（教材原文块 + 关联题目 + 先修后继） */
export function fetchNode(nodeId) {
  return request.get(`/knowledge/nodes/${nodeId}`, { params: { userId: getAnonUserId() } })
}

/** 推荐学习路径（前沿节点 + 全图拓扑序） */
export function fetchPath() {
  return request.get('/knowledge/path', { params: { userId: getAnonUserId() } })
}

/** 关键词搜索知识节点 */
export function searchNodes(q) {
  return request.get('/knowledge/search', { params: { q } })
}

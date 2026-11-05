<!--
  知识图谱页（知识点学习部分的结构化视图）
  ================================================================
  左侧：25 个知识节点 + 26 条先修/关联边的力导向图
        · 节点颜色 = 本人该节点掌握度（灰=未学，红/黄/绿=薄弱/进阶/扎实）
        · 实线箭头 = 先修关系（必须先学源节点），虚线 = 跨节关联
  右侧：推荐学习路径（拓扑序 + 学习前沿），点击可直接看节点详情
  点击节点：抽屉展示教材原文块、关联习题、先修/后继节点
-->
<template>
  <div class="page-container">
    <div class="page-header">
      <el-button class="back-btn" @click="$emit('back')">← 返回首页</el-button>
      <h1 class="page-title">🕸️ 知识图谱</h1>
      <span class="page-sub">25 个知识节点 · 先修关系可视化 · 节点掌握度着色</span>
      <div class="header-right">
        <el-input
          v-model="searchQ" size="small" placeholder="搜索知识点 / 关键词，如：挤出效应"
          style="width: 260px" clearable @keyup.enter="doSearch" @clear="searchResults = []"
        >
          <template #append><el-button @click="doSearch">检索</el-button></template>
        </el-input>
      </div>
    </div>

    <!-- 知识库检索结果 -->
    <el-card v-if="searchResults.length" class="card" shadow="never">
      <template #header><b>🔎 知识库检索结果（{{ searchResults.length }}）</b></template>
      <div class="search-list">
        <div v-for="r in searchResults" :key="r.id" class="search-item" @click="openNode(r.id)">
          <div class="search-name">{{ r.name }}</div>
          <div class="search-meta">{{ r.topic }} · {{ r.section }}</div>
          <div class="search-summary">{{ r.summary }}</div>
        </div>
      </div>
    </el-card>

    <!-- 概览指标 -->
    <el-row :gutter="14" class="stat-row">
      <el-col :xs="12" :md="6"><div class="stat-card c1"><div class="num">{{ stats.nodeCount ?? 0 }}</div><div class="lab">知识节点</div></div></el-col>
      <el-col :xs="12" :md="6"><div class="stat-card c2"><div class="num">{{ stats.prereqEdgeCount ?? 0 }}</div><div class="lab">先修关系</div></div></el-col>
      <el-col :xs="12" :md="6"><div class="stat-card c3"><div class="num">{{ stats.depth ?? 0 }}</div><div class="lab">最长学习链</div></div></el-col>
      <el-col :xs="12" :md="6"><div class="stat-card c4"><div class="num">{{ learnedCount }}</div><div class="lab">已学节点</div></div></el-col>
    </el-row>

    <el-row :gutter="16">
      <!-- 图谱 -->
      <el-col :xs="24" :lg="16">
        <el-card class="card" shadow="hover">
          <template #header>
            <div class="card-head">
              <b>知识图谱</b>
              <div class="legend">
                <span><i class="dot gray"></i>未学</span>
                <span><i class="dot red"></i>薄弱</span>
                <span><i class="dot yellow"></i>进阶</span>
                <span><i class="dot green"></i>扎实</span>
              </div>
            </div>
          </template>
          <div ref="chartRef" class="graph" v-loading="loading"></div>
          <div class="graph-tip">提示：滚轮缩放、拖拽平移；点击节点查看教材原文与关联习题。</div>
        </el-card>
      </el-col>

      <!-- 推荐路径 -->
      <el-col :xs="24" :lg="8">
        <el-card class="card" shadow="hover">
          <template #header><b>🎯 你的学习前沿</b></template>
          <div class="path-list">
            <div
              v-for="p in frontier" :key="p.id" class="path-item"
              @click="openNode(p.id)"
            >
              <div class="path-step">{{ p.step }}</div>
              <div class="path-body">
                <div class="path-name">{{ p.name }}</div>
                <div class="path-meta">{{ p.topic }} · 难度 {{ '⭐'.repeat(p.difficulty) }}</div>
                <div class="path-reason">{{ p.reason }}</div>
              </div>
              <el-tag size="small" :type="tagType(p.mastery)" effect="plain">
                {{ p.mastery === null ? '未学' : Math.round(p.mastery * 100) + '%' }}
              </el-tag>
            </div>
            <el-empty v-if="frontier.length === 0" description="当前没有待攻克节点" :image-size="60" />
          </div>
        </el-card>

        <el-card class="card" shadow="hover">
          <template #header><b>📚 按知识点统计</b></template>
          <div class="topic-stat">
            <div v-for="(v, k) in stats.byTopic || {}" :key="k" class="topic-stat-row">
              <span>{{ k }}</span>
              <el-progress :percentage="Math.round((v / (stats.nodeCount || 1)) * 100)" :show-text="false" :stroke-width="8" />
              <b>{{ v }} 节点</b>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 节点详情抽屉 -->
    <el-drawer v-model="drawer" :title="detail?.name || '知识节点'" size="46%">
      <div v-if="detail" class="detail">
        <div class="detail-meta">
          <el-tag size="small" type="primary" effect="plain">{{ detail.topic }}</el-tag>
          <el-tag size="small" type="info" effect="plain">{{ detail.section }}</el-tag>
          <el-tag size="small" type="warning" effect="plain">难度 {{ '⭐'.repeat(detail.difficulty) }}</el-tag>
          <el-tag size="small" :type="tagType(detail.mastery)" effect="plain">
            掌握度 {{ detail.mastery === null ? '未学' : Math.round(detail.mastery * 100) + '%' }}
          </el-tag>
        </div>

        <div class="detail-summary">{{ detail.summary }}</div>
        <div v-if="detail.formula" class="detail-formula">{{ detail.formula }}</div>

        <el-divider content-position="left">先修 / 后继</el-divider>
        <div class="rel-row">
          <span class="rel-label">先修：</span>
          <el-tag
            v-for="p in detail.prereqNodes" :key="p.id" size="small" class="rel-tag"
            @click="openNode(p.id)"
          >{{ p.name }}</el-tag>
          <span v-if="!detail.prereqNodes.length" class="rel-none">无（入门节点）</span>
        </div>
        <div class="rel-row">
          <span class="rel-label">后继：</span>
          <el-tag
            v-for="c in detail.children" :key="c.id" size="small" type="success" class="rel-tag"
            @click="openNode(c.id)"
          >{{ c.name }}</el-tag>
          <span v-if="!detail.children.length" class="rel-none">无（终点节点）</span>
        </div>

        <el-divider content-position="left">教材原文</el-divider>
        <div class="chunk-list">
          <div v-for="c in detail.chunks" :key="c.chunkId" class="chunk">
            <div class="chunk-title">{{ c.title }} <el-tag size="small" type="info" effect="plain">{{ c.type }}</el-tag></div>
            <div class="chunk-body">{{ c.content }}</div>
          </div>
          <el-empty v-if="!detail.chunks.length" description="该节点暂无教材块" :image-size="50" />
        </div>

        <el-divider content-position="left">关联习题（{{ detail.questions.length }} 道）</el-divider>
        <div class="q-list">
          <div v-for="q in detail.questions" :key="q.id" class="q-item">
            <div class="q-head">
              <span class="q-id">#{{ q.id }}</span>
              <el-tag size="small" effect="plain">{{ q.type === 'choice' ? '单选' : '计算' }}</el-tag>
              <el-tag size="small" type="info" effect="plain">{{ q.difficulty }}</el-tag>
              <span class="q-point">{{ q.examPoint }}</span>
            </div>
            <div class="q-stem" v-html="q.question"></div>
          </div>
        </div>

        <div class="drawer-foot">
          <el-button type="primary" @click="$emit('open-page', 'exercise')">去练这个知识点的题</el-button>
          <el-button @click="$emit('open-chapter', 'ch11')">回到章节学习</el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as echarts from 'echarts'
import { fetchGraph, fetchNode, fetchPath, searchNodes } from '@/api/knowledge'

defineEmits(['back', 'open-page', 'open-chapter'])

const loading = ref(true)
const stats = ref({})
const nodes = ref([])
const edges = ref([])
const frontier = ref([])
const searchQ = ref('')
const searchResults = ref([])
const chartRef = ref(null)
const drawer = ref(false)
const detail = ref(null)
let chart = null

const learnedCount = computed(() => nodes.value.filter((n) => n.mastery !== null).length)

/** 掌握度 → 标签类型 */
function tagType(m) {
  if (m === null || m === undefined) return 'info'
  if (m < 0.35) return 'danger'
  if (m < 0.6) return 'warning'
  return 'success'
}

/** 掌握度 → 节点颜色 */
function nodeColor(m) {
  if (m === null || m === undefined) return '#c0c4cc'
  if (m < 0.35) return '#f56c6c'
  if (m < 0.6) return '#e6a23c'
  return '#67c23a'
}

/** 渲染力导向图 */
function renderGraph() {
  if (!chartRef.value) return
  if (!chart) chart = echarts.init(chartRef.value)

  const topics = [...new Set(nodes.value.map((n) => n.topic))]
  const categories = topics.map((t) => ({ name: t }))

  const data = nodes.value.map((n) => ({
    id: n.id,
    name: n.name,
    category: topics.indexOf(n.topic),
    symbolSize: 22 + n.difficulty * 7,
    itemStyle: {
      color: nodeColor(n.mastery),
      borderColor: '#fff',
      borderWidth: 2,
      shadowBlur: 6,
      shadowColor: 'rgba(0,0,0,0.12)'
    },
    /* 标签只显示短名，避免 25 个节点糊成一片 */
    label: { show: true, fontSize: 10, formatter: () => n.name.length > 9 ? n.name.slice(0, 9) + '…' : n.name },
    value: n.mastery === null ? 0 : Math.round(n.mastery * 100),
    meta: n
  }))

  const links = edges.value.map((e) => ({
    source: e.source,
    target: e.target,
    lineStyle: {
      color: e.type === 'related' ? '#c8d0e0' : '#aab4c8',
      width: e.type === 'related' ? 1 : 1.6,
      type: e.type === 'related' ? 'dashed' : 'solid',
      curveness: 0.08
    }
  }))

  chart.setOption({
    tooltip: {
      formatter: (p) => {
        if (p.dataType === 'edge') return ''
        const m = p.data.meta
        const pct = m.mastery === null ? '未学' : Math.round(m.mastery * 100) + '%'
        return `<b>${m.name}</b><br/>${m.topic} · 难度 ${m.difficulty}<br/>掌握度：${pct}<br/><span style="color:#909399">${m.summary}</span>`
      }
    },
    legend: [{ data: categories.map((c) => c.name), bottom: 0, textStyle: { fontSize: 11 } }],
    series: [{
      type: 'graph',
      layout: 'force',
      roam: true,
      draggable: true,
      categories,
      data,
      links,
      edgeSymbol: ['none', 'arrow'],
      edgeSymbolSize: 6,
      force: { repulsion: 320, edgeLength: [70, 150], gravity: 0.08 },
      emphasis: { focus: 'adjacency', lineStyle: { width: 3 } },
      labelLayout: { hideOverlap: true }
    }]
  })

  chart.off('click')
  chart.on('click', (params) => {
    if (params.dataType === 'node' && params.data?.id) openNode(params.data.id)
  })
}

/** 打开节点详情（再次点击同一个节点也会刷新） */
async function openNode(id) {
  try {
    const res = await fetchNode(id)
    detail.value = res.data.data
    drawer.value = true
  } catch {
    detail.value = null
  }
}

/** 知识库关键词检索（命中节点后点击直接看教材原文） */
async function doSearch() {
  const q = searchQ.value.trim()
  if (!q) {
    searchResults.value = []
    return
  }
  try {
    const res = await searchNodes(q)
    searchResults.value = res.data.data.list || []
  } catch {
    searchResults.value = []
  }
}

/** 加载图谱与路径 */
async function load() {
  loading.value = true
  try {
    const [gRes, pRes] = await Promise.all([fetchGraph(), fetchPath()])
    const g = gRes.data.data
    nodes.value = g.nodes || []
    edges.value = g.edges || []
    stats.value = g.stats || {}
    frontier.value = pRes.data.data.frontier || []
    await nextTick()
    renderGraph()
  } finally {
    loading.value = false
  }
}

function onResize() {
  chart && chart.resize()
}

onMounted(() => {
  load()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  if (chart) {
    chart.dispose()
    chart = null
  }
})
</script>

<style scoped>
.page-container {
  max-width: 1400px; margin: 0 auto; padding: 24px 20px 60px; min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);
  font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
}
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.page-title { margin: 0; font-size: 22px; color: #303133; }
.page-sub { color: #909399; font-size: 13px; }
.header-right { margin-left: auto; }

.search-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
.search-item { border: 1px solid #ebeef5; border-radius: 10px; padding: 10px 12px; cursor: pointer; transition: all .2s; }
.search-item:hover { border-color: #667eea; box-shadow: 0 4px 12px rgba(102,126,234,.12); }
.search-name { font-size: 13px; font-weight: 700; color: #303133; }
.search-meta { font-size: 11.5px; color: #909399; margin: 3px 0; }
.search-summary { font-size: 12px; color: #606266; line-height: 1.7; }

.stat-row { margin-bottom: 4px; }
.stat-card { border-radius: 12px; padding: 16px; color: #fff; margin-bottom: 14px; }
.stat-card.c1 { background: linear-gradient(135deg, #667eea, #764ba2); }
.stat-card.c2 { background: linear-gradient(135deg, #43e97b, #38f9d7); }
.stat-card.c3 { background: linear-gradient(135deg, #fa709a, #fee140); }
.stat-card.c4 { background: linear-gradient(135deg, #4facfe, #00f2fe); }
.stat-card .num { font-size: 24px; font-weight: 700; }
.stat-card .lab { font-size: 12px; opacity: 0.92; margin-top: 4px; }

.card { border-radius: 12px; margin-bottom: 16px; }
.card-head { display: flex; justify-content: space-between; align-items: center; }
.legend { display: flex; gap: 12px; font-size: 12px; color: #909399; }
.legend .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 4px; }
.dot.gray { background: #c0c4cc; }
.dot.red { background: #f56c6c; }
.dot.yellow { background: #e6a23c; }
.dot.green { background: #67c23a; }

.graph { width: 100%; height: 620px; }
.graph-tip { font-size: 12px; color: #909399; text-align: center; margin-top: 6px; }

.path-list { display: flex; flex-direction: column; gap: 10px; }
.path-item {
  display: flex; gap: 10px; align-items: flex-start; padding: 10px;
  border: 1px solid #ebeef5; border-radius: 10px; cursor: pointer; transition: all 0.2s;
}
.path-item:hover { border-color: #667eea; box-shadow: 0 4px 12px rgba(102,126,234,0.12); }
.path-step {
  width: 22px; height: 22px; border-radius: 50%; background: #667eea; color: #fff;
  font-size: 12px; display: flex; align-items: center; justify-content: center; flex: 0 0 22px;
}
.path-body { flex: 1; }
.path-name { font-size: 13px; font-weight: 700; color: #303133; }
.path-meta { font-size: 12px; color: #909399; margin: 2px 0; }
.path-reason { font-size: 12px; color: #606266; }

.topic-stat { display: flex; flex-direction: column; gap: 10px; }
.topic-stat-row { display: grid; grid-template-columns: 90px 1fr 60px; align-items: center; gap: 8px; font-size: 12px; color: #606266; }

.detail-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.detail-summary { font-size: 14px; color: #303133; line-height: 1.8; }
.detail-formula {
  margin-top: 10px; padding: 10px 14px; background: #f5f7fa; border-left: 3px solid #667eea;
  border-radius: 6px; font-family: Consolas, monospace; font-size: 13px; color: #409eff;
}
.rel-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.rel-label { font-size: 13px; color: #909399; }
.rel-tag { cursor: pointer; }
.rel-none { font-size: 12px; color: #c0c4cc; }

.chunk { margin-bottom: 12px; }
.chunk-title { font-size: 13px; font-weight: 700; color: #303133; margin-bottom: 6px; }
.chunk-body { font-size: 13px; color: #606266; line-height: 1.85; white-space: pre-wrap; background: #fafbfd; border-radius: 8px; padding: 10px 12px; }

.q-item { border: 1px solid #ebeef5; border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; }
.q-head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 12px; }
.q-id { font-weight: 700; color: #667eea; }
.q-point { color: #909399; }
.q-stem { margin-top: 6px; font-size: 13px; color: #303133; line-height: 1.7; }

.drawer-foot { margin-top: 18px; display: flex; gap: 10px; }
</style>

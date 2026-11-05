<!--
  教师端学情看板
  ================================================================
  三个层次：
    1. 班级概览：注册人数 / 有作答人数 / 平均掌握度 / 平均正确率 / 风险分布
    2. 班级诊断：知识点平均掌握度柱状图 + 近 7 天活跃折线 + AI 班级简报
    3. 学生明细：列表（风险分级）→ 抽屉（画像雷达 + 文字画像 + 学习建议 +
       节点掌握 + 近期作答 / 两游戏记录 / 行为事件流）
  权限：后端 requireTeacher 校验 users.role='teacher'，非教师登录会得到 403 提示。
-->
<template>
  <div class="page-container">
    <div class="page-header">
      <el-button class="back-btn" @click="$emit('back')">← 返回首页</el-button>
      <h1 class="page-title">👩‍🏫 教师端 · 学情看板</h1>
      <div class="header-right">
        <el-select v-model="className" placeholder="全部班级" clearable size="small" style="width: 160px" @change="loadAll">
          <el-option v-for="c in classes" :key="c.name" :label="`${c.name}（${c.students}）`" :value="c.name" />
        </el-select>
        <el-button size="small" :loading="loading" @click="loadAll">刷新</el-button>
        <el-button size="small" type="primary" plain @click="exportCsv">导出 CSV</el-button>
      </div>
    </div>

    <!-- 无权限 -->
    <el-result
      v-if="forbidden" icon="warning" title="当前账号没有教师权限"
      sub-title="请使用教师账号登录（注册教师账号需要邀请码），或联系管理员调整角色。"
    >
      <template #extra>
        <el-button type="primary" @click="$emit('open-page', 'login')">去登录</el-button>
      </template>
    </el-result>

    <template v-else>
      <el-skeleton v-if="loading" :rows="10" animated class="card" />

      <template v-else>
        <!-- ================= 概览指标 ================= -->
        <el-row :gutter="14" class="stat-row">
          <el-col :xs="12" :md="6"><div class="stat-card c1"><div class="num">{{ overview.registered ?? 0 }}</div><div class="lab">注册学生</div></div></el-col>
          <el-col :xs="12" :md="6"><div class="stat-card c2"><div class="num">{{ overview.activeStudents ?? 0 }}</div><div class="lab">有作答记录</div></div></el-col>
          <el-col :xs="12" :md="6"><div class="stat-card c3"><div class="num">{{ Math.round((overview.avgMastery || 0) * 100) }}%</div><div class="lab">平均掌握度</div></div></el-col>
          <el-col :xs="12" :md="6"><div class="stat-card c4"><div class="num">{{ overview.avgAccuracy ?? 0 }}%</div><div class="lab">平均正确率</div></div></el-col>
        </el-row>

        <!-- ================= 风险分布 ================= -->
        <el-card class="card" shadow="hover">
          <template #header>
            <div class="card-head">
              <b>🚦 学生状态分布</b>
              <span class="hint-text">重点 {{ overview.riskStats?.high ?? 0 }} 人 · 跟进 {{ overview.riskStats?.medium ?? 0 }} 人 · 良好 {{ overview.riskStats?.low ?? 0 }} 人 · 未开始 {{ overview.riskStats?.new ?? 0 }} 人</span>
            </div>
          </template>
          <div class="risk-bar">
            <div class="risk-seg high" :style="{ flex: overview.riskStats?.high || 0 }"></div>
            <div class="risk-seg medium" :style="{ flex: overview.riskStats?.medium || 0 }"></div>
            <div class="risk-seg low" :style="{ flex: overview.riskStats?.low || 0 }"></div>
            <div class="risk-seg new" :style="{ flex: overview.riskStats?.new || 0 }"></div>
          </div>
        </el-card>

        <!-- ================= 图表区 ================= -->
        <el-row :gutter="16">
          <el-col :xs="24" :md="12">
            <el-card class="card" shadow="hover">
              <template #header><b>📊 班级知识点平均掌握度</b></template>
              <div ref="topicChartRef" class="chart"></div>
            </el-card>
          </el-col>
          <el-col :xs="24" :md="12">
            <el-card class="card" shadow="hover">
              <template #header><b>📈 近 7 天活跃（作答数 / 活跃人数）</b></template>
              <div ref="activityChartRef" class="chart"></div>
            </el-card>
          </el-col>
        </el-row>

        <!-- ================= AI 班级简报 ================= -->
        <el-card class="card" shadow="hover">
          <template #header>
            <div class="card-head">
              <b>🤖 AI 班级学情简报</b>
              <el-button size="small" type="primary" :loading="insightLoading" @click="genInsight">生成 / 刷新</el-button>
            </div>
          </template>
          <div v-if="insight">
            <div class="insight-headline">{{ insight.headline }}</div>
            <div class="insight-overview">{{ insight.overview }}</div>
            <el-row :gutter="16" class="insight-grid">
              <el-col :xs="24" :md="12">
                <div class="insight-block">
                  <div class="block-title">⚠️ 主要问题</div>
                  <ul><li v-for="(p, i) in insight.problems || []" :key="i">{{ p }}</li></ul>
                </div>
              </el-col>
              <el-col :xs="24" :md="12">
                <div class="insight-block">
                  <div class="block-title">✅ 教学建议</div>
                  <ul><li v-for="(a, i) in insight.actions || []" :key="i">{{ a }}</li></ul>
                </div>
              </el-col>
            </el-row>
            <div v-if="insight.focus_students?.length" class="focus-row">
              <span class="focus-label">待关注：</span>
              <el-tag v-for="(s, i) in insight.focus_students" :key="i" type="danger" effect="plain" size="small">
                {{ s.name }}（{{ s.reason }}）
              </el-tag>
            </div>
          </div>
          <el-empty v-else description="点击右上角生成班级学情简报" :image-size="70" />
        </el-card>

        <!-- ================= 学生列表 ================= -->
        <el-card class="card" shadow="hover">
          <template #header>
            <div class="card-head">
              <b>👥 学生学情（{{ students.length }} 人）</b>
              <el-input v-model="keyword" size="small" placeholder="搜索姓名 / 用户名" style="width: 200px" clearable />
            </div>
          </template>
          <el-table :data="filteredStudents" height="520" size="small" stripe @row-click="openStudent">
            <el-table-column prop="displayName" label="姓名" width="110" fixed />
            <el-table-column prop="className" label="班级" width="110" />
            <el-table-column prop="answers" label="作答" width="70" align="center" />
            <el-table-column label="正确率" width="85" align="center">
              <template #default="{ row }">{{ row.accuracy === null ? '—' : row.accuracy + '%' }}</template>
            </el-table-column>
            <el-table-column label="掌握度" width="90" align="center">
              <template #default="{ row }">{{ row.avgMastery === null ? '—' : Math.round(row.avgMastery * 100) + '%' }}</template>
            </el-table-column>
            <el-table-column label="游戏一" width="75" align="center">
              <template #default="{ row }">{{ row.game1Sessions }} 局</template>
            </el-table-column>
            <el-table-column label="游戏二" width="75" align="center">
              <template #default="{ row }">{{ row.game2Decisions }} 决策</template>
            </el-table-column>
            <el-table-column label="最近活跃" width="120">
              <template #default="{ row }">{{ fmtDate(row.lastActiveAt) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="95">
              <template #default="{ row }">
                <el-tag :type="riskType(row.risk.level)" size="small" effect="plain">{{ row.risk.label }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="profileSummary" label="画像摘要" min-width="180" show-overflow-tooltip />
            <el-table-column label="操作" width="80" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link size="small" @click.stop="openStudent(row)">查看</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="students.length === 0" description="暂无注册学生" :image-size="70" />
        </el-card>

        <!-- ================= 行为流 ================= -->
        <el-card class="card" shadow="hover">
          <template #header><b>🛰️ 最近行为流（两游戏 + 学习）</b></template>
          <div class="feed">
            <div v-for="(e, i) in activity" :key="i" class="feed-item">
              <el-tag size="small" :type="sourceType(e.source)" effect="plain">{{ sourceLabel(e.source) }}</el-tag>
              <span class="feed-name">{{ e.name }}</span>
              <span class="feed-type">{{ e.type }}</span>
              <span class="feed-time">{{ fmtDate(e.at) }}</span>
            </div>
            <el-empty v-if="activity.length === 0" description="暂无行为数据" :image-size="60" />
          </div>
        </el-card>
      </template>
    </template>

    <!-- ================= 学生详情抽屉 ================= -->
    <el-drawer v-model="drawer" :title="detail?.user?.displayName || '学生详情'" size="58%">
      <div v-if="detailLoading" v-loading="true" class="detail-loading"></div>
      <div v-else-if="detail" class="detail">
        <!-- 基本信息 -->
        <div class="d-head">
          <div>
            <div class="d-name">{{ detail.user.displayName }}</div>
            <div class="d-meta">{{ detail.user.username }} · {{ detail.user.className }} · 注册于 {{ fmtDate(detail.user.createdAt) }}</div>
          </div>
          <el-button size="small" type="primary" :loading="adviceLoading" @click="regenAdvice">重新生成学习建议</el-button>
        </div>

        <div class="d-tags">
          <el-tag v-for="t in detail.profile.tags" :key="t" size="small" type="success" effect="plain">{{ t }}</el-tag>
          <el-tag size="small" type="info" effect="plain">画像摘要：{{ detail.profile.summary }}</el-tag>
        </div>

        <!-- 雷达 + 画像 -->
        <el-row :gutter="14">
          <el-col :xs="24" :md="10">
            <div ref="detailRadarRef" class="d-radar"></div>
          </el-col>
          <el-col :xs="24" :md="14">
            <div class="d-block-title">AI 文字画像</div>
            <div class="d-narrative">{{ detail.profile.narrative }}</div>
          </el-col>
        </el-row>

        <!-- 学习建议 -->
        <div class="d-block-title">学习建议（{{ detail.advice?.items?.length || 0 }} 条）</div>
        <div class="d-advice">
          <div v-for="(it, i) in detail.advice?.items || []" :key="i" class="d-advice-item">
            <b>{{ it.priority }}.</b>
            <div>
              <div class="d-advice-title">{{ it.title }} <span class="d-min">{{ it.minutes }} 分钟</span></div>
              <div class="d-advice-action">{{ it.action }}</div>
              <div class="d-advice-reason">{{ it.reason }}</div>
            </div>
          </div>
          <el-empty v-if="!detail.advice" description="尚未生成建议" :image-size="50" />
        </div>

        <!-- 薄弱节点 -->
        <div class="d-block-title">薄弱知识节点</div>
        <div class="d-nodes">
          <el-tag
            v-for="n in weakNodes" :key="n.id" type="danger" effect="plain"
            :title="`掌握度 ${n.pKnown === null ? '未学' : Math.round(n.pKnown * 100) + '%'}`"
          >{{ n.name }}</el-tag>
          <span v-if="weakNodes.length === 0" class="d-none">暂无明显薄弱节点</span>
        </div>

        <!-- 近期作答 -->
        <div class="d-block-title">近期作答</div>
        <el-table :data="detail.recent.answers" size="small" max-height="220">
          <el-table-column prop="questionId" label="题号" width="60" />
          <el-table-column prop="topic" label="知识点" width="110" />
          <el-table-column prop="difficulty" label="难度" width="80" />
          <el-table-column label="结果" width="70">
            <template #default="{ row }">
              <el-tag size="small" :type="row.correct ? 'success' : 'danger'" effect="plain">{{ row.correct ? '对' : '错' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="耗时" width="80">
            <template #default="{ row }">{{ row.durationSec === null ? '—' : row.durationSec + 's' }}</template>
          </el-table-column>
          <el-table-column label="时间" min-width="120">
            <template #default="{ row }">{{ fmtDate(row.at) }}</template>
          </el-table-column>
        </el-table>

        <!-- 游戏记录 -->
        <el-row :gutter="14">
          <el-col :xs="24" :md="12">
            <div class="d-block-title">游戏一（政策模拟）</div>
            <div v-for="(g, i) in detail.recent.game1" :key="i" class="d-game">
              <el-tag size="small" effect="plain">{{ g.mode === 'sandbox' ? '沙盘' : '学习' }}</el-tag>
              <span>{{ g.quarters }} 季 · 评分 {{ g.score ?? '—' }} · 政策 {{ g.policies }} 项</span>
              <span class="d-time">{{ fmtDate(g.at) }}</span>
            </div>
            <div v-if="!detail.recent.game1.length" class="d-none">暂无对局</div>
          </el-col>
          <el-col :xs="24" :md="12">
            <div class="d-block-title">游戏二（多人博弈）</div>
            <div v-for="(g, i) in detail.recent.game2.slice(0, 5)" :key="i" class="d-game">
              <el-tag size="small" effect="plain">{{ roleLabel(g.role) }}</el-tag>
              <span>第 {{ g.round }} 回合 · {{ summarizeDecision(g.decision) }}</span>
            </div>
            <div v-if="!detail.recent.game2.length" class="d-none">暂无决策</div>
          </el-col>
        </el-row>

        <!-- 行为流 -->
        <div class="d-block-title">行为事件（最近 20 条）</div>
        <div class="d-events">
          <div v-for="(e, i) in detail.recent.events" :key="i" class="d-event">
            <el-tag size="small" :type="sourceType(e.source)" effect="plain">{{ sourceLabel(e.source) }}</el-tag>
            <span class="d-event-type">{{ e.type }}</span>
            <span class="d-time">{{ fmtDate(e.at) }}</span>
          </div>
          <div v-if="!detail.recent.events.length" class="d-none">暂无事件</div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as echarts from 'echarts'
import { ElMessage } from 'element-plus'
import request from '@/api/request'
import {
  fetchOverview, fetchStudents, fetchStudent, regenerateAdvice,
  fetchClassInsight, fetchClasses, fetchActivity
} from '@/api/teacher'

defineEmits(['back', 'open-page'])

const loading = ref(true)
const forbidden = ref(false)
const className = ref('')
const classes = ref([])
const overview = ref({})
const students = ref([])
const activity = ref([])
const insight = ref(null)
const insightLoading = ref(false)
const keyword = ref('')

const drawer = ref(false)
const detail = ref(null)
const detailLoading = ref(false)
const adviceLoading = ref(false)

const topicChartRef = ref(null)
const activityChartRef = ref(null)
const detailRadarRef = ref(null)
let topicChart = null
let actChart = null
let dRadar = null

/** 列表搜索过滤 */
const filteredStudents = computed(() => {
  const k = keyword.value.trim()
  if (!k) return students.value
  return students.value.filter((s) => s.displayName.includes(k) || s.username.includes(k))
})

/** 薄弱节点：掌握度最低且已作答的 8 个 */
const weakNodes = computed(() => {
  const nodes = detail.value?.nodes || []
  return nodes
    .filter((n) => n.pKnown !== null && n.pKnown < 0.6)
    .sort((a, b) => a.pKnown - b.pKnown)
    .slice(0, 8)
})

function riskType(level) {
  return { high: 'danger', medium: 'warning', low: 'success', new: 'info' }[level] || 'info'
}
function sourceLabel(s) {
  return { game1: '游戏一', game2: '游戏二', learning: '学习', ai: 'AI' }[s] || s
}
function sourceType(s) {
  return { game1: 'warning', game2: 'danger', learning: 'success', ai: 'primary' }[s] || 'info'
}
function roleLabel(r) {
  return { government: '政府', bank: '银行', enterprise: '企业', consumer: '消费者' }[r] || r
}
function summarizeDecision(d) {
  if (!d || typeof d !== 'object') return '—'
  const parts = Object.entries(d).map(([k, v]) => `${k}${v > 0 ? '+' : ''}${v}`)
  return parts.slice(0, 3).join(' ') || '—'
}
function fmtDate(t) {
  if (!t) return '—'
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 渲染两个概览图 */
function renderOverviewCharts() {
  const topics = overview.value.topics || []

  if (topicChartRef.value) {
    if (!topicChart) topicChart = echarts.init(topicChartRef.value)
    topicChart.setOption({
      grid: { left: 90, right: 20, top: 16, bottom: 24 },
      xAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
      yAxis: { type: 'category', data: topics.map((t) => t.topic), axisLabel: { fontSize: 11 } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      series: [{
        type: 'bar',
        data: topics.map((t) => Math.round(t.avgMastery * 100)),
        barWidth: 16,
        itemStyle: {
          borderRadius: [0, 8, 8, 0],
          color: (p) => (p.value < 35 ? '#f56c6c' : p.value < 60 ? '#e6a23c' : '#67c23a')
        },
        label: { show: true, position: 'right', formatter: '{c}%', fontSize: 11 }
      }]
    })
  }

  if (activityChartRef.value) {
    if (!actChart) actChart = echarts.init(activityChartRef.value)
    const act = overview.value.activity || []
    actChart.setOption({
      grid: { left: 40, right: 20, top: 30, bottom: 24 },
      legend: { top: 0, textStyle: { fontSize: 11 } },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: act.map((a) => String(a.date).slice(5, 10)) },
      yAxis: [{ type: 'value', name: '作答' }],
      series: [
        { name: '作答数', type: 'bar', data: act.map((a) => a.answers), barWidth: 14, itemStyle: { color: '#667eea', borderRadius: [6, 6, 0, 0] } },
        { name: '活跃人数', type: 'line', smooth: true, data: act.map((a) => a.users), itemStyle: { color: '#f56c6c' } }
      ]
    })
  }
}

/** 渲染详情雷达 */
function renderDetailRadar() {
  if (!detailRadarRef.value || !detail.value) return
  if (!dRadar) dRadar = echarts.init(detailRadarRef.value)
  const radar = detail.value.profile.radar || []
  dRadar.setOption({
    radar: {
      indicator: radar.map((r) => ({ name: r.name, max: 100 })),
      radius: '62%',
      splitNumber: 4,
      axisName: { fontSize: 10, color: '#606266' }
    },
    series: [{
      type: 'radar',
      data: [{
        value: radar.map((r) => r.value),
        areaStyle: { color: 'rgba(102,126,234,0.28)' },
        lineStyle: { color: '#667eea' },
        itemStyle: { color: '#667eea' }
      }]
    }]
  })
}

/** 加载班级数据 */
async function loadAll() {
  loading.value = true
  forbidden.value = false
  try {
    const [oRes, sRes, cRes, aRes] = await Promise.all([
      fetchOverview(className.value || null),
      fetchStudents(className.value || null),
      fetchClasses(),
      fetchActivity(20)
    ])
    overview.value = oRes.data.data
    students.value = sRes.data.data.list || []
    classes.value = cRes.data.data.list || []
    activity.value = aRes.data.data.list || []
    await nextTick()
    renderOverviewCharts()
  } catch (e) {
    if (e?.response?.status === 403 || e?.response?.status === 401) {
      forbidden.value = true
    } else {
      ElMessage.error(e?.response?.data?.message || '数据加载失败')
    }
  } finally {
    loading.value = false
  }
}

/** 生成班级简报 */
async function genInsight() {
  insightLoading.value = true
  try {
    const res = await fetchClassInsight(className.value || null)
    insight.value = res.data.data
    ElMessage.success('班级简报已生成')
  } catch {
    ElMessage.error('简报生成失败')
  } finally {
    insightLoading.value = false
  }
}

/** 打开学生详情 */
async function openStudent(row) {
  drawer.value = true
  detailLoading.value = true
  detail.value = null
  try {
    const res = await fetchStudent(row.userId)
    detail.value = res.data.data
    await nextTick()
    renderDetailRadar()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '学生详情加载失败')
    drawer.value = false
  } finally {
    detailLoading.value = false
  }
}

/** 重新生成该生建议 */
async function regenAdvice() {
  if (!detail.value) return
  adviceLoading.value = true
  try {
    const res = await regenerateAdvice(detail.value.user.userId)
    detail.value.advice = res.data.data
    ElMessage.success('已重新生成')
  } catch {
    ElMessage.error('生成失败')
  } finally {
    adviceLoading.value = false
  }
}

/** 导出 CSV（用 axios 带 JWT，再转 blob 下载） */
async function exportCsv() {
  try {
    const res = await request.get('/teacher/export', {
      params: className.value ? { className: className.value } : {},
      responseType: 'blob'
    })
    const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `学情导出_${className.value || '全部班级'}.csv`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('已导出')
  } catch {
    ElMessage.error('导出失败')
  }
}

function onResize() {
  topicChart && topicChart.resize()
  actChart && actChart.resize()
  dRadar && dRadar.resize()
}

onMounted(() => {
  loadAll()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  ;[topicChart, actChart, dRadar].forEach((c) => c && c.dispose())
  topicChart = null
  actChart = null
  dRadar = null
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
.header-right { margin-left: auto; display: flex; gap: 8px; align-items: center; }

.stat-row { margin-bottom: 4px; }
.stat-card { border-radius: 12px; padding: 16px; color: #fff; margin-bottom: 14px; }
.stat-card.c1 { background: linear-gradient(135deg, #667eea, #764ba2); }
.stat-card.c2 { background: linear-gradient(135deg, #43e97b, #38f9d7); }
.stat-card.c3 { background: linear-gradient(135deg, #fa709a, #fee140); }
.stat-card.c4 { background: linear-gradient(135deg, #4facfe, #00f2fe); }
.stat-card .num { font-size: 24px; font-weight: 700; }
.stat-card .lab { font-size: 12px; opacity: 0.92; margin-top: 4px; }

.card { border-radius: 12px; margin-bottom: 16px; }
.card-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.hint-text { font-size: 12px; color: #909399; }

.risk-bar { display: flex; height: 16px; border-radius: 8px; overflow: hidden; background: #f0f2f5; }
.risk-seg { height: 100%; min-width: 0; }
.risk-seg.high { background: #f56c6c; }
.risk-seg.medium { background: #e6a23c; }
.risk-seg.low { background: #67c23a; }
.risk-seg.new { background: #c0c4cc; }

.chart { width: 100%; height: 300px; }

.insight-headline { font-size: 17px; font-weight: 700; color: #303133; margin-bottom: 8px; }
.insight-overview { font-size: 13px; color: #606266; line-height: 1.9; }
.insight-grid { margin-top: 12px; }
.insight-block { background: #fafbfd; border-radius: 10px; padding: 12px 14px; height: 100%; }
.block-title { font-size: 13px; font-weight: 700; color: #303133; margin-bottom: 6px; }
.insight-block ul { margin: 0; padding-left: 18px; }
.insight-block li { font-size: 12.5px; color: #606266; line-height: 1.9; }
.focus-row { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.focus-label { font-size: 12px; color: #909399; }

.feed { display: flex; flex-direction: column; gap: 8px; max-height: 260px; overflow-y: auto; }
.feed-item { display: flex; gap: 10px; align-items: center; font-size: 12.5px; color: #606266; }
.feed-name { font-weight: 600; color: #303133; min-width: 80px; }
.feed-type { color: #909399; font-family: Consolas, monospace; }
.feed-time { margin-left: auto; color: #c0c4cc; }

.detail-loading { height: 300px; }
.detail { display: flex; flex-direction: column; gap: 12px; }
.d-head { display: flex; justify-content: space-between; align-items: center; }
.d-name { font-size: 18px; font-weight: 700; color: #303133; }
.d-meta { font-size: 12px; color: #909399; margin-top: 4px; }
.d-tags { display: flex; gap: 8px; flex-wrap: wrap; }
.d-block-title { font-size: 13px; font-weight: 700; color: #303133; margin-top: 8px; border-left: 3px solid #667eea; padding-left: 8px; }
.d-radar { width: 100%; height: 240px; }
.d-narrative { font-size: 13px; color: #606266; line-height: 1.9; white-space: pre-wrap; }
.d-advice { display: flex; flex-direction: column; gap: 8px; }
.d-advice-item { display: flex; gap: 8px; font-size: 12.5px; color: #606266; background: #fafbfd; border-radius: 8px; padding: 8px 10px; }
.d-advice-title { font-weight: 700; color: #303133; }
.d-min { font-weight: 400; color: #909399; font-size: 11px; margin-left: 6px; }
.d-advice-reason { color: #909399; font-size: 11.5px; }
.d-nodes { display: flex; gap: 8px; flex-wrap: wrap; }
.d-none { font-size: 12px; color: #c0c4cc; }
.d-game { display: flex; gap: 8px; align-items: center; font-size: 12px; color: #606266; padding: 4px 0; flex-wrap: wrap; }
.d-time { margin-left: auto; color: #c0c4cc; font-size: 11px; }
.d-events { display: flex; flex-direction: column; gap: 6px; max-height: 200px; overflow-y: auto; }
.d-event { display: flex; gap: 8px; align-items: center; font-size: 12px; color: #606266; }
.d-event-type { font-family: Consolas, monospace; color: #909399; }
</style>

<!--
  学习数据统计视图
  -------------------------------------------------
  功能：
  1. 近 7 天刷题时长 / 做题数 / 错题数 折线图
  2. 知识点掌握情况（掌握率条形图 + 雷达图）
  3. 错题分布（按知识点柱状图）
  4. 薄弱板块 Top3（自动识别，点击可去专项练习）
  5. 个人学习周报（自动生成文本）
-->
<template>
  <div class="page-container">

    <!-- 顶部导航 -->
    <div class="page-header">
      <el-button class="back-btn" @click="$emit('back')">← 返回首页</el-button>
      <h1 class="page-title">📊 学习数据统计</h1>
      <span class="page-sub">刷题时长 · 掌握度 · 错题分布 · 学习周报</span>
    </div>

    <!-- 概览指标卡 -->
    <el-row :gutter="16" class="stat-row">
      <el-col :span="6" :xs="12"><div class="stat-card sc1"><div class="num">{{ total7.days }}</div><div class="lab">近7天学习(天)</div></div></el-col>
      <el-col :span="6" :xs="12"><div class="stat-card sc2"><div class="num">{{ total7.hours }}</div><div class="lab">近7天总时长(小时)</div></div></el-col>
      <el-col :span="6" :xs="12"><div class="stat-card sc3"><div class="num">{{ total7.done }}</div><div class="lab">近7天做题数</div></div></el-col>
      <el-col :span="6" :xs="12"><div class="stat-card sc4"><div class="num">{{ total7.wrong }}</div><div class="lab">近7天错题数</div></div></el-col>
    </el-row>

    <el-row :gutter="16">
      <!-- 近7天学习曲线 -->
      <el-col :span="14" :xs="24">
        <el-card class="card" shadow="hover">
          <template #header><b>📈 近 7 天学习曲线</b></template>
          <div ref="lineRef" class="chart"></div>
        </el-card>
      </el-col>

      <!-- 知识点掌握 -->
      <el-col :span="10" :xs="24">
        <el-card class="card" shadow="hover">
          <template #header><b>🎯 知识点掌握雷达</b>
            <el-tag v-if="bktTopics" size="small" type="success" style="margin-left:8px">BKT 知识追踪模型</el-tag>
            <el-tag v-else size="small" type="info" style="margin-left:8px">本地正确率模式</el-tag>
          </template>
          <div ref="radarRef" class="chart"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <!-- 掌握率条形 -->
      <el-col :span="12" :xs="24">
        <el-card class="card" shadow="hover">
          <template #header><b>🧩 各知识点掌握率（做过的题）</b></template>
          <div ref="barRef" class="chart"></div>
        </el-card>
      </el-col>

      <!-- 错题分布 -->
      <el-col :span="12" :xs="24">
        <el-card class="card" shadow="hover">
          <template #header><b>📕 错题分布（错题本）</b></template>
          <div ref="pieRef" class="chart"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <!-- 薄弱板块 -->
      <el-col :span="10" :xs="24">
        <el-card class="card" shadow="hover">
          <template #header><b>⚡ 薄弱板块 Top3（建议专项巩固）</b></template>
          <el-empty v-if="weakTop.length === 0" description="暂无数据，先去刷几组题吧" :image-size="70" />
          <div v-else class="weak-list">
            <div v-for="(w, i) in weakTop" :key="w.topic" class="weak-item">
              <el-tag :type="['danger', 'warning', 'info'][i]">No.{{ i + 1 }}</el-tag>
              <span class="weak-name">{{ w.topic }}</span>
              <el-progress :percentage="w.rate" :stroke-width="12" :color="['#f56c6c', '#e6a23c', '#909399'][i]" class="weak-prog" />
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 学习周报 -->
      <el-col :span="14" :xs="24">
        <el-card class="card" shadow="hover">
          <template #header><b>📮 个人学习周报（近7天）</b></template>
          <pre class="report">{{ weeklyReport }}</pre>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as echarts from 'echarts'
import { learningStore } from '@/store/learning'
import { TOPICS } from '@/data/questionBank'
import { todayStr } from '@/utils/storage'
import { getMastery } from '@/api/record'

defineEmits(['back'])

const store = learningStore.state

/* ================= BKT 云端掌握度（大创学习分析亮点） =================
 * 优先用后端 BKT 贝叶斯知识追踪模型输出的"掌握概率"渲染雷达图；
 * 后端不可用时自动回落本地 localStorage 的正确率，两种模式都有数据看 */
const bktTopics = ref(null) // [{ topic, pKnown, attempts, correctCount, rate }] | null

async function loadBkt() {
  try {
    const res = await getMastery()
    bktTopics.value = res.data.data.topics
  } catch {
    bktTopics.value = null // 静默回落本地模式
  }
}

/* ================= 近7天数据 ================= */
/** 生成最近7天的日期数组（含今天） */
function last7Days() {
  const arr = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    arr.push({ key: `${d.getFullYear()}-${m}-${day}`, label: `${m}-${day}` })
  }
  return arr
}
const days = last7Days()

const total7 = computed(() => {
  let seconds = 0, done = 0, wrong = 0, active = 0
  for (const d of days) {
    const log = store.studyLog[d.key]
    if (log) {
      seconds += log.seconds
      done += log.done
      wrong += log.wrong
      if (log.seconds > 0 || log.done > 0) active++
    }
  }
  return { days: active, hours: (seconds / 3600).toFixed(2), done, wrong }
})

/* ================= 知识点掌握 ================= */
/** 各知识点的掌握率（做过题的才有数据） */
const masteryList = computed(() =>
  TOPICS.map(t => {
    const m = store.mastery[t]
    return { topic: t, rate: m && m.total > 0 ? Math.round((m.correct / m.total) * 100) : null, total: m ? m.total : 0 }
  })
)

/** 薄弱板块 Top3：按掌握率升序取前3（只统计做过≥2题的） */
const weakTop = computed(() =>
  masteryList.value
    .filter(m => m.rate !== null && m.total >= 2)
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 3)
)

/* ================= 错题分布 ================= */
const wrongDist = computed(() => {
  const map = {}
  for (const w of store.wrongBook) map[w.snap.topic] = (map[w.snap.topic] || 0) + 1
  return Object.keys(map).map(k => ({ name: k, value: map[k] }))
})

/* ================= 学习周报文本 ================= */
const weeklyReport = computed(() => {
  const t = total7.value
  let lines = []
  lines.push(`【学习时长】本周共学习 ${t.hours} 小时，有效学习 ${t.days} 天，平均每天 ${(t.days ? (t.hours / t.days) : 0).toFixed(2)} 小时。`)
  lines.push(`【刷题情况】完成 ${t.done} 题，答错 ${t.wrong} 题，正确率 ${t.done ? Math.round(((t.done - t.wrong) / t.done) * 100) : 0}%。`)
  lines.push(`【错题本】当前待巩固错题 ${store.wrongBook.length} 道。`)

  const done = masteryList.value.filter(m => m.rate !== null)
  if (done.length) {
    const best = [...done].sort((a, b) => b.rate - a.rate)[0]
    lines.push(`【最佳板块】${best.topic}（掌握率 ${best.rate}%），继续保持！`)
  }
  if (weakTop.value.length) {
    const names = weakTop.value.map(w => `${w.topic}(${w.rate}%)`).join('、')
    lines.push(`【薄弱板块】${names}——建议去"题库练习"专项刷题，并重做错题本中的相关错题。`)
  } else {
    lines.push('【薄弱板块】暂无足够数据（每个知识点至少做过2题才会参与评估）。')
  }
  lines.push('【学习建议】每天保持 30 分钟专项刷题 + 10 分钟错题重做，考前用"AI 助手"生成速记提纲。')
  return lines.join('\n')
})

/* ================= ECharts 渲染 ================= */
const lineRef = ref(null)
const radarRef = ref(null)
const barRef = ref(null)
const pieRef = ref(null)
let charts = []

function render() {
  // ① 近7天折线：时长(分钟) / 做题数 / 错题数
  const lineChart = echarts.init(lineRef.value)
  lineChart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['时长(分钟)', '做题数', '错题数'] },
    grid: { left: 50, right: 20, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: days.map(d => d.label) },
    yAxis: { type: 'value' },
    series: [
      {
        name: '时长(分钟)', type: 'line', smooth: true, symbolSize: 8,
        lineStyle: { width: 3, color: '#667eea' }, itemStyle: { color: '#667eea' },
        areaStyle: { color: 'rgba(102,126,234,0.15)' },
        data: days.map(d => Math.round((store.studyLog[d.key]?.seconds || 0) / 60))
      },
      {
        name: '做题数', type: 'line', smooth: true, symbolSize: 8,
        lineStyle: { width: 3, color: '#67c23a' }, itemStyle: { color: '#67c23a' },
        data: days.map(d => store.studyLog[d.key]?.done || 0)
      },
      {
        name: '错题数', type: 'line', smooth: true, symbolSize: 8,
        lineStyle: { width: 3, color: '#f56c6c' }, itemStyle: { color: '#f56c6c' },
        data: days.map(d => store.studyLog[d.key]?.wrong || 0)
      }
    ]
  })

  // ② 掌握雷达：优先 BKT 掌握概率（pKnown×100），无云端数据回落本地正确率
  const radarChart = echarts.init(radarRef.value)
  const radarValues = bktTopics.value
    ? TOPICS.map((t) => {
        const b = bktTopics.value.find((x) => x.topic === t)
        return b ? Math.round(b.pKnown * 100) : 0
      })
    : TOPICS.map(t => {
        const m = store.mastery[t]
        return m && m.total > 0 ? Math.round((m.correct / m.total) * 100) : 0
      })
  radarChart.setOption({
    tooltip: {},
    radar: {
      indicator: TOPICS.map(t => ({ name: t, max: 100 })),
      radius: '62%'
    },
    series: [{
      type: 'radar',
      data: [{
        value: radarValues,
        name: bktTopics.value ? '掌握概率(%)' : '掌握率(%)',
        areaStyle: { color: 'rgba(102,126,234,0.3)' },
        lineStyle: { color: '#667eea', width: 3 },
        itemStyle: { color: '#667eea' }
      }]
    }]
  })

  // ③ 掌握率条形
  const barChart = echarts.init(barRef.value)
  barChart.setOption({
    tooltip: { formatter: (p) => `${p.name}：${p.value === null ? '未做过题' : p.value + '%'}` },
    grid: { left: 90, right: 30, top: 20, bottom: 30 },
    xAxis: { type: 'value', max: 100 },
    yAxis: { type: 'category', data: TOPICS, inverse: true },
    series: [{
      type: 'bar',
      barWidth: 18,
      label: { show: true, position: 'right', formatter: (p) => p.value === null ? '—' : p.value + '%' },
      data: TOPICS.map(t => {
        const m = store.mastery[t]
        return m && m.total > 0 ? Math.round((m.correct / m.total) * 100) : null
      }),
      itemStyle: {
        borderRadius: 9,
        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
          { offset: 0, color: '#667eea' }, { offset: 1, color: '#764ba2' }
        ])
      }
    }]
  })

  // ④ 错题分布饼图
  const pieChart = echarts.init(pieRef.value)
  pieChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}：{c} 道（{d}%）' },
    legend: { bottom: 0 },
    series: [{
      type: 'pie',
      radius: ['38%', '65%'],
      center: ['50%', '44%'],
      label: { show: true, formatter: '{b}\n{c}道' },
      data: wrongDist.value.length ? wrongDist.value : [{ name: '暂无错题', value: 0, itemStyle: { color: '#dcdfe6' } }],
      color: ['#f56c6c', '#e6a23c', '#667eea', '#67c23a', '#409eff', '#909399']
    }]
  })

  charts = [lineChart, radarChart, barChart, pieChart]
}

/** 窗口尺寸变化时自适应 */
function resize() {
  charts.forEach(c => c.resize())
}

onMounted(async () => {
  await loadBkt()  // 先拉 BKT 云端掌握度（失败自动回落本地模式）
  await nextTick() // 等待 DOM 渲染完成再初始化图表
  render()
  window.addEventListener('resize', resize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  charts.forEach(c => c.dispose())
})
</script>

<style scoped>
.page-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 30px 20px;
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);
  font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
}
.page-header { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
.page-title { margin: 0; font-size: 24px; color: #303133; }
.page-sub { font-size: 13px; color: #909399; }
.card { border-radius: 12px; margin-bottom: 16px; }

/* 指标卡 */
.stat-row { margin-bottom: 16px; }
.stat-card {
  border-radius: 12px;
  color: #fff;
  padding: 18px;
  text-align: center;
}
.sc1 { background: linear-gradient(135deg, #667eea, #764ba2); }
.sc2 { background: linear-gradient(135deg, #30cfd0, #330867); }
.sc3 { background: linear-gradient(135deg, #43e97b, #38f9d7); }
.sc4 { background: linear-gradient(135deg, #f093fb, #f5576c); }
.stat-card .num { font-size: 30px; font-weight: 700; }
.stat-card .lab { font-size: 12.5px; opacity: 0.9; margin-top: 4px; }

.chart { height: 300px; }

/* 薄弱板块 */
.weak-list { display: flex; flex-direction: column; gap: 14px; }
.weak-item { display: flex; align-items: center; gap: 10px; }
.weak-name { width: 90px; color: #303133; font-size: 14px; flex-shrink: 0; }
.weak-prog { flex: 1; }

/* 周报 */
.report {
  white-space: pre-wrap;
  font-family: 'Microsoft YaHei', sans-serif;
  font-size: 14px;
  line-height: 2.1;
  color: #303133;
  background: #f8f9fc;
  border-radius: 10px;
  padding: 16px;
  margin: 0;
}
</style>

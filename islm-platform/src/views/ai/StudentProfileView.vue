<!--
  学生画像页（AI 部分 · 学生视角）
  ================================================================
  展示三块内容：
    1. 量化画像：六维能力雷达 + 五个知识点掌握度 + 学习习惯指标
    2. 文字画像：AI 根据真实行为数据生成的叙述（规则兜底，绝不编造）
    3. 行动建议：强化学习策略选出的"下一知识节点" + 3~5 条可执行建议
  另附"AI 引擎状态"卡片，让强化学习的训练进度对学生/答辩老师可见。
-->
<template>
  <div class="page-container">
    <div class="page-header">
      <el-button class="back-btn" @click="$emit('back')">← 返回首页</el-button>
      <h1 class="page-title">🧬 我的学习画像</h1>
      <span class="page-sub">由两游戏操作 + 学习行为共同生成 · 强化学习驱动建议</span>
    </div>

    <!-- 加载 / 错误 -->
    <el-skeleton v-if="loading" :rows="8" animated class="card" />
    <el-alert v-else-if="error" type="error" :closable="false" :title="error" class="card" />
    <el-empty v-else-if="empty" description="还没有学习数据，先去做几道题或玩一局游戏吧" class="card">
      <el-button type="primary" @click="$emit('open-page', 'exercise')">去题库练习</el-button>
    </el-empty>

    <template v-else>
      <!-- ================= 画像摘要 ================= -->
      <el-card class="card summary-card" shadow="hover">
        <div class="summary-row">
          <div class="summary-main">
            <div class="summary-label">画像摘要</div>
            <div class="summary-text">{{ profile.summary || '数据积累中…' }}</div>
            <div class="tag-row">
              <el-tag v-for="t in profile.tags" :key="t" size="small" type="success" effect="plain">{{ t }}</el-tag>
              <el-tag size="small" type="info" effect="plain" v-if="profile.source === 'rule'">规则画像</el-tag>
              <el-tag size="small" type="warning" effect="plain" v-else>AI 画像</el-tag>
            </div>
          </div>
          <div class="summary-actions">
            <div class="time">更新于 {{ fmtTime(profile.generatedAt) }}</div>
            <el-button type="primary" :loading="refreshing" @click="refreshAll">🔄 重新生成</el-button>
          </div>
        </div>
      </el-card>

      <!-- ================= 量化画像 ================= -->
      <el-row :gutter="16">
        <el-col :xs="24" :md="10">
          <el-card class="card" shadow="hover">
            <template #header><b>🎯 六维能力雷达</b></template>
            <div ref="radarRef" class="chart radar-chart"></div>
          </el-card>
        </el-col>
        <el-col :xs="24" :md="14">
          <el-card class="card" shadow="hover">
            <template #header>
              <div class="card-head">
                <b>📚 知识点掌握度（BKT）</b>
                <span class="hint-text">节点级掌握：{{ profile.dimensions.nodes?.attempted ?? 0 }} / {{ profile.dimensions.nodes?.total ?? 25 }}</span>
              </div>
            </template>
            <div class="topic-list">
              <div v-for="k in profile.dimensions.knowledge" :key="k.topic" class="topic-item">
                <div class="topic-name">{{ k.topic }}</div>
                <el-progress
                  :percentage="Math.round(k.pKnown * 100)"
                  :stroke-width="12"
                  :color="masteryColor(k.pKnown)"
                  class="topic-bar"
                />
                <div class="topic-meta">{{ k.attempts }} 题 · 正确率 {{ k.accuracy ?? '—' }}%</div>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- ================= 学习习惯 + 游戏表现 ================= -->
      <el-row :gutter="16">
        <el-col :xs="24" :md="12">
          <el-card class="card" shadow="hover">
            <template #header><b>🕒 学习行为</b></template>
            <div class="stat-grid">
              <div class="stat"><div class="num">{{ habits.answers ?? 0 }}</div><div class="lab">累计作答</div></div>
              <div class="stat"><div class="num">{{ habits.accuracy ?? 0 }}%</div><div class="lab">正确率</div></div>
              <div class="stat"><div class="num">{{ habits.activeDays ?? 0 }}</div><div class="lab">活跃天数</div></div>
              <div class="stat"><div class="num">{{ habits.streak ?? 0 }}</div><div class="lab">连续天数</div></div>
              <div class="stat"><div class="num">{{ habits.avgDurationSec ?? '—' }}</div><div class="lab">平均耗时(s)</div></div>
              <div class="stat"><div class="num">{{ habits.wrongBook ?? 0 }}</div><div class="lab">错题本</div></div>
            </div>
            <el-divider content-position="left">阶梯导学使用</el-divider>
            <div class="hint-stats">
              <span v-for="lv in [1, 2, 3, 4]" :key="lv" class="hint-chip">
                L{{ lv }} <b>{{ hint.byLevel?.[lv] ?? 0 }}</b>
              </span>
              <span class="hint-chip danger">直取解析 <b>{{ hint.directL4 ?? 0 }}</b></span>
            </div>
            <div class="hint-tip" v-if="hint.directL4 > 0">
              直取完整解析会跳过思考过程，建议优先用完 L1→L3。
            </div>
          </el-card>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-card class="card" shadow="hover">
            <template #header><b>🎮 游戏中的表现</b></template>
            <div class="game-block">
              <div class="game-title">游戏一 · 经济舵手（单机政策模拟）</div>
              <div class="stat-grid small">
                <div class="stat"><div class="num">{{ g1.sessions ?? 0 }}</div><div class="lab">对局数</div></div>
                <div class="stat"><div class="num">{{ g1.bestScore ?? '—' }}</div><div class="lab">最高评分</div></div>
                <div class="stat"><div class="num">{{ g1.policies ?? 0 }}</div><div class="lab">执行政策</div></div>
                <div class="stat"><div class="num">{{ g1.quizCorrect ?? 0 }}/{{ g1.quizTotal ?? 0 }}</div><div class="lab">政策题答对</div></div>
              </div>
              <div class="cat-row" v-if="g1.policyCategories?.length">
                偏好政策：
                <el-tag v-for="c in g1.policyCategories" :key="c" size="small" effect="plain">{{ c }}</el-tag>
              </div>
            </div>
            <el-divider />
            <div class="game-block">
              <div class="game-title">游戏二 · 多人博弈沙盘</div>
              <div class="stat-grid small">
                <div class="stat"><div class="num">{{ g2.rooms ?? 0 }}</div><div class="lab">主持房间</div></div>
                <div class="stat"><div class="num">{{ g2.decisions ?? 0 }}</div><div class="lab">决策次数</div></div>
                <div class="stat"><div class="num">{{ g2.roles ?? 0 }}</div><div class="lab">担任角色</div></div>
                <div class="stat"><div class="num">{{ g2.chats ?? 0 }}</div><div class="lab">协商发言</div></div>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- ================= AI 文字画像 ================= -->
      <el-card class="card" shadow="hover">
        <template #header>
          <div class="card-head">
            <b>🪞 AI 文字画像</b>
            <span class="hint-text">基于作答、提示、两游戏行为生成</span>
          </div>
        </template>
        <div class="narrative">{{ profile.narrative }}</div>
      </el-card>

      <!-- ================= 学习建议 ================= -->
      <el-card class="card" shadow="hover">
        <template #header>
          <div class="card-head">
            <b>🧭 针对性学习建议</b>
            <el-button size="small" :loading="adviceLoading" @click="refreshAdvice">重新生成建议</el-button>
          </div>
        </template>

        <el-alert
          v-if="advice && advice.narrative"
          type="success" :closable="false" class="advice-narrative"
          :title="advice.narrative"
        />

        <div class="advice-list">
          <div v-for="(it, idx) in advice?.items || []" :key="idx" class="advice-item">
            <div class="advice-idx" :class="'p' + it.priority">{{ it.priority }}</div>
            <div class="advice-body">
              <div class="advice-title">
                {{ it.title }}
                <el-tag v-if="it.minutes" size="small" type="info" effect="plain">{{ it.minutes }} 分钟</el-tag>
              </div>
              <div class="advice-action">{{ it.action }}</div>
              <div class="advice-reason">依据：{{ it.reason }}</div>
            </div>
            <el-button size="small" type="primary" plain @click="goEntry(it.entry)">去完成 →</el-button>
          </div>
          <el-empty v-if="!advice || advice.items.length === 0" description="暂无建议" :image-size="60" />
        </div>
      </el-card>

      <!-- ================= 强化学习：下一步 + 引擎状态 ================= -->
      <el-row :gutter="16">
        <el-col :xs="24" :md="14">
          <el-card class="card" shadow="hover">
            <template #header>
              <div class="card-head">
                <b>🤖 强化学习策略：下一步学什么</b>
                <el-tag size="small" :type="recommend?.source === 'rl' ? 'success' : 'warning'" effect="plain">
                  {{ recommend?.source === 'rl' ? 'DQN 策略' : '冷启动启发式' }}
                </el-tag>
              </div>
            </template>
            <template v-if="recommend">
              <div class="rl-node">
                <div class="rl-name">{{ recommend.node.name }}</div>
                <div class="rl-meta">
                  {{ recommend.node.topic }} · {{ recommend.node.section }} · 难度 {{ '⭐'.repeat(recommend.node.difficulty) }}
                </div>
                <div class="rl-summary">{{ recommend.node.summary }}</div>
                <div class="rl-reason">{{ recommend.reason }}</div>
              </div>
              <el-divider content-position="left">策略在各候选节点上的估值 Q</el-divider>
              <div class="q-list">
                <div v-for="t in recommend.top" :key="t.nodeId" class="q-item">
                  <span class="q-name">{{ nodeName(t.nodeId) }}</span>
                  <el-progress
                    :percentage="qPercent(t.q)" :show-text="false" :stroke-width="10"
                    :color="t.nodeId === recommend.node.id ? '#67c23a' : '#c0c4cc'"
                    class="q-bar"
                  />
                  <span class="q-val">{{ t.q.toFixed(3) }}</span>
                </div>
              </div>
            </template>
            <el-empty v-else description="暂无推荐" :image-size="60" />
          </el-card>
        </el-col>
        <el-col :xs="24" :md="10">
          <el-card class="card" shadow="hover">
            <template #header><b>⚙️ AI 引擎状态</b></template>
            <div v-if="model" class="model-box">
              <div class="model-row"><span>模型</span><b>{{ model.modelName }}</b></div>
              <div class="model-row"><span>网络结构</span><b>{{ model.stateDim }} → 64 → 64 → {{ model.actionDim }}</b></div>
              <div class="model-row"><span>训练步数</span><b>{{ model.trainSteps }}</b></div>
              <div class="model-row"><span>探索率 ε</span><b>{{ model.epsilon }}</b></div>
              <div class="model-row"><span>经验样本</span><b>{{ model.filledTransitions }} / {{ model.transitions }}</b></div>
              <div class="model-row"><span>最近损失</span><b>{{ model.lastLoss }}</b></div>
              <div class="model-row">
                <span>状态</span>
                <el-tag size="small" :type="model.coldStart ? 'warning' : 'success'" effect="plain">
                  {{ model.coldStart ? '冷启动（启发式推荐）' : '已训练（策略网络推荐）' }}
                </el-tag>
              </div>
              <div class="model-tip">
                每次作答后系统会用"掌握度增量 + 对错"构造奖励，回放训练 2 步，
                训练足够后自动从启发式切换到 DQN 策略。
              </div>
            </div>
            <el-empty v-else description="模型状态不可用" :image-size="60" />
          </el-card>
        </el-col>
      </el-row>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as echarts from 'echarts'
import { fetchProfile, fetchAdvice, fetchRecommend, fetchModelStatus } from '@/api/ai'
import { fetchGraph } from '@/api/knowledge'
import { ElMessage } from 'element-plus'

const emit = defineEmits(['back', 'open-page', 'open-chapter'])
const loading = ref(true)
const refreshing = ref(false)
const adviceLoading = ref(false)
const error = ref('')
const profile = ref(null)
const advice = ref(null)
const recommend = ref(null)
const model = ref(null)
const graphNodes = ref([])
const radarRef = ref(null)
let radarChart = null

/** 是否有画像数据 */
const empty = computed(() => {
  if (!profile.value) return true
  const h = profile.value.dimensions?.habits || {}
  return (h.answers || 0) === 0 && (profile.value.dimensions?.nodes?.attempted || 0) === 0
})

const habits = computed(() => profile.value?.dimensions?.habits || {})
const hint = computed(() => profile.value?.dimensions?.hint || {})
const g1 = computed(() => profile.value?.dimensions?.game?.game1 || {})
const g2 = computed(() => profile.value?.dimensions?.game?.game2 || {})

/** 掌握度 → 进度条颜色（红黄绿三档） */
function masteryColor(p) {
  if (p < 0.35) return '#f56c6c'
  if (p < 0.6) return '#e6a23c'
  return '#67c23a'
}

function fmtTime(t) {
  if (!t) return '—'
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 节点 ID → 名称 */
function nodeName(id) {
  const n = graphNodes.value.find((x) => x.id === id)
  return n ? n.name : id
}

/** Q 值映射成 0~100 的进度（负值也会显示一点） */
function qPercent(q) {
  return Math.max(2, Math.min(100, Math.round(((q + 1) / 2) * 100)))
}

/** 渲染雷达图 */
function renderRadar() {
  if (!radarRef.value || !profile.value) return
  if (!radarChart) radarChart = echarts.init(radarRef.value)
  const radar = profile.value.radar || []
  radarChart.setOption({
    radar: {
      indicator: radar.map((r) => ({ name: r.name, max: 100 })),
      radius: '66%',
      splitNumber: 4,
      axisName: { color: '#606266', fontSize: 12 },
      splitLine: { lineStyle: { color: '#e4e8f0' } },
      splitArea: { areaStyle: { color: ['#fbfcfe', '#f4f6fb'] } }
    },
    series: [{
      type: 'radar',
      data: [{
        value: radar.map((r) => r.value),
        name: '我的能力',
        areaStyle: { color: 'rgba(102,126,234,0.28)' },
        lineStyle: { color: '#667eea', width: 2 },
        itemStyle: { color: '#667eea' }
      }]
    }]
  })
}

/** 拉取全部数据 */
async function loadAll(force = false) {
  loading.value = true
  error.value = ''
  try {
    const [pRes, aRes, rRes, mRes, gRes] = await Promise.all([
      fetchProfile({ force }),
      fetchAdvice({ refresh: force }),
      fetchRecommend({ record: false }),
      fetchModelStatus(),
      fetchGraph()
    ])
    profile.value = pRes.data.data
    advice.value = aRes.data.data
    recommend.value = rRes.data.data
    model.value = mRes.data.data
    graphNodes.value = gRes.data.data.nodes || []
    await nextTick()
    renderRadar()
  } catch (e) {
    error.value = e?.response?.data?.message || '画像数据加载失败，请确认后端服务已启动'
  } finally {
    loading.value = false
  }
}

/** 强制重算画像 + 建议 */
async function refreshAll() {
  refreshing.value = true
  try {
    await loadAll(true)
    ElMessage.success('画像与建议已重新生成')
  } finally {
    refreshing.value = false
  }
}

/** 只重新生成建议（画像复用缓存） */
async function refreshAdvice() {
  adviceLoading.value = true
  try {
    const res = await fetchAdvice({ refresh: true })
    advice.value = res.data.data
    ElMessage.success('建议已更新')
  } catch {
    ElMessage.error('建议生成失败')
  } finally {
    adviceLoading.value = false
  }
}

/** 建议入口跳转：章节学习走 open-chapter（首页需要章节 id） */
function goEntry(entry) {
  if (entry === 'chapter') return emit('open-chapter', 'ch11')
  if (entry) emit('open-page', entry)
}

/** 窗口尺寸变化时重绘 */
function onResize() {
  radarChart && radarChart.resize()
}

onMounted(() => {
  loadAll(false)
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  if (radarChart) {
    radarChart.dispose()
    radarChart = null
  }
})
</script>

<style scoped>
.page-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 20px 60px;
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);
  font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
}
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
.page-title { margin: 0; font-size: 22px; color: #303133; }
.page-sub { color: #909399; font-size: 13px; }
.card { border-radius: 12px; margin-bottom: 16px; }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.hint-text { color: #909399; font-size: 12px; }

.summary-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; border: none; }
.summary-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.summary-label { font-size: 12px; opacity: 0.85; letter-spacing: 2px; }
.summary-text { font-size: 24px; font-weight: 700; margin: 6px 0 10px; }
.summary-actions { text-align: right; }
.summary-actions .time { font-size: 12px; opacity: 0.8; margin-bottom: 8px; }
.tag-row { display: flex; gap: 8px; flex-wrap: wrap; }

.chart { width: 100%; }
.radar-chart { height: 320px; }

.topic-list { display: flex; flex-direction: column; gap: 12px; }
.topic-item { display: grid; grid-template-columns: 100px 1fr 130px; align-items: center; gap: 10px; }
.topic-name { font-size: 13px; color: #303133; font-weight: 600; }
.topic-meta { font-size: 12px; color: #909399; text-align: right; }

.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.stat-grid.small { grid-template-columns: repeat(4, 1fr); }
.stat { background: #f7f9fc; border-radius: 10px; padding: 12px 8px; text-align: center; }
.stat .num { font-size: 20px; font-weight: 700; color: #409eff; }
.stat .lab { font-size: 12px; color: #909399; margin-top: 4px; }

.hint-stats { display: flex; gap: 10px; flex-wrap: wrap; }
.hint-chip { background: #eef3ff; color: #409eff; border-radius: 16px; padding: 5px 12px; font-size: 12px; }
.hint-chip.danger { background: #fef0f0; color: #f56c6c; }
.hint-tip { margin-top: 10px; font-size: 12px; color: #e6a23c; }

.game-block { margin-bottom: 6px; }
.game-title { font-size: 13px; font-weight: 700; color: #303133; margin-bottom: 10px; }
.cat-row { margin-top: 10px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; font-size: 12px; color: #909399; }

.narrative { white-space: pre-wrap; line-height: 1.9; color: #303133; font-size: 14px; }

.advice-narrative { margin-bottom: 14px; }
.advice-list { display: flex; flex-direction: column; gap: 12px; }
.advice-item { display: flex; gap: 12px; align-items: flex-start; padding: 12px; border: 1px solid #ebeef5; border-radius: 10px; }
.advice-idx {
  width: 26px; height: 26px; border-radius: 50%; flex: 0 0 26px;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; color: #fff; background: #909399;
}
.advice-idx.p1 { background: #f56c6c; }
.advice-idx.p2 { background: #e6a23c; }
.advice-idx.p3 { background: #409eff; }
.advice-body { flex: 1; }
.advice-title { font-size: 14px; font-weight: 700; color: #303133; display: flex; gap: 8px; align-items: center; }
.advice-action { font-size: 13px; color: #606266; margin-top: 4px; line-height: 1.7; }
.advice-reason { font-size: 12px; color: #909399; margin-top: 4px; }

.rl-node { background: #f7f9fc; border-radius: 10px; padding: 14px; }
.rl-name { font-size: 18px; font-weight: 700; color: #303133; }
.rl-meta { font-size: 12px; color: #909399; margin: 6px 0; }
.rl-summary { font-size: 13px; color: #606266; line-height: 1.7; }
.rl-reason { font-size: 12px; color: #409eff; margin-top: 8px; }

.q-list { display: flex; flex-direction: column; gap: 8px; }
.q-item { display: grid; grid-template-columns: 180px 1fr 60px; align-items: center; gap: 10px; }
.q-name { font-size: 12px; color: #606266; }
.q-val { font-size: 12px; color: #909399; text-align: right; font-family: Consolas, monospace; }

.model-box { display: flex; flex-direction: column; gap: 8px; }
.model-row { display: flex; justify-content: space-between; font-size: 13px; color: #606266; }
.model-row b { color: #303133; }
.model-tip { margin-top: 8px; font-size: 12px; color: #909399; line-height: 1.7; }
</style>

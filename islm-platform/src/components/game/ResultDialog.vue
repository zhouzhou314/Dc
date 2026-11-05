<!--
  多人博弈游戏 · 终局结算弹窗
  五维雷达图（GDP恢复度/失业率控制/通胀控制/债务可持续性/政策协调度）
  + 通关判定结论 + 完整博弈报告（事件/决策序列/指标轨迹）
-->
<template>
  <el-dialog
    :model-value="visible"
    width="720px"
    :close-on-click-modal="false"
    :show-close="false"
    class="result-dialog"
  >
    <div class="result-wrap">
      <div class="result-verdict" :class="verdict.type">
        <div class="verdict-icon">{{ verdictIcon }}</div>
        <div class="verdict-title">{{ verdict.title }}</div>
        <div class="verdict-detail">{{ verdict.detail }}</div>
      </div>

      <!-- 雷达图 -->
      <div class="radar-title">📊 综合评分雷达图</div>
      <div ref="radarRef" class="radar-chart"></div>
      <div class="total-score">
        综合得分：<b>{{ radar?.total ?? '—' }}</b> 分
        <span class="debt-note" v-if="radar">（累计国债率 {{ radar.debtRate }}%）</span>
      </div>

      <!-- 决策复盘 -->
      <div class="report-title">📋 决策复盘</div>
      <div class="report-list">
        <div v-for="(h, i) in history" :key="i" class="report-round">
          <div class="report-round-head">
            <b>第 {{ h.round }} 回合</b>
            <span class="report-metrics">
              GDP {{ h.metrics.g.toFixed(1) }}% · 失业 {{ h.metrics.u.toFixed(1) }}% · 通胀 {{ h.metrics.pi.toFixed(1) }}%
            </span>
          </div>
          <div class="report-events" v-if="h.event">
            🎲 事件：{{ h.event.title }}
          </div>
          <div class="report-decisions">
            <div v-for="(chg, role) in h.decisions" :key="role" class="decision-chip">
              <span class="chip-role">{{ ROLE_MAP[role].icon }} {{ ROLE_MAP[role].name }}</span>
              <span class="chip-val">{{ fmtDecision(role, chg) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button type="primary" size="large" @click="$emit('back')">🏠 返回首页</el-button>
      <el-button size="large" @click="$emit('again')">🔄 再来一局</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import * as echarts from 'echarts'
import { ROLE_MAP } from '@/constants/game'

const props = defineProps({
  visible: { type: Boolean, default: false },
  verdict: { type: Object, default: null },
  radar: { type: Object, default: null },
  history: { type: Array, default: () => [] }
})

defineEmits(['back', 'again'])

const radarRef = ref(null)
let radarChart = null

const verdictIcon = computed(() => {
  const t = props.verdict?.type
  if (t === 'pass') return '🎉'
  if (t === 'overheat') return '🔥'
  if (t === 'crowd') return '📉'
  if (t === 'weak') return '🩹'
  return '📊'
})

const DECISION_LABELS = {
  /* 政府（含央行） */
  dG: '政府购买', dT: '税收', dTr: '转移支付', dDebt: '公债发行', dMP: '货币供给', dNX: '净出口',
  /* 银行 */
  dReserve: '超额准备金', dCredit: '信贷投放', dLiquidity: '流动性补充', dDeposit: '存款利率',
  /* 企业 */
  dI0: '投资', dLabor: '雇佣', dFinance: '直接融资', dPrice: '定价',
  /* 消费者 */
  dC0: '消费支出', dSave: '储蓄', dAsset: '金融资产', dBorrow: '借贷'
}

function fmtDecision(role, chg) {
  const parts = []
  for (const [k, v] of Object.entries(chg)) {
    if (Math.abs(v) < 1e-9) continue
    const label = DECISION_LABELS[k] || k
    parts.push(`${label}${v > 0 ? '+' : ''}${v}`)
  }
  return parts.length ? parts.join('，') : '按兵不动'
}

function renderRadar() {
  if (!radarChart || !props.radar) return
  const r = props.radar
  radarChart.setOption({
    tooltip: {},
    radar: {
      indicator: [
        { name: 'GDP恢复度', max: 100 },
        { name: '失业率控制', max: 100 },
        { name: '通胀控制', max: 100 },
        { name: '债务可持续', max: 100 },
        { name: '政策协调度', max: 100 }
      ],
      radius: '65%',
      axisName: { color: '#303133', fontSize: 12 }
    },
    series: [{
      type: 'radar',
      data: [{
        value: [r.gdpRecovery, r.unemployment, r.inflation, r.debt, r.coordination],
        name: '综合表现',
        areaStyle: { color: 'rgba(102, 126, 234, 0.35)' },
        lineStyle: { color: '#667eea', width: 2 },
        itemStyle: { color: '#667eea' }
      }]
    }]
  })
}

watch(() => props.visible, async (v) => {
  if (v) {
    await nextTick()
    if (!radarChart && radarRef.value) radarChart = echarts.init(radarRef.value)
    renderRadar()
  }
})

onBeforeUnmount(() => { radarChart && radarChart.dispose() })
</script>

<style scoped>
.result-verdict {
  text-align: center; padding: 18px; border-radius: 10px; margin-bottom: 16px;
}
.result-verdict.pass { background: #f0f9eb; }
.result-verdict.overheat { background: #fdf6ec; }
.result-verdict.crowd { background: #fef0f0; }
.result-verdict.weak { background: #f4f4f5; }
.result-verdict.near { background: #ecf5ff; }
.verdict-icon { font-size: 40px; }
.verdict-title { font-size: 22px; font-weight: bold; color: #303133; margin: 6px 0; }
.verdict-detail { color: #606266; font-size: 14px; }
.radar-title, .report-title { font-weight: bold; color: #303133; margin: 14px 0 8px; }
.radar-chart { width: 100%; height: 320px; }
.total-score { text-align: center; font-size: 16px; color: #303133; }
.total-score b { font-size: 24px; color: #e6a23c; }
.debt-note { font-size: 12px; color: #909399; }
.report-list { display: flex; flex-direction: column; gap: 10px; max-height: 300px; overflow-y: auto; }
.report-round { border: 1px solid #ebeef5; border-radius: 8px; padding: 10px; }
.report-round-head { display: flex; justify-content: space-between; align-items: center; }
.report-metrics { font-size: 12px; color: #909399; }
.report-events { font-size: 12px; color: #e6a23c; margin: 4px 0; }
.report-decisions { display: flex; flex-wrap: wrap; gap: 6px; }
.decision-chip { background: #f5f7fa; border-radius: 14px; padding: 3px 10px; font-size: 12px; }
.chip-role { color: #606266; margin-right: 4px; }
.chip-val { color: #303133; }
</style>

<!--
  多人博弈游戏 · 主界面
  布局：左=曲线图+知识点 / 中=仪表盘+事件+反馈 / 右=角色状态+我的决策面板+聊天
  阶段：waiting(等位) → event(事件) → consult(协商) → decision(轮流决策) → finished(结算)
-->
<template>
  <div class="room-container">
    <!-- 顶部栏 -->
    <div class="room-header">
      <div class="header-left">
        <el-button round size="small" @click="leave">← 退出</el-button>
        <span class="room-code">房间 <b>{{ room.code }}</b></span>
        <el-tag v-if="room.aiFill" size="small" type="warning" effect="plain">🤖 AI 补位中</el-tag>
      </div>
      <div class="header-center">
        <template v-if="room.status === 'waiting'">
          <span class="phase-text">等待玩家入座…</span>
        </template>
        <template v-else>
          <span class="phase-text">{{ phaseLabel }}</span>
          <span class="round-text">第 {{ room.round }} / {{ room.totalRounds }} 回合</span>
        </template>
      </div>
      <div class="header-right">
        <span class="my-role" v-if="myRole">
          {{ ROLE_MAP[myRole].icon }} 我是{{ ROLE_MAP[myRole].name }}
        </span>
      </div>
    </div>

    <!-- 等待阶段：座位表 + 开始 -->
    <div v-if="room.status === 'waiting'" class="waiting-wrap">
      <el-card shadow="hover" class="waiting-card">
        <template #header><span class="panel-title">🪑 座位表（{{ seatedCount }}/4）</span></template>
        <div class="seat-grid">
          <div v-for="r in ROLES" :key="r.key" class="seat" :class="{ occupied: room.players[r.key], mine: myRole === r.key }">
            <div class="seat-icon">{{ r.icon }}</div>
            <div class="seat-name">{{ r.name }}</div>
            <div class="seat-player">
              <template v-if="room.players[r.key]">
                {{ room.players[r.key].nickname }}
                <el-tag v-if="room.players[r.key].type === 'ai'" size="small" type="info">AI</el-tag>
              </template>
              <span v-else class="seat-empty">虚位以待</span>
            </div>
            <el-button v-if="myRole === r.key" size="small" type="primary" plain @click="pickRole(r.key)" disabled>
              我的座位
            </el-button>
            <el-button v-else-if="!room.players[r.key]" size="small" @click="pickRole(r.key)">入座</el-button>
            <el-button v-else-if="room.players[r.key].type === 'ai'" size="small" @click="pickRole(r.key)">顶替 AI</el-button>
          </div>
        </div>
        <div class="waiting-actions">
          <div class="share-tip">📣 告诉队友房间码：<b class="share-code">{{ room.code }}</b></div>
          <el-button type="primary" size="large" :disabled="seatedCount < 4" @click="startGame">
            🚀 开始对局
          </el-button>
        </div>
      </el-card>
    </div>

    <!-- 对局中：三栏布局 -->
    <div v-else class="game-body">
      <!-- 左栏：曲线图 + 知识点 -->
      <div class="col-left">
        <el-card shadow="hover" class="chart-card">
          <template #header><span class="panel-title">📈 IS-LM 曲线</span></template>
          <GameChart :curves="room.curves" :trail="trail" />
        </el-card>

        <el-card shadow="hover" class="concept-card">
          <template #header><span class="panel-title">💡 相关知识点</span></template>
          <div class="concept-list">
            <el-tag v-for="c in activeConcepts" :key="c.key" size="large" effect="plain" class="concept-tag">
              {{ c.key }}
              <el-tooltip :content="c.hint" placement="top"><span class="concept-hint">ⓘ</span></el-tooltip>
            </el-tag>
            <div v-if="!activeConcepts.length" class="concept-empty">当前暂无事件，等待系统发布…</div>
          </div>
        </el-card>
      </div>

      <!-- 中栏：仪表盘 + 事件 + 反馈 -->
      <div class="col-mid">
        <!-- 仪表盘 -->
        <el-card shadow="hover" class="dash-card">
          <template #header><span class="panel-title">📊 宏观经济仪表盘</span></template>
          <div class="metric-grid">
            <div v-for="m in METRIC_ITEMS" :key="m.key" class="metric-box" :style="{ borderColor: m.color }">
              <div class="metric-label">{{ m.label }}</div>
              <div class="metric-value" :style="{ color: m.color }">
                {{ fmtMetric(m.key, room.metrics?.[m.key]) }}<span class="metric-unit">{{ m.unit }}</span>
              </div>
              <div class="metric-status" :class="metricStatus(m.key)">{{ metricStatusText(m.key) }}</div>
            </div>
          </div>
        </el-card>

        <!-- 事件卡 -->
        <el-card v-if="currentEvent" shadow="hover" class="event-card">
          <template #header><span class="panel-title">📰 突发事件</span></template>
          <div class="event-title">{{ currentEvent.title }}</div>
          <div class="event-news">{{ currentEvent.news }}</div>
        </el-card>

        <!-- 三层反馈（最近一回合） -->
        <el-card v-if="lastFeedbackList.length" shadow="hover" class="feedback-card">
          <template #header><span class="panel-title">📚 上一回合 · 决策反馈</span></template>
          <div class="feedback-list">
            <div v-for="fb in lastFeedbackList" :key="fb.role" class="feedback-item">
              <div class="fb-head">
                <span class="fb-by">{{ ROLE_MAP[fb.role].icon }} {{ fb.by }}</span>
              </div>
              <div class="fb-surface">🔵 {{ fb.surface }}</div>
              <el-collapse class="fb-collapse">
                <el-collapse-item title="🔗 传导链条（中层）" name="chain">
                  <div v-for="(c, i) in fb.chain" :key="i" class="fb-chain-line">{{ c }}</div>
                </el-collapse-item>
                <el-collapse-item title="📖 理论出处（深层）" name="theory">
                  <div v-for="(t, i) in fb.theory" :key="i" class="fb-theory-line">• {{ t }}</div>
                </el-collapse-item>
              </el-collapse>
            </div>
          </div>
        </el-card>
      </div>

      <!-- 右栏：角色状态 + 我的决策面板 + 聊天 -->
      <div class="col-right">
        <!-- 角色状态条 -->
        <el-card shadow="hover" class="status-card">
          <template #header><span class="panel-title">👥 决策状态</span></template>
          <div class="status-list">
            <div v-for="r in ROLES" :key="r.key" class="status-row" :class="{ active: room.currentTurn === r.key }">
              <span class="status-icon">{{ r.icon }}</span>
              <span class="status-name">{{ r.name }}</span>
              <el-tag v-if="room.players[r.key]?.type === 'ai'" size="small" type="info">AI</el-tag>
              <span class="status-state">
                <template v-if="room.currentTurn === r.key">⚙️ 决策中</template>
                <template v-else-if="room.phase === 'decision' && turnDone(r.key)">✅ 已提交</template>
                <template v-else-if="room.phase === 'consult'">💬 协商</template>
                <template v-else>—</template>
              </span>
            </div>
          </div>
        </el-card>

        <!-- 我的决策面板（协商阶段显示"准备"按钮，决策阶段显示表单） -->
        <el-card v-if="myRole" shadow="hover" class="panel-card">
          <template #header><span class="panel-title">🎯 我的决策面板</span></template>

          <!-- 协商阶段：准备决策按钮 -->
          <div v-if="room.phase === 'consult'" class="consult-panel">
            <div class="consult-tip">💬 与队友在下方聊天区协商策略，然后点击"准备决策"</div>
            <el-button type="primary" size="large" class="ready-btn" :disabled="consultReady" @click="markReady">
              {{ consultReady ? '已准备，等待队友…' : '✅ 准备决策' }}
            </el-button>
          </div>

          <!-- 决策阶段：角色面板 -->
          <RolePanel
            v-else-if="room.phase === 'decision'"
            :role="myRole"
            :my-role="myRole"
            :is-turn="room.currentTurn === myRole"
            :is-ai="room.players[myRole]?.type === 'ai'"
            :done="turnDone(myRole)"
            @submit="onDecide"
          />

          <!-- 事件阶段：等待提示 -->
          <div v-else-if="room.phase === 'event'" class="phase-wait">
            📰 请阅读左侧事件与仪表盘数据，稍候进入协商…
          </div>
        </el-card>

        <!-- 聊天 -->
        <el-card shadow="hover" class="chat-card">
          <template #header><span class="panel-title">💬 公共聊天（协商区）</span></template>
          <div class="chat-list" ref="chatListRef">
            <div v-for="(m, i) in room.chat" :key="i" class="chat-msg" :class="{ mine: m.role === myRole }">
              <span class="chat-role">{{ ROLE_MAP[m.role]?.icon }} {{ m.nickname }}</span>
              <span class="chat-text">{{ m.text }}</span>
            </div>
            <div v-if="!room.chat.length" class="chat-empty">还没有聊天，来发起协商吧～</div>
          </div>
          <div class="chat-input">
            <el-input v-model="chatText" placeholder="输入协商内容…" maxlength="300" @keyup.enter="sendChat" />
            <el-button type="primary" @click="sendChat" :disabled="!chatText.trim()">发送</el-button>
          </div>
        </el-card>
      </div>
    </div>

    <!-- 终局结算弹窗 -->
    <ResultDialog
      :visible="showResult"
      :verdict="room.verdict"
      :radar="room.radar"
      :history="room.history"
      @back="backHome"
      @again="again"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { connect, onState, onNotice, onError, getMyId, gameActions } from '@/api/gameSocket'
import { reportEvent } from '@/api/event'
import { ROLES, ROLE_MAP, METRIC_ITEMS, fmtMetric } from '@/constants/game'
import GameChart from '@/components/game/GameChart.vue'
import RolePanel from '@/components/game/RolePanel.vue'
import ResultDialog from '@/components/game/ResultDialog.vue'

const emit = defineEmits(['back', 'again'])
const props = defineProps({ code: { type: String, required: true } })

/* 房间状态（后端 game:state 全量推送） */
const room = ref({
  code: props.code, status: 'waiting', phase: 'seating', round: 0, totalRounds: 3,
  players: {}, metrics: null, curves: null, history: [], chat: [], currentTurn: null,
  currentEvent: null, verdict: null, radar: null, aiFill: false
})

const chatText = ref('')
const chatListRef = ref(null)
const showResult = ref(false)

/* 我的身份与座位 */
const myId = getMyId()
const myRole = computed(() => {
  for (const [role, seat] of Object.entries(room.value.players)) {
    if (seat && seat.userId === myId) return role
  }
  return null
})

const seatedCount = computed(() => ROLES.filter(r => room.value.players[r.key]).length)
const consultReady = computed(() => !!room.value.consultReady?.[myRole.value])
const currentEvent = computed(() => room.value.currentEvent)

/* 阶段文案 */
const phaseLabel = computed(() => ({
  event: '📰 事件发布', consult: '💬 协商回合', decision: '⚙️ 轮流决策', finished: '🏁 对局结束'
}[room.value.phase] || ''))

/* 知识点高亮：当前事件的概念 */
const activeConcepts = computed(() => {
  const ev = room.value.currentEvent
  if (!ev || !ev.concepts) return []
  return ev.concepts.map(key => ({ key, hint: conceptHint(key) }))
})
function conceptHint(key) {
  const map = {
    '总需求不足': 'AD < 潜在产出，经济运行低于充分就业水平',
    'IS曲线左移': 'C₀/I₀/G/NX 下降或 T 上升使 IS 左移',
    'IS曲线右移': 'C₀/I₀/G/NX 上升或 T 下降使 IS 右移',
    '扩张性政策': '财政扩张（G↑/T↓）或货币扩张（M↑）',
    '挤出效应': '利率上升挤占私人投资，财政扩张效果打折',
    '乘数效应': '支出乘数 = 1/(1-MPC)',
    '节俭悖论': '全社会增加储蓄反而导致总收入下降',
    '自发消费': '与收入无关的基础消费 C₀',
    '自发投资': '与利率无关的基础投资 I₀',
    '投资函数': 'I = I₀ - d·r',
    '净出口': '出口 - 进口，外需冲击影响总需求',
    '供给冲击': '成本上升推动的价格冲击',
    '信贷渠道': '信贷收缩放大投资波动',
    '货币政策传导': '货币 → 利率 → 投资 → 产出'
  }
  return map[key] || '点击了解相关知识点'
}

/* 均衡点轨迹（含历史 + 当前） */
const trail = computed(() => {
  const t = room.value.history.map(h => ({ Y: h.metrics.Y, r: h.metrics.r }))
  if (room.value.metrics?.Y != null) t.push({ Y: room.value.metrics.Y, r: room.value.metrics.r })
  return t
})

/* 上一回合的反馈（结算后显示，取 history 最后一项的 feedbacks） */
const lastFeedbackList = computed(() => {
  const last = room.value.history[room.value.history.length - 1]
  if (!last || !last.feedbacks) return []
  return ROLES.map(r => last.feedbacks[r.key]).filter(Boolean)
})

/* 某角色本回合是否已提交（decision 阶段，通过 currentTurn 顺序判断：已越过该角色的都算提交了） */
function turnDone(role) {
  if (room.value.phase !== 'decision' || !room.value.currentTurn) return false
  const order = ROLES.map(r => r.key)
  return order.indexOf(role) < order.indexOf(room.value.currentTurn)
}

/* 指标状态判定（颜色提示） */
function metricStatus(key) {
  const m = room.value.metrics
  if (!m) return ''
  if (key === 'g') return m.g >= 5.5 && m.g <= 6.5 ? 'good' : (m.g > 6.5 ? 'warn' : 'bad')
  if (key === 'u') return m.u <= 5.5 ? 'good' : 'bad'
  if (key === 'pi') return m.pi >= 1 && m.pi <= 3 ? 'good' : (m.pi > 3 ? 'warn' : 'bad')
  if (key === 'r') return m.r <= 0.06 ? 'good' : 'warn'
  return ''
}
function metricStatusText(key) {
  const s = metricStatus(key)
  return { good: '✅ 健康', warn: '⚠️ 偏热', bad: '🔴 偏冷' }[s] || ''
}

/* 动作 */
function pickRole(role) { gameActions.pickRole(role) }
function startGame() {
  gameActions.start()
  reportEvent('game2', 'game2.start', { code: room.value.code, rounds: room.value.totalRounds, aiFill: room.value.aiFill })
}
function markReady() { gameActions.ready() }
function onDecide(changes) {
  gameActions.decide(changes)
  /* AI 画像数据源：把"谁在什么阶段做了什么决策"写入统一事件流 */
  reportEvent('game2', 'game2.decision', {
    role: myRole.value,
    round: room.value.round,
    changes,
    metricsBefore: room.value.metrics
  })
}
function sendChat() {
  const t = chatText.value.trim()
  if (!t) return
  gameActions.chat(t)
  reportEvent('game2', 'game2.chat', { role: myRole.value, round: room.value.round, text: t.slice(0, 120) })
  chatText.value = ''
  scrollChat()
}
function scrollChat() {
  nextTick(() => { if (chatListRef.value) chatListRef.value.scrollTop = chatListRef.value.scrollHeight })
}
function backHome() {
  gameActions.leave()
  emit('back')
}
function again() {
  gameActions.leave()
  emit('again')
}
function leave() {
  ElMessageBox.confirm('确定退出对局吗？', '提示', { type: 'warning' })
    .then(() => backHome())
    .catch(() => {})
}

/* WebSocket 绑定 */
let offState, offNotice, offError
/** 事件上报状态：避免同一次连接重复上报入场/回合结果 */
let joinedReported = false
let lastHistoryLen = 0

/* 回合结算：history 变长即有一次新结算，写入事件流供画像使用 */
watch(() => room.value.history.length, (n) => {
  if (n <= lastHistoryLen) return
  lastHistoryLen = n
  const last = room.value.history[n - 1]
  reportEvent('game2', 'game2.round_result', {
    round: last?.round ?? room.value.round,
    metrics: last?.metrics ?? room.value.metrics,
    verdict: room.value.verdict
  })
})

/* 阶段变化（event → consult → decision）也留痕，教师端可还原对局过程 */
watch(() => room.value.phase, (p, old) => {
  if (p && p !== old) reportEvent('game2', 'game2.phase', { phase: p, round: room.value.round })
})

/* 终局：结果弹窗出现时上报一次完整报告 */
watch(() => room.value.verdict, (v) => {
  if (v) reportEvent('game2', 'game2.finish', { verdict: v, radar: room.value.radar, metrics: room.value.metrics })
})

onMounted(() => {
  connect()
  offError = onError((msg) => ElMessage.error(msg))
  offNotice = onNotice((n) => {
    if (n.kind === 'round_result' || n.kind === 'finished') scrollChat()
    if (n.kind === 'finished') showResult.value = true
    if (n.kind === 'event') scrollChat()
  })
  offState = onState((view) => {
    room.value = view
    /* 首次拿到房间状态 → 记录入场事件（含房间码与回合数） */
    if (!joinedReported && view?.code) {
      joinedReported = true
      lastHistoryLen = (view.history || []).length
      reportEvent('game2', 'game2.join', { code: view.code, rounds: view.totalRounds, phase: view.phase })
    }
    scrollChat()
  })
  /* 主动拉取一次房间状态：挂载前 create/join 的广播已经错过，必须主动 sync */
  gameActions.sync()
})

onBeforeUnmount(() => {
  offState && offState()
  offNotice && offNotice()
  offError && offError()
})
</script>

<style scoped>
.room-container {
  max-width: 1400px; margin: 0 auto; padding: 16px; min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);
  font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
}
.room-header {
  display: flex; align-items: center; justify-content: space-between;
  background: #fff; border-radius: 10px; padding: 12px 18px; margin-bottom: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,.06);
}
.header-left, .header-right { display: flex; align-items: center; gap: 10px; }
.room-code { font-size: 16px; color: #303133; }
.room-code b { font-size: 20px; color: #667eea; letter-spacing: 2px; }
.header-center { text-align: center; }
.phase-text { font-weight: bold; color: #e6a23c; font-size: 15px; }
.round-text { margin-left: 12px; color: #909399; font-size: 13px; }
.my-role { color: #606266; font-weight: bold; }
.panel-title { font-weight: bold; color: #303133; }

/* 等待阶段 */
.waiting-wrap { display: flex; justify-content: center; }
.waiting-card { width: 100%; max-width: 900px; }
.seat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.seat { border: 2px dashed #dcdfe6; border-radius: 10px; padding: 16px; text-align: center; transition: all .3s; }
.seat.occupied { border-style: solid; border-color: #c0c4cc; background: #fafafa; }
.seat.mine { border-color: #67c23a; background: #f0f9eb; }
.seat-icon { font-size: 30px; }
.seat-name { font-weight: bold; margin: 6px 0; }
.seat-player { font-size: 13px; color: #606266; min-height: 22px; margin-bottom: 8px; }
.seat-empty { color: #c0c4cc; }
.waiting-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 20px; }
.share-tip { color: #606266; }
.share-code { color: #e6a23c; font-size: 22px; letter-spacing: 3px; margin: 0 6px; }

/* 三栏布局 */
.game-body { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; align-items: start; }
.col-left, .col-mid, .col-right { display: flex; flex-direction: column; gap: 14px; }
@media (max-width: 1100px) { .game-body { grid-template-columns: 1fr; } }

/* 仪表盘 */
.metric-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.metric-box { border: 2px solid #e4e7ed; border-left-width: 5px; border-radius: 8px; padding: 12px; }
.metric-label { font-size: 13px; color: #909399; }
.metric-value { font-size: 26px; font-weight: bold; }
.metric-unit { font-size: 14px; margin-left: 2px; }
.metric-status { font-size: 12px; }
.metric-status.good { color: #67c23a; }
.metric-status.warn { color: #e6a23c; }
.metric-status.bad { color: #f56c6c; }

/* 事件卡 */
.event-card { border-color: #e6a23c; }
.event-title { font-size: 17px; font-weight: bold; color: #e6a23c; margin-bottom: 6px; }
.event-news { color: #606266; line-height: 1.7; }

/* 反馈卡 */
.feedback-item { padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
.feedback-item:last-child { border-bottom: none; }
.fb-head { margin-bottom: 6px; }
.fb-by { font-weight: bold; color: #303133; }
.fb-surface { font-size: 13px; color: #409eff; margin-bottom: 4px; line-height: 1.6; }
.fb-collapse { margin-top: 4px; }
.fb-chain-line { font-size: 13px; color: #606266; line-height: 1.8; padding-left: 4px; }
.fb-theory-line { font-size: 13px; color: #909399; line-height: 1.8; }

/* 角色状态 */
.status-list { display: flex; flex-direction: column; gap: 8px; }
.status-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; }
.status-row.active { background: #fdf6ec; }
.status-icon { font-size: 18px; }
.status-name { width: 50px; font-weight: bold; }
.status-state { margin-left: auto; font-size: 12px; color: #909399; }

/* 协商面板 */
.consult-panel { text-align: center; padding: 10px 0; }
.consult-tip { color: #606266; font-size: 14px; margin-bottom: 12px; line-height: 1.6; }
.ready-btn { width: 100%; }
.phase-wait { text-align: center; color: #909399; padding: 20px 0; line-height: 1.6; }

/* 聊天 */
.chat-list { height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding: 4px; }
.chat-msg { background: #f5f7fa; border-radius: 8px; padding: 6px 10px; font-size: 13px; }
.chat-msg.mine { background: #ecf5ff; }
.chat-role { color: #909399; margin-right: 6px; }
.chat-text { color: #303133; word-break: break-all; }
.chat-empty { color: #c0c4cc; text-align: center; padding: 20px 0; }
.chat-input { display: flex; gap: 8px; margin-top: 8px; }

/* 知识点 */
.concept-list { display: flex; flex-wrap: wrap; gap: 8px; }
.concept-tag { font-size: 13px; }
.concept-hint { color: #c0c4cc; cursor: help; margin-left: 2px; }
.concept-empty { color: #c0c4cc; font-size: 13px; }
</style>

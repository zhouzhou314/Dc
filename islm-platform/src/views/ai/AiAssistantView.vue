<!--
  AI 学习助手视图
  -------------------------------------------------
  功能一：AI 答疑解析（引导式，不直接甩答案）
    - 选择题目后，AI 按三层递进给出提示：方向提示 → 关键公式 → 思路框架
    - 全程引导自主思考，最后才可查看完整答案与解析
    - 支持自由提问：关键词匹配本章知识库给出讲解
  功能二：复习资料生成（根据错题本 + 薄弱知识点）
    - 背诵提纲：按错题考点汇总
    - 考前速记：核心公式清单 + 个人薄弱提醒
    - 模拟卷：优先抽取薄弱知识点与错题相关题目
-->
<template>
  <div class="page-container">

    <!-- 顶部导航 -->
    <div class="page-header">
      <el-button class="back-btn" @click="$emit('back')">← 返回首页</el-button>
      <h1 class="page-title">🤖 AI 学习助手</h1>
      <span class="page-sub">引导式答疑（不直接给答案）· 智能生成复习资料</span>
    </div>

    <el-tabs v-model="activeTab" class="ai-tabs">

      <!-- ============ 功能一：AI 答疑 ============ -->
      <el-tab-pane label="🧭 AI 答疑解析" name="qa">
        <el-card class="card" shadow="never">
          <div class="pick-row">
            <el-select
              v-model="pickedQid"
              filterable
              placeholder="🔍 选择或搜索题目（输入题干关键词）"
              style="max-width: 640px"
            >
              <el-option
                v-for="q in questionBank" :key="q.id"
                :label="stripHtml(q.question).slice(0, 46) + '……'"
                :value="q.id"
              />
            </el-select>
            <el-button type="primary" :disabled="!curQ" @click="startAsk">开始 AI 引导</el-button>
          </div>

          <el-alert
            type="info" :closable="false" show-icon class="tip"
            title="AI 不直接给答案：请先独立思考，按顺序获取提示。每点开一层提示前，建议先自己动手算/想一遍。"
          />
        </el-card>

        <!-- 题目与对话 -->
        <template v-if="curQ">
          <el-card class="card qcard" shadow="hover">
            <div class="q-meta">
              <el-tag size="small" type="primary">{{ curQ.topic }}</el-tag>
              <el-tag size="small" :type="DIFFICULTIES[curQ.difficulty].type">{{ DIFFICULTIES[curQ.difficulty].label }}</el-tag>
              <el-tag size="small" effect="plain">{{ curQ.type === 'choice' ? '单选题' : '计算题' }}</el-tag>
            </div>
            <div class="q-title" v-html="curQ.question"></div>
          </el-card>

          <!-- AI 对话流 -->
          <div class="chat-zone">
            <div v-for="(m, mi) in chat" :key="mi" class="chat-row" :class="m.role">
              <div class="bubble" :class="m.role">
                <div class="b-title">{{ m.title }}</div>
                <div v-if="m.html" class="b-body" v-html="m.body"></div>
                <div v-else class="b-body">{{ m.body }}</div>
              </div>
            </div>

            <!-- 下一步按钮 -->
            <div v-if="!revealed && curQ" class="next-step">
              <el-button v-if="hintLevel === 0" type="primary" plain @click="giveHint(1)">💡 提示一：方向在哪？</el-button>
              <el-button v-else-if="hintLevel === 1" type="primary" plain @click="giveHint(2)">💡 提示二：关键公式 / 概念</el-button>
              <el-button v-else-if="hintLevel === 2" type="warning" plain @click="giveHint(3)">💡 提示三：思路框架</el-button>
              <el-button v-else type="danger" plain @click="revealed = true; pushAi('完整答案与解析', analysisHtml, true, '✅ 完整答案')">🤔 实在想不出，看答案</el-button>
              <el-button v-if="revealed === false && hintLevel > 0" text @click="revealed = true; pushAi('完整答案与解析', analysisHtml, true, '✅ 完整答案')">我已想出答案，直接看解析</el-button>
            </div>
          </div>
        </template>

        <!-- 自由提问：AI 智能体（SSE 流式打字机 + Function Calling 工具步骤条） -->
        <el-card class="card" shadow="never">
          <template #header>
            <div class="card-head">
              <b>🙋 自由提问（AI 智能体 · 可调用求解器 / 知识库 / 题库工具）</b>
              <el-button size="small" text :disabled="agentBusy || !freeChat.length" @click="clearFree">清空对话</el-button>
            </div>
          </template>
          <div ref="freeScroll" class="free-chat">
            <div v-if="!freeChat.length" class="free-empty">
              试试问我：<b>「帮我求解 IS-LM 均衡」</b>、<b>「什么是挤出效应」</b>、<b>「推荐几道练习题」</b>
            </div>
            <div v-for="(m, mi) in freeChat" :key="mi" class="chat-row" :class="m.role">
              <div class="bubble" :class="m.role">
                <!-- 工具调用步骤条（Function Calling 可视化） -->
                <div v-if="m.tools?.length" class="tool-steps">
                  <div v-for="(t, ti) in m.tools" :key="ti" class="tool-step" :class="{ running: t.running }">
                    <span class="tool-dot"></span>
                    {{ t.running ? '正在调用 ' + TOOL_NAME[t.name] + '…' : TOOL_NAME[t.name] + '：' + t.summary }}
                  </div>
                </div>
                <div class="b-body" :class="{ typing: m.streaming }" v-html="m.body"></div>
              </div>
            </div>
          </div>
          <div class="free-row">
            <el-input
              v-model="freeText"
              :disabled="agentBusy"
              placeholder="如：帮我求解 IS-LM 均衡 / 挤出效应 / 推荐练习题"
              @keyup.enter="freeAsk"
            />
            <el-button type="primary" :loading="agentBusy" @click="freeAsk">{{ agentBusy ? '思考中' : '发送' }}</el-button>
          </div>
        </el-card>
      </el-tab-pane>

      <!-- ============ 功能二：复习资料生成 ============ -->
      <el-tab-pane label="📝 复习资料生成" name="gen">
        <el-card class="card" shadow="never">
          <div class="gen-row">
            <el-alert
              type="success" :closable="false" show-icon class="gen-tip"
              :title="'将根据你的错题本（' + store.wrongBook.length + ' 道）与薄弱知识点自动生成资料'"
            />
            <el-button-group>
              <el-button type="primary" @click="gen('outline')">📋 生成背诵提纲</el-button>
              <el-button type="success" @click="gen('memo')">⚡ 生成考前速记</el-button>
              <el-button type="warning" @click="gen('mock')">📄 生成模拟卷</el-button>
            </el-button-group>
          </div>
        </el-card>

        <el-card v-if="genResult" class="card" shadow="hover">
          <template #header>
            <div class="card-head">
              <b>{{ genResult.title }}</b>
              <el-button size="small" @click="copyResult">复制全文</el-button>
            </div>
          </template>
          <pre class="gen-body">{{ genResult.body }}</pre>
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, computed, reactive, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { questionBank, DIFFICULTIES } from '@/data/questionBank'
import { learningStore } from '@/store/learning'
import { agentChat } from '@/api/agent'

defineEmits(['back'])

const store = learningStore.state
const activeTab = ref('qa')

function stripHtml(s) {
  return String(s).replace(/<[^>]+>/g, '')
}

/* ==================================================
 * 功能一：AI 引导式答疑
 * ================================================== */
const pickedQid = ref(null)
const curQ = computed(() => questionBank.find(q => q.id === pickedQid.value) || null)

const chat = ref([])        // 对话消息 [{role:'ai'|'user'|'q', title, body, html}]
const hintLevel = ref(0)    // 已给到第几层提示
const revealed = ref(false) // 是否已展示完整答案
const analysisHtml = computed(() => curQ.value ? curQ.value.analysis : '')

/** 追加一条 AI 消息 */
function pushAi(title, body, html = false, tag = '🤖 AI 助手') {
  chat.value.push({ role: 'ai', title: title ? `${tag} · ${title}` : tag, body, html })
}

/** 开始一次引导 */
function startAsk() {
  if (!curQ.value) return
  chat.value = []
  hintLevel.value = 0
  revealed.value = false
  // 先复述题目要点
  pushAi('题目已收到', '先别急着看提示！请先在草稿纸上：① 判断这道题考的是哪个知识点；② 写出你会用到的条件。想好之后再点下方的提示按钮。')
}

/** 按层级给出提示（核心：递进引导，不直接给答案） */
function giveHint(level) {
  const q = curQ.value
  if (!q) return
  hintLevel.value = level

  if (level === 1) {
    // 层1：指出考点方向，不涉及具体内容
    pushAi('提示一 · 方向提示',
      `这道题考查的是「${q.examPoint}」，属于「${q.topic}」板块，对应课本「${q.relatedSection}」。` +
      `建议先回忆该部分的核心结论与图形特征，再决定解题路径。`)
  } else if (level === 2) {
    // 层2：给出关键公式 / 概念
    if (q.type === 'calc' && q.steps && q.steps.length) {
      const f = q.steps.slice(0, 2).map((s, i) => `${i + 1}) ${s.f}　——${s.note}`).join('\n')
      pushAi('提示二 · 关键公式', f.replace(/\n/g, '<br>'), true)
    } else {
      pushAi('提示二 · 关键概念',
        `记住要点：<b>${stripHtml(q.analysis).slice(0, 60)}……</b><br>（完整结论先自己复述一遍，再对照提示三的框架）`, true)
    }
  } else if (level === 3) {
    // 层3：思路框架（计算题给步骤骨架，选择题给排除思路）
    if (q.type === 'calc' && q.steps && q.steps.length) {
      const frame = q.steps.map((s, i) => `第${i + 1}步：${s.note}`).join('<br>')
      pushAi('提示三 · 思路框架', frame + '<br><br>现在按框架代入数值自己算一遍，算完再对照答案！', true)
    } else {
      pushAi('提示三 · 排除思路',
        '逐项排除：先找出与本题核心概念明显不符的选项；再比较剩余选项的差异点，回到定义判断。想好后可以看完整解析了。')
    }
  }
}

/* ---------------- 自由提问：AI 智能体（SSE 流式 + Function Calling） ---------------- */
const freeText = ref('')
const freeChat = ref([])
const agentBusy = ref(false)
const freeScroll = ref(null)

/** 工具名 → 前端展示名（步骤条用） */
const TOOL_NAME = { islm_solve: 'IS-LM 求解器', knowledge_search: '知识库检索', question_query: '题库查询' }

/** 发给智能体的干净上下文（纯文本，最多带最近 10 条，控制 token） */
let freeHistory = []

/** 对话区自动滚到底 */
function scrollFree() {
  nextTick(() => { if (freeScroll.value) freeScroll.value.scrollTop = freeScroll.value.scrollHeight })
}

/** 用户输入做 HTML 转义（气泡用 v-html 渲染，防注入） */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

const stripTags = s => String(s).replace(/<[^>]+>/g, '')

/** 本章知识库（关键词 → 讲解） */
const KB = [
  { k: ['挤出'], a: '<b>挤出效应</b>：政府支出增加 → 收入增加 → 货币交易需求 L₁=ky 增加 → 在 m 不变时利率上升 → 私人投资 I=e−dr 减少。IS 越平缓（d 大）且 LM 越陡峭（h 小），挤出越大。试试在仿真器里做一次"财政扩张"对比仿真观察利率变化。' },
  { k: ['流动性陷阱', '凯恩斯陷阱'], a: '<b>流动性陷阱</b>：利率极低时人们预期利率只会上升（证券价格只会跌），不管多少货币都愿意持有。LM 呈水平状 → 货币政策完全无效，财政政策效果最好（无挤出）。理论上尚未真正出现过。' },
  { k: ['IS斜率', 'IS 曲线斜率', 'IS曲线斜率'], a: 'IS 斜率 = <b>−(1−β)/d</b>。β 越大 IS 越平缓（乘数大）；d 越大 IS 越平缓（投资对利率越敏感）。IS 上点满足 i=s；右侧 i＜s（收入将降），左侧 i＞s（收入将升）。' },
  { k: ['LM斜率', 'LM 曲线斜率', 'LM曲线斜率'], a: 'LM 斜率 = <b>k/h</b>。k 越大越陡；h 越大越平缓；h→∞ 水平（凯恩斯区/流动性陷阱），h→0 垂直（古典区）。LM 上点满足 L=m；右侧 L＞m（利率将升），左侧 L＜m（利率将降）。' },
  { k: ['三大动机', '货币需求动机'], a: '凯恩斯货币需求<b>三大动机</b>：① 交易动机（与 y 正相关）② 预防动机（与 y 大体正相关）③ 投机动机（与 r 负相关，源于债券价格与利率反向变化）。合并得 L = ky − hr。' },
  { k: ['乘数'], a: '简单政府支出<b>乘数</b> = 1/(1−β)。但在 IS-LM 框架中，财政扩张会推高利率产生挤出，实际产出增加 = 乘数预测 − 挤出量；流动性陷阱中无挤出，乘数效应全额兑现。' },
  { k: ['M0', 'M1', 'M2', '货币层次'], a: '<b>M0</b>=流通中现金；<b>M1</b>=M0+单位活期存款（狭义货币）；<b>M2</b>=M1+定期+储蓄+其他（广义货币）。我国只公布 M0/M1/M2。货币供给是存量、外生变量，图中为垂直线。' },
  { k: ['凯恩斯极端', '古典极端'], a: '<b>凯恩斯主义极端</b>（IS垂直）：财政十分有效、货币完全无效；<b>古典主义极端</b>（IS水平/LM垂直）：货币十分有效、财政完全无效（完全挤出）。' },
  { k: ['均衡', '联立', '交点'], a: '两个市场同时均衡在 <b>IS 与 LM 的交点</b>：联立 IS 方程 r=(C0+I0+G−c·T)/d−(1−c)/d·Y 与 LM 方程 r=(k·Y−m)/h，解出 Y* 与 r*。可以打开"题库练习"做第6题并仿真验证。' },
  { k: ['债券'], a: '<b>债券价格与利率反向变化</b>：到期本息固定，市价越低利率越高。例：面值100、票面10%一年期，到期110元；市价105 → 利率≈4.76%；市价95 → ≈15.8%。' },
  { k: ['传导'], a: '<b>货币政策传导</b>：m↑ → 货币市场超额供给 → r↓ → I=e−dr↑ → 乘数放大 → Y↑。LM 越平缓（h 大）效果越弱，IS 越平缓（d 大）效果越强。' }
]

/** 发送消息给智能体：SSE 流式打字 + 工具步骤条；后端不可用时回落本地知识库（离线可玩） */
function freeAsk() {
  const text = freeText.value.trim()
  if (!text || agentBusy.value) return
  freeChat.value.push({ role: 'user', body: escapeHtml(text) })
  freeText.value = ''
  agentBusy.value = true
  scrollFree()

  /* AI 占位气泡：工具步骤条 + 打字机正文 */
  const aiMsg = reactive({ role: 'ai', body: '', tools: [], streaming: true })
  freeChat.value.push(aiMsg)

  const history = [...freeHistory.slice(-10), { role: 'user', content: text }]
  freeHistory = history

  /** 回合结束后把纯文本写回上下文，保证多轮连贯 */
  const remember = () => { freeHistory = [...freeHistory, { role: 'assistant', content: stripTags(aiMsg.body).slice(0, 2000) }] }
  const stop = () => { aiMsg.streaming = false; agentBusy.value = false; scrollFree() }

  agentChat(history, {
    onToolCall: p => { aiMsg.tools.push({ name: p.name, summary: '', running: true }); scrollFree() },
    onToolResult: p => {
      const t = [...aiMsg.tools].reverse().find(x => x.name === p.name && x.running)
      if (t) { t.running = false; t.summary = p.summary }
    },
    onReset: () => { aiMsg.body = '' }, /* 工具轮开始前清掉流出的半截引导文本 */
    onDelta: t => { aiMsg.body += String(t).replace(/\n/g, '<br>'); scrollFree() },
    onDone: () => { remember(); stop() },
    onError: p => {
      if (!aiMsg.body) {
        fallbackFreeAsk(text, aiMsg) /* 尚无内容：本地知识库兜底 */
      } else {
        aiMsg.body += '<br><i>（回答中断：' + escapeHtml(p?.message || '智能体暂时不可用') + '）</i>'
      }
      remember()
      stop()
    }
  }).catch(() => {
    /* fetch 层失败（后端关闭/断网）→ 本地知识库兜底 */
    if (!aiMsg.body) fallbackFreeAsk(text, aiMsg)
    remember()
    stop()
  })
}

/** 本地知识库兜底（保留旧版关键词匹配逻辑，保证"关掉后端前端仍可玩"） */
function fallbackFreeAsk(text, aiMsg) {
  let best = null, bestScore = 0
  for (const item of KB) {
    const score = item.k.reduce((s, kw) => s + (text.includes(kw) ? 1 : 0), 0)
    if (score > bestScore) { best = item; bestScore = score }
  }
  aiMsg.body = best
    ? `先自己想一想：这个概念在图形上长什么样？会影响哪条曲线、怎么移动？<br>——下面是参考讲解（离线兜底模式）：<br><br>${best.a}`
    : '这个问题暂时没有匹配到知识库（当前为离线兜底模式）。建议：① 去第十一章对应小节查看知识点讲解与图示；② 启动后端后可体验智能体对话、IS-LM 求解器与题库查询工具；③ 或从上方选择相关题目，用"AI 引导"一步步获得提示。关键词示例：挤出效应、流动性陷阱、IS斜率、LM斜率、三大动机、乘数、货币层次。'
}

/** 清空智能体对话（含上下文） */
function clearFree() {
  if (agentBusy.value) return
  freeChat.value = []
  freeHistory = []
}

/* ==================================================
 * 功能二：复习资料生成
 * ================================================== */
const genResult = ref(null)

/** 各知识点掌握率 */
function rateOf(topic) {
  const m = store.mastery[topic]
  return m && m.total > 0 ? Math.round((m.correct / m.total) * 100) : null
}

/** 生成三种资料 */
function gen(kind) {
  const wrongs = store.wrongBook
  const weak = ['IS曲线', 'LM曲线', 'IS-LM均衡', '政策运用', '模型评析']
    .map(t => ({ t, r: rateOf(t) }))
    .filter(x => x.r !== null && x.r < 80)
    .sort((a, b) => a.r - b.r)

  if (kind === 'outline') {
    // 背诵提纲：错题考点 + 薄弱知识点
    const points = [...new Set(wrongs.map(w => w.snap.examPoint))]
    const lines = []
    lines.push('═══ 背诵提纲（基于你的错题自动生成）═══')
    lines.push('')
    lines.push('一、你最近的错题涉及的考点（优先背诵）：')
    if (points.length) points.forEach((p, i) => lines.push(`  ${i + 1}. ${p}`))
    else lines.push('  （错题本为空，保持下去！）')
    lines.push('')
    lines.push('二、薄弱知识点（掌握率<80%）：')
    if (weak.length) weak.forEach(w => lines.push(`  · ${w.t}（掌握率 ${w.r}%）→ 回顾课本对应小节 + 重做错题`))
    else lines.push('  （暂无，各知识点掌握良好）')
    lines.push('')
    lines.push('三、本章必背结论：IS斜率=−(1−β)/d；LM斜率=k/h；乘数=1/(1−β)；')
    lines.push('    债券价格与利率反向变化；流动性陷阱中货币无效、财政最有效。')
    genResult.value = { title: '📋 背诵提纲', body: lines.join('\n') }
  } else if (kind === 'memo') {
    // 考前速记：核心公式清单
    const lines = []
    lines.push('═══ 考前速记（核心公式 + 个人提醒）═══')
    lines.push('')
    lines.push('【核心公式】')
    lines.push('  1. 消费函数：C = C₀ + c·Yd（Yd = Y − T）')
    lines.push('  2. 投资函数：I = I₀ − d·r')
    lines.push('  3. IS方程：r = (C₀+I₀+G−c·T)/d − (1−c)/d·Y')
    lines.push('  4. LM方程：r = (k·Y − m)/h，m = M/P')
    lines.push('  5. 均衡：IS=LM → Y* = [截距IS+截距LM]/[斜率绝对值之和]')
    lines.push('  6. 乘数 = 1/(1−c)')
    lines.push('')
    lines.push('【图形要点】')
    lines.push('  · IS 右下方倾斜（i=s）；LM 右上方倾斜（L=m）')
    lines.push('  · IS右侧 i＜s；LM左侧 L＜m（利率偏高）')
    lines.push('  · G↑/T↓/e↑ → IS右移；m↑/P↓ → LM右移')
    lines.push('')
    if (wrongs.length) {
      lines.push('【你的易错提醒】')
      wrongs.slice(0, 5).forEach((w, i) => {
        const reason = w.reason ? `（原因：${w.reason}）` : ''
        lines.push(`  ${i + 1}. ${stripHtml(w.snap.question).slice(0, 30)}……${reason}`)
      })
    } else {
      lines.push('【你的易错提醒】错题本为空，没有个性化提醒。')
    }
    genResult.value = { title: '⚡ 考前速记', body: lines.join('\n') }
  } else {
    // 模拟卷：优先薄弱知识点 + 错题原题
    const pool = [...questionBank]
    // 排序：薄弱知识点的题排前，错题次之
    const weakSet = new Set(weak.map(w => w.t))
    const wrongIds = new Set(wrongs.map(w => w.qid))
    pool.sort((a, b) => {
      const sa = (weakSet.has(a.topic) ? 2 : 0) + (wrongIds.has(a.id) ? 1 : 0)
      const sb = (weakSet.has(b.topic) ? 2 : 0) + (wrongIds.has(b.id) ? 1 : 0)
      return sb - sa
    })
    const picked = pool.slice(0, 10)
    const lines = []
    lines.push('═══ AI 模拟卷（10题 · 优先薄弱知识点与错题）═══')
    lines.push('建议限时 25 分钟完成，再到"题库练习"搜索原题检验。')
    lines.push('')
    picked.forEach((q, i) => {
      lines.push(`第${i + 1}题（${q.type === 'choice' ? '单选' : '计算'}·${q.topic}）`)
      lines.push(`  ${stripHtml(q.question)}`)
      if (q.type === 'choice') {
        q.options.forEach((op, oi) => lines.push(`    ${'ABCD'[oi]}. ${op}`))
        lines.push(`  [答案：${'ABCD'[q.correct]}]`)
      } else {
        const r = q.answer.r != null ? `，r*=${(q.answer.r * 100).toFixed(2)}%` : ''
        lines.push(`  [答案：Y*=${q.answer.Y}${r}]`)
      }
      lines.push('')
    })
    genResult.value = { title: '📄 AI 模拟卷（含答案，先做后对）', body: lines.join('\n') }
  }
  ElMessage.success('资料已生成')
}

/** 复制生成的资料 */
function copyResult() {
  if (!genResult.value) return
  navigator.clipboard?.writeText(genResult.value.body)
  ElMessage.success('已复制到剪贴板')
}
</script>

<style scoped>
.page-container {
  max-width: 960px;
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
.card-head { display: flex; justify-content: space-between; align-items: center; }
.tip { margin-top: 14px; }

.pick-row { display: flex; gap: 12px; flex-wrap: wrap; }

.q-meta { display: flex; gap: 8px; margin-bottom: 12px; }
.q-title { font-size: 15.5px; color: #303133; line-height: 1.8; }

/* 对话流 */
.chat-zone { margin-bottom: 16px; }
.chat-row { display: flex; margin-bottom: 12px; }
.chat-row.ai { justify-content: flex-start; }
.chat-row.user { justify-content: flex-end; }
.bubble {
  max-width: 86%;
  border-radius: 12px;
  padding: 12px 16px;
  line-height: 1.9;
  font-size: 14px;
}
.bubble.ai { background: #ecf5ff; border: 1px solid #d9ecff; color: #303133; }
.bubble.user { background: #f0f9eb; border: 1px solid #e1f3d8; color: #303133; }
.b-title { font-weight: 700; color: #409eff; margin-bottom: 6px; font-size: 13px; }
.next-step { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 6px; }

/* 自由提问（智能体对话） */
.free-chat {
  max-height: 420px;
  overflow-y: auto;
  padding: 4px 2px;
  margin-bottom: 14px;
}
.free-empty {
  text-align: center;
  color: #909399;
  font-size: 13px;
  padding: 24px 0;
}
.free-row { display: flex; gap: 10px; }
/* 工具调用步骤条（Function Calling 可视化） */
.tool-steps { margin-bottom: 8px; display: flex; flex-direction: column; gap: 4px; }
.tool-step {
  display: flex; align-items: center; gap: 6px;
  font-size: 12.5px; color: #67c23a;
  background: #f0f9eb; border: 1px solid #e1f3d8;
  border-radius: 6px; padding: 4px 10px;
  width: fit-content;
}
.tool-step.running { color: #409eff; background: #ecf5ff; border-color: #d9ecff; }
.tool-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex: none; }
.tool-step.running .tool-dot { animation: tool-blink 0.9s infinite; }
@keyframes tool-blink { 50% { opacity: 0.2; } }
/* 流式打字机光标 */
.b-body.typing::after {
  content: '▍';
  color: #409eff;
  animation: tool-blink 0.9s infinite;
}

/* 资料生成 */
.gen-row { display: flex; flex-direction: column; gap: 14px; }
.gen-tip { width: 100%; }
.gen-body {
  white-space: pre-wrap;
  font-family: 'Microsoft YaHei', sans-serif;
  font-size: 13.5px;
  line-height: 2;
  color: #303133;
  margin: 0;
}
</style>

<!--
  题库练习视图
  -------------------------------------------------
  功能：
  1. 按知识点 / 题型 / 难度筛选习题
  2. 三种练习模式：
     - 专项刷题：顺序做完筛选出的题目
     - 模拟测试：随机抽取指定数量组卷
     - 限时自测：限定时间，倒计时结束自动交卷
  3. 做完自动批改，给出参考答案、解题步骤、考点与关联章节
  4. 答错自动收入错题本；更新知识点掌握度；记录刷题时长
-->
<template>
  <div class="page-container">

    <!-- 顶部导航 -->
    <div class="page-header">
      <el-button class="back-btn" @click="$emit('back')">← 返回首页</el-button>
      <h1 class="page-title">✏️ 题库练习</h1>
      <span class="page-sub">共 {{ questionBank.length }} 题 · 自动批改 · 错题自动入库</span>
    </div>

    <!-- ============ 阶段一：练习设置 ============ -->
    <el-card v-if="stage === 'setup'" class="card" shadow="hover">
      <template #header><b>练习设置</b></template>

      <el-form label-width="90px">
        <el-form-item label="知识点">
          <el-select v-model="filter.topic" style="width: 220px">
            <el-option label="全部知识点" value="" />
            <el-option v-for="t in TOPICS" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="题型">
          <el-radio-group v-model="filter.type">
            <el-radio-button value="">全部</el-radio-button>
            <el-radio-button value="choice">单选题</el-radio-button>
            <el-radio-button value="calc">计算题</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="难度">
          <el-radio-group v-model="filter.difficulty">
            <el-radio-button value="">全部</el-radio-button>
            <el-radio-button v-for="(d, k) in DIFFICULTIES" :key="k" :value="k">{{ d.label }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="练习模式">
          <el-radio-group v-model="mode">
            <el-radio-button value="special">专项刷题</el-radio-button>
            <el-radio-button value="mock">模拟测试</el-radio-button>
            <el-radio-button value="timed">限时自测</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="mode !== 'special'" label="题目数量">
          <el-input-number v-model="count" :min="3" :max="30" />
        </el-form-item>
        <el-form-item v-if="mode === 'timed'" label="限时（分钟）">
          <el-input-number v-model="limitMinutes" :min="3" :max="90" />
        </el-form-item>
      </el-form>

      <el-alert :title="'当前筛选条件下共 ' + filtered.length + ' 道题'" type="info" :closable="false" class="tip" />
      <el-button type="primary" size="large" :disabled="sessionQuestions.length === 0" @click="startSession">
        ▶ 开始练习（{{ sessionQuestions.length }} 题）
      </el-button>
      <el-button v-if="mode === 'mock' || mode === 'timed'" @click="shufflePreview">🎲 重新抽题</el-button>
      <!-- 大创亮点：BKT 知识追踪驱动的自适应推题 -->
      <el-button type="success" :loading="recommending" @click="startRecommended">
        🎯 智能推荐练习
      </el-button>
      <el-alert
        v-if="recommendInfo"
        :title="recommendInfo"
        type="success"
        :closable="false"
        class="tip"
      />
    </el-card>

    <!-- ============ 阶段二：作答中 ============ -->
    <template v-if="stage === 'running'">
      <!-- 进度条 / 计时器 -->
      <el-card class="card progress-card" shadow="never">
        <div class="progress-row">
          <el-progress :percentage="progressPct" :stroke-width="14" striped striped-flow class="prog" />
          <el-tag v-if="mode === 'timed'" :type="remainSeconds < 60 ? 'danger' : 'warning'" size="large">
            ⏱ 剩余 {{ fmtTime(remainSeconds) }}
          </el-tag>
          <el-tag type="primary" size="large">{{ doneCount + 1 }} / {{ sessionQuestions.length }}</el-tag>
        </div>
      </el-card>

      <!-- 题目卡片 -->
      <el-card class="card" shadow="hover">
        <div class="q-meta">
          <el-tag size="small" type="primary">{{ q.topic }}</el-tag>
          <el-tag size="small" :type="DIFFICULTIES[q.difficulty].type">{{ DIFFICULTIES[q.difficulty].label }}</el-tag>
          <el-tag size="small" effect="plain">{{ q.type === 'choice' ? '单选题' : '计算题' }}</el-tag>
        </div>

        <div class="q-title" v-html="q.question"></div>

        <!-- 单选题作答 -->
        <el-radio-group v-if="q.type === 'choice'" v-model="myChoice" class="q-options" :disabled="answered">
          <el-radio v-for="(op, oi) in q.options" :key="oi" :value="oi" class="q-radio">
            {{ 'ABCD'[oi] }}. {{ op }}
          </el-radio>
        </el-radio-group>

        <!-- 计算题作答 -->
        <div v-if="q.type === 'calc'" class="q-calc">
          <div class="calc-item">
            <span>均衡产出 Y* =</span>
            <el-input-number v-model="myY" :precision="2" :controls="false" :disabled="answered" style="width: 140px" placeholder="如 1266.67" />
          </div>
          <div class="calc-item" v-if="q.answer && q.answer.r !== null && q.answer.r !== undefined">
            <span>均衡利率 r* =</span>
            <el-input-number v-model="myR" :precision="2" :controls="false" :disabled="answered" style="width: 110px" placeholder="如 5.33" />
            <span>%</span>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="q-actions">
          <el-button v-if="!answered" type="primary" @click="submit">提交答案（自动批改）</el-button>
          <template v-else>
            <el-button type="success" @click="next">下一题 →</el-button>
            <el-button v-if="q.lab" type="warning" plain @click="openLab">🔬 仿真验证</el-button>
          </template>
          <el-button text type="danger" @click="quitSession">放弃本次练习</el-button>
        </div>

        <!-- 批改结果 -->
        <el-alert
          v-if="answered"
          :title="isCorrect ? '✅ 回答正确！' : '❌ 回答有误，已自动收入错题本'"
          :type="isCorrect ? 'success' : 'error'"
          show-icon :closable="false" class="q-result"
        />

        <!-- 解析（参考答案 + 解题步骤 + 考点 + 关联章节） -->
        <div v-if="answered" class="q-analysis">
          <div class="ana-title">📝 参考答案与解析</div>

          <div v-if="q.type === 'choice'" class="ana-answer">正确答案：<b>{{ 'ABCD'[q.correct] }}</b>　（你的选择：{{ myChoice === -1 ? '未作答' : 'ABCD'[myChoice] }}）</div>
          <div v-else class="ana-answer">
            参考答案：<b>Y* = {{ q.answer.Y }}</b>
            <template v-if="q.answer.r != null">，<b>r* = {{ (q.answer.r * 100).toFixed(2) }}%</b></template>
          </div>

          <div v-if="q.steps && q.steps.length" class="ana-steps">
            <div class="ana-sub">解题步骤：</div>
            <div v-for="(s, si) in q.steps" :key="si" class="ana-step">
              <span class="step-no">{{ si + 1 }}</span>
              <div>
                <pre class="step-f">{{ s.f }}</pre>
                <div class="step-n">{{ s.note }}</div>
              </div>
            </div>
          </div>

          <div class="ana-body" v-html="q.analysis"></div>

          <div class="ana-foot">
            <el-tag type="warning" effect="plain" size="small">考点：{{ q.examPoint }}</el-tag>
            <el-tag type="info" effect="plain" size="small">关联章节：{{ q.relatedSection }}</el-tag>
          </div>
        </div>
      </el-card>
    </template>

    <!-- ============ 阶段三：练习报告 ============ -->
    <el-card v-if="stage === 'result'" class="card" shadow="hover">
      <template #header><b>📊 练习报告</b></template>
      <el-result
        :icon="wrongList.length === 0 ? 'success' : 'info'"
        :title="'共 ' + sessionQuestions.length + ' 题，答对 ' + correctCount + ' 题'"
        :sub-title="'用时 ' + fmtTime(spentSeconds) + ' · 正确率 ' + correctRate + '% · 本次学习时长已计入统计'"
      >
        <template #extra>
          <el-button type="primary" @click="restart">再来一轮</el-button>
          <el-button @click="goSetup">调整筛选</el-button>
        </template>
      </el-result>

      <!-- 错题速览 -->
      <div v-if="wrongList.length" class="wrong-quick">
        <div class="ana-title">本次错题（已收入错题本，可去错题本标注错误原因）：</div>
        <div v-for="(w, wi) in wrongList" :key="wi" class="wrong-item">
          <el-tag size="small" type="danger">{{ w.topic }}</el-tag>
          <span class="wrong-q" v-html="w.question"></span>
        </div>
      </div>
    </el-card>

    <!-- 仿真验证弹窗 -->
    <el-dialog v-model="labVisible" title="🔬 仿真验证" width="94%" top="2vh" destroy-on-close class="lab-dialog">
      <ISLMSimulator
        v-if="labConfig"
        :key="simKey"
        ref="simRef"
        :initial-params="labConfig.params"
        :initial-compare-mode="labConfig.compare"
        :initial-shock-params="labConfig.shock"
      />
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount, watch } from 'vue'
import { ElMessage } from 'element-plus'
import ISLMSimulator from '@/components/ISLMSimulator.vue'
import { questionBank, TOPICS, DIFFICULTIES } from '@/data/questionBank'
import { learningStore } from '@/store/learning'
import { reportAnswer, getRecommend } from '@/api/record'
import { loadLocal, saveLocal, genId } from '@/utils/storage'

defineEmits(['back'])

/* 匿名用户标识（与章节页 hintUserId 同源：登录前作答记录也能延续到登录后） */
const hintUserId = loadLocal('hintUserId') || genId()
saveLocal('hintUserId', hintUserId)

/* ================= 筛选与模式 ================= */
const filter = ref({ topic: '', type: '', difficulty: '' })
const mode = ref('special')      // special 专项 | mock 模拟 | timed 限时
const count = ref(10)            // 模拟/限时 抽题数量
const limitMinutes = ref(15)     // 限时分钟数

/** 符合筛选条件的题目 */
const filtered = computed(() =>
  questionBank.filter(q =>
    (!filter.value.topic || q.topic === filter.value.topic) &&
    (!filter.value.type || q.type === filter.value.type) &&
    (!filter.value.difficulty || q.difficulty === filter.value.difficulty)
  )
)

/* ================= 智能推荐（BKT 自适应推题，大创学习分析亮点） ================= */
const recommendIds = ref(null)   // 推荐题目 id 列表（null = 非推荐模式）
const recommending = ref(false)  // 推荐请求加载态
const recommendInfo = ref('')    // 推荐策略说明（展示给用户）

/** 本次练习题目：推荐模式优先，否则按筛选条件 */
const sessionQuestions = computed(() => {
  if (recommendIds.value) {
    const picked = recommendIds.value.map((id) => questionBank.find((q) => q.id === id)).filter(Boolean)
    return picked
  }
  const list = filtered.value
  if (mode.value === 'special') return list
  // 打乱后取前 count 题
  const shuffled = [...list].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count.value, list.length))
})

/** 点击"智能推荐练习"：向后端要一份基于 BKT 掌握度的个性化题目清单 */
async function startRecommended() {
  recommending.value = true
  try {
    const res = await getRecommend(5)
    const data = res.data.data
    if (!data.questions || data.questions.length === 0) {
      ElMessage.warning('暂时没有可推荐的题目')
      return
    }
    recommendIds.value = data.questions.map((x) => x.id)
    recommendInfo.value = `🎯 已按 ${data.strategy.weakTopic ? '薄弱知识点「' + data.strategy.weakTopic + '」' : '你的作答历史'}生成 ${data.questions.length} 道个性化练习（${data.strategy.rule}）`
    ElMessage.success('已生成个性化练习清单')
  } catch (e) {
    // 后端未启动等异常：静默降级，不影响普通刷题
    ElMessage.info('智能推荐暂不可用（后端未连接），已保持普通模式')
  } finally {
    recommending.value = false
  }
}

/** 设置页重新抽题（仅用于刷新随机序列，触发重新计算） */
function shufflePreview() {
  filter.value = { ...filter.value }
  ElMessage.success('已重新抽题')
}

/* 用户手动改动筛选/模式时退出推荐模式 */
watch([filter, mode, count], () => {
  recommendIds.value = null
  recommendInfo.value = ''
}, { deep: true })

/* ================= 会话状态 ================= */
const stage = ref('setup')       // setup | running | result
const qIndex = ref(0)            // 当前题号
const q = computed(() => sessionQuestions.value[qIndex.value] || questionBank[0])

const myChoice = ref(-1)         // 单选作答
const myY = ref(null)            // 计算题 Y 作答
const myR = ref(null)            // 计算题 r 作答（百分数数值）
const answered = ref(false)      // 当前题是否已提交
const isCorrect = ref(false)     // 当前题判定结果
let questionStartTs = 0          // 当前题开始作答的时间戳（算耗时用）

const correctCount = ref(0)      // 会话累计答对
const wrongList = ref([])        // 会话错题列表
const spentSeconds = ref(0)      // 会话用时
const startTs = ref(0)           // 会话开始时间戳

/* 限时自测计时器 */
const remainSeconds = ref(0)
let timer = null

const doneCount = computed(() => qIndex.value)
const progressPct = computed(() => Math.round((qIndex.value / sessionQuestions.value.length) * 100))
const correctRate = computed(() =>
  sessionQuestions.value.length === 0 ? 0 : Math.round((correctCount.value / sessionQuestions.value.length) * 100)
)

/** 秒数格式化为 mm:ss */
function fmtTime(s) {
  const m = Math.floor(s / 60)
  const ss = Math.round(s % 60)
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

/* ================= 流程控制 ================= */
function startSession() {
  if (sessionQuestions.value.length === 0) {
    ElMessage.warning('当前筛选条件下没有题目')
    return
  }
  stage.value = 'running'
  qIndex.value = 0
  correctCount.value = 0
  wrongList.value = []
  spentSeconds.value = 0
  startTs.value = Date.now()
  resetAnswer()
  // 限时自测：启动倒计时
  if (mode.value === 'timed') {
    remainSeconds.value = limitMinutes.value * 60
    timer = setInterval(() => {
      remainSeconds.value--
      if (remainSeconds.value <= 0) {
        ElMessage.warning('时间到！自动交卷')
        finishSession()
      }
    }, 1000)
  }
}

/** 重置当前题作答状态 */
function resetAnswer() {
  myChoice.value = -1
  myY.value = null
  myR.value = null
  answered.value = false
  isCorrect.value = false
  questionStartTs = Date.now() // 记录本题作答开始时间（耗时统计）
}

/** 提交当前题并自动批改 */
function submit() {
  const cur = q.value
  let ok = false
  let myAns = null

  if (cur.type === 'choice') {
    if (myChoice.value === -1) { ElMessage.warning('请先选择一个选项'); return }
    ok = myChoice.value === cur.correct
    myAns = myChoice.value
  } else {
    // 计算题：Y 必填；r 仅在题目要求时必填
    if (myY.value === null || myY.value === undefined) { ElMessage.warning('请先填写均衡产出 Y*'); return }
    const needR = cur.answer && cur.answer.r !== null && cur.answer.r !== undefined
    if (needR && (myR.value === null || myR.value === undefined)) { ElMessage.warning('请先填写均衡利率 r*'); return }
    // 容差判定：相对误差 0.5% 以内视为正确
    const tol = (std, mine) => Math.abs(mine - std) <= Math.abs(std) * 0.005 + 0.005
    ok = tol(cur.answer.Y, myY.value)
    if (needR) ok = ok && tol(cur.answer.r * 100, myR.value)
    myAns = needR ? { Y: myY.value, r: myR.value } : { Y: myY.value }
  }

  isCorrect.value = ok
  answered.value = true

  // 记录知识点掌握度（本地，匿名可用）
  learningStore.recordMastery(cur.topic, ok)

  /* 云端作答上报：BKT 知识追踪的数据源（fire-and-forget，失败不阻塞做题） */
  reportAnswer({
    hintUserId, // 匿名标识；登录用户的身份由请求头的 JWT 决定
    questionId: cur.id,
    topic: cur.topic,
    qType: cur.type,
    difficulty: cur.difficulty,
    isCorrect: ok,
    studentAnswer: myAns,
    durationMs: Date.now() - questionStartTs
  }).catch(() => {})

  if (ok) {
    correctCount.value++
    ElMessage.success('回答正确！')
  } else {
    // 错题自动收入错题本
    learningStore.addWrong(cur, myAns, '')
    wrongList.value.push(cur)
    ElMessage.error('回答有误，已收入错题本')
  }
}

/** 下一题 / 交卷 */
function next() {
  if (qIndex.value + 1 >= sessionQuestions.value.length) {
    finishSession()
  } else {
    qIndex.value++
    resetAnswer()
  }
}

/** 结束会话：结算时长 + 生成报告 */
function finishSession() {
  if (timer) { clearInterval(timer); timer = null }
  spentSeconds.value = Math.round((Date.now() - startTs.value) / 1000)
  // 写入学习日志：本次时长 / 做题数 / 错题数
  learningStore.addStudyLog({
    seconds: spentSeconds.value,
    done: sessionQuestions.value.length,
    wrong: wrongList.value.length
  })
  stage.value = 'result'
}

/** 放弃练习（仍计时长） */
function quitSession() {
  finishSession()
  ElMessage.info('已结束本次练习，时长已计入统计')
}

function restart() {
  stage.value = 'setup'
}

function goSetup() {
  stage.value = 'setup'
}

/* ================= 仿真验证弹窗 ================= */
const labVisible = ref(false)
const labConfig = ref(null)
const simKey = ref(0)
const simRef = ref(null)

function openLab() {
  labConfig.value = {
    compare: q.value.lab?.compare || false,
    params: q.value.lab?.params || q.value.lab?.base,
    shock: q.value.lab?.shock
  }
  simKey.value++
  labVisible.value = true
}

/* 组件销毁前清理计时器与未结算的时长 */
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  // 防止用户中途切走页面丢失时长：按已进行时间结算
  if (stage.value === 'running') {
    const secs = Math.round((Date.now() - startTs.value) / 1000)
    if (secs > 0) {
      learningStore.addStudyLog({ seconds: secs, done: qIndex.value, wrong: wrongList.value.length })
    }
  }
})
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
.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.page-title { margin: 0; font-size: 24px; color: #303133; }
.page-sub { font-size: 13px; color: #909399; }
.card { border-radius: 12px; margin-bottom: 16px; }
.tip { margin: 14px 0; }

/* 进度行 */
.progress-row { display: flex; align-items: center; gap: 14px; }
.prog { flex: 1; }

/* 题目 */
.q-meta { display: flex; gap: 8px; margin-bottom: 14px; }
.q-title { font-size: 16px; color: #303133; line-height: 1.8; margin-bottom: 16px; }
.q-options { display: flex; flex-direction: column; gap: 10px; margin-left: 4px; }
.q-radio { margin-right: 0; }
.q-calc { display: flex; flex-direction: column; gap: 12px; }
.calc-item { display: flex; align-items: center; gap: 8px; color: #606266; }
.q-actions { margin-top: 20px; display: flex; gap: 10px; flex-wrap: wrap; }
.q-result { margin-top: 16px; }

/* 解析 */
.q-analysis {
  margin-top: 16px;
  background: #f8f9fc;
  border-radius: 10px;
  padding: 16px;
  border: 1px solid #ebeef5;
}
.ana-title { font-weight: 700; color: #303133; margin-bottom: 10px; }
.ana-sub { font-weight: 600; color: #303133; margin: 10px 0 6px; }
.ana-answer { color: #409eff; margin-bottom: 8px; }
.ana-body { color: #606266; line-height: 1.9; margin-top: 8px; }
.ana-foot { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
.ana-step { display: flex; gap: 10px; margin-bottom: 8px; }
.step-no {
  flex-shrink: 0;
  width: 20px; height: 20px;
  border-radius: 50%;
  background: #667eea;
  color: #fff;
  font-size: 12px;
  display: flex; align-items: center; justify-content: center;
  margin-top: 3px;
}
.step-f { margin: 0; font-family: Consolas, monospace; color: #303133; background: #eef1f8; padding: 3px 8px; border-radius: 4px; font-size: 13px; }
.step-n { font-size: 12.5px; color: #909399; margin-top: 3px; }

/* 报告 */
.wrong-quick { margin-top: 10px; }
.wrong-item { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px; }
.wrong-q { color: #606266; font-size: 13.5px; line-height: 1.7; }

.lab-dialog { border-radius: 12px; }
</style>

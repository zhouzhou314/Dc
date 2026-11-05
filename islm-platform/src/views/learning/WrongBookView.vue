<!--
  智能错题本视图
  -------------------------------------------------
  功能：
  1. 错题列表：自动收纳的错题 + 手动添加的错题
  2. 标注错误原因（常见原因下拉 + 自定义输入）
  3. 按知识点筛选 / 重做错题：答对可"掌握移除"
  4. 每道题附参考答案、解析与考点，可跳仿真验证
-->
<template>
  <div class="page-container">

    <!-- 顶部导航 -->
    <div class="page-header">
      <el-button class="back-btn" @click="$emit('back')">← 返回首页</el-button>
      <h1 class="page-title">📕 智能错题本</h1>
      <span class="page-sub">错题自动收纳 · 标注原因 · 反复巩固薄弱内容</span>
    </div>

    <!-- 工具栏 -->
    <el-card class="card" shadow="never">
      <div class="toolbar">
        <el-select v-model="topicFilter" style="width: 200px" placeholder="按知识点筛选">
          <el-option label="全部知识点" value="" />
          <el-option v-for="t in TOPICS" :key="t" :label="t" :value="t" />
        </el-select>
        <el-button type="primary" :disabled="topicFiltered.length === 0" @click="startRedo">
          🔁 按知识点重做（{{ topicFiltered.length }} 题）
        </el-button>
        <el-button type="success" @click="addDialog = true">＋ 手动添加错题</el-button>
        <!-- 大创亮点：SM-2 间隔重复复习（登录 + 后端在线时可用） -->
        <el-button type="warning" :loading="dueLoading" @click="startReview">
          🧠 今日复习（{{ dueList.length > 0 ? dueList.length + ' 题到期' : '加载' }}）
        </el-button>
        <el-tag type="danger" size="large">共 {{ filteredWrong.length }} 道错题</el-tag>
      </div>
    </el-card>

    <!-- ============ SM-2 间隔重复复习模式（大创亮点） ============ -->
    <el-card v-if="reviewing && curDue" class="card" shadow="hover">
      <template #header>
        <b>🧠 间隔重复复习（SM-2 算法调度）</b>　{{ dueIndex + 1 }} / {{ dueList.length }}
      </template>

      <div class="q-meta">
        <el-tag size="small" type="primary">{{ curDue.snapshot.topic }}</el-tag>
        <el-tag size="small" type="info" effect="plain">已错 {{ curDue.times }} 次</el-tag>
      </div>
      <div class="q-title" v-html="curDue.snapshot.question"></div>

      <!-- 先回忆，再揭晓答案自评 -->
      <template v-if="!revealed">
        <el-alert title="先在脑中回忆解法，再点击下方按钮对照答案" type="info" :closable="false" class="q-result" />
        <el-button type="primary" @click="revealed = true">👀 显示答案</el-button>
      </template>

      <template v-else>
        <div class="q-analysis">
          <div class="ana-title">📝 参考答案与解析</div>
          <div v-if="curDue.snapshot.type === 'choice'" class="ana-answer">
            正确答案：<b>{{ 'ABCD'[curDue.snapshot.correct] }}</b>
          </div>
          <div v-else class="ana-answer">
            参考答案：<b>Y* = {{ curDue.snapshot.answer.Y }}</b>
            <template v-if="curDue.snapshot.answer.r != null">，<b>r* = {{ (curDue.snapshot.answer.r * 100).toFixed(2) }}%</b></template>
          </div>
          <div class="ana-body" v-html="curDue.snapshot.analysis"></div>
        </div>

        <!-- 三档自评 → SM-2 计算下次复习时间 -->
        <div class="review-grade">
          <span class="grade-tip">回忆得怎么样？</span>
          <el-button type="success" @click="grade('remember')">😌 记得</el-button>
          <el-button type="warning" @click="grade('fuzzy')">😕 模糊</el-button>
          <el-button type="danger" @click="grade('forgot')">😵 忘了</el-button>
        </div>
      </template>

      <!-- 评分结果反馈 -->
      <el-alert
        v-if="gradeResult"
        :title="gradeResult"
        :type="gradedAs === 'forgot' ? 'error' : gradedAs === 'fuzzy' ? 'warning' : 'success'"
        show-icon :closable="false" class="q-result"
      />

      <div class="q-actions">
        <el-button text type="danger" @click="reviewing = false">退出复习</el-button>
      </div>
    </el-card>

    <!-- ============ 重做模式 ============ -->
    <el-card v-if="redoing && curQ" class="card" shadow="hover">
      <template #header><b>🔁 错题重做</b>　{{ redoIndex + 1 }} / {{ redoList.length }}</template>

      <div class="q-meta">
        <el-tag size="small" type="primary">{{ curQ.topic }}</el-tag>
        <el-tag size="small" effect="plain">{{ curQ.type === 'choice' ? '单选题' : '计算题' }}</el-tag>
      </div>
      <div class="q-title" v-html="curQ.question"></div>

      <!-- 单选 -->
      <el-radio-group v-if="curQ.type === 'choice'" v-model="rChoice" class="q-options" :disabled="rAnswered">
        <el-radio v-for="(op, oi) in curQ.options" :key="oi" :value="oi" class="q-radio">
          {{ 'ABCD'[oi] }}. {{ op }}
        </el-radio>
      </el-radio-group>

      <!-- 计算 -->
      <div v-if="curQ.type === 'calc'" class="q-calc">
        <div class="calc-item">
          <span>均衡产出 Y* =</span>
          <el-input-number v-model="rY" :precision="2" :controls="false" :disabled="rAnswered" style="width: 140px" />
        </div>
        <div class="calc-item" v-if="curQ.answer && curQ.answer.r != null">
          <span>均衡利率 r* =</span>
          <el-input-number v-model="rR" :precision="2" :controls="false" :disabled="rAnswered" style="width: 110px" />
          <span>%</span>
        </div>
      </div>

      <div class="q-actions">
        <el-button v-if="!rAnswered" type="primary" @click="submitRedo">提交（自动批改）</el-button>
        <el-button v-else type="success" @click="nextRedo">下一题 →</el-button>
        <el-button text type="danger" @click="redoing = false">退出重做</el-button>
      </div>

      <el-alert
        v-if="rAnswered"
        :title="rCorrect ? '✅ 掌握了！可以移出错题本' : '❌ 仍然做错，继续留在错题本（错误次数+1）'"
        :type="rCorrect ? 'success' : 'error'"
        show-icon :closable="false" class="q-result"
      />

      <!-- 重做后的解析 -->
      <div v-if="rAnswered" class="q-analysis">
        <div class="ana-title">📝 解析</div>
        <div v-if="curQ.type === 'choice'" class="ana-answer">正确答案：<b>{{ 'ABCD'[curQ.correct] }}</b></div>
        <div v-else class="ana-answer">
          参考答案：<b>Y* = {{ curQ.answer.Y }}</b>
          <template v-if="curQ.answer.r != null">，<b>r* = {{ (curQ.answer.r * 100).toFixed(2) }}%</b></template>
        </div>
        <div class="ana-body" v-html="curQ.analysis"></div>
        <div class="ana-foot">
          <el-tag type="warning" effect="plain" size="small">考点：{{ curQ.examPoint }}</el-tag>
        </div>
        <el-button v-if="rCorrect" type="success" size="small" class="remove-btn" @click="masterRemove">
          ✓ 已掌握，移出错题本
        </el-button>
      </div>
    </el-card>

    <!-- ============ 错题列表 ============ -->
    <el-empty v-if="filteredWrong.length === 0" description="错题本空空如也，太棒了！继续保持 🎉" />
    <el-card v-for="w in filteredWrong" :key="w.qid" class="card wrong-card" shadow="hover">
      <div class="w-head">
        <el-tag size="small" type="primary">{{ w.snap.topic }}</el-tag>
        <el-tag size="small" effect="plain">{{ w.snap.type === 'choice' ? '单选题' : '计算题' }}</el-tag>
        <el-tag v-if="w.reason" size="small" type="warning">{{ w.reason }}</el-tag>
        <el-tag size="small" type="danger">错 {{ w.times }} 次</el-tag>
        <span class="w-time">{{ fmtTs(w.time) }}</span>
      </div>

      <div class="q-title" v-html="w.snap.question"></div>

      <!-- 折叠：我的作答 / 参考答案 / 解析 -->
      <el-collapse class="w-collapse">
        <el-collapse-item title="▼ 查看我的作答与解析">
          <div class="ana-answer">
            我的作答：
            <b v-if="w.snap.type === 'choice'">{{ w.myAnswer === -1 || w.myAnswer == null ? '未作答' : 'ABCD'[w.myAnswer] }}</b>
            <b v-else>{{ fmtMyCalc(w.myAnswer) }}</b>
            　｜　正确答案：
            <b v-if="w.snap.type === 'choice'">{{ 'ABCD'[w.snap.correct] }}</b>
            <b v-else>Y* = {{ w.snap.answer.Y }}<template v-if="w.snap.answer.r != null">，r* = {{ (w.snap.answer.r * 100).toFixed(2) }}%</template></b>
          </div>
          <div class="ana-body" v-html="w.snap.analysis"></div>
        </el-collapse-item>
      </el-collapse>

      <!-- 操作行 -->
      <div class="w-actions">
        <el-select
          :model-value="w.reason"
          placeholder="标注错误原因"
          style="width: 180px"
          @change="(v) => learningStore.setWrongReason(w.qid, v)"
        >
          <el-option v-for="r in REASONS" :key="r" :label="r" :value="r" />
        </el-select>
        <el-button size="small" @click="redoOne(w)">重做此题</el-button>
        <el-button size="small" type="success" plain @click="learningStore.removeWrong(w.qid); ElMessage.success('已移出错题本')">
          ✓ 已掌握移除
        </el-button>
        <el-button size="small" type="danger" plain @click="learningStore.removeWrong(w.qid)">
          🗑 删除
        </el-button>
      </div>
    </el-card>

    <!-- ============ 手动添加错题弹窗 ============ -->
    <el-dialog v-model="addDialog" title="＋ 手动添加错题" width="640px">
      <el-form label-width="90px">
        <el-form-item label="选择题目">
          <el-select v-model="addQid" filterable placeholder="搜索题干关键词" style="width: 100%">
            <el-option
              v-for="q in questionBank" :key="q.id"
              :label="stripHtml(q.question).slice(0, 40) + '……'"
              :value="q.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="错误原因">
          <el-select v-model="addReason" style="width: 220px">
            <el-option v-for="r in REASONS" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmAdd">加入错题本</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { questionBank, TOPICS } from '@/data/questionBank'
import { learningStore } from '@/store/learning'
import { authStore } from '@/store/auth'
import { getDueList, gradeReview } from '@/api/review'

defineEmits(['back'])

/** 常见错误原因 */
const REASONS = ['概念不清', '公式记错', '计算失误', '审题错误', '图像看错', '时间不够', '粗心大意', '其他']

/* ================= 列表 ================= */
const topicFilter = ref('')

/** 按知识点过滤后的错题 */
const filteredWrong = computed(() =>
  learningStore.state.wrongBook.filter(w => !topicFilter.value || w.snap.topic === topicFilter.value)
)

/** 重做用：按知识点过滤（含全部） */
const topicFiltered = computed(() =>
  learningStore.state.wrongBook.filter(w => !topicFilter.value || w.snap.topic === topicFilter.value)
)

/** 时间戳格式化 */
function fmtTs(ts) {
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 计算题作答格式化 */
function fmtMyCalc(ans) {
  if (!ans || ans.Y == null) return '未作答'
  return ans.r != null ? `Y=${ans.Y}, r=${ans.r}%` : `Y=${ans.Y}`
}

/** 去掉 HTML 标签（用于下拉显示题干） */
function stripHtml(s) {
  return String(s).replace(/<[^>]+>/g, '')
}

/* ================= 重做 ================= */
const redoing = ref(false)
const redoList = ref([])
const redoIndex = ref(0)
const curQ = ref(null)

const rChoice = ref(-1)
const rY = ref(null)
const rR = ref(null)
const rAnswered = ref(false)
const rCorrect = ref(false)

function resetRedo() {
  rChoice.value = -1
  rY.value = null
  rR.value = null
  rAnswered.value = false
  rCorrect.value = false
}

/** 开始按知识点重做 */
function startRedo() {
  if (topicFiltered.value.length === 0) return
  redoList.value = topicFiltered.value.map(w => w.snap) // 用快照重做
  redoIndex.value = 0
  curQ.value = redoList.value[0]
  resetRedo()
  redoing.value = true
}

/** 单题重做 */
function redoOne(w) {
  redoList.value = [w.snap]
  redoIndex.value = 0
  curQ.value = w.snap
  resetRedo()
  redoing.value = true
}

/** 提交重做答案 */
function submitRedo() {
  const cur = curQ.value
  let ok = false
  let myAns = null

  if (cur.type === 'choice') {
    if (rChoice.value === -1) { ElMessage.warning('请先选择一个选项'); return }
    ok = rChoice.value === cur.correct
    myAns = rChoice.value
  } else {
    if (rY.value == null) { ElMessage.warning('请先填写均衡产出 Y*'); return }
    const needR = cur.answer && cur.answer.r != null
    if (needR && rR.value == null) { ElMessage.warning('请先填写均衡利率 r*'); return }
    const tol = (std, mine) => Math.abs(mine - std) <= Math.abs(std) * 0.005 + 0.005
    ok = tol(cur.answer.Y, rY.value)
    if (needR) ok = ok && tol(cur.answer.r * 100, rR.value)
    myAns = needR ? { Y: rY.value, r: rR.value } : { Y: rY.value }
  }

  rCorrect.value = ok
  rAnswered.value = true
  learningStore.recordMastery(cur.topic, ok) // 重做也计入掌握度
  learningStore.addStudyLog({ seconds: 30, done: 1, wrong: ok ? 0 : 1 }) // 每题按30秒估算时长

  if (ok) {
    ElMessage.success('回答正确！')
  } else {
    learningStore.addWrong(cur, myAns, '') // 错误次数 +1
    ElMessage.error('仍做错了，错误次数+1')
  }
}

/** 下一题 */
function nextRedo() {
  if (redoIndex.value + 1 >= redoList.value.length) {
    redoing.value = false
    ElMessage.success('本轮重做完成！')
  } else {
    redoIndex.value++
    curQ.value = redoList.value[redoIndex.value]
    resetRedo()
  }
}

/** 答对后移出错题本 */
function masterRemove() {
  const cur = curQ.value
  learningStore.removeWrong(cur.id)
  ElMessage.success('已从错题本移除')
}

/* ================= SM-2 间隔重复复习（大创亮点） =================
 * 流程：拉取到期队列 → 显示题目 → 学生回忆后自评（记得/模糊/忘了）
 * → 后端 SM-2 算法计算下次复习日期 → 下一题 */
const reviewing = ref(false)
const dueLoading = ref(false)
const dueList = ref([])        // 到期复习队列（来自云端 wrong_book 表）
const dueIndex = ref(0)
const curDue = computed(() => dueList.value[dueIndex.value] || null)
const revealed = ref(false)    // 是否已揭晓答案
const gradeResult = ref('')    // 评分后的反馈文案
const gradedAs = ref('')       // 本次评分档位（控制反馈颜色）

/** 开始复习：拉取今天到期的错题 */
async function startReview() {
  dueLoading.value = true
  try {
    const res = await getDueList()
    dueList.value = (res.data.data && res.data.data.list) || []
    if (dueList.value.length === 0) {
      ElMessage.success('今天没有到期的复习任务，安排得明明白白！')
      return
    }
    dueIndex.value = 0
    revealed.value = false
    gradeResult.value = ''
    reviewing.value = true
  } catch (e) {
    const notLogin = !authStore.isLoggedIn()
    ElMessage.info(notLogin ? '间隔重复复习需要登录后使用（数据云端调度）' : '复习服务暂不可用（后端未连接）')
  } finally {
    dueLoading.value = false
  }
}

/** 提交自评：后端按 SM-2 更新调度，返回下次复习日期，展示 1.5s 后自动进入下一题 */
async function grade(g) {
  gradedAs.value = g
  try {
    const res = await gradeReview(curDue.value.questionId, g)
    const d = res.data.data
    const label = { remember: '很棒！', fuzzy: '有点模糊，', forgot: '别急，' }[g]
    gradeResult.value = `${label}下次复习：${d.nextDueDate}（间隔 ${d.intervalDays} 天）`
  } catch {
    gradeResult.value = '评分保存失败（后端未连接），请稍后再试'
    return // 保存失败不前进，方便重试
  }
  setTimeout(() => {
    if (dueIndex.value + 1 >= dueList.value.length) {
      reviewing.value = false
      ElMessage.success('本轮复习完成！SM-2 已为你安排好下次复习计划')
    } else {
      dueIndex.value++
      revealed.value = false
      gradeResult.value = ''
      gradedAs.value = ''
    }
  }, 1500)
}

/* ================= 手动添加 ================= */
const addDialog = ref(false)
const addQid = ref(null)
const addReason = ref('概念不清')

function confirmAdd() {
  if (!addQid.value) { ElMessage.warning('请先选择题目'); return }
  const q = questionBank.find(x => x.id === addQid.value)
  learningStore.addWrong(q, null, addReason.value)
  ElMessage.success('已加入错题本')
  addDialog.value = false
  addQid.value = null
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

/* SM-2 复习评分行 */
.review-grade {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}
.grade-tip { color: #606266; font-size: 14px; }

.toolbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }

.q-meta { display: flex; gap: 8px; margin-bottom: 12px; }
.q-title { font-size: 15.5px; color: #303133; line-height: 1.8; margin-bottom: 12px; }
.q-options { display: flex; flex-direction: column; gap: 10px; }
.q-radio { margin-right: 0; }
.q-calc { display: flex; flex-direction: column; gap: 12px; }
.calc-item { display: flex; align-items: center; gap: 8px; color: #606266; }
.q-actions { margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap; }
.q-result { margin-top: 14px; }

.q-analysis { margin-top: 14px; background: #f8f9fc; border-radius: 10px; padding: 14px; border: 1px solid #ebeef5; }
.ana-title { font-weight: 700; color: #303133; margin-bottom: 8px; }
.ana-answer { color: #409eff; margin-bottom: 8px; }
.ana-body { color: #606266; line-height: 1.9; }
.ana-foot { margin-top: 10px; }
.remove-btn { margin-top: 10px; }

/* 错题卡片 */
.wrong-card { border-left: 4px solid #f56c6c; }
.w-head { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
.w-time { font-size: 12px; color: #c0c4cc; margin-left: auto; }
.w-collapse { margin-bottom: 12px; }
.w-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
</style>

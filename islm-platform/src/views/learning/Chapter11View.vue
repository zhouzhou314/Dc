<!--
  辅助学习系统 - 章节学习页（第十一章）
  V4.0：知识点（按节）+ 交互仿真实验弹窗 + 课后习题（含仿真验证）
-->
<template>
  <div class="chapter-container">

    <!-- 顶部：返回 + 章节标题 -->
    <div class="chapter-header">
      <el-button class="back-btn" @click="$emit('back')">← 返回章节列表</el-button>
      <h1 class="chapter-title">{{ chapterMeta.no }}　{{ chapterMeta.title }}</h1>
      <p class="chapter-intro">{{ chapterMeta.intro }}</p>
      <div class="chapter-tags">
        <el-tag v-for="t in chapterMeta.tags" :key="t" size="small" effect="plain">{{ t }}</el-tag>
      </div>
    </div>

    <!-- 小节选项卡 -->
    <el-card class="content-card" shadow="hover">
      <el-tabs v-model="activeTab" tab-position="top">
        <el-tab-pane
          v-for="sec in sections"
          :key="sec.key"
          :label="sec.tab"
          :name="sec.key"
        >
          <h2 class="section-title">{{ sec.title }}</h2>
          <div class="kp-content">

            <!-- 内容块渲染器 -->
            <template v-for="(b, bi) in sec.blocks" :key="bi">
              <h4 v-if="b.type === 'h4'" class="kp-h4">{{ b.text }}</h4>

              <p v-else-if="b.type === 'p'" class="kp-p" v-html="b.text"></p>

              <ul v-else-if="b.type === 'ul'" class="kp-ul">
                <li v-for="(it, ii) in b.items" :key="ii" v-html="it"></li>
              </ul>

              <div v-else-if="b.type === 'formula'" class="kp-formula">
                <pre>{{ b.text }}</pre>
              </div>

              <div v-else-if="b.type === 'keypoint'" class="kp-key">💡 {{ b.text }}</div>

              <table v-else-if="b.type === 'table'" class="kp-table">
                <thead>
                  <tr><th v-for="h in b.head" :key="h">{{ h }}</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(row, ri) in b.rows" :key="ri">
                    <td v-for="(c, ci) in row" :key="ci" v-html="c"></td>
                  </tr>
                </tbody>
              </table>

              <!-- 知识点图示（V4.1） -->
              <KnowledgeChart
                v-else-if="b.type === 'chart'"
                :chart="b.chart"
                :title="b.title"
                :desc="b.desc"
              />

              <!-- 分步推导过程（V4.1） -->
              <div v-else-if="b.type === 'derive'" class="kp-derive">
                <div class="derive-title">🧮 {{ b.title }}</div>
                <div v-for="(s, si) in b.steps" :key="si" class="derive-step">
                  <span class="step-no">{{ si + 1 }}</span>
                  <div class="step-body">
                    <pre class="step-formula">{{ s.formula }}</pre>
                    <div class="step-note">{{ s.note }}</div>
                  </div>
                </div>
              </div>

              <!-- 符号说明表（V4.1） -->
              <div v-else-if="b.type === 'symbols'" class="kp-symbols">
                <div class="derive-title">🔤 {{ b.title }}</div>
                <table class="kp-table sym-table">
                  <thead>
                    <tr><th style="width:110px">符号</th><th style="width:180px">名称</th><th>含义说明</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="(it, ii) in b.items" :key="ii">
                      <td class="sym-cell" v-html="it.sym"></td>
                      <td v-html="it.name"></td>
                      <td class="sym-desc" v-html="it.desc"></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- 交互仿真实验入口 -->
              <div v-else-if="b.type === 'lab'" class="kp-lab">
                <div class="lab-icon">🔬</div>
                <div class="lab-body">
                  <div class="lab-desc">{{ b.desc }}</div>
                  <el-button type="primary" @click="openLab(b.lab, sec.title + ' · 交互实验')">
                    ▶ 打开交互仿真实验
                  </el-button>
                </div>
              </div>
            </template>

          </div>
        </el-tab-pane>

        <!-- 课后习题 -->
        <el-tab-pane label="📝 课后习题" name="exercises">
          <h2 class="section-title">课后习题（共{{ exercises.length }}题）</h2>
          <el-alert
            class="ex-tip"
            type="info"
            :closable="false"
            show-icon
            title="作答说明：单选题直接选择选项提交；计算题按提示填写数值后提交，提交后可查看解析，并可用仿真器复现验证答案。"
          />

          <div v-for="(ex, idx) in exercises" :key="ex.id" class="exercise-card">
            <div class="ex-head">
              <el-tag :type="ex.type === 'choice' ? 'primary' : 'success'" size="small">
                第{{ idx + 1 }}题 · {{ ex.typeName }}
              </el-tag>
              <el-tag v-if="ex.lab" type="danger" size="small" effect="plain">可仿真验证</el-tag>
            </div>

            <div class="ex-question" v-html="ex.question"></div>

            <!-- 单选题 -->
            <div v-if="ex.type === 'choice'" class="ex-options">
              <el-radio-group v-model="exState[ex.id].choice" :disabled="exState[ex.id].done">
                <el-radio v-for="(op, oi) in ex.options" :key="oi" :value="oi" class="ex-radio">
                  {{ 'ABCD'[oi] }}. {{ op }}
                </el-radio>
              </el-radio-group>
            </div>

            <!-- 计算题 -->
            <div v-if="ex.type === 'calc'" class="ex-calc">
              <div class="calc-item">
                <span>均衡产出 Y* =</span>
                <el-input-number v-model="exState[ex.id].y" :precision="2" :controls="false" :disabled="exState[ex.id].done" placeholder="如 1266.67" style="width: 140px" />
              </div>
              <div class="calc-item">
                <span>均衡利率 r* =</span>
                <el-input-number v-model="exState[ex.id].r" :precision="2" :controls="false" :disabled="exState[ex.id].done" placeholder="如 5.33" style="width: 110px" />
                <span class="pct">%</span>
              </div>
              <div class="ex-hint" v-if="ex.hint">{{ ex.hint }}</div>
            </div>

            <!-- 操作按钮 -->
            <div class="ex-actions">
              <el-button
                type="primary"
                size="small"
                :disabled="exState[ex.id].done"
                @click="submitExercise(ex)"
              >
                提交答案
              </el-button>
              <el-button v-if="ex.lab" size="small" type="warning" plain @click="openLab(ex.lab, '第' + (idx + 1) + '题 · 仿真验证')">
                🔬 仿真验证
              </el-button>
              <el-button
                v-if="exState[ex.id].done"
                size="small"
                text
                @click="exState[ex.id].showAnalysis = !exState[ex.id].showAnalysis"
              >
                {{ exState[ex.id].showAnalysis ? '收起解析' : '查看解析' }}
              </el-button>
            </div>

            <!-- 结果提示 -->
            <el-alert
              v-if="exState[ex.id].done"
              :title="exState[ex.id].correct ? '✅ 回答正确！' : '❌ 回答有误，请查看解析并可用仿真器验证'"
              :type="exState[ex.id].correct ? 'success' : 'error'"
              show-icon
              :closable="false"
              class="ex-result"
            />

            <!-- 解析 -->
            <div v-if="exState[ex.id].showAnalysis" class="ex-analysis">
              <div class="analysis-title">📝 参考答案与解析</div>
              <div v-if="ex.type === 'choice'" class="analysis-answer">
                正确答案：<b>{{ 'ABCD'[ex.correct] }}</b>
              </div>
              <div v-if="ex.type === 'calc'" class="analysis-answer">
                参考答案：Y* = <b>{{ ex.answer.Y }}</b>，r* = <b>{{ (ex.answer.r * 100).toFixed(2) }}%</b>
              </div>
              <div class="analysis-body" v-html="ex.analysis"></div>
            </div>

            <!-- 阶梯导学面板（RAG + CoT，L1~L3 逐级提示，L4 完整解析需确认） -->
            <HintPanel
              :question="ex"
              :session="hintMap[String(ex.id)]"
              :student-answer="getStudentAnswer(ex)"
              :judge-result="getJudgeResult(ex)"
              :hide-get-hint="exState[ex.id].done && exState[ex.id].correct"
              @refresh="fetchAllState"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 交互仿真实验弹窗（复用 ISLMSimulator，支持参数预填与自动运行） -->
    <el-dialog
      v-model="labVisible"
      :title="'🔬 ' + labTitle"
      width="94%"
      top="2vh"
      destroy-on-close
      class="lab-dialog"
      @opened="onLabOpened"
    >
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
import { ref, reactive, onMounted, provide } from 'vue'
import { ElMessage } from 'element-plus'
import ISLMSimulator from '@/components/ISLMSimulator.vue'
import KnowledgeChart from '@/components/KnowledgeChart.vue'
import HintPanel from '@/components/HintPanel.vue'
import { chapterMeta, sections, exercises } from '@/data/chapter11'
import { loadLocal, saveLocal, genId } from '@/utils/storage'
import { getHintState } from '@/api/hint'

defineEmits(['back'])

/* 当前激活的小节选项卡 */
const activeTab = ref(sections[0].key)

/* ============================================
 * 交互仿真实验弹窗
 * ============================================ */
const labVisible = ref(false)
const labTitle = ref('')
const labConfig = ref(null)
const simKey = ref(0)
const simRef = ref(null)

/**
 * 打开实验弹窗（预填参数，强制重建仿真器组件）
 * @param {Object} lab { compare, params / base, shock }
 * @param {string} title 弹窗标题
 */
function openLab(lab, title) {
  labConfig.value = {
    compare: !!lab.compare,
    params: lab.compare ? (lab.base || null) : (lab.params || null),
    shock: lab.compare ? (lab.shock || null) : null
  }
  labTitle.value = title || '交互仿真实验'
  simKey.value++
  labVisible.value = true
}

/** 弹窗打开动画结束后自动执行仿真 */
function onLabOpened() {
  simRef.value?.autoRun()
}

/* ============================================
 * 课后习题作答状态
 * ============================================ */
const exState = reactive({})
exercises.forEach(ex => {
  exState[ex.id] = { choice: null, y: null, r: null, done: false, correct: false, showAnalysis: false }
})

/**
 * 提交习题答案
 */
function submitExercise(ex) {
  const st = exState[ex.id]
  if (ex.type === 'choice') {
    if (st.choice === null) {
      ElMessage.warning('请先选择一个选项')
      return
    }
    st.done = true
    st.correct = st.choice === ex.correct
    st.showAnalysis = true
  } else if (ex.type === 'calc') {
    if (st.y === null || st.r === null) {
      ElMessage.warning('请先填写均衡产出 Y* 和均衡利率 r*')
      return
    }
    st.done = true
    // 允许合理误差：产出 ±1，利率（百分数）±0.25
    st.correct =
      Math.abs(st.y - ex.answer.Y) <= 1 &&
      Math.abs(st.r - ex.answer.r * 100) <= 0.25
    st.showAnalysis = true
  }
}

/* ============================================
 * 阶梯导学（RAG + CoT）：用户标识 + 状态恢复
 * ============================================ */
const hintMap = ref({})          // { [questionId]: { currentLevel, solutionUnlocked, logs[] } }

/* 学生标识：首次生成并持久化，刷新后恢复同一份导学历史
   provide 必须在 setup 顶层调用，传入 ref 本身让 HintPanel 响应式读取 */
const hintUserId = ref(loadLocal('hintUserId') || genId())
saveLocal('hintUserId', hintUserId.value)
provide('hintUserId', hintUserId)

/** 组装作答快照（传给后端用于个性化提示） */
function getStudentAnswer(ex) {
  const st = exState[ex.id]
  if (ex.type === 'choice') return { choice: st.choice }
  return { y: st.y, r: st.r }
}

/** 判定结果：correct / wrong / unsolved（未提交） */
function getJudgeResult(ex) {
  const st = exState[ex.id]
  return st.done ? (st.correct ? 'correct' : 'wrong') : 'unsolved'
}

/** 拉取全部题目的导学状态（首次进入 + 每次获取提示后刷新） */
async function fetchAllState() {
  try {
    const res = await getHintState(hintUserId.value)
    if (res.data?.success) {
      hintMap.value = res.data.data?.sessions || {}
    }
  } catch (e) {
    console.warn('[hint] 导学状态拉取失败（后端未启动时面板会自动置空）：', e?.message)
  }
}

onMounted(() => {
  fetchAllState()
})
</script>

<style scoped>
.chapter-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 20px 40px;
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);
  font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
}

/* 章节头 */
.chapter-header {
  text-align: center;
  padding: 28px 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border-radius: 14px;
  margin-bottom: 22px;
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.35);
  position: relative;
}
.back-btn {
  position: absolute;
  left: 16px;
  top: 16px;
  color: #fff;
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.4);
}
.chapter-title {
  margin: 6px 0 12px;
  font-size: 26px;
  letter-spacing: 1px;
}
.chapter-intro {
  margin: 0 auto 12px;
  max-width: 860px;
  font-size: 13px;
  line-height: 1.8;
  opacity: 0.93;
  text-align: left;
}
.chapter-tags {
  display: flex;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}
.chapter-tags .el-tag {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.35);
}

/* 内容卡片 */
.content-card {
  border-radius: 12px;
  border: none;
}
.section-title {
  margin: 4px 0 18px;
  font-size: 20px;
  color: #303133;
  border-left: 4px solid #667eea;
  padding-left: 12px;
}

/* 知识点排版 */
.kp-content { line-height: 1.9; }
.kp-h4 {
  margin: 22px 0 10px;
  font-size: 16px;
  color: #4a5bbf;
}
.kp-p {
  margin: 8px 0;
  font-size: 14px;
  color: #303133;
}
.kp-ul {
  margin: 8px 0 8px 22px;
  font-size: 14px;
  color: #303133;
}
.kp-ul li { margin: 6px 0; }

/* 公式块 */
.kp-formula pre {
  margin: 12px 0;
  padding: 14px 20px;
  background: #f4f6fb;
  border: 1px dashed #b8c4ea;
  border-radius: 8px;
  font-family: 'Cambria Math', 'Consolas', 'Courier New', monospace;
  font-size: 15px;
  line-height: 1.8;
  color: #2c3e9e;
  white-space: pre-wrap;
}

/* 核心考点 */
.kp-key {
  margin: 12px 0;
  padding: 12px 16px;
  background: #fdf6ec;
  border-left: 4px solid #e6a23c;
  border-radius: 6px;
  font-size: 14px;
  color: #7a5a1e;
  line-height: 1.8;
}

/* 表格 */
.kp-table {
  margin: 12px auto;
  border-collapse: collapse;
  width: 92%;
  font-size: 13.5px;
}
.kp-table th,
.kp-table td {
  border: 1px solid #d8dce8;
  padding: 9px 14px;
  text-align: center;
}
.kp-table th {
  background: #eef1fb;
  color: #303133;
}

/* 分步推导过程（V4.1） */
.kp-derive {
  margin: 14px 0;
  padding: 14px 18px;
  background: #f8faff;
  border: 1px solid #c9d6f2;
  border-left: 4px solid #667eea;
  border-radius: 10px;
}
.derive-title {
  font-size: 15px;
  font-weight: 700;
  color: #3a4a8c;
  margin-bottom: 12px;
}
.derive-step {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 8px 0;
}
.derive-step + .derive-step { border-top: 1px dashed #dde5f5; }
.step-no {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #667eea;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 6px;
}
.step-body { flex: 1; }
.step-formula {
  margin: 0 0 4px;
  padding: 6px 14px;
  background: #eef2ff;
  border-radius: 6px;
  font-family: 'Cambria Math', 'Consolas', monospace;
  font-size: 14.5px;
  color: #2c3e9e;
  white-space: pre-wrap;
}
.step-note {
  font-size: 13px;
  color: #5a6b8c;
  line-height: 1.6;
}

/* 符号说明表（V4.1） */
.kp-symbols {
  margin: 14px 0;
  padding: 14px 18px;
  background: #fbfcff;
  border: 1px solid #d5def5;
  border-left: 4px solid #8f9ee8;
  border-radius: 10px;
}
.sym-table { width: 100%; margin: 0; }
.sym-table th, .sym-table td { text-align: left; }
.sym-cell {
  font-family: 'Cambria Math', 'Consolas', monospace;
  font-size: 14.5px;
  font-weight: 700;
  color: #2c3e9e;
  text-align: center !important;
}
.sym-desc { font-size: 13px; color: #4a5a7a; line-height: 1.7; }

/* 交互实验入口 */
.kp-lab {
  margin: 16px 0;
  padding: 16px 18px;
  display: flex;
  gap: 14px;
  align-items: flex-start;
  background: linear-gradient(135deg, #eef2ff 0%, #f0f9ff 100%);
  border: 1px solid #c3d0f5;
  border-radius: 10px;
}
.lab-icon { font-size: 30px; }
.lab-body { flex: 1; }
.lab-desc {
  font-size: 13.5px;
  color: #3a4a8c;
  line-height: 1.7;
  margin-bottom: 10px;
}

/* 习题 */
.ex-tip { margin-bottom: 16px; }
.exercise-card {
  border: 1px solid #e4e7ed;
  border-radius: 10px;
  padding: 18px 20px;
  margin-bottom: 18px;
  background: #fff;
  transition: box-shadow 0.2s;
}
.exercise-card:hover { box-shadow: 0 3px 12px rgba(0, 0, 0, 0.07); }
.ex-head {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.ex-question {
  font-size: 14.5px;
  color: #303133;
  line-height: 1.8;
  margin-bottom: 12px;
}
.ex-options {
  margin: 4px 0 12px 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ex-radio { margin-right: 0; }
.ex-calc {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  margin: 4px 0 10px;
}
.calc-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #303133;
}
.pct { color: #606266; }
.ex-hint {
  width: 100%;
  font-size: 12.5px;
  color: #909399;
}
.ex-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}
.ex-result { margin-top: 12px; }
.ex-analysis {
  margin-top: 12px;
  padding: 14px 16px;
  background: #f6f8fd;
  border-left: 4px solid #409eff;
  border-radius: 6px;
  font-size: 13.5px;
  color: #303133;
  line-height: 1.9;
}
.analysis-title {
  font-weight: 700;
  margin-bottom: 6px;
  color: #409eff;
}
.analysis-answer { margin-bottom: 6px; }

/* 实验弹窗 */
.lab-dialog :deep(.el-dialog__body) {
  padding: 10px 16px 16px;
}

/* 响应式 */
@media (max-width: 768px) {
  .chapter-title { font-size: 20px; }
  .back-btn { position: static; margin-bottom: 10px; }
  .chapter-header { text-align: left; }
}
</style>

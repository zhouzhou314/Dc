<!--
  课程与日程视图
  -------------------------------------------------
  功能：
  1. 课程表录入（星期 / 时间 / 课程名 / 教室 / 教师）+ 周课程网格展示
  2. 学习日历（el-calendar 月历）：自动标记考试、作业、计划日期
  3. 作业 / 考试倒计时提醒（临近自动变红）
  4. 自定义待办任务与学习计划
-->
<template>
  <div class="page-container">

    <!-- 顶部导航 -->
    <div class="page-header">
      <el-button class="back-btn" @click="$emit('back')">← 返回首页</el-button>
      <h1 class="page-title">🗓️ 课程与日程</h1>
      <span class="page-sub">课程表 · 学习日历 · 倒计时提醒 · 待办计划</span>
    </div>

    <!-- ============ 倒计时提醒 ============ -->
    <el-card class="card" shadow="hover">
      <template #header>
        <div class="card-head">
          <b>⏰ 作业 / 考试倒计时</b>
          <el-button type="primary" size="small" @click="examDialog = true">＋ 新增提醒</el-button>
        </div>
      </template>
      <el-empty v-if="store.exams.length === 0" description="还没有倒计时提醒，快添加吧" :image-size="70" />
      <div class="exam-list">
        <div
          v-for="e in sortedExams" :key="e.id"
          class="exam-item"
          :class="{ urgent: !e.done && daysLeft(e.date) <= 3 && daysLeft(e.date) >= 0, passed: e.done || daysLeft(e.date) < 0 }"
        >
          <el-tag :type="e.type === 'exam' ? 'danger' : 'warning'" size="small">
            {{ e.type === 'exam' ? '考试' : '作业' }}
          </el-tag>
          <span class="exam-title">{{ e.title }}</span>
          <span class="exam-date">{{ e.date }}</span>
          <el-tag v-if="e.done" type="info">已完成</el-tag>
          <el-tag v-else-if="daysLeft(e.date) < 0" type="info">已过期 {{ -daysLeft(e.date) }} 天</el-tag>
          <el-tag v-else :type="daysLeft(e.date) <= 3 ? 'danger' : 'success'" effect="dark">
            剩 {{ daysLeft(e.date) }} 天
          </el-tag>
          <el-button text type="success" size="small" :disabled="e.done" @click="e.done = true">完成</el-button>
          <el-button text type="danger" size="small" @click="learningStore.removeExam(e.id)">删除</el-button>
        </div>
      </div>
    </el-card>

    <el-row :gutter="16">
      <!-- ============ 左：课程表 ============ -->
      <el-col :span="14" :xs="24">
        <el-card class="card" shadow="hover">
          <template #header>
            <div class="card-head">
              <b>📅 本学期课程表</b>
              <el-button type="primary" size="small" @click="courseDialog = true">＋ 录入课程</el-button>
            </div>
          </template>

          <el-empty v-if="store.courses.length === 0" description="还没有录入课程" :image-size="70" />
          <!-- 周课程网格：7列 -->
          <div v-else class="week-grid">
            <div v-for="(d, di) in WEEK_NAMES" :key="di" class="week-col">
              <div class="week-head">{{ d }}</div>
              <div
                v-for="(c, ci) in coursesOfDay(di)" :key="ci"
                class="course-block"
                :style="{ background: colorOf(ci) }"
              >
                <div class="cb-name">{{ c.name }}</div>
                <div class="cb-time">{{ c.start }} - {{ c.end }}</div>
                <div class="cb-room">{{ c.room }}<template v-if="c.teacher"> · {{ c.teacher }}</template></div>
              </div>
              <div v-if="coursesOfDay(di).length === 0" class="week-empty">—</div>
            </div>
          </div>
        </el-card>

        <!-- ============ 待办任务 ============ -->
        <el-card class="card" shadow="hover">
          <template #header><b>✅ 待办任务与学习计划</b></template>
          <div class="todo-add">
            <el-input v-model="todoText" placeholder="输入待办事项，如：完成IS-LM计算题第7题" @keyup.enter="addTodoItem" />
            <el-date-picker v-model="todoPlan" type="date" placeholder="计划日期(可选)" value-format="YYYY-MM-DD" style="width: 160px" />
            <el-button type="primary" @click="addTodoItem">添加</el-button>
          </div>
          <div class="todo-list">
            <div v-for="t in store.todos" :key="t.id" class="todo-item" :class="{ done: t.done }">
              <el-checkbox :model-value="t.done" @change="learningStore.toggleTodo(t.id)" />
              <span class="todo-text" @click="learningStore.toggleTodo(t.id)">{{ t.text }}</span>
              <el-tag v-if="t.plan" size="small" type="info" effect="plain">📅 {{ t.plan }}</el-tag>
              <el-button text type="danger" size="small" @click="learningStore.removeTodo(t.id)">删除</el-button>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- ============ 右：学习日历 ============ -->
      <el-col :span="10" :xs="24">
        <el-card class="card" shadow="hover">
          <template #header><b>🗓️ 学习日历（自动生成）</b></template>
          <el-calendar v-model="calendarDate">
            <template #date-cell="{ data }">
              <div class="cal-cell" :class="{ today: data.isSelected }">
                <span>{{ Number(data.day.slice(8)) }}</span>
                <!-- 标记：考试(红) / 作业(橙) / 计划(蓝) -->
                <div class="cal-dots">
                  <span
                    v-for="e in examsOn(data.day)" :key="'e' + e.id"
                    class="dot" :class="e.type === 'exam' ? 'dot-exam' : 'dot-hw'"
                    :title="(e.type === 'exam' ? '考试：' : '作业：') + e.title"
                  ></span>
                  <span
                    v-for="t in todosOn(data.day)" :key="'t' + t.id"
                    class="dot dot-plan" :title="'计划：' + t.text"
                  ></span>
                </div>
              </div>
            </template>
          </el-calendar>
          <div class="cal-legend">
            <span><i class="dot dot-exam"></i> 考试</span>
            <span><i class="dot dot-hw"></i> 作业</span>
            <span><i class="dot dot-plan"></i> 学习计划</span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- ============ 录入课程弹窗 ============ -->
    <el-dialog v-model="courseDialog" title="录入课程" width="480px">
      <el-form label-width="80px">
        <el-form-item label="星期">
          <el-select v-model="courseForm.day" style="width: 160px">
            <el-option v-for="(d, i) in WEEK_NAMES" :key="i" :label="d" :value="i" />
          </el-select>
        </el-form-item>
        <el-form-item label="时间段">
          <el-time-select v-model="courseForm.start" start="08:00" step="00:40" end="21:30" placeholder="开始" style="width: 120px" />
          <span>　至　</span>
          <el-time-select v-model="courseForm.end" :start="courseForm.start || '08:00'" step="00:40" end="22:00" placeholder="结束" style="width: 120px" />
        </el-form-item>
        <el-form-item label="课程名称">
          <el-input v-model="courseForm.name" placeholder="如：宏观经济学" />
        </el-form-item>
        <el-form-item label="教室">
          <el-input v-model="courseForm.room" placeholder="如：A101" />
        </el-form-item>
        <el-form-item label="教师">
          <el-input v-model="courseForm.teacher" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="courseDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmCourse">保存</el-button>
      </template>
    </el-dialog>

    <!-- ============ 新增倒计时弹窗 ============ -->
    <el-dialog v-model="examDialog" title="新增作业 / 考试提醒" width="440px">
      <el-form label-width="80px">
        <el-form-item label="类型">
          <el-radio-group v-model="examForm.type">
            <el-radio value="exam">考试</el-radio>
            <el-radio value="homework">作业</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="examForm.title" placeholder="如：宏观经济学期末考" />
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker v-model="examForm.date" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="examDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmExam">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { learningStore } from '@/store/learning'
import { daysUntil } from '@/utils/storage'

defineEmits(['back'])

const store = learningStore.state
const WEEK_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/* ================= 倒计时 ================= */
/** 距离目标日期天数 */
function daysLeft(date) {
  return daysUntil(date)
}

/** 按剩余天数排序：未完成在前，临近在前 */
const sortedExams = computed(() =>
  [...store.exams].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return a.date.localeCompare(b.date)
  })
)

/* ================= 课程表 ================= */
/** 课程块配色（按索引循环） */
const COURSE_COLORS = [
  'linear-gradient(135deg,#667eea,#764ba2)',
  'linear-gradient(135deg,#f093fb,#f5576c)',
  'linear-gradient(135deg,#30cfd0,#330867)',
  'linear-gradient(135deg,#fa709a,#fee140)',
  'linear-gradient(135deg,#43e97b,#38f9d7)',
  'linear-gradient(135deg,#4facfe,#00f2fe)'
]
function colorOf(i) {
  return COURSE_COLORS[i % COURSE_COLORS.length]
}
/** 某天的课程列表 */
function coursesOfDay(day) {
  return store.courses.filter(c => c.day === day)
}

const courseDialog = ref(false)
const courseForm = reactive({ day: 0, start: '08:00', end: '09:40', name: '', room: '', teacher: '' })

function confirmCourse() {
  if (!courseForm.name.trim()) { ElMessage.warning('请填写课程名称'); return }
  learningStore.addCourse({ ...courseForm, name: courseForm.name.trim() })
  ElMessage.success('课程已加入课程表')
  courseDialog.value = false
  courseForm.name = ''
  courseForm.room = ''
  courseForm.teacher = ''
}

/* ================= 待办 ================= */
const todoText = ref('')
const todoPlan = ref(null)

function addTodoItem() {
  if (!todoText.value.trim()) { ElMessage.warning('请输入待办内容'); return }
  learningStore.addTodo(todoText.value.trim(), todoPlan.value || '')
  todoText.value = ''
  todoPlan.value = null
  ElMessage.success('已添加待办')
}

/* ================= 新增倒计时 ================= */
const examDialog = ref(false)
const examForm = reactive({ type: 'exam', title: '', date: '' })

function confirmExam() {
  if (!examForm.title.trim()) { ElMessage.warning('请填写名称'); return }
  if (!examForm.date) { ElMessage.warning('请选择日期'); return }
  learningStore.addExam({ type: examForm.type, title: examForm.title.trim(), date: examForm.date })
  ElMessage.success('提醒已添加')
  examDialog.value = false
  examForm.title = ''
  examForm.date = ''
}

/* ================= 学习日历 ================= */
const calendarDate = ref(new Date())

/** 某日期上的考试/作业 */
function examsOn(day) {
  return store.exams.filter(e => e.date === day && !e.done)
}
/** 某日期上的学习计划 */
function todosOn(day) {
  return store.todos.filter(t => t.plan === day && !t.done)
}
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
.card-head { display: flex; justify-content: space-between; align-items: center; }

/* 倒计时列表 */
.exam-list { display: flex; flex-direction: column; gap: 10px; }
.exam-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  background: #f8f9fc;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}
.exam-item.urgent { background: #fef0f0; border-color: #fbc4c4; }
.exam-item.passed { opacity: 0.6; }
.exam-title { flex: 1; color: #303133; font-size: 14px; }
.exam-date { font-size: 12.5px; color: #909399; }

/* 周课程网格 */
.week-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
.week-head { text-align: center; font-weight: 600; color: #303133; font-size: 13px; padding: 6px 0; }
.week-empty { text-align: center; color: #dcdfe6; padding: 12px 0; }
.course-block {
  border-radius: 8px;
  color: #fff;
  padding: 8px 6px;
  margin-bottom: 6px;
  min-height: 64px;
}
.cb-name { font-size: 12.5px; font-weight: 600; margin-bottom: 4px; }
.cb-time { font-size: 11px; opacity: 0.9; }
.cb-room { font-size: 11px; opacity: 0.85; margin-top: 2px; }

/* 待办 */
.todo-add { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.todo-list { display: flex; flex-direction: column; gap: 8px; max-height: 320px; overflow-y: auto; }
.todo-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px;
  background: #f8f9fc;
  border-radius: 8px;
}
.todo-item.done .todo-text { text-decoration: line-through; color: #c0c4cc; }
.todo-text { flex: 1; cursor: pointer; color: #303133; font-size: 14px; }

/* 日历 */
.cal-cell { position: relative; height: 100%; }
.cal-dots { position: absolute; bottom: 4px; left: 0; right: 0; display: flex; justify-content: center; gap: 3px; }
.dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.dot-exam { background: #f56c6c; }
.dot-hw { background: #e6a23c; }
.dot-plan { background: #409eff; }
.cal-legend { display: flex; gap: 18px; justify-content: center; color: #606266; font-size: 12.5px; padding-top: 6px; }
.cal-legend span { display: flex; align-items: center; gap: 5px; }
</style>

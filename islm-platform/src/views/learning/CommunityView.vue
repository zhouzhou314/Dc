<!--
  问答交流社区视图
  -------------------------------------------------
  功能：
  1. 发布课程疑问
  2. 同学互相答疑（发表回答、点赞）
  3. 热门高频问题自动沉淀为"高频知识库"（点赞或回答数达标自动收录）
-->
<template>
  <div class="page-container">

    <!-- 顶部导航 -->
    <div class="page-header">
      <el-button class="back-btn" @click="$emit('back')">← 返回首页</el-button>
      <h1 class="page-title">💬 问答交流社区</h1>
      <span class="page-sub">发布疑问 · 互助答疑 · 高频问题自动沉淀</span>
    </div>

    <!-- 高频知识库 -->
    <el-card class="card hot-card" shadow="hover">
      <template #header><b>🔥 高频知识库（热门问题自动沉淀）</b></template>
      <el-empty v-if="hotPosts.length === 0" description="暂无高频问题（点赞≥10 或 回答≥2 自动收录）" :image-size="70" />
      <div v-else class="hot-list">
        <div v-for="p in hotPosts" :key="p.id" class="hot-item" @click="expandPost(p.id)">
          <el-tag type="danger" size="small" effect="dark">HOT</el-tag>
          <span class="hot-title">{{ p.title }}</span>
          <span class="hot-meta">👍 {{ p.likes }} · 💬 {{ p.answers.length }}</span>
        </div>
      </div>
    </el-card>

    <!-- 工具行 -->
    <el-card class="card" shadow="never">
      <div class="toolbar">
        <el-button type="primary" @click="askDialog = true">✍️ 发布疑问</el-button>
        <el-select v-model="sortWay" style="width: 150px">
          <el-option label="按热度排序" value="hot" />
          <el-option label="按时间排序" value="time" />
        </el-select>
        <el-tag type="info" size="large">共 {{ store.qaPosts.length }} 个问题</el-tag>
      </div>
    </el-card>

    <!-- 问题列表 -->
    <el-empty v-if="store.qaPosts.length === 0" description="还没有提问，来提第一个问题吧" />
    <el-card v-for="p in sortedPosts" :key="p.id" class="card qa-card" shadow="hover">
      <!-- 问题头 -->
      <div class="qa-head">
        <div class="qa-avatar">{{ p.author.slice(0, 1) }}</div>
        <div class="qa-main">
          <div class="qa-title">{{ p.title }}</div>
          <div class="qa-meta">{{ p.author }} · {{ p.date }} · {{ p.course }}</div>
        </div>
        <div class="qa-ops">
          <el-button size="small" :type="likedSet.has(p.id) ? 'warning' : 'default'" plain @click="like(p)">
            👍 点赞 {{ p.likes }}
          </el-button>
        </div>
      </div>

      <div class="qa-body">{{ p.body }}</div>

      <!-- 回答列表 -->
      <div class="ans-zone">
        <div class="ans-head">💬 {{ p.answers.length }} 个回答</div>
        <div v-for="a in p.answers" :key="a.id" class="ans-item">
          <div class="ans-top">
            <el-tag size="small" effect="plain">{{ a.author }}</el-tag>
            <span class="ans-date">{{ a.date }}</span>
            <el-button text size="small" type="primary" @click="likeAns(p, a)">👍 {{ a.likes }}</el-button>
          </div>
          <div class="ans-body">{{ a.body }}</div>
        </div>

        <!-- 我要回答 -->
        <div v-if="answerOpen === p.id" class="ans-input">
          <el-input
            v-model="answerText"
            type="textarea"
            :rows="3"
            placeholder="写下你的回答，帮助同学解决疑问……"
          />
          <div class="ans-btns">
            <el-button type="primary" size="small" @click="submitAnswer(p)">提交回答</el-button>
            <el-button size="small" text @click="answerOpen = null">取消</el-button>
          </div>
        </div>
        <el-button v-else text type="primary" @click="answerOpen = p.id">✏️ 我来回答</el-button>
      </div>
    </el-card>

    <!-- 发布疑问弹窗 -->
    <el-dialog v-model="askDialog" title="✍️ 发布课程疑问" width="560px">
      <el-form label-width="80px">
        <el-form-item label="标题">
          <el-input v-model="askForm.title" placeholder="一句话概括你的问题" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="课程">
          <el-select v-model="askForm.course" style="width: 200px">
            <el-option label="宏观经济学" value="宏观经济学" />
            <el-option label="微观经济学" value="微观经济学" />
          </el-select>
        </el-form-item>
        <el-form-item label="详细描述">
          <el-input v-model="askForm.body" type="textarea" :rows="4" placeholder="具体描述你卡在哪里，方便同学针对性解答" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="askDialog = false">取消</el-button>
        <el-button type="primary" @click="submitAsk">发布</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { learningStore } from '@/store/learning'

defineEmits(['back'])

const store = learningStore.state

/* ================= 列表 ================= */
const sortWay = ref('hot')
const likedSet = ref(new Set()) // 防重复点赞（仅前端演示）

/** 排序：热度 = 点赞数 + 2×回答数 */
const sortedPosts = computed(() => {
  const arr = [...store.qaPosts]
  if (sortWay.value === 'hot') {
    arr.sort((a, b) => (b.likes + b.answers.length * 2) - (a.likes + a.answers.length * 2))
  }
  return arr
})

/** 高频知识库：点赞≥10 或 回答≥2 自动沉淀 */
const hotPosts = computed(() =>
  store.qaPosts.filter(p => p.likes >= 10 || p.answers.length >= 2).slice(0, 5)
)

/** 点赞 */
function like(p) {
  if (likedSet.value.has(p.id)) { ElMessage.info('已经点过赞啦'); return }
  learningStore.likeQaPost(p.id)
  likedSet.value.add(p.id)
}

/** 回答点赞 */
function likeAns(p, a) {
  learningStore.likeQaAnswer(p.id, a.id)
}

/** 高频库点击 → 展开（简单实现：滚动到该问题并打开回答框） */
function expandPost(pid) {
  answerOpen.value = pid
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

/* ================= 提问与回答 ================= */
const askDialog = ref(false)
const askForm = ref({ title: '', course: '宏观经济学', body: '' })

function submitAsk() {
  if (!askForm.value.title.trim()) { ElMessage.warning('请填写问题标题'); return }
  if (!askForm.value.body.trim()) { ElMessage.warning('请描述问题详情'); return }
  learningStore.addQaPost({ ...askForm.value, author: '我' })
  ElMessage.success('发布成功，等待同学解答！')
  askForm.value = { title: '', course: '宏观经济学', body: '' }
  askDialog.value = false
}

const answerOpen = ref(null)
const answerText = ref('')

function submitAnswer(p) {
  if (!answerText.value.trim()) { ElMessage.warning('请填写回答内容'); return }
  learningStore.addQaAnswer(p.id, answerText.value.trim())
  answerText.value = ''
  answerOpen.value = null
  ElMessage.success('回答成功！')
}
</script>

<style scoped>
.page-container {
  max-width: 880px;
  margin: 0 auto;
  padding: 30px 20px;
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);
  font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
}
.page-header { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
.page-title { margin: 0; font-size: 24px; color: #303133; }
.page-sub { font-size: 13px; color: #909399; }
.card { border-radius: 12px; margin-bottom: 14px; }
.toolbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }

/* 高频库 */
.hot-card { border-left: 4px solid #f56c6c; }
.hot-list { display: flex; flex-direction: column; gap: 8px; }
.hot-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px;
  background: #fff7f7;
  border-radius: 8px;
  cursor: pointer;
}
.hot-item:hover { background: #fff1f1; }
.hot-title { flex: 1; color: #303133; font-size: 14px; }
.hot-meta { font-size: 12.5px; color: #909399; }

/* 问题卡 */
.qa-head { display: flex; align-items: center; gap: 12px; }
.qa-avatar {
  width: 40px; height: 40px; border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff; font-size: 16px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.qa-main { flex: 1; min-width: 0; }
.qa-title { font-size: 16px; font-weight: 700; color: #303133; }
.qa-meta { font-size: 12.5px; color: #a8abb2; margin-top: 3px; }

.qa-body { color: #606266; font-size: 14px; line-height: 1.9; margin: 12px 0; }

/* 回答区 */
.ans-zone { background: #f8f9fc; border-radius: 10px; padding: 12px 14px; }
.ans-head { font-weight: 600; color: #303133; font-size: 13.5px; margin-bottom: 10px; }
.ans-item { border-bottom: 1px dashed #e4e7ed; padding: 10px 0; }
.ans-item:last-of-type { border-bottom: none; }
.ans-top { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.ans-date { font-size: 12px; color: #c0c4cc; flex: 1; }
.ans-body { color: #606266; font-size: 13.5px; line-height: 1.9; }
.ans-input { margin-top: 10px; }
.ans-btns { margin-top: 8px; display: flex; gap: 8px; }
</style>

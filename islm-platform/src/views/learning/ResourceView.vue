<!--
  学习资源库视图
  -------------------------------------------------
  功能：
  1. 课件 / 笔记 / 往年试卷 / 复习提纲 分类归档
  2. 关键词搜索（标题 + 描述）
  3. 上传资源（前端模拟：登记文件信息）
  4. 下载计数（模拟下载）与删除
-->
<template>
  <div class="page-container">

    <!-- 顶部导航 -->
    <div class="page-header">
      <el-button class="back-btn" @click="$emit('back')">← 返回首页</el-button>
      <h1 class="page-title">📂 学习资源库</h1>
      <span class="page-sub">课件 · 笔记 · 往年试卷 · 复习提纲，支持搜索与下载</span>
    </div>

    <!-- 工具栏 -->
    <el-card class="card" shadow="never">
      <div class="toolbar">
        <el-input
          v-model="keyword"
          placeholder="🔍 输入关键词搜索资料（标题/描述）"
          clearable
          style="max-width: 360px"
        />
        <el-select v-model="cat" style="width: 160px">
          <el-option label="全部分类" value="全部" />
          <el-option v-for="c in CATEGORIES" :key="c" :label="c" :value="c" />
        </el-select>
        <el-button type="primary" @click="uploadDialog = true">⬆ 上传资源</el-button>
        <el-tag type="info" size="large">共 {{ filtered.length }} 份资料</el-tag>
      </div>
    </el-card>

    <!-- 资源列表 -->
    <el-empty v-if="filtered.length === 0" description="没有找到相关资料" />
    <el-card v-for="r in filtered" :key="r.id" class="card res-card" shadow="hover">
      <div class="res-row">
        <div class="res-icon" :class="'ic-' + r.category">{{ CATEGORY_ICON[r.category] || '📄' }}</div>
        <div class="res-main">
          <div class="res-title">{{ r.title }}</div>
          <div class="res-desc">{{ r.desc }}</div>
          <div class="res-meta">
            <el-tag size="small">{{ r.category }}</el-tag>
            <span>{{ r.size }}</span>
            <span>{{ r.uploader }} · {{ r.date }}</span>
            <span>⬇ 已下载 {{ r.downloads }} 次</span>
          </div>
        </div>
        <div class="res-ops">
          <el-button type="primary" size="small" @click="download(r)">⬇ 下载</el-button>
          <el-button v-if="r.uploader === '我'" type="danger" size="small" plain @click="learningStore.removeResource(r.id)">删除</el-button>
        </div>
      </div>
    </el-card>

    <!-- 上传弹窗（前端模拟登记） -->
    <el-dialog v-model="uploadDialog" title="⬆ 上传资源" width="520px">
      <el-form label-width="90px">
        <el-form-item label="资源标题">
          <el-input v-model="uploadForm.title" placeholder="如：第11章 课后习题详解" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="uploadForm.category" style="width: 180px">
            <el-option v-for="c in CATEGORIES" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="简介">
          <el-input v-model="uploadForm.desc" type="textarea" :rows="3" placeholder="简单描述资料内容" />
        </el-form-item>
        <el-form-item label="文件">
          <input
            type="file"
            accept=".pdf,.ppt,.pptx,.doc,.docx,.md,.txt,.zip,.rar"
            @change="onFilePick"
          />
          <div class="file-tip">前端演示环境仅登记文件信息，不做真实上传</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="uploadDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmUpload">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { learningStore } from '@/store/learning'

defineEmits(['back'])

const CATEGORIES = ['课件', '笔记', '往年试卷', '复习提纲']
const CATEGORY_ICON = { 课件: '📽️', 笔记: '📝', 往年试卷: '📄', 复习提纲: '🧾' }

/* ================= 筛选 ================= */
const keyword = ref('')
const cat = ref('全部')

const filtered = computed(() =>
  learningStore.state.resources.filter(r =>
    (cat.value === '全部' || r.category === cat.value) &&
    (!keyword.value.trim() ||
      r.title.toLowerCase().includes(keyword.value.trim().toLowerCase()) ||
      (r.desc || '').toLowerCase().includes(keyword.value.trim().toLowerCase()))
  )
)

/* ================= 下载 ================= */
function download(r) {
  learningStore.downloadResource(r.id)
  ElMessage.success(`开始下载「${r.title}」（演示环境不做真实下载）`)
}

/* ================= 上传 ================= */
const uploadDialog = ref(false)
const uploadForm = reactive({ title: '', category: '课件', desc: '', size: '1.0 MB' })

/** 选择文件后记录文件名与大小 */
function onFilePick(e) {
  const f = e.target.files[0]
  if (!f) return
  if (!uploadForm.title) uploadForm.title = f.name.replace(/\.[^.]+$/, '') // 默认用文件名
  const mb = f.size / 1024 / 1024
  uploadForm.size = mb >= 1 ? mb.toFixed(1) + ' MB' : Math.max(1, Math.round(f.size / 1024)) + ' KB'
}

function confirmUpload() {
  if (!uploadForm.title.trim()) { ElMessage.warning('请填写资源标题'); return }
  learningStore.addResource({
    title: uploadForm.title.trim(),
    category: uploadForm.category,
    desc: uploadForm.desc,
    size: uploadForm.size,
    uploader: '我'
  })
  ElMessage.success('上传成功！')
  uploadDialog.value = false
  uploadForm.title = ''
  uploadForm.desc = ''
  uploadForm.size = '1.0 MB'
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
.card { border-radius: 12px; margin-bottom: 14px; }

.toolbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }

/* 资源行 */
.res-row { display: flex; gap: 14px; align-items: flex-start; }
.res-icon {
  flex-shrink: 0;
  width: 52px; height: 52px;
  border-radius: 12px;
  background: #f0f2f8;
  display: flex; align-items: center; justify-content: center;
  font-size: 26px;
}
.res-main { flex: 1; min-width: 0; }
.res-title { font-size: 15.5px; font-weight: 600; color: #303133; margin-bottom: 4px; }
.res-desc { font-size: 13px; color: #909399; line-height: 1.6; margin-bottom: 8px; }
.res-meta { display: flex; gap: 12px; align-items: center; font-size: 12.5px; color: #a8abb2; flex-wrap: wrap; }
.res-ops { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }

.file-tip { font-size: 12px; color: #c0c4cc; margin-top: 6px; }
</style>

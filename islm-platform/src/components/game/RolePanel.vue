<!--
  多人博弈游戏 · 角色决策面板子组件
  每个角色只看到自己的决策变量；轮到谁，谁的面板高亮并允许提交
-->
<template>
  <div class="role-panel" :class="{ 'is-turn': isTurn, 'is-done': done }">
    <div class="role-head" :style="{ borderColor: roleInfo.color }">
      <span class="role-icon">{{ roleInfo.icon }}</span>
      <div class="role-meta">
        <div class="role-name" :style="{ color: roleInfo.color }">{{ roleInfo.name }}</div>
        <div class="role-desc">{{ roleInfo.desc }}</div>
      </div>
      <el-tag v-if="isTurn" type="warning" size="small" effect="dark">轮到你决策</el-tag>
      <el-tag v-else-if="done" type="success" size="small">已提交</el-tag>
      <el-tag v-else type="info" size="small">{{ isAi ? 'AI 托管' : '等待中' }}</el-tag>
    </div>

    <!-- 决策表单（按 group 分组显示） -->
    <div class="role-form">
      <div v-for="g in groupedFields" :key="g.name" class="field-group">
        <div class="group-title" v-if="g.name">{{ g.name }}</div>
        <div v-for="f in g.fields" :key="f.key" class="field-row">
          <div class="field-label">
            {{ f.label }}
            <el-tooltip :content="f.hint" placement="top">
              <span class="field-hint">ⓘ</span>
            </el-tooltip>
          </div>
          <el-input-number
            v-model="form[f.key]"
            :min="f.min" :max="f.max" :step="f.step"
            :precision="f.step < 1 ? 2 : 0"
            controls-position="right" size="small" class="field-input"
            :disabled="!canEdit"
          />
          <span class="field-unit">{{ f.unit }}</span>
        </div>
      </div>
    </div>

    <!-- 提交按钮（仅轮到真人自己时可用） -->
    <el-button
      v-if="isTurn && !isAi"
      type="primary" size="large" class="submit-btn" :loading="submitting"
      @click="submit"
    >
      ✅ 提交决策
    </el-button>
    <div v-else-if="isAi" class="ai-tip">🤖 AI 自动决策中……</div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ROLE_MAP, DECISION_FIELDS } from '@/constants/game'

const props = defineProps({
  role: { type: String, required: true },   // 当前面板代表的角色
  myRole: { type: String, default: null },  // 我坐的角色（用于判断能否操作）
  isTurn: { type: Boolean, default: false }, // 是否轮到该角色
  isAi: { type: Boolean, default: false },   // 该角色是否 AI
  done: { type: Boolean, default: false }    // 本回合是否已提交
})

const emit = defineEmits(['submit'])

const roleInfo = computed(() => ROLE_MAP[props.role])
const fields = computed(() => DECISION_FIELDS[props.role] || [])

/* 按 group 分组（保持原始顺序），无 group 字段归入空组（不显示组标题） */
const groupedFields = computed(() => {
  const groups = []
  const map = new Map()
  for (const f of fields.value) {
    const name = f.group || ''
    if (!map.has(name)) {
      const g = { name, fields: [] }
      map.set(name, g)
      groups.push(g)
    }
    map.get(name).fields.push(f)
  }
  return groups
})

/* 表单初始值：全 0 */
const form = ref({})
function resetForm() {
  const f = {}
  for (const field of fields.value) f[field.key] = 0
  form.value = f
}
watch(fields, resetForm, { immediate: true })

const submitting = ref(false)

/* 是否允许编辑：是我的座位、轮到该角色、且是真人 */
const canEdit = computed(() => props.myRole === props.role && props.isTurn && !props.isAi)

function submit() {
  submitting.value = true
  /* 提交后清空表单，准备下一回合 */
  emit('submit', { ...form.value })
  resetForm()
  setTimeout(() => { submitting.value = false }, 300)
}
</script>

<style scoped>
.role-panel {
  border: 2px solid #e4e7ed;
  border-radius: 10px;
  padding: 14px;
  background: #fff;
  transition: all .3s;
}
.role-panel.is-turn {
  border-color: #e6a23c;
  box-shadow: 0 0 0 3px rgba(230, 162, 60, 0.2);
  background: #fffdf5;
}
.role-panel.is-done { opacity: 0.75; }
.role-head { display: flex; align-items: center; gap: 10px; padding-bottom: 10px; border-bottom: 1px dashed #ebeef5; margin-bottom: 10px; }
.role-icon { font-size: 28px; }
.role-meta { flex: 1; }
.role-name { font-weight: bold; font-size: 16px; }
.role-desc { font-size: 12px; color: #909399; }
.role-form { display: flex; flex-direction: column; gap: 8px; }
.field-group { display: flex; flex-direction: column; gap: 8px; }
.group-title {
  font-size: 12px; font-weight: bold; color: #909399;
  padding: 4px 8px; background: #f5f7fa; border-radius: 4px;
  border-left: 3px solid #c0c4cc;
}
.field-row { display: flex; align-items: center; gap: 8px; }
.field-label { flex: 1; font-size: 13px; color: #606266; }
.field-hint { color: #c0c4cc; cursor: help; }
.field-input { width: 140px; }
.field-unit { width: 36px; font-size: 12px; color: #909399; }
.submit-btn { width: 100%; margin-top: 10px; }
.ai-tip { text-align: center; color: #909399; font-size: 13px; padding: 8px 0; }
</style>

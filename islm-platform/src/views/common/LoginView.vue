<!--
  登录 / 注册视图
  -------------------------------------------------
  大创平台工程能力之一：JWT 账号体系。
  登录后错题本与学习记录云端同步（MySQL），未登录仍可用本地模式。
  Element Plus 表单 + 简单校验，成功后返回首页。
-->
<template>
  <div class="login-page">
    <el-card class="login-card" shadow="hover">
      <div class="login-head">
        <div class="login-icon">🎓</div>
        <h2>{{ isRegister ? '注册新账号' : '登录 IS-LM 学习平台' }}</h2>
        <p class="login-sub">{{ isRegister ? '注册后学习数据云端同步，换电脑也不丢' : '登录后错题本 / 学习记录多端同步' }}</p>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @keyup.enter="submit">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" placeholder="3~20 位字母、数字、下划线或中文" maxlength="20" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" type="password" show-password placeholder="6~32 位" maxlength="32" />
        </el-form-item>
        <el-form-item v-if="isRegister" label="昵称（可选）" prop="displayName">
          <el-input v-model="form.displayName" placeholder="不填则与用户名相同" maxlength="20" />
        </el-form-item>

        <el-button type="primary" size="large" class="submit-btn" :loading="loading" @click="submit">
          {{ isRegister ? '注 册' : '登 录' }}
        </el-button>
      </el-form>

      <div class="login-switch">
        <el-link type="primary" @click="toggleMode">
          {{ isRegister ? '已有账号？去登录' : '没有账号？去注册' }}
        </el-link>
        <el-link @click="$emit('back')">先逛逛，不登录</el-link>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { authStore } from '@/store/auth'
import { learningStore } from '@/store/learning'

/* back：登录成功或"先逛逛"时通知 App.vue 回首页 */
const emit = defineEmits(['back'])

/* 表单模式切换：false 登录 / true 注册 */
const isRegister = ref(false)
const loading = ref(false)
const formRef = ref(null)

/* 表单数据与校验规则（与后端 userService 的规则一致） */
const form = reactive({ username: '', password: '', displayName: '' })
const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 32, message: '密码长度 6~32 位', trigger: 'blur' }
  ]
}

/** 切换登录/注册模式并清空校验状态 */
function toggleMode() {
  isRegister.value = !isRegister.value
  formRef.value?.clearValidate()
}

/** 提交：注册或登录，成功提示后回首页（由 App.vue 处理） */
async function submit() {
  try { await formRef.value.validate() } catch { return } // 校验不通过直接返回
  loading.value = true
  const result = isRegister.value
    ? await authStore.register(form.username, form.password, form.displayName)
    : await authStore.login(form.username, form.password)
  loading.value = false

  if (result.ok) {
    ElMessage.success(isRegister.value ? '注册成功，已自动登录' : '登录成功')
    learningStore.syncOnLogin() // 登录成功即双向同步云端错题本
    emit('back')
  } else {
    ElMessage.error(result.message)
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
}
.login-card {
  width: 400px;
  padding: 10px 8px;
  border-radius: 14px;
}
.login-head { text-align: center; margin-bottom: 18px; }
.login-icon { font-size: 44px; }
.login-head h2 { margin: 8px 0 6px; }
.login-sub { margin: 0; font-size: 13px; color: #909399; }
.submit-btn { width: 100%; margin-top: 4px; }
.login-switch {
  display: flex;
  justify-content: space-between;
  margin-top: 14px;
}
</style>

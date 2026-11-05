<!--
  ============================================================
  IS-LM 曲线交互式仿真实验平台（主组件）
  技术栈：Vue3 + Element-Plus + ECharts5 + Axios
  版本说明：
    V1.0 - 基础单情景仿真、ECharts绘图、预制案例
    V2.0 - 历史仿真记录保存/查看/回填、学生备注、localStorage持久化
    V3.0 - 政策冲击对比模式（基准组 vs 冲击后组，双曲线同图）
    V3.1 - 结果指标卡片、参数重置、图表导出PNG、历史删除
  ============================================================
-->
<template>
  <div class="islm-container">

    <!-- ==================== 区域1：顶部标题区 ==================== -->
    <div class="header-section">
      <h1 class="main-title">IS-LM 曲线交互式仿真实验平台</h1>
      <p class="sub-title">
        本工具用于宏观经济学课程辅助学习，可观察财政、货币政策变化对均衡产出、均衡利率的影响。
      </p>
    </div>

    <!-- ==================== 区域2：参数操作区 ==================== -->
    <div class="param-section">

      <!-- ====== 板块2-1：基础模式（V1.0） ====== -->
      <el-card class="param-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <span class="card-title">📊 基础模式 · 单情景仿真</span>
            <!-- V3.0 开关：政策对比模式 -->
            <el-switch
              v-model="compareMode"
              active-text="🔘 开启政策冲击对比模式"
              class="compare-switch"
            />
          </div>
        </template>

        <!-- 基础参数表单（对比模式时复用为基准组） -->
        <el-form :model="activeParams" label-width="130px" label-position="right" class="param-form">
          <div class="form-row" v-for="(row, ri) in paramRows" :key="ri">
            <el-form-item v-for="f in row" :key="f.key" :label="f.label">
              <el-input-number
                v-model="activeParams[f.key]"
                :min="f.min"
                :max="f.max"
                :step="f.step"
                :precision="f.precision"
                controls-position="right"
                class="full-width"
              />
            </el-form-item>
          </div>
        </el-form>

        <!-- 操作控件行 -->
        <div class="control-row">
          <!-- V1.0：载入预制案例 -->
          <el-select
            v-model="selectedPreset"
            placeholder="载入预制案例"
            @change="loadPreset"
            clearable
            class="preset-select"
          >
            <el-option v-for="item in presetOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>

          <!-- V1.0 / V3.0：运行仿真按钮 -->
          <el-button v-if="!compareMode" type="primary" @click="runSimulation" :loading="simLoading" size="large">
            🚀 运行单次仿真
          </el-button>
          <el-button v-else type="warning" @click="runCompareSimulation" :loading="simLoading" size="large">
            ⚡ 运行对比仿真
          </el-button>

          <!-- V3.1：重置参数 -->
          <el-button @click="resetParams" size="large">🔄 重置参数</el-button>

          <!-- V2.0：保存记录复选框 -->
          <el-checkbox v-model="saveRecord" class="save-checkbox">保存本次仿真记录</el-checkbox>

          <!-- V2.0：查看历史记录 -->
          <el-button @click="openHistoryDialog" size="large">📋 查看历史仿真记录</el-button>
        </div>
      </el-card>

      <!-- ====== 板块2-2：政策对比模式（V3.0） ====== -->
      <el-card v-if="compareMode" class="param-card compare-card" shadow="hover">
        <template #header>
          <span class="card-title">🔄 冲击后组参数（政策冲击后）</span>
        </template>
        <el-form :model="paramsShock" label-width="130px" label-position="right" class="param-form">
          <div class="form-row" v-for="(row, ri) in paramRows" :key="'s' + ri">
            <el-form-item v-for="f in row" :key="'s' + f.key" :label="f.label">
              <el-input-number
                v-model="paramsShock[f.key]"
                :min="f.min"
                :max="f.max"
                :step="f.step"
                :precision="f.precision"
                controls-position="right"
                class="full-width"
              />
            </el-form-item>
          </div>
        </el-form>
        <div class="compare-tip">
          💡 提示：基准组曲线以浅色虚线显示，冲击后组以深色实线显示，可直观观察曲线平移效果。
        </div>
      </el-card>
    </div>

    <!-- ==================== 区域3：ECharts绘图可视化画布（V1.0） ==================== -->
    <div class="chart-section">
      <el-card shadow="hover">
        <template #header>
          <div class="card-header">
            <span class="card-title">📈 IS-LM 曲线图形</span>
            <!-- V3.1：导出图片 -->
            <el-button size="small" @click="exportChart" :disabled="!hasResult">💾 导出PNG</el-button>
          </div>
        </template>
        <div ref="chartRef" class="echarts-canvas"></div>
      </el-card>
    </div>

    <!-- ==================== V3.1：结果指标卡片 ==================== -->
    <div v-if="hasResult" class="metrics-section">
      <el-row :gutter="16">
        <el-col :xs="12" :sm="8" :md="6" :lg="4">
          <el-card shadow="hover" class="metric-card metric-y">
            <div class="metric-label">均衡产出 Y*</div>
            <div class="metric-value">{{ formatNum(metrics.Y) }}</div>
          </el-card>
        </el-col>
        <el-col :xs="12" :sm="8" :md="6" :lg="4">
          <el-card shadow="hover" class="metric-card metric-r">
            <div class="metric-label">均衡利率 r*</div>
            <div class="metric-value">{{ (metrics.r * 100).toFixed(2) }}%</div>
          </el-card>
        </el-col>
        <el-col :xs="12" :sm="8" :md="6" :lg="4">
          <el-card shadow="hover" class="metric-card">
            <div class="metric-label">政府支出乘数</div>
            <div class="metric-value small">{{ metrics.multiplier.toFixed(2) }}</div>
          </el-card>
        </el-col>
        <el-col :xs="12" :sm="8" :md="6" :lg="4">
          <el-card shadow="hover" class="metric-card">
            <div class="metric-label">IS 斜率 |β|</div>
            <div class="metric-value small">{{ metrics.betaIS.toFixed(6) }}</div>
          </el-card>
        </el-col>
        <el-col :xs="12" :sm="8" :md="6" :lg="4">
          <el-card shadow="hover" class="metric-card">
            <div class="metric-label">LM 斜率 β</div>
            <div class="metric-value small">{{ metrics.betaLM.toFixed(6) }}</div>
          </el-card>
        </el-col>
        <el-col :xs="12" :sm="8" :md="6" :lg="4">
          <el-card shadow="hover" class="metric-card">
            <div class="metric-label">可支配收入 Yd</div>
            <div class="metric-value small">{{ formatNum(metrics.Yd) }}</div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <!-- ==================== 区域4：经济学解读区域（V1.0+V2.0） ==================== -->
    <div class="analysis-section">
      <el-card shadow="hover">
        <template #header>
          <span class="card-title">📖 经济学解读</span>
        </template>

        <!-- V1.0：系统自动生成分析文本 -->
        <div class="analysis-text">
          <div v-if="analysisNote" class="note-content"><pre>{{ analysisNote }}</pre></div>
          <el-empty v-else description="请先运行仿真以查看经济学分析解读" :image-size="80" />
        </div>

        <el-divider />

        <!-- V2.0：学生个人备注 -->
        <div class="student-note">
          <div class="note-label">📝 学生个人备注：</div>
          <el-input
            v-model="studentNote"
            type="textarea"
            :rows="4"
            placeholder="在此输入您的学习笔记、观察结论或疑问（勾选&quot;保存本次仿真记录&quot;时备注将一并保存）..."
            maxlength="500"
            show-word-limit
          />
        </div>
      </el-card>
    </div>

    <!-- ==================== 区域5：底部说明栏 ==================== -->
    <div class="footer-section">
      <p>① 当前模型采用线性 IS-LM 模型；</p>
      <p>② 利率、产出小于0视为无效参数；</p>
      <p>③ 本平台仅作课程教学演示，不作为现实投资参考。</p>
    </div>

    <!-- ==================== V2.0：历史仿真记录弹窗 ==================== -->
    <el-dialog v-model="historyDialogVisible" title="📋 历史仿真记录" width="82%" destroy-on-close>
      <el-table
        :data="historyList"
        stripe
        border
        highlight-current-row
        @row-click="handleHistoryRowClick"
        style="width: 100%; cursor: pointer;"
        empty-text="暂无历史记录（保存的仿真将显示在此处）"
      >
        <el-table-column prop="id" label="#" width="60" align="center" />
        <el-table-column prop="createTime" label="仿真时间" width="170" />
        <el-table-column label="参数概要" min-width="340">
          <template #default="{ row }">
            <span class="param-summary">
              C₀={{ row.params.C0 }}, c={{ row.params.c }}, I₀={{ row.params.I0 }},
              d={{ row.params.d }}, G={{ row.params.G }}, T={{ row.params.T }},
              M/P={{ row.params.MP }}, k={{ row.params.k }}, h={{ row.params.h }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="均衡结果" width="180">
          <template #default="{ row }">
            <span v-if="row.result && row.result.Y !== undefined">
              Y*={{ Number(row.result.Y).toFixed(2) }}<br/>
              r*={{ (Number(row.result.r) * 100).toFixed(2) }}%
            </span>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column prop="studentNote" label="备注" min-width="140" show-overflow-tooltip />
        <el-table-column label="操作" width="150" align="center">
          <template #default="{ row }">
            <el-button type="primary" link @click.stop="handleHistoryRowClick(row)">回填</el-button>
            <el-button type="danger" link @click.stop="deleteHistoryRow(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="historyDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import * as echarts from 'echarts'
import { ElMessage, ElMessageBox } from 'element-plus'
import { PRESET_CASES, presetOptions, DEFAULT_PARAMS, PARAM_FIELDS } from '@/constants/presets'
import { validateParams } from '@/utils/islmCalc'
import { simulate, compare, saveHistory, fetchHistory, deleteHistory } from '@/api/islm'

/* ============================================
 * V4.0（辅助学习系统）：外部传入初始参数
 * 支持章节实验/习题验证弹窗预填参数并自动运行
 * ============================================ */
const props = defineProps({
  initialParams: { type: Object, default: null },
  initialCompareMode: { type: Boolean, default: false },
  initialShockParams: { type: Object, default: null }
})

/* ============================================
 * 参数表单按三列分组（9个字段 → 3行 × 3列）
 * ============================================ */
const paramRows = [
  PARAM_FIELDS.slice(0, 3),
  PARAM_FIELDS.slice(3, 6),
  PARAM_FIELDS.slice(6, 9)
]

/* ============================================
 * V1.0：响应式数据
 * ============================================ */
const params = reactive(props.initialParams ? { ...DEFAULT_PARAMS, ...props.initialParams } : { ...DEFAULT_PARAMS })
const selectedPreset = ref('baseline')
const simLoading = ref(false)
const analysisNote = ref('')
const hasResult = ref(false)
// 最近一次仿真结果（用于指标卡片）
const lastResult = ref(null)

// 当前激活参数对象（对比模式指向基准组，否则指向单模式）
const activeParams = computed(() => (compareMode.value ? paramsBase : params))

/* ============================================
 * V2.0：保存记录 & 学生备注 & 历史列表
 * ============================================ */
const saveRecord = ref(false)
const studentNote = ref('')
const historyDialogVisible = ref(false)
const historyList = ref([])

/* ============================================
 * V3.0：对比模式（V4.0：支持外部预填初始值）
 * ============================================ */
const compareMode = ref(!!props.initialCompareMode)
const paramsBase = reactive(props.initialParams ? { ...DEFAULT_PARAMS, ...props.initialParams } : { ...DEFAULT_PARAMS })
const paramsShock = reactive(props.initialShockParams ? { ...DEFAULT_PARAMS, ...props.initialShockParams } : { ...DEFAULT_PARAMS, G: 150 })

/* ============================================
 * V3.1：结果指标卡片计算属性
 * ============================================ */
const metrics = computed(() => {
  if (!lastResult.value) return { Y: 0, r: 0, multiplier: 0, betaIS: 0, betaLM: 0, Yd: 0 }
  const p = compareMode.value ? paramsShock : params
  const r = lastResult.value
  return {
    Y: r.equilibrium.Y,
    r: r.equilibrium.r,
    multiplier: 1 / (1 - p.c),
    betaIS: r.betaIS,
    betaLM: r.betaLM,
    Yd: r.equilibrium.Y - p.T // 可支配收入 Y - T
  }
})

/** 数字格式化（保留2位小数） */
function formatNum(v) {
  return Number(v).toFixed(2)
}

/* ============================================
 * ECharts 实例
 * ============================================ */
const chartRef = ref(null)
let chartInstance = null

/* ============================================
 * V1.0：ECharts 渲染 - 单模式
 * ============================================ */
function renderChartSingle(result) {
  if (!chartInstance) return
  chartInstance.setOption({
    animation: true,
    tooltip: {
      trigger: 'item',
      formatter: p => {
        if (p.seriesType === 'scatter') {
          return `<div style="font-weight:bold;color:#F56C6C">${p.seriesName}</div>` +
            `均衡产出 Y* = ${p.data[0]}<br/>均衡利率 r* = ${(p.data[1] * 100).toFixed(2)}%`
        }
        return `<b>${p.seriesName}</b><br/>国民收入 Y = ${p.data[0]}<br/>利率 r = ${(p.data[1] * 100).toFixed(2)}%`
      }
    },
    legend: { data: ['IS 曲线', 'LM 曲线', '均衡点 E*'], top: 10 },
    grid: { left: '8%', right: '5%', bottom: '10%', top: '15%' },
    xAxis: {
      type: 'value', name: '国民收入 Y', nameLocation: 'middle', nameGap: 30,
      nameTextStyle: { fontSize: 14, fontWeight: 'bold' }, min: 0
    },
    yAxis: {
      type: 'value', name: '利率 r', nameLocation: 'middle', nameGap: 50,
      nameTextStyle: { fontSize: 14, fontWeight: 'bold' }, min: 0,
      axisLabel: { formatter: v => (v * 100).toFixed(1) + '%' }
    },
    series: [
      {
        name: 'IS 曲线', type: 'line', data: result.isCurve, symbol: 'none',
        lineStyle: { color: '#409EFF', width: 3 }, itemStyle: { color: '#409EFF' }
      },
      {
        name: 'LM 曲线', type: 'line', data: result.lmCurve, symbol: 'none',
        lineStyle: { color: '#E6A23C', width: 3 }, itemStyle: { color: '#E6A23C' }
      },
      {
        name: '均衡点 E*', type: 'scatter', data: [[result.equilibrium.Y, result.equilibrium.r]],
        symbolSize: 16, z: 10,
        itemStyle: { color: '#F56C6C', borderColor: '#fff', borderWidth: 2 },
        label: {
          show: true, position: 'top',
          formatter: `E*(${result.equilibrium.Y}, ${(result.equilibrium.r * 100).toFixed(2)}%)`,
          color: '#F56C6C', fontWeight: 'bold', fontSize: 12
        }
      }
    ]
  }, true)
}

/* ============================================
 * V3.0：ECharts 渲染 - 对比模式
 * ============================================ */
function renderChartCompare(baseResult, shockResult) {
  if (!chartInstance) return
  chartInstance.setOption({
    animation: true,
    tooltip: {
      trigger: 'item',
      formatter: p => {
        return `<b>${p.seriesName}</b><br/>Y = ${p.data[0]}<br/>r = ${(p.data[1] * 100).toFixed(2)}%`
      }
    },
    legend: {
      data: ['IS 基准（虚线）', 'LM 基准（虚线）', 'IS 冲击后（实线）', 'LM 冲击后（实线）', '基准均衡 E₀', '冲击后均衡 E₁'],
      top: 5, textStyle: { fontSize: 11 }
    },
    grid: { left: '8%', right: '5%', bottom: '10%', top: '18%' },
    xAxis: {
      type: 'value', name: '国民收入 Y', nameLocation: 'middle', nameGap: 30,
      nameTextStyle: { fontSize: 14, fontWeight: 'bold' }, min: 0
    },
    yAxis: {
      type: 'value', name: '利率 r', nameLocation: 'middle', nameGap: 50,
      nameTextStyle: { fontSize: 14, fontWeight: 'bold' }, min: 0,
      axisLabel: { formatter: v => (v * 100).toFixed(1) + '%' }
    },
    series: [
      { name: 'IS 基准（虚线）', type: 'line', data: baseResult.isCurve, symbol: 'none',
        lineStyle: { color: '#A0CFFF', width: 2, type: 'dashed' } },
      { name: 'LM 基准（虚线）', type: 'line', data: baseResult.lmCurve, symbol: 'none',
        lineStyle: { color: '#F5D090', width: 2, type: 'dashed' } },
      { name: 'IS 冲击后（实线）', type: 'line', data: shockResult.isCurve, symbol: 'none',
        lineStyle: { color: '#1D6FCC', width: 3 } },
      { name: 'LM 冲击后（实线）', type: 'line', data: shockResult.lmCurve, symbol: 'none',
        lineStyle: { color: '#CF7A00', width: 3 } },
      { name: '基准均衡 E₀', type: 'scatter', data: [[baseResult.equilibrium.Y, baseResult.equilibrium.r]],
        symbolSize: 12, z: 9, itemStyle: { color: '#909399', borderColor: '#fff', borderWidth: 2 },
        label: { show: true, position: 'bottom',
          formatter: `E₀(${baseResult.equilibrium.Y}, ${(baseResult.equilibrium.r * 100).toFixed(2)}%)`,
          color: '#909399', fontSize: 11 } },
      { name: '冲击后均衡 E₁', type: 'scatter', data: [[shockResult.equilibrium.Y, shockResult.equilibrium.r]],
        symbolSize: 16, z: 10, itemStyle: { color: '#F56C6C', borderColor: '#fff', borderWidth: 2 },
        label: { show: true, position: 'top',
          formatter: `E₁(${shockResult.equilibrium.Y}, ${(shockResult.equilibrium.r * 100).toFixed(2)}%)`,
          color: '#F56C6C', fontWeight: 'bold', fontSize: 12 } }
    ]
  }, true)
}

/* ============================================
 * V1.0：载入预制案例
 * ============================================ */
function loadPreset(val) {
  if (!val) return
  const preset = PRESET_CASES[val]
  if (!preset) return
  const p = preset.params

  if (compareMode.value) {
    Object.assign(paramsBase, p)
    // 对比模式下，冲击后组根据案例类型自动差异化
    if (val === 'fiscalExpand') Object.assign(paramsShock, { ...p, G: p.G + 50 })
    else if (val === 'fiscalContract') Object.assign(paramsShock, { ...p, G: Math.max(0, p.G - 50) })
    else if (val === 'monetaryExpand') Object.assign(paramsShock, { ...p, MP: p.MP + 100 })
    else if (val === 'mixedPolicy') Object.assign(paramsShock, { ...p, G: p.G + 50, MP: p.MP + 100 })
    else Object.assign(paramsShock, p)
  } else {
    Object.assign(params, p)
  }
  ElMessage.success('已载入预制案例：' + preset.label)
}

/* ============================================
 * V3.1：重置参数为默认值
 * ============================================ */
function resetParams() {
  ElMessageBox.confirm('确定要将参数重置为基准默认值吗？', '重置确认', {
    confirmButtonText: '确定重置',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    Object.assign(params, DEFAULT_PARAMS)
    Object.assign(paramsBase, DEFAULT_PARAMS)
    Object.assign(paramsShock, { ...DEFAULT_PARAMS, G: 150 })
    selectedPreset.value = 'baseline'
    analysisNote.value = ''
    hasResult.value = false
    lastResult.value = null
    initChart() // 清空画布
    ElMessage.success('参数已重置为基准默认值')
  }).catch(() => {})
}

/* ============================================
 * V1.0：运行单次仿真
 * ============================================ */
async function runSimulation() {
  const check = validateParams(params)
  if (!check.valid) {
    ElMessage.warning(check.message)
    return
  }

  simLoading.value = true
  try {
    const res = await simulate({ ...params })
    if (!res.success) {
      ElMessage.error(res.message || '仿真失败')
      return
    }
    analysisNote.value = res.data.note
    lastResult.value = res.data
    hasResult.value = true
    await nextTick()
    renderChartSingle(res.data)
    ElMessage.success('仿真完成！')

    if (saveRecord.value) {
      await persistRecord({ ...params }, res.data.equilibrium, studentNote.value)
    }
  } catch (err) {
    ElMessage.error('仿真请求失败：' + (err.message || '未知错误'))
  } finally {
    simLoading.value = false
  }
}

/* ============================================
 * V3.0：运行对比仿真
 * ============================================ */
async function runCompareSimulation() {
  const c1 = validateParams(paramsBase, '基准组')
  if (!c1.valid) { ElMessage.warning(c1.message); return }
  const c2 = validateParams(paramsShock, '冲击后组')
  if (!c2.valid) { ElMessage.warning(c2.message); return }

  simLoading.value = true
  try {
    const res = await compare({ ...paramsBase }, { ...paramsShock })
    if (!res.success) {
      ElMessage.error(res.message || '对比仿真失败')
      return
    }
    analysisNote.value = res.data.note
    lastResult.value = res.data.shock
    hasResult.value = true
    await nextTick()
    renderChartCompare(res.data.base, res.data.shock)
    ElMessage.success('对比仿真完成！')

    if (saveRecord.value) {
      await persistRecord({ ...paramsShock }, res.data.shock.equilibrium, studentNote.value)
    }
  } catch (err) {
    ElMessage.error('对比仿真请求失败：' + (err.message || '未知错误'))
  } finally {
    simLoading.value = false
  }
}

/* ============================================
 * V2.0：保存仿真记录（API + localStorage 双写）
 * ============================================ */
async function persistRecord(paramsData, equilibriumData, note) {
  const record = {
    id: Date.now(),
    createTime: new Date().toLocaleString('zh-CN'),
    params: paramsData,
    result: equilibriumData,
    studentNote: note || '(无备注)'
  }
  // 调用 API 层（当前为 mock）
  await saveHistory(record)
  // 同步写入 localStorage 做本地持久化
  historyList.value.unshift(record)
  localStorage.setItem('islm_history', JSON.stringify(historyList.value))
  ElMessage.success('仿真记录已保存！')
}

/* ============================================
 * V2.0：打开历史记录弹窗
 * ============================================ */
async function openHistoryDialog() {
  try {
    const res = await fetchHistory()
    if (res.success) {
      historyList.value = res.data.list
    }
  } catch (e) {
    console.error(e)
  }
  historyDialogVisible.value = true
}

/* ============================================
 * V2.0：点击历史记录行回填表单
 * ============================================ */
function handleHistoryRowClick(row) {
  compareMode.value = false
  Object.assign(params, row.params)
  selectedPreset.value = ''
  studentNote.value = row.studentNote && row.studentNote !== '(无备注)' ? row.studentNote : ''
  historyDialogVisible.value = false
  ElMessage.info('已回填历史记录参数，可点击【运行单次仿真】重新计算并绘图')
}

/* ============================================
 * V3.1：删除单条历史记录
 * ============================================ */
async function deleteHistoryRow(row) {
  try {
    await ElMessageBox.confirm('确定删除该条历史记录吗？', '删除确认', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning'
    })
    await deleteHistory(row.id)
    historyList.value = historyList.value.filter(item => item.id !== row.id)
    localStorage.setItem('islm_history', JSON.stringify(historyList.value))
    ElMessage.success('已删除该条记录')
  } catch (e) {
    // 用户取消
  }
}

/* ============================================
 * V3.1：导出图表为 PNG
 * ============================================ */
function exportChart() {
  if (!chartInstance || !hasResult.value) {
    ElMessage.warning('请先运行仿真生成图表')
    return
  }
  const url = chartInstance.getDataURL({
    type: 'png',
    pixelRatio: 2,
    backgroundColor: '#fff'
  })
  const a = document.createElement('a')
  a.href = url
  a.download = `IS-LM仿真_${new Date().toISOString().slice(0, 10)}.png`
  a.click()
  ElMessage.success('图表已导出')
}

/* ============================================
 * ECharts 初始化
 * ============================================ */
function initChart() {
  if (!chartRef.value) return
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
  chartInstance = echarts.init(chartRef.value)
  chartInstance.setOption({
    title: {
      text: hasResult.value ? '' : '请填写参数并点击"运行仿真"，此处将显示 IS-LM 曲线图',
      left: 'center', top: 'center',
      textStyle: { color: '#909399', fontSize: 15, fontWeight: 'normal' }
    },
    grid: { left: '8%', right: '5%', bottom: '10%', top: '15%' },
    xAxis: { type: 'value', name: '国民收入 Y', min: 0, nameLocation: 'middle', nameGap: 30,
      nameTextStyle: { fontSize: 14, fontWeight: 'bold' } },
    yAxis: { type: 'value', name: '利率 r', min: 0, nameLocation: 'middle', nameGap: 50,
      nameTextStyle: { fontSize: 14, fontWeight: 'bold' },
      axisLabel: { formatter: v => (v * 100).toFixed(0) + '%' } },
    series: []
  })
}

function handleResize() {
  if (chartInstance) chartInstance.resize()
}

/* ============================================
 * 生命周期
 * ============================================ */
onMounted(() => {
  nextTick(() => {
    initChart()
    window.addEventListener('resize', handleResize)
    // 启动时从 localStorage 加载历史记录
    const saved = localStorage.getItem('islm_history')
    if (saved) {
      try { historyList.value = JSON.parse(saved) } catch (e) { /* ignore */ }
    }
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
})

// V3.0：切换对比模式时，将当前单模式参数复制到基准组
watch(compareMode, (newVal) => {
  if (newVal) Object.assign(paramsBase, params)
})

/* ============================================
 * V4.0（辅助学习系统）：暴露自动运行方法
 * 供章节实验弹窗 / 习题验证弹窗打开后自动执行仿真
 * ============================================ */
defineExpose({
  autoRun() {
    nextTick(() => {
      if (compareMode.value) runCompareSimulation()
      else runSimulation()
    })
  }
})
</script>

<style scoped>
/* ==================== 全局容器 ==================== */
.islm-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);
  min-height: 100vh;
  box-sizing: border-box;
  font-family: 'Microsoft YaHei', 'PingFang SC', 'Helvetica Neue', sans-serif;
}

/* ==================== 区域1：顶部标题区 ==================== */
.header-section {
  text-align: center;
  padding: 28px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border-radius: 12px;
  margin-bottom: 20px;
  box-shadow: 0 4px 18px rgba(102, 126, 234, 0.35);
}
.main-title {
  margin: 0 0 10px 0;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 2px;
}
.sub-title {
  margin: 0;
  font-size: 14px;
  opacity: 0.92;
  line-height: 1.6;
}

/* ==================== 区域2：参数操作区 ==================== */
.param-section { margin-bottom: 20px; }
.param-card { margin-bottom: 16px; border-radius: 10px; border: none; }
.compare-card {
  border: 2px dashed #e6a23c;
  background: #fffbf0;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}
.compare-switch { --el-switch-on-color: #e6a23c; }

.param-form { margin-bottom: 6px; }
.form-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0 24px;
}
:deep(.el-form-item) { margin-bottom: 14px; }
:deep(.el-form-item__label) { font-weight: 500; }
.full-width { width: 100%; }

.control-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding-top: 14px;
  border-top: 1px dashed #dcdfe6;
}
.preset-select { width: 230px; }
.save-checkbox { margin-left: auto; }
.compare-tip {
  margin-top: 10px;
  padding: 10px 14px;
  background: #fdf6ec;
  border-left: 4px solid #e6a23c;
  border-radius: 4px;
  font-size: 13px;
  color: #b88230;
  line-height: 1.6;
}

/* ==================== 区域3：ECharts 画布 ==================== */
.chart-section { margin-bottom: 20px; }
.echarts-canvas {
  width: 100%;
  height: 450px;
}

/* ==================== V3.1：结果指标卡片 ==================== */
.metrics-section { margin-bottom: 20px; }
.metric-card {
  text-align: center;
  border-radius: 10px;
  margin-bottom: 12px;
}
.metric-card :deep(.el-card__body) { padding: 16px 10px; }
.metric-label {
  font-size: 13px;
  color: #909399;
  margin-bottom: 8px;
}
.metric-value {
  font-size: 26px;
  font-weight: 700;
  color: #303133;
}
.metric-value.small { font-size: 18px; }
.metric-y { border-top: 3px solid #409EFF; }
.metric-r { border-top: 3px solid #E6A23C; }

/* ==================== 区域4：经济学解读区 ==================== */
.analysis-section { margin-bottom: 20px; }
.analysis-text { min-height: 100px; }
.note-content pre {
  margin: 0;
  padding: 16px 20px;
  background: #f0f6ff;
  border-radius: 8px;
  border-left: 4px solid #409eff;
  font-family: 'Microsoft YaHei', 'Consolas', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.9;
  color: #1d2129;
  white-space: pre-wrap;
  word-wrap: break-word;
}
.student-note { margin-top: 6px; }
.note-label {
  margin-bottom: 8px;
  font-weight: 600;
  color: #303133;
}
.param-summary {
  font-size: 12px;
  color: #606266;
  font-family: 'Consolas', 'Courier New', monospace;
}

/* ==================== 区域5：底部说明栏 ==================== */
.footer-section {
  text-align: center;
  padding: 16px;
  background: #f4f4f5;
  border-radius: 8px;
  color: #909399;
  font-size: 12px;
  line-height: 2;
}
.footer-section p { margin: 2px 0; }

/* ==================== 响应式适配 ==================== */
@media (max-width: 960px) {
  .form-row { grid-template-columns: repeat(2, 1fr); }
  .main-title { font-size: 22px; }
  .control-row { flex-direction: column; align-items: stretch; }
  .save-checkbox { margin-left: 0; }
  .preset-select { width: 100%; }
}
@media (max-width: 600px) {
  .form-row { grid-template-columns: 1fr; }
  .islm-container { padding: 10px; }
  .echarts-canvas { height: 360px; }
  .metric-value { font-size: 22px; }
}
</style>

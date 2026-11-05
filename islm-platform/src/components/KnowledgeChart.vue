<!--
  知识点图示组件（V4.1 辅助学习系统）
  根据传入的 chart key 渲染对应的静态经济学示意图
-->
<template>
  <div class="kc-block">
    <div class="kc-head">
      <span class="kc-title">📊 {{ title }}</span>
      <span v-if="desc" class="kc-desc">{{ desc }}</span>
    </div>
    <div ref="chartRef" class="kc-canvas"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import * as echarts from 'echarts'
import { getKnowledgeChartOption } from '@/constants/knowledgeCharts'

const props = defineProps({
  chart: { type: String, required: true },  // 图型 key
  title: { type: String, default: '知识点图示' },
  desc: { type: String, default: '' }
})

const chartRef = ref(null)
let instance = null

onMounted(() => {
  instance = echarts.init(chartRef.value)
  instance.setOption(getKnowledgeChartOption(props.chart))

  // 选项卡切换导致容器尺寸变化时自适应（ResizeObserver 监听容器）
  resizeObserver = new ResizeObserver(() => instance && instance.resize())
  resizeObserver.observe(chartRef.value)
})

let resizeObserver = null

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (instance) {
    instance.dispose()
    instance = null
  }
})
</script>

<style scoped>
.kc-block {
  margin: 14px 0;
  padding: 12px 14px;
  background: #fff;
  border: 1px solid #dce3f5;
  border-radius: 10px;
}
.kc-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.kc-title {
  font-size: 14.5px;
  font-weight: 700;
  color: #3a4a8c;
}
.kc-desc {
  font-size: 12.5px;
  color: #8a93a8;
  line-height: 1.5;
}
.kc-canvas {
  width: 100%;
  height: 300px;
}
</style>

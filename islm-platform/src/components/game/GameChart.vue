<!--
  多人博弈游戏 · IS-LM 曲线图子组件
  展示当前 IS/LM 曲线 + 当前均衡点 + 历史均衡点轨迹（体现曲线移动/政策传导）
-->
<template>
  <div ref="chartRef" class="game-chart"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  curves: { type: Object, default: null },  // { isCurve, lmCurve, equilibrium }
  trail: { type: Array, default: () => [] } // [{Y, r, round}] 历史均衡点轨迹（含当前）
})

const chartRef = ref(null)
let chart = null

function render() {
  if (!chart || !props.curves) return
  const { isCurve, lmCurve, equilibrium } = props.curves

  /* 历史均衡点轨迹：按回合顺序连线（E₀ → E₁ → ...） */
  const trailData = props.trail.map((p, i) => [p.Y, p.r])
  const isFirst = props.trail.length <= 1

  chart.setOption({
    animationDuration: 800,
    animationEasing: 'cubicOut',
    tooltip: {
      trigger: 'item',
      formatter: p => {
        if (p.seriesType === 'scatter') {
          return `<b>${p.seriesName}</b><br/>Y = ${p.data[0]}<br/>r = ${(p.data[1] * 100).toFixed(2)}%`
        }
        return `<b>${p.seriesName}</b><br/>Y = ${p.data[0]}<br/>r = ${(p.data[1] * 100).toFixed(2)}%`
      }
    },
    legend: { data: ['IS 曲线', 'LM 曲线', '均衡点', '政策传导轨迹'], top: 5, textStyle: { fontSize: 11 } },
    grid: { left: '8%', right: '5%', bottom: '12%', top: '16%' },
    xAxis: {
      type: 'value', name: '国民收入 Y', nameLocation: 'middle', nameGap: 30,
      nameTextStyle: { fontSize: 13, fontWeight: 'bold' }, min: 0
    },
    yAxis: {
      type: 'value', name: '利率 r', nameLocation: 'middle', nameGap: 50,
      nameTextStyle: { fontSize: 13, fontWeight: 'bold' }, min: 0,
      axisLabel: { formatter: v => (v * 100).toFixed(1) + '%' }
    },
    series: [
      {
        name: 'IS 曲线', type: 'line', data: isCurve, symbol: 'none',
        lineStyle: { color: '#409EFF', width: 3 }, itemStyle: { color: '#409EFF' },
        markLine: { silent: true, symbol: 'none', lineStyle: { type: 'dashed', color: '#c0c4cc', width: 1 },
          data: [{ xAxis: equilibrium.Y }] }
      },
      {
        name: 'LM 曲线', type: 'line', data: lmCurve, symbol: 'none',
        lineStyle: { color: '#E6A23C', width: 3 }, itemStyle: { color: '#E6A23C' }
      },
      {
        name: '均衡点', type: 'scatter', data: [[equilibrium.Y, equilibrium.r]],
        symbolSize: 16, z: 10,
        itemStyle: { color: '#F56C6C', borderColor: '#fff', borderWidth: 2 },
        label: {
          show: true, position: 'top',
          formatter: `E(${equilibrium.Y.toFixed(0)}, ${(equilibrium.r * 100).toFixed(2)}%)`,
          color: '#F56C6C', fontWeight: 'bold', fontSize: 12
        }
      },
      {
        name: '政策传导轨迹', type: 'line', data: trailData, symbol: 'circle',
        symbolSize: isFirst ? 0 : 8, z: 9,
        lineStyle: { color: '#909399', width: 2, type: 'dashed' },
        itemStyle: { color: '#909399', borderColor: '#fff', borderWidth: 1 },
        label: {
          show: !isFirst, fontSize: 10, color: '#909399',
          formatter: p => `E${p.dataIndex}`
        }
      }
    ]
  }, true)
}

onMounted(() => {
  chart = echarts.init(chartRef.value)
  render()
  window.addEventListener('resize', resize)
})

function resize() { chart && chart.resize() }

watch(() => [props.curves, props.trail], render, { deep: true })

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  chart && chart.dispose()
})
</script>

<style scoped>
.game-chart { width: 100%; height: 360px; }
</style>

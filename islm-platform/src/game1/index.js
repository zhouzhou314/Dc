/* =========================================================
   index.js —— 游戏一（经济舵手 Macro Pilot）模块汇总出口
   ---------------------------------------------------------
   用法（Game1View.vue）：
     import { mountGame1 } from '@/game1'
     const inst = mountGame1({ root, onEvent, profile })
     inst.getState()   // 只读状态快照
     inst.destroy()    // 卸载：清定时器 / 动画 / 事件，可再次 mount

   对外契约：
     mountGame1({ root, onEvent = () => {}, profile = null })
       → { destroy(), getState() }

   事件类型（payload 均为纯 JSON，数字保留两位小数）：
     game1.start     { mode }
     game1.policy    { quarter, cardId, name, category, effect, changes, mode }
     game1.quiz      { quarter, cardId, questionKey, correct, chosen, answer, chapter }
     game1.quarter   { quarter, round, kpi, score, mode }
     game1.wrongbook { action, questionKey, correct, chapter }
     game1.finish    { mode, quarters, radar, totalScore, achievements, kpiSeries }
   ========================================================= */

export { mountGame1 } from './main.js';

/* 便于上层做数据分析 / 复盘时按需取用（不参与渲染） */
export { game, TOTAL_QUARTERS, kpiSnapshot } from './engine.js';
export { CARDS, CATS, CHAINS, ACHIEVEMENTS } from './data.js';
export { ctx } from './context.js';

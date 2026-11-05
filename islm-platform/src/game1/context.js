/* =========================================================
   context.js —— 游戏一运行期上下文（ES Module 版新增模块）
   ---------------------------------------------------------
   职责（对应移植需求）：
     1. 保存当前挂载的 root 容器 / 游戏实例 / 上报回调 / 学生档案，
        替代原版依赖 window 的隐式全局（window.game 等）；
     2. 提供 root 作用域内的 DOM 查询助手 $ / $$，
        所有查询都限定在组件容器内，不会误伤站点其它元素；
     3. 统一登记 setTimeout / setInterval / requestAnimationFrame，
        destroy 时一次性清除，保证反复 mount / unmount 不残留定时器；
     4. 统一事件上报入口 emit()，payload 内的数字统一保留两位小数，
        并做一次深拷贝，确保上报出去的都是纯 JSON 可序列化对象。
   ========================================================= */

/* 全局唯一的运行期上下文（同一时刻只允许一局挂载） */
export const ctx = {
  root: null,          // HTMLElement：Game1View 的容器
  game: null,          // 游戏状态机实例（engine.js 中的 game）
  UI: null,            // UI 对象（main.js 注册）
  Transmission: null,  // 传导演示动画对象（main.js 注册）
  profile: null,       // 学生档案（{ displayName } 等）
  onEvent: null,       // 事件上报回调 (type, payload) => void
  alive: false,        // 是否处于挂载期；false 时所有异步回调自动失效
};

/* 异步任务登记表：destroy 时统一清理 */
const timerIds = new Set();
const frameIds = new Set();

/* ---------- DOM 查询助手（全部限定在 root 内） ---------- */

/** 在 root 内查询单个元素；未挂载或找不到时返回 null */
export function $(selector) {
  return ctx.root ? ctx.root.querySelector(selector) : null;
}

/** 在 root 内查询多个元素，返回真数组（便于 forEach / map） */
export function $$(selector) {
  return ctx.root ? Array.from(ctx.root.querySelectorAll(selector)) : [];
}

/* ---------- 异步任务助手 ---------- */

/**
 * 受控 setTimeout：挂载期结束后不再执行，并登记以便 destroy 清理
 * @returns {number} 定时器 id
 */
export function setTimer(fn, ms) {
  const id = setTimeout(() => {
    timerIds.delete(id);
    if (ctx.alive) fn();
  }, ms);
  timerIds.add(id);
  return id;
}

/**
 * 受控 setInterval：原版未使用，保留统一出口，避免将来出现"野定时器"
 */
export function setIntervalSafe(fn, ms) {
  const id = setInterval(() => {
    if (!ctx.alive) { clearInterval(id); timerIds.delete(id); return; }
    fn();
  }, ms);
  timerIds.add(id);
  return id;
}

/** 清除单个定时器（timeout / interval 在浏览器中共用 id 空间） */
export function clearTimer(id) {
  if (id === null || id === undefined) return;
  clearTimeout(id);
  clearInterval(id);
  timerIds.delete(id);
}

/**
 * 受控 requestAnimationFrame：挂载期结束后不再执行，并登记以便 destroy 取消
 * @returns {number} 帧 id
 */
export function requestFrame(fn) {
  const id = requestAnimationFrame((t) => {
    frameIds.delete(id);
    if (ctx.alive) fn(t);
  });
  frameIds.add(id);
  return id;
}

/** 清除所有定时器与动画帧（destroy 时调用） */
export function clearAllTimers() {
  timerIds.forEach((id) => {
    clearTimeout(id);
    clearInterval(id);
  });
  timerIds.clear();
  frameIds.forEach((id) => cancelAnimationFrame(id));
  frameIds.clear();
}

/* ---------- 事件上报 ---------- */

/** 数值统一保留两位小数，避免浮点噪声（如 0.30000000000000004） */
export function round2(v) {
  return Math.round(v * 100) / 100;
}

/**
 * 深拷贝并把所有数字四舍五入到两位小数
 * 用于保证上报 payload 是纯 JSON 对象（不含 DOM / 函数 / 循环引用）
 */
export function toPlain(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? round2(value) : null;
  if (typeof value === 'function' || typeof value === 'undefined') return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(toPlain);
  const out = {};
  Object.keys(value).forEach((k) => {
    const v = toPlain(value[k]);
    if (v !== undefined) out[k] = v;
  });
  return out;
}

/**
 * 事件上报统一入口
 * @param {string} type    事件类型（game1.start / game1.policy / ...）
 * @param {object} payload 纯 JSON 可序列化的载荷（数字自动保留两位小数）
 */
export function emit(type, payload) {
  if (typeof ctx.onEvent !== 'function') return;
  try {
    ctx.onEvent(type, toPlain(payload || {}));
  } catch (e) {
    /* 上报失败不能影响游戏本身 */
    console.warn('[game1] onEvent 回调异常：', e);
  }
}

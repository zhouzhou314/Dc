/* =========================================================
   quiz.js —— 政策预判做题系统
   每张政策卡触发一道与其机制对应的计算/概念题。
   答对：政策全额生效；答错：效果减半并计入错题本。
   题目参数随机生成，避免背答案。
   ========================================================= */

/* ---------- 随机小工具 ---------- */
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rint(lo, hi) { return Math.floor(lo + Math.random() * (hi - lo + 1)); }

/* 组装选择题：opts = [{t:文本, ok:是否正确}]，自动打乱 */
function makeQ(text, opts, explain, formula, chapter) {
  const shuffled = opts.slice().sort(() => Math.random() - 0.5);
  return {
    text: text,
    options: shuffled.map(o => o.t),
    ans: shuffled.findIndex(o => o.ok),
    explain: explain,
    formula: formula,
    chapter: chapter,
  };
}

/* ---------- 题目生成器（key 与 data.js 中 card.quiz 对应） ---------- */
const QUIZ_GEN = {

  /* 政府支出乘数 */
  multG() {
    const b = pick([0.75, 0.8, 0.9]);
    const dg = rint(2, 10) * 10;
    const k = 1 / (1 - b);
    const dy = k * dg;
    return makeQ(
      `【政策预判 · 乘数原理】\n已知边际消费倾向 β = ${b}，政府购买增加 ${dg} 亿元，其他条件不变。\n根据乘数原理，均衡国民收入 Y 将增加多少亿元？`,
      [
        { t: `增加 ${dy} 亿元`, ok: true },
        { t: `增加 ${dg} 亿元`, ok: false },
        { t: `增加 ${(dg / (1 + b)).toFixed(0)} 亿元`, ok: false },
        { t: `增加 ${(dy * 2).toFixed(0)} 亿元`, ok: false },
      ],
      `政府支出乘数 k_G = 1/(1−β) = ${k.toFixed(2)}，故 ΔY = ${k.toFixed(2)} × ${dg} = ${dy} 亿元。每一轮支出都成为下一轮收入，循环放大。`,
      'k_G = 1/(1−β)', '第13章 第2节');
  },

  /* 税收乘数 */
  multT() {
    const b = pick([0.75, 0.8, 0.9]);
    const dt = -rint(2, 6) * 10;   // 减税为负
    const k = -b / (1 - b);
    const dy = k * dt;             // 减税 → 产出增加（正数）
    return makeQ(
      `【政策预判 · 税收乘数】\n边际消费倾向 β = ${b}，政府实施减税 ΔT = ${dt} 亿元（减税）。\n均衡国民收入将如何变化？`,
      [
        { t: `增加 ${dy.toFixed(0)} 亿元`, ok: true },
        { t: `减少 ${dy.toFixed(0)} 亿元`, ok: false },
        { t: `增加 ${(-dt).toFixed(0)} 亿元`, ok: false },
        { t: `不变（税收不影响总需求）`, ok: false },
      ],
      `税收乘数 k_T = −β/(1−β) = ${k.toFixed(1)}，ΔY = ${k.toFixed(1)} × (${dt}) = +${dy.toFixed(0)} 亿元。税收先影响可支配收入，再按 β 转为消费，故力度小于政府购买。`,
      'k_T = −β/(1−β)', '第13章 第2节');
  },

  /* 平衡预算乘数 */
  balanced() {
    const dx = rint(3, 8) * 10;
    return makeQ(
      `【政策预判 · 平衡预算】\n政府同时增加购买与税收各 ${dx} 亿元（维持预算平衡）。\n均衡国民收入将增加多少亿元？`,
      [
        { t: `${dx} 亿元`, ok: true },
        { t: `0 亿元`, ok: false },
        { t: `${dx / 5} 亿元`, ok: false },
        { t: `${dx * 5} 亿元`, ok: false },
      ],
      `平衡预算乘数 = k_G + k_T = 1/(1−β) − β/(1−β) = 1。政府购买直接进入总需求，税收仅通过消费间接影响，两者恰好抵消后净效应等于初始支出规模。`,
      'k_B = k_G + k_T = 1', '第13章 第2节');
  },

  /* 支出法 GDP 核算 */
  gdpAccount() {
    const C = rint(50, 70), I = rint(15, 25), G = rint(14, 22), X = rint(18, 30), Mc = rint(12, 17);
    const gdp = C + I + G + (X - Mc);
    return makeQ(
      `【政策预判 · GDP 核算】\n某季度：消费 C=${C}、投资 I=${I}、政府购买 G=${G}、出口 X=${X}、进口 M=${Mc}（单位：万亿元）。\n按支出法，GDP = ？`,
      [
        { t: `${gdp} 万亿元`, ok: true },
        { t: `${C + I + G + X} 万亿元`, ok: false },
        { t: `${C + I + G} 万亿元`, ok: false },
        { t: `${gdp + Mc} 万亿元`, ok: false },
      ],
      `支出法：GDP = C + I + G + NX = ${C} + ${I} + ${G} + (${X} − ${Mc}) = ${gdp} 万亿元。注意进口是减项， GDP 衡量的是本国生产的最终产品。`,
      'GDP = C + I + G + NX', '第12章 第1节');
  },

  /* 法定准备金率与货币乘数 */
  rr() {
    const r1 = 0.1, r2 = 0.08;
    const B = pick([4000, 5000, 6000]);
    const dm = 1 / r2 - 1 / r1;
    const dmoney = B * dm;
    return makeQ(
      `【政策预判 · 货币乘数】\n法定准备金率由 10% 降至 8%，基础货币 ${B} 亿元不变，采用简单乘数 m = 1/rrd。\n货币供给将增加多少亿元？`,
      [
        { t: `${dmoney.toFixed(0)} 亿元`, ok: true },
        { t: `${(B * 0.02).toFixed(0)} 亿元`, ok: false },
        { t: `${(B / r2).toFixed(0)} 亿元`, ok: false },
        { t: `${(B / r1).toFixed(0)} 亿元`, ok: false },
      ],
      `m₁ = 1/10% = 10，m₂ = 1/8% = 12.5，ΔM = B×Δm = ${B} × 2.5 = ${dmoney.toFixed(0)} 亿元。准备金率的小幅变动经乘数放大后效果显著。`,
      'm = 1/rrd', '第16章 第2节');
  },

  /* 公开市场业务 */
  openMarket() {
    const db = pick([100, 200, 300]);
    const m = pick([4, 5, 6]);
    const dmoney = db * m;
    return makeQ(
      `【政策预判 · 公开市场操作】\n央行在二级市场买入国债 ${db} 亿元，当前货币乘数 m = ${m}。\n此举将使货币供给如何变化？`,
      [
        { t: `增加 ${dmoney} 亿元`, ok: true },
        { t: `减少 ${dmoney} 亿元`, ok: false },
        { t: `增加 ${db} 亿元`, ok: false },
        { t: `不变，仅利率结构变化`, ok: false },
      ],
      `央行买入债券即向市场投放基础货币 ${db} 亿元，经乘数放大：ΔM = ${db} × ${m} = ${dmoney} 亿元，LM 曲线右移。`,
      'ΔM = ΔB × m', '第16章 第2节');
  },

  /* 挤出效应（概念） */
  crowdOut() {
    return makeQ(
      `【政策预判 · 挤出效应】\n政府以增发国债融资扩大支出。在 IS-LM 框架下，该政策最可能带来的副作用是？`,
      [
        { t: '利率上升，挤出部分私人投资', ok: true },
        { t: '货币供给自动收缩', ok: false },
        { t: '自然失业率永久性上升', ok: false },
        { t: '本币必然大幅贬值', ok: false },
      ],
      '政府支出↑ → 收入Y↑ → 货币需求 kY↑ →（M 不变）利率 r↑ → 私人投资 I = I0 − d·r↓。这就是"挤出效应"，其大小取决于 LM 曲线的斜率。',
      'I = I0 − d·r', '第13章 第3节');
  },

  /* 供给冲击（概念） */
  supplyShock() {
    return makeQ(
      `【政策预判 · 供给冲击】\n国际油价大幅上涨。在 AD-AS 框架中，短期均衡将如何变化？`,
      [
        { t: '物价上升，产出下降（滞胀）', ok: true },
        { t: '物价下降，产出上升', ok: false },
        { t: '物价与产出同升', ok: false },
        { t: '仅物价上升，产出不变', ok: false },
      ],
      '油价上涨推高企业成本 → 短期总供给 SRAS 左移（上移）→ 均衡物价 P↑、产出 Y↓，出现"滞胀"。总需求管理政策对此类冲击效果有限。',
      'SRAS 左移：P↑ 且 Y↓', '第15章 第2节');
  },

  /* IS 曲线移动（概念） */
  isShift() {
    return makeQ(
      `【政策预判 · IS-LM 几何】\n下列哪一项会使 IS 曲线向右移动？`,
      [
        { t: '政府购买增加或减税', ok: true },
        { t: '央行买入债券投放货币', ok: false },
        { t: '物价水平下降', ok: false },
        { t: '自主性消费下降', ok: false },
      ],
      'IS 曲线由产品市场均衡导出：G↑、T↓、I0↑、NX↑ 等自发性支出增加都会使 IS 右移；央行买债影响的是 LM 曲线；物价下降是沿 AD 曲线的移动。',
      'IS：Y = C(Y−T) + I(r) + G + NX', '第14章 第1节');
  },

  /* 货币政策传导链条 */
  monetaryChain() {
    return makeQ(
      `【政策预判 · 传导机制】\n降息政策影响总产出的正确传导链条是？`,
      [
        { t: 'r↓ → I↑ → 总需求↑ → Y↑', ok: true },
        { t: 'I↑ → r↓ → Y↑ → AD↑', ok: false },
        { t: 'Y↑ → I↑ → r↓ → AD↑', ok: false },
        { t: 'r↓ → 储蓄↑ → 消费↑ → Y↑', ok: false },
      ],
      '利率是投资的机会成本：r↓ → I = I0 − d·r ↑ → 总需求扩张 → 经乘数放大为产出增加。注意"r↓ → 储蓄↑"混淆了利率的收入效应与替代效应。',
      'I = I0 − d·r → AD → Y', '第16章 第4节');
  },

  /* 净出口核算 */
  netExport() {
    const X = rint(18, 26), Mc = rint(12, 17);
    const nx = X - Mc;
    return makeQ(
      `【政策预判 · 国际收支】\n某季度出口 X = ${X} 万亿元，进口 M = ${Mc} 万亿元。\n净出口 NX 与其对总需求的作用方向是？`,
      [
        { t: `NX = ${nx} 万亿元，正向拉动总需求`, ok: nx >= 0, },
        { t: `NX = ${nx} 万亿元，负向拖累总需求`, ok: nx < 0 },
        { t: `NX = ${X + Mc} 万亿元，正向拉动`, ok: false },
        { t: `NX = 0，不影响总需求`, ok: false },
      ],
      `NX = X − M = ${X} − ${Mc} = ${nx} 万亿元。顺差（NX>0）为总需求的净注入，逆差则为净漏出。贸易政策通过改变 X、M 影响均衡产出。`,
      'NX = X − M', '第18章 第1节');
  },

  /* 汇率贬值（概念） */
  devalue() {
    return makeQ(
      `【政策预判 · 汇率政策】\n本币贬值改善贸易收支的前提条件是？`,
      [
        { t: '进出口需求弹性之和大于 1（马歇尔-勒纳条件）', ok: true },
        { t: '国内利率高于国外利率', ok: false },
        { t: '通货膨胀率等于零', ok: false },
        { t: '资本账户完全开放', ok: false },
      ],
      '马歇尔-勒纳条件：|εx| + |εm| > 1。不满足时贬值反而恶化贸易收支；即使满足，短期也可能先恶化后改善（J 曲线效应）。',
      '|εx| + |εm| > 1', '第18章 第2节');
  },
};

/* =========================================================
   做题流程控制
   ========================================================= */
const Quiz = {
  current: null,   // 当前题目
  card: null,      // 当前政策卡
  onDone: null,    // 回调 correct => {}

  /* 打开做题弹窗。card: 政策卡；onDone(correct) 由 game.js 提供 */
  start(card, onDone) {
    this.card = card;
    this.onDone = onDone;
    this.current = QUIZ_GEN[card.quiz]();
    this.answered = false;

    document.getElementById('quiz-card-name').textContent = `${card.icon} ${card.name} · 政策预判题`;
    document.getElementById('quiz-stamp').className = '';
    document.getElementById('quiz-stamp').textContent = '';
    document.getElementById('quiz-chapter').textContent = `📚 ${this.current.chapter} · ${card.formula}`;
    document.getElementById('quiz-question').innerHTML =
      this.current.text.replace(/\n/g, '<br>');
    document.getElementById('quiz-explain').classList.add('hidden');
    document.getElementById('quiz-close').classList.add('hidden');

    const box = document.getElementById('quiz-options');
    box.innerHTML = '';
    this.current.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'quiz-opt';
      btn.textContent = String.fromCharCode(65 + i) + '. ' + opt;
      btn.onclick = () => this.answer(i);
      box.appendChild(btn);
    });
    document.getElementById('quiz-modal').classList.remove('hidden');
  },

  /* 作答判定 */
  answer(i) {
    if (this.answered) return;
    this.answered = true;
    const correct = i === this.current.ans;
    this.correct = correct;
    const btns = document.querySelectorAll('#quiz-options .quiz-opt');
    btns.forEach((b, j) => {
      b.disabled = true;
      if (j === this.current.ans) b.classList.add('right');
      else if (j === i) b.classList.add('wrong');
    });

    /* 红章批注 + 解析 */
    const stamp = document.getElementById('quiz-stamp');
    stamp.className = correct ? 'ok' : 'no';
    stamp.textContent = correct ? '✔ 答对' : '✘ 答错';
    const exp = document.getElementById('quiz-explain');
    exp.classList.remove('hidden');
    exp.innerHTML = `<b>${correct ? '回答正确，政策全额生效！' : '回答有误，政策效果减半！'}</b>` +
      `<span class="fx">${this.current.formula}</span>${this.current.explain}`;
    document.getElementById('quiz-close').classList.remove('hidden');
    document.getElementById('quiz-close').textContent = '确认执行 ▶';

    /* 记录到错题本 */
    if (!correct && window.game) game.addWrong(this.current, this.card);
    if (correct && window.game) game.quizRight++;
  },

  close() {
    document.getElementById('quiz-modal').classList.add('hidden');
    if (this.onDone) { const cb = this.onDone; this.onDone = null; cb(!!this.correct); }
  },
};

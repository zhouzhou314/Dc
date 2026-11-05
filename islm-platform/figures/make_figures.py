# -*- coding: utf-8 -*-
"""为征文生成三张插图（数据与论文正文/表 1 严格一致，不发明内容）。

图 1  平台总体架构（示意，四层堆叠 + 侧向数据流）
图 2  阶梯导学与三级防泄露链路（A/B 双面板示意）
图 3  不同 LM 斜率下的挤出效应（quantitative，数据 = 论文表 1）
图 4  多人政策博弈模拟（轮流决策 → 同一 IS-LM 求解器 → 仪表盘/五维评分）
图 5  防泄露守门链真实触发记录（拦截 → 重试 → 降级 → 留痕，与 hintService/leakGuard 实现一致）

导出：SVG/PDF 矢量 + 600 dpi PNG；正文嵌入宽度 14.5 cm（图 3 为 12.5 cm）。
"""
import math
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patheffects as pe
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Polygon
from pathlib import Path

SKILL_SCRIPTS = r"C:\Users\周\.trae-cn\skills\nature-figure\scripts"
if SKILL_SCRIPTS not in sys.path:
    sys.path.insert(0, SKILL_SCRIPTS)
from audit_panel_alignment import require_matplotlib_panel_alignment

OUT = Path(__file__).resolve().parent

plt.rcParams.update({
    "font.sans-serif": ["Microsoft YaHei", "SimHei"],
    "font.family": "sans-serif",
    "axes.unicode_minus": False,
    "pdf.fonttype": 42,
    "svg.fonttype": "none",
    "font.size": 9,
})

INK = "#333333"
GRAY = "#666666"
ARROW = "#7A7A7A"


def est_w(fig, ax, text, fs):
    """估算文本宽度（该 axes 横轴单位）。"""
    pos = ax.get_position()
    unit_cm = fig.get_figwidth() * 2.54 * pos.width / 100.0
    n_cjk = sum(1 for c in text if ord(c) > 0x2E7F)
    n_other = len(text) - n_cjk
    w_cm = (n_cjk * fs + n_other * 0.56 * fs) / 28.35 + 0.16
    return w_cm / unit_cm


def rbox(ax, cx, cy, w, h, aspect, fc, ec, lw=1.0, dashed=False, rounding=1.2):
    p = FancyBboxPatch((cx - w / 2, cy - h / 2), w, h,
                       boxstyle=f"round,pad=0,rounding_size={rounding}",
                       mutation_aspect=aspect, fc=fc, ec=ec, lw=lw,
                       linestyle=(0, (3, 2)) if dashed else "solid")
    ax.add_patch(p)


def diamond(ax, cx, cy, w, h, aspect, fc, ec):
    pts = [(cx, cy + h / 2 / aspect), (cx + w / 2, cy),
           (cx, cy - h / 2 / aspect), (cx - w / 2, cy)]
    ax.add_patch(Polygon(pts, closed=True, fc=fc, ec=ec, lw=1.0))


def arrow(ax, p0, p1, color=ARROW, lw=1.1, both=False, dashed=False, rad=0.0, ms=9):
    a = FancyArrowPatch(p0, p1, arrowstyle="<|-|>" if both else "-|>",
                        mutation_scale=ms, color=color, lw=lw,
                        connectionstyle=f"arc3,rad={rad}",
                        linestyle=(0, (3, 2)) if dashed else "solid",
                        shrinkA=1.5, shrinkB=1.5)
    ax.add_patch(a)


def txt(ax, x, y, s, fs=8, bold=False, color=INK, ha="center", va="center", rot=0):
    ax.text(x, y, s, fontsize=fs, fontweight="bold" if bold else "normal",
            color=color, ha=ha, va=va, rotation=rot, rotation_mode="anchor",
            linespacing=1.35)


def save_all(fig, name, dpi=600):
    """按 QA 规范导出：矢量（svg+pdf）+ 高分辨率位图（png）。"""
    fig.savefig(OUT / f"{name}.svg")
    fig.savefig(OUT / f"{name}.pdf")
    fig.savefig(OUT / f"{name}.png", dpi=dpi)
    plt.close(fig)
    print(OUT / f"{name}.png")


# ----------------------------------------------------------------------
def fig1():
    """图 1：平台总体架构（四层）。"""
    fw, fh = 14.5 / 2.54, 11.2 / 2.54
    fig = plt.figure(figsize=(fw, fh))
    ax = fig.add_axes([0.004, 0.004, 0.992, 0.992])
    ax.set_xlim(0, 100); ax.set_ylim(0, 100); ax.axis("off")
    aspect = fw / fh

    bands = [  # (名称, 副名, fc, ec, 芯片列表)
        ("① 交互层", "（前端）", "#EDF3FA", "#7FA3C8",
         ["Vue 3 ＋ ECharts", "九参数 IS-LM 交互仿真", "阶梯提示界面·解锁确认", "错题本与练习页"]),
        ("② AI 增强层", "（核心创新）", "#E9F3EA", "#79A87E",
         ["L1~L4 阶梯导学", "三级防泄露链路", "Function Calling 智能体", "混合检索：TF-IDF＋向量"]),
        ("③ 学习分析层", "", "#FBF3E2", "#C9A05C",
         ["BKT 知识追踪", "三因子练习推荐", "SM-2 复习排期", "行为日志"]),
        ("④ 平台工程层", "", "#EFEFF4", "#9B97B8",
         ["Node.js（Express）", "MySQL", "豆包大模型（火山方舟）", "Docker 一键部署", "三重降级"]),
    ]
    y_bot = [79.5, 53.5, 27.5, 1.5]   # 自上而下
    h_band = 19.5

    for (name, sub, fc, ec, chips), yb in zip(bands, y_bot):
        cy = yb + h_band / 2
        rbox(ax, 45.5, cy, 87, h_band, aspect, fc, ec, lw=1.1, rounding=1.0)
        # 层名行（带内上部），副名紧跟其后
        txt(ax, 4.0, cy + 6.1, name, fs=8.0, bold=True, ha="left")
        if sub:
            nw = est_w(fig, ax, name, 8.0) * 1.10  # 粗体补偿
            txt(ax, 4.0 + nw + 1.6, cy + 6.1, sub, fs=6.6, color=GRAY, ha="left")
        # 芯片单行排布（字号逐级回退，区间内居中）
        for fs in (7.2, 6.8, 6.5, 6.0):
            ws = [est_w(fig, ax, c, fs) + 2.4 for c in chips]
            gap = 1.6
            total = sum(ws) + gap * (len(chips) - 1)
            if total <= 82.0 or fs == 6.0:
                break
        x = 4.5 + (82.0 - total) / 2
        for c, w in zip(chips, ws):
            rbox(ax, x + w / 2, cy - 2.4, w, 9.2, aspect, "#FFFFFF", ec, lw=0.9, rounding=0.8)
            txt(ax, x + w / 2, cy - 2.4, c, fs=fs)
            x += w + gap

    # 层间箭头（双向）
    for yb0, yb1 in [(79.5, 73.0), (53.5, 47.0), (27.5, 21.0)]:
        arrow(ax, (43, yb0), (43, yb1), both=True)
    txt(ax, 47.5, 76.2, "请求 / SSE 回放", fs=6.6, color=GRAY, ha="left")

    # 侧向数据流：交互层 ↔ 学习分析层
    arrow(ax, (92.5, 89), (92.5, 37), both=True, lw=1.0)
    txt(ax, 96.0, 63, "作答·解锁行为数据 与 练习·复习排期", fs=6.6, color=GRAY, rot=90)

    # “核心创新”角标
    rbox(ax, 83, 74.6, 12.5, 5.2, aspect, "#79A87E", "#79A87E", rounding=0.8)
    txt(ax, 83, 74.6, "核心创新", fs=6.4, color="#FFFFFF", bold=True)

    save_all(fig, "fig1_architecture")


# ----------------------------------------------------------------------
def fig2():
    """图 2：阶梯导学（A）与三级防泄露链路（B）。"""
    fw, fh = 14.5 / 2.54, 8.8 / 2.54
    fig = plt.figure(figsize=(fw, fh))
    gs = fig.add_gridspec(1, 2, width_ratios=[0.40, 0.60], wspace=0.02,
                          left=0.004, right=0.996, top=0.996, bottom=0.004)
    axA = fig.add_subplot(gs[0]); axA.set_xlim(0, 100); axA.set_ylim(0, 100); axA.axis("off")
    axB = fig.add_subplot(gs[1]); axB.set_xlim(0, 100); axB.set_ylim(0, 100); axB.axis("off")
    aspA = (fw * 0.40 / 100) / (fh * 0.992 / 100)
    aspB = (fw * 0.60 / 100) / (fh * 0.992 / 100)

    # ---- 面板 A：L1~L4 阶梯 ----
    txt(axA, 50, 97.5, "（A）L1~L4 阶梯导学", fs=8.0, bold=True)
    steps = [  # (cx, cy, w, h, fc, 标签, 内容)
        (15, 20, 21, 13, "#EDF3FA", "L1", "宏观方向"),
        (41, 43, 37, 13, "#D8E6F4", "L2", "关键条件＋知识卡"),
        (68, 65, 41, 13, "#C2D8ED", "L3", "思路框架·末步留白"),
        (80, 87, 37, 14, "#AAC9E4", "L4", "完整解析＋二次确认"),
    ]
    for cx, cy, w, h, fc, lab, desc in steps:
        rbox(axA, cx, cy, w, h, aspA, fc, "#4472A8", lw=1.0, rounding=1.0)
        txt(axA, cx, cy + 3.0, lab, fs=7.8, bold=True, color="#2F4F73")
        txt(axA, cx, cy - 3.2, desc, fs=6.8)
    arrow(axA, (23, 25.5), (28, 36.5), rad=-0.25)
    arrow(axA, (50, 48.5), (55, 58.5), rad=-0.25)
    arrow(axA, (77, 70.5), (79, 80), rad=-0.2)
    txt(axA, 30, 30.5, "逐级解锁", fs=6.2, color=GRAY)
    txt(axA, 50, 9.5, "层级单调递增、不可回退", fs=7.0, color=GRAY)
    txt(axA, 50, 3.5, "困惑重试：按当前层级重新生成、不越级", fs=7.0, color=GRAY)

    # ---- 面板 B：三级防泄露链路 ----
    txt(axB, 50, 97.5, "（B）三级防泄露链路", fs=8.0, bold=True)
    rbox(axB, 30, 90, 32, 6.5, aspB, "#F3F3F3", "#AAAAAA", lw=0.9, rounding=0.8)
    txt(axB, 30, 90, "学生请求 L1~L4 提示", fs=7.0)
    arrow(axB, (30, 86.7), (30, 83))
    # ① 源头过滤
    rbox(axB, 30, 77, 58, 11, aspB, "#EDF3FA", "#4472A8", lw=1.1)
    txt(axB, 30, 80.2, "① 源头过滤：构造提示词", fs=7.4, bold=True)
    txt(axB, 30, 73.9, "官方答案字段恒为“（按规则隐藏）”", fs=6.6)
    arrow(axB, (30, 71.5), (30, 67))
    rbox(axB, 30, 62.5, 40, 8.5, aspB, "#F7F7F7", "#AAAAAA", lw=0.9, rounding=0.8)
    txt(axB, 30, 62.5, "大模型生成完整回复", fs=7.2)
    arrow(axB, (30, 58.2), (30, 55))
    # ② 输出校验
    rbox(axB, 30, 50, 54, 9.5, aspB, "#EDF3FA", "#4472A8", lw=1.1)
    txt(axB, 30, 50, "② 输出校验：正则扫描数值与选项字母", fs=7.2, bold=True)
    arrow(axB, (30, 45.2), (30, 40.5))
    diamond(axB, 30, 36, 20, 9, aspB, "#FFF8EC", "#C9A05C")
    txt(axB, 30, 36, "校验通过？", fs=6.6)
    arrow(axB, (30, 31.4), (30, 22.2))
    txt(axB, 32.5, 27, "是", fs=6.8, ha="left", color=GRAY)
    rbox(axB, 30, 16, 48, 12, aspB, "#E9F3EA", "#4E8A57", lw=1.1)
    txt(axB, 30, 19.2, "完整生成 → SSE 分段回放", fs=7.2, bold=True)
    txt(axB, 30, 12.9, "打字机体验＋100% 安全审查", fs=6.4, color=GRAY)
    # 否 → 重试 → 降级
    arrow(axB, (40.4, 36), (61.5, 36))
    txt(axB, 45.5, 38.3, "否", fs=6.8, color=GRAY)
    rbox(axB, 74, 36, 24, 13, aspB, "#FBF3E2", "#C9A05C", lw=1.0, dashed=True)
    txt(axB, 74, 39.2, "追加严厉提醒", fs=7.0)
    txt(axB, 74, 33.2, "重试一次", fs=7.0)
    arrow(axB, (74, 29.4), (74, 22.3))
    txt(axB, 76.3, 25.7, "仍不合格", fs=6.2, ha="left", color=GRAY)
    rbox(axB, 74, 16, 34, 12, aspB, "#F9ECEA", "#B3544C", lw=1.1)
    txt(axB, 74, 19.2, "③ 降级：直出知识卡", fs=7.2, bold=True)
    txt(axB, 74, 12.9, "绝不静默失败", fs=6.4, color=GRAY)
    # 重试回路（虚线）
    arrow(axB, (74, 42.6), (50.5, 62), dashed=True, rad=-0.25, lw=0.9)
    txt(axB, 72, 54, "再生成 → 再校验", fs=6.2, color=GRAY)

    require_matplotlib_panel_alignment(fig)
    save_all(fig, "fig2_leakguard")


# ----------------------------------------------------------------------
def fig3():
    """图 3：不同 LM 斜率下的挤出效应（数据 = 论文表 1）。"""
    fig = plt.figure(figsize=(4.92, 3.30))
    ax = fig.add_axes([0.125, 0.145, 0.705, 0.775])

    x = [0, 1, 2]
    dY = [14.3, 125.0, 166.7]
    ex = [94.3, 50.0, 33.3]

    ax.axhline(250, ls=(0, (4, 3)), color="#B3544C", lw=1.0, zorder=1)
    ax.bar(x, dY, width=0.52, color="#6B9AC4", edgecolor="#3D6B9E",
           linewidth=0.8, zorder=2)
    for xi, v in zip(x, dY):
        ax.text(xi, v + 8, f"+{v:.1f}", ha="center", fontsize=8.2, color="#2F4F73")
    ax.text(2.42, 255, "简单乘数效应 250", ha="right", fontsize=7.2, color="#B3544C")

    ax.set_xlim(-0.55, 2.55)
    ax.set_ylim(0, 288)
    ax.set_xticks(x)
    ax.set_xticklabels(["h = 10", "h = 25", "h = 50"], fontsize=8.5)
    ax.set_xlabel("货币需求的利率敏感系数 h", fontsize=8.5)
    ax.set_ylabel("产出增量 ΔY", fontsize=8.5)
    ax.tick_params(labelsize=8, length=2.5)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)

    ax2 = ax.twinx()
    ax2.plot(x, ex, "-o", color="#C0704F", lw=1.4, ms=4.5, zorder=3)
    for xi, v in zip(x, ex):
        ax2.text(xi, v - 9, f"{v:.1f}%", ha="center", fontsize=7.8, color="#A05A3C",
                 path_effects=[pe.withStroke(linewidth=2.2, foreground="white")])
    ax2.set_ylim(0, 112)
    ax2.set_ylabel("挤出比例", fontsize=8.5)
    ax2.tick_params(labelsize=8, length=2.5, colors="#8A5A3A")
    ax2.spines["top"].set_visible(False)
    ax2.spines["right"].set_color("#BBBBBB")

    ax.text(0.98, 0.985, "h 越小，LM 越陡峭，挤出效应越强",
            transform=ax.transAxes, ha="right", va="top",
            fontsize=7.5, color=GRAY)

    save_all(fig, "fig3_crowding_out")


# ----------------------------------------------------------------------
def fig4():
    """图 4：多人政策博弈模拟（角色与决策字段、五维评分名称与平台代码一致）。"""
    fw, fh = 14.5 / 2.54, 9.6 / 2.54
    fig = plt.figure(figsize=(fw, fh))
    ax = fig.add_axes([0.004, 0.004, 0.992, 0.992])
    ax.set_xlim(0, 100); ax.set_ylim(0, 100); ax.axis("off")
    aspect = fw / fh

    # ---- 顶部：四个角色（按固定顺序轮流决策） ----
    txt(ax, 50, 96.9, "按固定顺序轮流决策 · 多轮循环", fs=6.6, color=GRAY)
    roles = [  # (cx, 序号, 名称, 字段行 1, 字段行 2, fc, ec)
        (13.5, "①", "政府（含央行）", "政府购买·税收·转移支付·公债", "货币供给·净出口",
         "#FBF1E1", "#C98836"),
        (37.5, "②", "银行", "准备金·信贷投放", "流动性·存款利率", "#E8F2FC", "#3E8ED6"),
        (61.5, "③", "企业", "投资·雇佣", "融资·定价", "#EDF7EA", "#5FA344"),
        (85.5, "④", "消费者", "消费·储蓄", "资产配置·借贷", "#FCEDED", "#D96C6C"),
    ]
    BW, BH, BY = 21.5, 17.0, 84.0
    for cx, no, name, f1, f2, fc, ec in roles:
        rbox(ax, cx, BY, BW, BH, aspect, fc, ec, lw=1.1, rounding=1.0)
        txt(ax, cx, BY + 5.7, f"{no} {name}", fs=7.3, bold=True)
        txt(ax, cx, BY + 0.9, f1, fs=5.4)
        txt(ax, cx, BY - 3.6, f2, fs=5.4)
    for x0, x1 in [(24.5, 26.5), (48.5, 50.5), (72.5, 74.5)]:
        arrow(ax, (x0, BY), (x1, BY), ms=5.5, lw=1.0)

    # ---- 中部：决策实时汇入同一 IS-LM 求解器 ----
    for sx, tx in [(13.5, 43), (37.5, 47), (61.5, 53), (85.5, 57)]:
        arrow(ax, (sx, BY - BH / 2 - 0.3), (tx, 63.3), ms=7)
    rbox(ax, 50, 55, 22, 16, aspect, "#F3F3F3", "#8A8A8A", lw=1.2, rounding=1.0)
    txt(ax, 50, 60.4, "后端 IS-LM 求解器", fs=7.6, bold=True)
    txt(ax, 50, 55.6, "决策实时汇入 · 同一均衡", fs=6.0, color=GRAY)
    txt(ax, 50, 50.9, "计算新均衡 Y*、r*", fs=6.4)

    # ---- 右：宏观仪表盘（实时刷新） ----
    arrow(ax, (61.3, 53), (66.6, 53), ms=7)
    txt(ax, 64.0, 55.8, "刷新", fs=5.6, color=GRAY)
    rbox(ax, 81.5, 53, 29, 24, aspect, "#FBFBFD", "#8A8A8A", lw=1.1, rounding=1.0)
    txt(ax, 81.5, 61.8, "宏观仪表盘（实时刷新）", fs=7.2, bold=True)
    chips = [("GDP 增速", "#409EFF", "#EAF3FC"), ("失业率", "#F56C6C", "#FDEEEE"),
             ("通胀率", "#E6A23C", "#FCF4E6"), ("利率", "#67C23A", "#EFF8EA")]
    for i, (lab, ec, fc) in enumerate(chips):
        cy = 57.3 - i * 4.7
        rbox(ax, 81.5, cy, 25.5, 4.2, aspect, fc, ec, lw=0.9, rounding=0.7)
        txt(ax, 81.5, cy, lab, fs=6.6)
    # 下一轮循环（虚线回角色）
    arrow(ax, (88, 65.2), (88, 75.1), dashed=True, ms=6)
    txt(ax, 90, 70.2, "下一轮", fs=5.6, color=GRAY, ha="left")

    # ---- 左下：终局五维雷达（评分维度模板，不含虚构数据） ----
    cxr, cyr, R = 20, 22, 11
    dims = [("GDP 恢复度", 90, "center", 0, 1.7), ("失业率控制", 162, "right", -1.5, 0),
            ("通胀控制", 234, "right", -1.5, -0.6), ("债务可持续性", 306, "left", 1.5, -0.6),
            ("政策协调度", 18, "left", 1.5, 0)]
    pts = [(cxr + R * math.cos(math.radians(a)), cyr + R * math.sin(math.radians(a)))
           for _, a, _, _, _ in dims]
    for frac, ls, col in [(1.0, "solid", "#C8C8C8"), (0.55, (0, (2, 2)), "#D8D8D8")]:
        xs = [cxr + R * frac * math.cos(math.radians(a)) for a in (90, 162, 234, 306, 18)]
        ys = [cyr + R * frac * math.sin(math.radians(a)) for a in (90, 162, 234, 306, 18)]
        ax.plot(xs + [xs[0]], ys + [ys[0]], ls=ls, lw=0.8, color=col, zorder=1)
    for (px, py) in pts:
        ax.plot([cxr, px], [cyr, py], lw=0.6, color="#DCDCDC", zorder=1)
    ax.plot([cxr], [cyr], marker="o", ms=2.2, color="#AAAAAA", zorder=2)
    for (lab, a, ha, dx, dy) in dims:
        px, py = cxr + R * math.cos(math.radians(a)), cyr + R * math.sin(math.radians(a))
        txt(ax, px + dx, py + dy, lab, fs=6.0, ha=ha)
    txt(ax, cxr, 38.8, "终局五维雷达评分", fs=7.2, bold=True)

    # ---- 对局结束 → 终局评分（虚线，绕开仪表盘与价值框） ----
    arrow(ax, (66, 40), (30.5, 37.5), dashed=True, ms=6, rad=0.10)
    txt(ax, 48, 43.0, "对局结束", fs=6.0, color=GRAY)

    # ---- 右下：博弈价值 ----
    rbox(ax, 81, 23, 36, 26, aspect, "#F7F9F7", "#8A8A8A", lw=1.1, rounding=1.0)
    txt(ax, 81, 32.4, "博弈价值：牵一发而动全身", fs=7.0, bold=True)
    for i, s in enumerate([
        "政府扩张 → 利率↑ → 挤出企业投资",
        "银行收缩信贷 → 抵消财政刺激",
        "任何一方都无法独善其身，须协商协调",
        "兼顾增长、物价、就业与国际收支四大目标",
    ]):
        txt(ax, 81, 28.2 - i * 4.3, "· " + s, fs=6.0)

    save_all(fig, "fig4_game")


# ----------------------------------------------------------------------
def fig5():
    """图 5：防泄露守门链真实触发记录（拦截 → 重试 → 降级 → 留痕）。"""
    fw, fh = 14.5 / 2.54, 10.2 / 2.54
    fig = plt.figure(figsize=(fw, fh))
    ax = fig.add_axes([0.004, 0.004, 0.992, 0.992])
    ax.set_xlim(0, 100); ax.set_ylim(0, 100); ax.axis("off")
    aspect = fw / fh

    # ---- 顶部标头 ----
    txt(ax, 50, 97.2, "输出侧防泄露守门链 · 开发期真实触发一次", fs=6.6, color=GRAY)

    # ---- 五阶段链条 ----
    BW, BH, BY = 17.5, 14.0, 86.0
    chain = [
        (10.75, "① 模型生成", "按 L2 模板输出 JSON", "#F4F6F8", "#8A8A8A"),
        (30.25, "② 泄露校验", "结构·层级·数值扫描", "#E8F2FC", "#3E8ED6"),
        (49.75, "③ 拦截·提醒重试", "错误输出回填上下文", "#FCEDED", "#D96C6C"),
        (69.25, "④ 降级直出知识卡", "solution = null", "#FCF4E6", "#E6A23C"),
        (88.75, "⑤ 落库 hint_log", "degraded = 1 留痕", "#EDF7EA", "#5FA344"),
    ]
    for cx, t, sub, fc, ec in chain:
        rbox(ax, cx, BY, BW, BH, aspect, fc, ec, lw=1.1, rounding=1.0)
        txt(ax, cx, BY + 4.6, t, fs=6.9, bold=True)
        txt(ax, cx, BY - 4.3, sub, fs=5.2, color=GRAY)
    for x0, x1 in [(19.7, 21.3), (39.2, 40.8), (58.7, 60.3), (78.2, 79.8)]:
        arrow(ax, (x0, BY), (x1, BY), ms=5.5, lw=1.0)
    txt(ax, 40.25, 94.4, "未通过", fs=4.8, color=GRAY)
    txt(ax, 59.75, 94.4, "复检仍未通过", fs=4.8, color=GRAY)
    txt(ax, 30.25, 76.4, "扫描数值变体：1266.67 / 1266.7 / 1267", fs=5.0, color=GRAY)

    # ---- 真实触发运行记录 ----
    txt(ax, 50, 70.6, "真实触发运行记录（某次 L2 提示）", fs=7.2, bold=True)
    rbox(ax, 50, 39.5, 96, 41, aspect, "#FFFFFF", "#C8CDD3", lw=1.0, rounding=0.8)
    rbox(ax, 50, 55.5, 96, 7, aspect, "#EEF1F4", "#C8CDD3", lw=0.8, rounding=0.8)
    txt(ax, 11, 55.5, "阶段", fs=6.2, bold=True)
    txt(ax, 41.5, 55.5, "系统动作", fs=6.2, bold=True)
    txt(ax, 80.5, 55.5, "结果", fs=6.2, bold=True)
    rows = [
        ("第1轮 生成·校验", "模型输出内含答案数值 1266.67，泄露扫描命中变体", "拦截（1266.67）", "#B3544C"),
        ("第2轮 提醒重试", "错误输出与严厉提醒回填上下文，再生成并复检", "仍不合格", "#B3544C"),
        ("自动降级", "直出知识库快照前 2 块知识卡原文，solution = null", "无答案外泄", "#4E8A57"),
        ("完整记录", "hint_log 落库：模型、token 用量、内容、degraded = 1", "可回溯审计", GRAY),
    ]
    for i, (a, b, c, cc) in enumerate(rows):
        cy = 46.9 - i * 7.8
        if i:
            ax.plot([3, 97], [cy + 3.9, cy + 3.9], lw=0.7, color="#E3E6EA")
        txt(ax, 11, cy, a, fs=6.0, bold=True)
        txt(ax, 41.5, cy, b, fs=5.6)
        txt(ax, 80.5, cy, c, fs=5.8, bold=True, color=cc)

    # ---- 结果条与脚注 ----
    rbox(ax, 50, 12, 96, 8.5, aspect, "#F0F7EC", "#5FA344", lw=1.1, rounding=0.9)
    txt(ax, 50, 12, "结果：学生仅收到知识卡原文与引导问题，未见任何答案数值——全程无外泄、完整留痕", fs=6.2, bold=True)
    txt(ax, 50, 3.4, "注：校验合格则直接返回提示；检索侧（retriever）还会预先剔除含答案数值的知识块，输出侧为最后一道闸。", fs=5.0, color=GRAY)

    save_all(fig, "fig5_leak_incident")


if __name__ == "__main__":
    fns = {"1": fig1, "2": fig2, "3": fig3, "4": fig4, "5": fig5}
    keys = sys.argv[1:] or list(fns)
    for k in keys:
        fns[k]()

import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Polygon, Rectangle
import matplotlib.font_manager as fm

FONT = "C:/Windows/Fonts/msyh.ttc"
FP = fm.FontProperties(fname=FONT)
plt.rcParams["font.sans-serif"] = ["Microsoft YaHei"]
plt.rcParams["axes.unicode_minus"] = False
OUT = r"D:\HZYJ\figs"

BLUE = "#1F4E79"
BLUE_D = "#173B5C"
BG = "#E9EEF4"
GREY = "#8C9AAB"

fig, ax = plt.subplots(figsize=(8.0, 4.15))
ax.set_xlim(0, 8.0); ax.set_ylim(0, 4.15); ax.axis("off")
fig.patch.set_facecolor("white")

# 顶部浅色带 + 左侧飘带
ax.add_patch(Rectangle((0, 3.42), 8.0, 0.73, facecolor=BG, edgecolor="none", zorder=0))
ax.add_patch(Polygon([[0, 4.15], [0.62, 4.15], [0.92, 3.79], [0.62, 3.42], [0, 3.42]],
                     closed=True, facecolor=BLUE, edgecolor="none", zorder=1))
ax.add_patch(Polygon([[0, 3.42], [0.62, 3.42], [0.92, 3.79], [0.62, 4.15], [0, 4.15]],
                     closed=False, facecolor="none", edgecolor="none", zorder=1))


def rbox(x, y, w, h, fc=BLUE, shadow=True):
    if shadow:
        ax.add_patch(FancyBboxPatch((x + 0.035, y - 0.035), w, h,
                                    boxstyle="round,pad=0.005,rounding_size=0.045",
                                    linewidth=0, facecolor="#B7C3D2", zorder=1))
    ax.add_patch(FancyBboxPatch((x, y), w, h,
                                boxstyle="round,pad=0.005,rounding_size=0.045",
                                linewidth=0, facecolor=fc, zorder=2))


# 顶层标题
rbox(2.55, 3.24, 2.90, 0.52)
ax.text(4.00, 3.50, "宏奕智学 · 功能模块", ha="center", va="center",
        fontsize=11.5, fontproperties=FP, color="white", fontweight="bold", zorder=3)

modules = [
    ("决策沙盘", ["四角色对局", "情景与冲击"]),
    ("AI 导学", ["阶梯提示", "质询答辩"]),
    ("学情分析", ["知识追踪", "决策画像"]),
    ("课堂工具", ["开课收卷", "一键讲评"]),
    ("内容中台", ["情景题库", "知识图谱"]),
    ("教师端", ["班级看板", "教学简报"]),
]

MW, MH = 1.05, 0.44
MY = 2.40
centers = [0.90 + i * 1.24 for i in range(6)]

# 主干连接线
ax.plot([4.00, 4.00], [3.24, 3.02], color=GREY, lw=1.2, zorder=0)
ax.plot([centers[0], centers[-1]], [3.02, 3.02], color=GREY, lw=1.2, zorder=0)

for cx, (name, subs) in zip(centers, modules):
    ax.add_patch(FancyArrowPatch((cx, 3.02), (cx, MY + MH + 0.01), arrowstyle="-|>",
                                 mutation_scale=8, linewidth=1.1, color=GREY, zorder=1))
    rbox(cx - MW / 2, MY, MW, MH)
    ax.text(cx, MY + MH / 2, name, ha="center", va="center", fontsize=9.2,
            fontproperties=FP, color="white", fontweight="bold", zorder=3)

    sub_y, sub_h, sub_w = 0.55, 1.58, 0.30
    xs = [cx - 0.27, cx + 0.27]
    # 模块到子项的连线
    ax.plot([cx, cx], [MY, MY - 0.18], color=GREY, lw=1.0, zorder=0)
    ax.plot([xs[0], xs[1]], [MY - 0.18, MY - 0.18], color=GREY, lw=1.0, zorder=0)
    for sx, sub in zip(xs, subs):
        ax.add_patch(FancyArrowPatch((sx, MY - 0.18), (sx, sub_y + sub_h + 0.01),
                                     arrowstyle="-|>", mutation_scale=8, linewidth=1.0,
                                     color=GREY, zorder=1))
        rbox(sx - sub_w / 2, sub_y, sub_w, sub_h)
        ax.text(sx, sub_y + sub_h / 2, sub, ha="center", va="center", fontsize=8.6,
                fontproperties=FP, color="white", rotation=90, zorder=3)

fig.tight_layout(pad=0.05)
fig.savefig(os.path.join(OUT, "fig_func.png"), dpi=300, bbox_inches="tight", facecolor="white")
plt.close(fig)
print("saved", os.path.getsize(os.path.join(OUT, "fig_func.png")))

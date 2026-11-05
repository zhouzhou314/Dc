/**
 * 资源库 & 问答社区 初始示例数据
 * -------------------------------------------------
 * 首次打开应用时写入 store（localStorage 为空时使用），
 * 之后用户上传/提问的数据会自动持久化。
 */
import { todayStr } from '@/utils/storage'

/** 学习资源库示例数据 */
export const mockResources = [
  {
    id: 'r1', title: '第11章 国民收入的决定：IS-LM模型（课件）',
    category: '课件', size: '2.4 MB', uploader: '王老师', date: todayStr(), downloads: 128,
    desc: '华东理工大学商学院《西方经济学》第十一章课件，含 IS/LM 推导与四区域图。'
  },
  {
    id: 'r2', title: 'IS-LM模型知识点总结（学霸笔记）',
    category: '笔记', size: '680 KB', uploader: '李同学', date: todayStr(), downloads: 96,
    desc: '手写整理：IS/LM 斜率含义、移动因素、流动性陷阱、凯恩斯极端与古典极端对比表。'
  },
  {
    id: 'r3', title: '2025学年期末试卷（宏观经济学 A卷）',
    category: '往年试卷', size: '1.1 MB', uploader: '张同学', date: todayStr(), downloads: 215,
    desc: '含 IS-LM 计算大题 2 道（联立求解 + 挤出效应分析），附参考答案。'
  },
  {
    id: 'r4', title: '第十一章复习提纲（考前速记版）',
    category: '复习提纲', size: '320 KB', uploader: '陈同学', date: todayStr(), downloads: 87,
    desc: '按"定义→方程→图像→政策"四步整理，10 分钟过完本章核心考点。'
  }
]

/** 问答社区示例数据 */
export const mockQaPosts = [
  {
    id: 'q1', title: '为什么IS曲线右移时利率会上升？',
    body: '政府支出增加推动IS右移，为什么均衡利率一定上升？在图上怎么看？',
    course: '宏观经济学', author: '刘同学', date: todayStr(), likes: 12,
    answers: [
      {
        id: 'a1', author: '李同学', date: todayStr(), likes: 20,
        body: 'G↑ → 总需求↑ → 收入↑ → 货币交易需求 L₁=ky↑ → 在货币供给 m 不变时出现超额货币需求 → 利率 r 必须上升来压低投机需求 L₂，货币市场才能重新出清。图上看：IS右移沿LM曲线滑动，均衡点沿 LM 向右上方移动，所以 r 与 y 同升。'
      }
    ]
  },
  {
    id: 'q2', title: '流动性陷阱中财政政策为什么有效？',
    body: '老师说流动性陷阱里货币政策无效，但财政政策效果最大，原理是什么？',
    course: '宏观经济学', author: '赵同学', date: todayStr(), likes: 8,
    answers: [
      {
        id: 'a2', author: '王同学', date: todayStr(), likes: 15,
        body: '陷阱区 LM 水平：财政扩张（IS右移）与均衡利率不变，利率不升 → 没有挤出效应 → 产出增加量 = 简单乘数 × ΔG，达到最大。而货币扩张（LM右移）在水平段内不改变利率 → 投资、收入都不变 → 无效。'
      }
    ]
  }
]

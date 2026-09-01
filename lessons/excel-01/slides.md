---
theme: default
title: Excel 2003 第一课：把空白表做成成绩表
titleTemplate: "%s · 计算实验室"
info: false
presenter: true
lang: zh-CN
favicon: false
fonts:
  provider: none
colorSchema: light
aspectRatio: 16/9
canvasWidth: 1280
preloadImages: false
wakeLock: false
transition: fade
---

<div class="cover-layout cover-slide">
  <div>
    <div class="cover-kicker">EXCEL 2003 · 第一课</div>
    <h1 class="cover-title">把空白表<br>做成成绩表</h1>
    <p class="cover-subtitle">先看清要做出什么，再想怎么做到。</p>
    <div class="cover-mark">高中信息技术 · 计算实验室</div>
  </div>
  <div class="cover-sheet">
    <ExcelSheet mode="merged" />
  </div>
</div>

<!--
教师提示：先让学生看见“终点”，不要先讲按钮。这里保留课件的任务驱动开场。
[Sources]
内容依据：/Users/wj/WorkBuddy/信息技术课/课程设计_Excel2003第一课.md
-->

---

<div class="eyebrow">先看终点</div>
<div class="content-split content-split--wide">
  <div>
    <h1>成品长这样</h1>
    <div class="side-note">
      <p>今天的目标不是背按钮，<br><strong>是把这一张表做出来。</strong></p>
    </div>
    <p class="muted">先看一眼终点，再回头找差距。</p>
  </div>
  <div class="image-frame">
    <img src="./assets/demo_score_table_clean.png" alt="Excel 成绩表成品" />
    <div class="caption">这就是我们要做出来的成绩表。</div>
  </div>
</div>
<div class="slide-number">01 / 19</div>

<!--
教师提示：让学生先描述看见的变化，不急着解释操作。
[Sources]
截图：教材《计算机应用基础教程》第 4 章中文 Excel 2003，课件裁剪图 demo_score_table_clean.png
-->

---

<div class="eyebrow">观察差距</div>
<h1>它跟一张空白表差在哪？</h1>
<div class="gap-list">
  <div v-click class="gap-item"><span class="gap-index">1</span><p>标题只在 A1，成品让它<strong>横跨整行并居中</strong>。</p></div>
  <div v-click class="gap-item"><span class="gap-index">2</span><p>表头是普通小字，成品让它<strong>加粗、居中、带下划线</strong>。</p></div>
  <div v-click class="gap-item"><span class="gap-index">3</span><p>学号不用一个个敲，Excel 可以<strong>按规律续写</strong>。</p></div>
  <div v-click class="gap-item"><span class="gap-index">4</span><p>平均分不是拿计算器按出来的，而是让 Excel <strong>自己算</strong>。</p></div>
</div>
<div class="slide-number">02 / 19</div>

<!--
教师提示：四处差距就是学生接下来要解决的四个具体问题。
-->

---

<div class="eyebrow">今天的路线</div>
<h1>今天只做三件事</h1>
<div class="roadmap">
  <div class="roadmap-item"><div class="roadmap-dot"></div><h2>标题跨列</h2><p>选中一片格子，合并并居中。</p></div>
  <div class="roadmap-item"><div class="roadmap-dot"></div><h2>字变好看</h2><p>字体、字号、加粗、下划线。</p></div>
  <div class="roadmap-item"><div class="roadmap-dot"></div><h2>学号续写</h2><p>找到右下角的小黑十字。</p></div>
</div>
<div class="prompt-box"><p>每一关都先自己找；卡住了，再看线索和方法。</p></div>
<div class="slide-number">03 / 19</div>

<!--
教师提示：把“自己找 → 给线索 → 给方法”作为课堂规则说清楚。
-->

---

<div class="eyebrow">先认眼前的窗口</div>
<div class="window-layout">
  <div>
    <h1>不必全背，先找到这四处</h1>
    <div class="window-points">
      <div class="window-point"><h3>工作表区</h3><p>中间这一大片格子，要填的东西都在这里。</p></div>
      <div class="window-point"><h3>名称框</h3><p>告诉你现在点的是哪个格子，比如 A1。</p></div>
      <div class="window-point"><h3>格式工具栏</h3><p>改字、合并，常用按钮都在上面。</p></div>
      <div class="window-point"><h3>编辑栏 × / √</h3><p>改字时，× 是放弃，√ 是确定。</p></div>
    </div>
  </div>
  <div class="image-frame"><img src="./assets/excel2003_window_cn2.png" alt="Excel 2003 窗口速查图" /></div>
</div>
<div class="slide-number">04 / 19</div>

<!--
教师提示：完整窗口图只作为速查卡，不逐项讲解。让学生知道卡住时可以回来找。
[Sources]
截图：教材《计算机应用基础教程》第 4 章中文 Excel 2003，课件裁剪图 excel2003_window_cn2.png
-->

---

<div class="eyebrow">速查卡</div>
<h1>窗口里每一块，做什么？</h1>
<div class="image-frame" style="margin-top: 22px"><img src="./assets/excel2003_window_cn2.png" alt="带工具栏的 Excel 2003 窗口" style="max-height: 470px" /></div>
<p class="caption">鼠标在按钮上停一秒，会弹出黄色提示。先做任务，找不到再回来。</p>
<div class="slide-number">05 / 19</div>

<!--
教师提示：可以让学生自己指出工作表区、名称框和格式工具栏，确认他们知道去哪里找。
[Sources]
截图：教材《计算机应用基础教程》第 4 章中文 Excel 2003，课件裁剪图 excel2003_window_cn2.png
-->

---

layout: section
class: section-slide
---

<div>
  <div class="eyebrow">第一关</div>
  <h1>让标题跨列居中</h1>
  <p>先把一格里的标题，变成一整行的标题。</p>
</div>
<div class="slide-number" style="color:#a9c4d7">06 / 19</div>

<!--
教师提示：这一页只宣布任务，不要立刻给方法。
-->

---

<div class="eyebrow">动手做</div>
<div class="task-layout">
  <div class="task-copy">
    <h1>标题缩在 A1，<br>怎么横跨 5 列还居中？</h1>
    <div class="prompt-box"><p><strong>自己找：</strong>工具栏里有没有“合并及居中”？</p></div>
    <div class="steps">
      <div v-click class="step"><span class="step-no">1</span><p>先选中 <strong>A1:E1</strong> 这一片。</p></div>
      <div v-click class="step"><span class="step-no">2</span><p>再点“合并及居中”。</p></div>
      <div v-click class="step"><span class="step-no">3</span><p>标题会跨列，并自动跑到正中间。</p></div>
    </div>
  </div>
  <div><ExcelSheet mode="plain" /></div>
</div>
<div class="slide-number">07 / 19</div>

<!--
教师提示：观察学生是否先选区域；只有卡住时再给线索和方法。
-->

---

<div class="eyebrow">别把两个动作混在一起</div>
<h1>合并，不等于居中</h1>
<div class="merge-compare">
  <div class="merge-column">
    <h2>点“合并及居中”</h2>
    <p>格子合并好，文字<strong>自动居中</strong>。</p>
    <p class="muted">平时做标题，最省事。</p>
  </div>
  <div class="merge-column">
    <h2>格式 → 单元格 → 对齐</h2>
    <p>勾选“合并单元格”后，只是<strong>合成一个格子</strong>。</p>
    <p class="muted">还要另把“水平对齐”设为“居中”。</p>
  </div>
</div>
<div class="warning-line">注意：合并后只留下左上角那个格子的内容；做错了就撤销。</div>
<div class="slide-number">08 / 19</div>

<!--
教师提示：这是本课最容易混淆的事实。可以先演示再让学生说出差别。
-->

---

layout: section
class: section-slide
---

<div>
  <div class="eyebrow">第二关</div>
  <h1>把字变好看</h1>
  <p>先选中对象，再改格式。顺序不要反。</p>
</div>
<div class="slide-number" style="color:#a9c4d7">09 / 19</div>

<!--
教师提示：第二关是第一关的复习和迁移，不需要再次完整讲授。
-->

---

<div class="eyebrow">动手做</div>
<h1>先选中，再改格式</h1>
<div class="content-split" style="align-items:start; margin-top: 18px">
  <div class="steps">
    <div class="step"><span class="step-no">1</span><p>标题选 <strong>A1:E1</strong>：黑体、20 号、加粗。</p></div>
    <div class="step"><span class="step-no">2</span><p>表头选整行：加粗、12 号、居中。</p></div>
    <div class="step"><span class="step-no">3</span><p>表头再加一条<strong>单下划线</strong>。</p></div>
  </div>
  <div class="image-frame toolbar-focus-frame"><img src="./assets/toolbar_format_focus.png" alt="Excel 2003 格式工具栏" /></div>
</div>
<div class="prompt-box"><p><strong>自己找：</strong>字体框、字号框、B、U、居中分别在哪？</p></div>
<div class="slide-number">10 / 19</div>

<!--
教师提示：允许按钮、菜单和快捷键路径不同，只要最后的成品一致。
[Sources]
截图：教材《计算机应用基础教程》第 4 章中文 Excel 2003，课件裁剪图 toolbar_format_focus.png
-->

---

<div class="eyebrow">三条路，结果一样</div>
<h1>改字在哪改？</h1>
<div class="shortcut-row">
  <div class="shortcut"><h2>格式工具栏</h2><p>选中格子，直接点字体、字号、B、I、U。</p></div>
  <div class="shortcut"><h2>菜单</h2><p>格式 → 单元格 → 字体，一次设全。</p></div>
  <div class="shortcut"><h2>快捷键</h2><p><span class="key">Ctrl+B</span> 加粗　<span class="key">Ctrl+U</span> 下划线</p></div>
</div>
<div class="warning-line">你找到的路径和别人不一样，也不代表做错；看最后的表格。</div>
<div class="slide-number">11 / 19</div>

<!--
教师提示：强调“允许路径差异”，不要把按钮法讲成唯一正确答案。
-->

---

<div class="eyebrow">格式速查</div>
<div class="content-split content-split--wide">
  <div>
    <h1>找不到按钮？<br>放大看这里</h1>
    <p>鼠标停在按钮上，等一秒，Excel 会告诉你它叫什么。</p>
    <div class="prompt-box"><p>先选格子，再点按钮。没有选中对象，按钮就不知道要改谁。</p></div>
  </div>
  <div class="image-frame toolbar-focus-frame"><img src="./assets/toolbar_format_focus.png" alt="放大的 Excel 2003 格式工具栏" /></div>
</div>
<div class="slide-number">12 / 19</div>

<!--
教师提示：这页作为巡堂时的投屏速查，不需要逐项念。
[Sources]
截图：教材《计算机应用基础教程》第 4 章中文 Excel 2003，课件裁剪图 toolbar_format_focus.png
-->

---

layout: section
class: section-slide
---

<div>
  <div class="eyebrow">第三关</div>
  <h1>让 Excel 替你抄</h1>
  <p>重复的事，先看看能不能交给电脑。</p>
</div>
<div class="slide-number" style="color:#a9c4d7">13 / 19</div>

<!--
教师提示：这是“重复劳动 → 自动化”的种子。先让学生手填 1、2，再揭示填充柄。
-->

---

<div class="eyebrow">动手做</div>
<div class="fill-layout">
  <div class="fill-callout">
    <h1>学号 1、2、3……<br><span class="nowrap">你要一行行打吗？</span></h1>
    <p>先在前两格写好 <strong>1、2</strong>。</p>
    <p>选中它们，找右下角的小黑十字。</p>
  </div>
  <div><ExcelSheet mode="fill" :show-fill-handle="true" /></div>
</div>
<div class="prompt-box"><p><strong>给方法：</strong>抓住填充柄往下拖到 6，Excel 会续出 3、4、5、6。</p></div>
<div class="slide-number">14 / 19</div>

<!--
教师提示：关注学生是否抓准右下角的小黑十字，抓错位置容易变成移动单元格。
-->

---

<div class="eyebrow">小黑十字</div>
<h1>填充柄到底做了什么？</h1>
<div class="content-split" style="align-items:start; margin-top: 32px">
  <div class="steps">
    <div class="step"><span class="step-no">1</span><p>你给了 Excel 两个样本：<strong>1、2</strong>。</p></div>
    <div class="step"><span class="step-no">2</span><p>它看出规律：每次<strong>加 1</strong>。</p></div>
    <div class="step"><span class="step-no">3</span><p>拖到下面，它把规律续成 3、4、5、6。</p></div>
  </div>
  <div class="fill-callout"><p class="muted">今天学到的不只是一个小黑十字。</p><div class="fill-equation">重复 → 找规律 → 交给电脑</div></div>
</div>
<div class="slide-number">15 / 19</div>

<!--
教师提示：把自动填充和后续公式填充连接起来，但不要提前展开第二课内容。
-->

---

<div class="eyebrow">做对就行</div>
<h1>按钮、菜单、快捷键，选哪条路都可以</h1>
<div class="content-split" style="align-items:center; margin-top: 28px">
  <div>
    <div class="steps">
      <div class="step"><span class="step-no">✓</span><p>标题跨 5 列，文字在中间。</p></div>
      <div class="step"><span class="step-no">✓</span><p>表头清楚，和下面的数据分得开。</p></div>
      <div class="step"><span class="step-no">✓</span><p>学号按规律排好，不靠逐个输入。</p></div>
    </div>
  </div>
  <div><ExcelSheet mode="merged" /></div>
</div>
<div class="slide-number">16 / 19</div>

<!--
教师提示：用成品验收，不纠正学生的非主路径。
-->

---

<div class="eyebrow">回头看</div>
<h1>今天你把这件事做成了</h1>
<div class="recap-grid">
  <div class="recap-item"><h2>先选中</h2><p>要改哪一片，先让 Excel 知道对象是谁。</p></div>
  <div class="recap-item"><h2>合并及居中</h2><p>标题横跨多列，文字自动到中间。</p></div>
  <div class="recap-item"><h2>格式工具栏</h2><p>字体、字号、加粗、下划线，找不到就停一下看提示。</p></div>
  <div class="recap-item"><h2>填充柄</h2><p>拖一拖把规律续下去；重复的事先交给电脑。</p></div>
</div>
<div class="prompt-box"><p>下节课：同一个小黑十字，拖的不是数字，而是公式。</p></div>
<div class="slide-number">17 / 19</div>

<!--
教师提示：收束到“公式 + 自动填充”的下节课连接。
-->

---

<div class="eyebrow">课后动手</div>
<h1>做一张“我的课程表”</h1>
<div class="homework-grid">
  <div class="homework-item"><h2>必做</h2><p>标题跨列合并居中、黑体；用自动填充排好“第 1 节”到“第 8 节”或星期。</p></div>
  <div class="homework-item"><h2>选做</h2><p>给课程表加底纹或边框，让不同的内容更容易看清。</p></div>
  <div class="homework-item"><h2>想一想</h2><p>如果全班 50 个人都要填学号，<br>你还会一行行敲吗？</p></div>
</div>
<div class="slide-number">18 / 19</div>

<!--
教师提示：作业保持三层，课堂口头说明即可；不要把分钟数带到学生课件里。
-->

---

layout: section
class: close-slide
---

<div>
  <div class="eyebrow">Excel 2003 · 第一课</div>
  <h1>先看目标，<br>再找方法。</h1>
  <p>下一次，让平均分自己算出来。</p>
</div>
<div class="slide-number" style="color:#a9c4d7">19 / 19</div>

<!--
教师提示：结束时提醒学生保存自己的成绩表，下一课继续使用填充柄。
-->

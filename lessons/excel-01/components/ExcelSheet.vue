<script setup>
import { computed } from "vue";

const props = defineProps({
  mode: { type: String, default: "merged" },
  showFillHandle: { type: Boolean, default: false },
});

const scoreColumns = ["姓名", "语文", "数学", "英语", "平均分"];
const scoreRows = [
  ["薛雪", "65", "78", "81", ""],
  ["郝涛", "86", "99", "79", ""],
  ["许英", "85", "65", "78", ""],
  ["孔平", "94", "79", "62", ""],
  ["江涛", "77", "92", "61", ""],
  ["王艳", "87", "60", "84", ""],
];

const fillColumns = ["学号"];
const fillRows = [["1"], ["2"], ["3"], ["4"], ["5"], ["6"]];
const columns = computed(() => (props.mode === "fill" ? fillColumns : scoreColumns));
const rows = computed(() => (props.mode === "fill" ? fillRows : scoreRows));
</script>

<template>
  <div class="excel-sheet" :class="`excel-sheet--${mode}`">
    <div class="excel-window-bar">
      <span class="excel-app-mark">X</span>
      <span>Microsoft Excel</span>
      <span class="excel-window-actions">— □ ×</span>
    </div>
    <div class="excel-toolbar-bar">
      <span>文件</span><span>编辑</span><span>视图</span><span>插入</span><span>格式</span>
      <span class="excel-toolbar-spacer" />
      <span class="excel-toolbar-icon">↶</span><span class="excel-toolbar-icon">↷</span>
    </div>
    <div class="excel-formula-bar">
      <span class="excel-name-box">A1</span>
      <span class="excel-formula-mark">fx</span>
      <span class="excel-formula-value">{{ mode === "fill" ? "1" : "高中生期末成绩表" }}</span>
    </div>
    <div class="excel-grid-wrap">
      <div class="excel-grid" :class="{ 'has-five-columns': mode !== 'fill' }">
        <div class="excel-corner" />
        <div v-for="column in columns" :key="column" class="excel-column-label">{{ column }}</div>

        <div class="excel-row-label">1</div>
        <div v-if="mode === 'fill'" class="excel-cell excel-title-cell">学号</div>
        <div v-else class="excel-cell excel-title-cell" :class="{ merged: mode === 'merged' }">
          高中生期末成绩表
        </div>
        <div
          v-if="mode !== 'merged'"
          v-for="blank in 4"
          :key="`blank-${blank}`"
          class="excel-cell"
        />

        <template v-if="mode !== 'fill'">
          <div class="excel-row-label">2</div>
          <div
            v-for="column in columns"
            :key="`head-${column}`"
            class="excel-cell excel-header-cell"
          >
            {{ column }}
          </div>
          <template v-for="(row, rowIndex) in rows" :key="`row-${rowIndex}`">
            <div class="excel-row-label">{{ rowIndex + 3 }}</div>
            <div
              v-for="(value, columnIndex) in row"
              :key="`${rowIndex}-${columnIndex}`"
              class="excel-cell"
            >
              {{ value }}
            </div>
          </template>
        </template>

        <template v-else>
          <template v-for="(row, rowIndex) in rows" :key="`fill-${rowIndex}`">
            <div class="excel-row-label">{{ rowIndex + 2 }}</div>
            <div class="excel-cell" :class="{ 'fill-current': rowIndex === 1 }">{{ row[0] }}</div>
          </template>
        </template>
      </div>
      <span v-if="showFillHandle" class="excel-fill-handle" aria-hidden="true" />
    </div>
    <div class="excel-status-bar"><span>就绪</span><span>Sheet1</span></div>
  </div>
</template>

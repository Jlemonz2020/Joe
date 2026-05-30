<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Check, Delete, Hide, Refresh, Search } from "@element-plus/icons-vue";
import { adminApi, messageFromError } from "@/api";
import type { CommentItem } from "@/types";

const loading = ref(false);
const items = ref<CommentItem[]>([]);
const filters = reactive({
  status: "",
  target: "",
  q: ""
});

function targetLabel(target: string) {
  if (target === "guestbook") return "留言板";
  if (target.startsWith("post:")) return `札记：${target.slice(5)}`;
  if (target.startsWith("project:")) return `项目 #${target.slice(8)}`;
  return target || "未命名目标";
}

function statusType(status: CommentItem["status"]) {
  if (status === "published") return "success";
  if (status === "pending") return "warning";
  return "info";
}

async function load() {
  loading.value = true;
  try {
    items.value = await adminApi.listComments(filters);
  } catch (error) {
    ElMessage.error(messageFromError(error));
  } finally {
    loading.value = false;
  }
}

async function publishComment(row: CommentItem) {
  await adminApi.publishComment(row.id);
  ElMessage.success("已发布");
  await load();
}

async function hideComment(row: CommentItem) {
  await ElMessageBox.confirm("隐藏后前台不会显示这条留言，继续？", "隐藏留言", { type: "warning" });
  await adminApi.hideComment(row.id);
  ElMessage.success("已隐藏");
  await load();
}

async function destroyComment(row: CommentItem) {
  await ElMessageBox.confirm("彻底删除这条留言和它的点赞记录，继续？", "删除留言", { type: "error" });
  await adminApi.destroyComment(row.id);
  ElMessage.success("已删除");
  await load();
}

onMounted(load);
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <div>
        <h2 class="panel-title">留言管理</h2>
        <p class="panel-desc">前台留言板、札记评论和项目评论统一在这里查看和处理。</p>
      </div>
      <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
    </div>
    <div class="panel-body toolbar-line">
      <div class="filter-row">
        <el-input v-model="filters.q" :prefix-icon="Search" clearable placeholder="搜索昵称、内容或目标" style="width: 260px" @keyup.enter="load" />
        <el-select v-model="filters.status" clearable placeholder="状态" style="width: 140px" @change="load">
          <el-option label="已发布" value="published" />
          <el-option label="待处理" value="pending" />
          <el-option label="已隐藏" value="hidden" />
        </el-select>
        <el-select v-model="filters.target" clearable filterable allow-create default-first-option placeholder="目标" style="width: 180px" @change="load">
          <el-option label="留言板" value="guestbook" />
        </el-select>
        <el-button @click="load">筛选</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="items" row-key="id">
      <el-table-column label="留言" min-width="340">
        <template #default="{ row }">
          <strong>{{ row.author_name || "路过的人" }}</strong>
          <p class="muted">{{ row.content }}</p>
        </template>
      </el-table-column>
      <el-table-column label="位置" min-width="180">
        <template #default="{ row }">
          <span>{{ targetLabel(row.target) }}</span>
          <div class="muted">{{ row.target }}</div>
        </template>
      </el-table-column>
      <el-table-column prop="likes" label="点赞" width="90" />
      <el-table-column prop="status" label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="时间" width="180" />
      <el-table-column label="操作" width="270" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status !== 'published'" size="small" :icon="Check" @click="publishComment(row)">发布</el-button>
          <el-button v-if="row.status !== 'hidden'" size="small" :icon="Hide" @click="hideComment(row)">隐藏</el-button>
          <el-button size="small" type="danger" :icon="Delete" @click="destroyComment(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </section>
</template>

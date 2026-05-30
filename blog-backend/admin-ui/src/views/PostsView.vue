<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { Delete, Edit, Hide, Plus, Search } from "@element-plus/icons-vue";
import { adminApi, messageFromError } from "@/api";
import type { PostItem } from "@/types";

const router = useRouter();
const loading = ref(false);
const items = ref<PostItem[]>([]);
const filters = reactive({
  status: "",
  q: ""
});

async function load() {
  loading.value = true;
  try {
    items.value = await adminApi.listPosts(filters);
  } catch (error) {
    ElMessage.error(messageFromError(error));
  } finally {
    loading.value = false;
  }
}

async function hidePost(row: PostItem) {
  await ElMessageBox.confirm(`确认隐藏《${row.title}》？`, "隐藏文章", { type: "warning" });
  await adminApi.hidePost(row.id);
  ElMessage.success("已隐藏");
  await load();
}

async function destroyPost(row: PostItem) {
  await ElMessageBox.confirm(`彻底删除《${row.title}》且不可恢复，继续？`, "删除文章", { type: "error" });
  await adminApi.destroyPost(row.id);
  ElMessage.success("已删除");
  await load();
}

onMounted(load);
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <div>
        <h2 class="panel-title">文章库</h2>
        <p class="panel-desc">长记录、教程草稿和复盘内容。</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="router.push('/posts/new')">新文章</el-button>
    </div>
    <div class="panel-body toolbar-line">
      <div class="filter-row">
        <el-input v-model="filters.q" :prefix-icon="Search" clearable placeholder="搜索标题或 slug" style="width: 260px" @keyup.enter="load" />
        <el-select v-model="filters.status" clearable placeholder="状态" style="width: 140px" @change="load">
          <el-option label="已发布" value="published" />
          <el-option label="草稿" value="draft" />
        </el-select>
        <el-button @click="load">筛选</el-button>
      </div>
    </div>
    <el-table v-loading="loading" :data="items" row-key="id">
      <el-table-column label="标题" min-width="260">
        <template #default="{ row }">
          <RouterLink class="link-muted" :to="`/posts/${row.id}`">{{ row.title }}</RouterLink>
          <div class="muted">{{ row.slug }}</div>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="row.status === 'published' ? 'success' : 'info'">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="updated_at" label="更新时间" width="180" />
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button size="small" :icon="Edit" @click="router.push(`/posts/${row.id}`)">编辑</el-button>
          <el-button size="small" :icon="Hide" @click="hidePost(row)">隐藏</el-button>
          <el-button size="small" type="danger" :icon="Delete" @click="destroyPost(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </section>
</template>

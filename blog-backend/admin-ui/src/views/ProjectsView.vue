<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { Delete, Edit, Hide, Plus, Search } from "@element-plus/icons-vue";
import { adminApi, messageFromError } from "@/api";
import type { ProjectItem } from "@/types";

const router = useRouter();
const loading = ref(false);
const items = ref<ProjectItem[]>([]);
const filters = reactive({
  status: "",
  q: ""
});

async function load() {
  loading.value = true;
  try {
    items.value = await adminApi.listProjects(filters);
  } catch (error) {
    ElMessage.error(messageFromError(error));
  } finally {
    loading.value = false;
  }
}

async function hideProject(row: ProjectItem) {
  await ElMessageBox.confirm(`确认把「${row.name}」从前台隐藏？`, "隐藏项目", { type: "warning" });
  await adminApi.hideProject(row.id);
  ElMessage.success("已隐藏");
  await load();
}

async function destroyProject(row: ProjectItem) {
  await ElMessageBox.confirm(`彻底删除「${row.name}」且不可恢复，继续？`, "删除项目", { type: "error" });
  await adminApi.destroyProject(row.id);
  ElMessage.success("已删除");
  await load();
}

onMounted(load);
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <div>
        <h2 class="panel-title">项目工作台</h2>
        <p class="panel-desc">项目卡片和详情正文统一用 Markdown 维护。</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="router.push('/projects/new')">新项目</el-button>
    </div>
    <div class="panel-body toolbar-line">
      <div class="filter-row">
        <el-input v-model="filters.q" :prefix-icon="Search" clearable placeholder="搜索项目或 slug" style="width: 260px" @keyup.enter="load" />
        <el-select v-model="filters.status" clearable placeholder="状态" style="width: 150px" @change="load">
          <el-option label="前台显示" value="active" />
          <el-option label="已隐藏" value="archived" />
        </el-select>
        <el-button @click="load">筛选</el-button>
      </div>
    </div>
    <el-table v-loading="loading" :data="items" row-key="id">
      <el-table-column label="项目" min-width="240">
        <template #default="{ row }">
          <RouterLink class="link-muted" :to="`/projects/${row.id}`">{{ row.name }}</RouterLink>
          <div class="muted">{{ row.slug }}</div>
        </template>
      </el-table-column>
      <el-table-column label="进度" width="160">
        <template #default="{ row }">
          <el-progress :percentage="Number(row.progress) || 0" :stroke-width="8" />
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="updated_at" label="更新时间" width="180" />
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button size="small" :icon="Edit" @click="router.push(`/projects/${row.id}`)">编辑</el-button>
          <el-button size="small" :icon="Hide" @click="hideProject(row)">隐藏</el-button>
          <el-button size="small" type="danger" :icon="Delete" @click="destroyProject(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { Collection, Document, Refresh, Timer } from "@element-plus/icons-vue";
import { adminApi, messageFromError } from "@/api";
import type { OverviewPayload } from "@/types";

const router = useRouter();
const loading = ref(false);
const syncing = ref(false);
const data = ref<OverviewPayload | null>(null);

async function load() {
  loading.value = true;
  try {
    data.value = await adminApi.overview();
  } catch (error) {
    ElMessage.error(messageFromError(error));
  } finally {
    loading.value = false;
  }
}

async function syncSearch() {
  syncing.value = true;
  try {
    const result = await adminApi.syncSearch();
    ElMessage.success(`已同步 ${result.count} 篇文章`);
  } catch (error) {
    ElMessage.error(messageFromError(error));
  } finally {
    syncing.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section v-loading="loading" class="page-stack">
    <div class="metric-grid">
      <article class="metric-card">
        <span>全部文章</span>
        <strong>{{ data?.stats.posts ?? 0 }}</strong>
      </article>
      <article class="metric-card">
        <span>已发布</span>
        <strong>{{ data?.stats.publishedPosts ?? 0 }}</strong>
      </article>
      <article class="metric-card">
        <span>瞬间</span>
        <strong>{{ data?.stats.moments ?? 0 }}</strong>
      </article>
      <article class="metric-card">
        <span>前台项目</span>
        <strong>{{ data?.stats.activeProjects ?? 0 }}/{{ data?.stats.projects ?? 0 }}</strong>
      </article>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">工作台</h2>
          <p class="panel-desc">常用内容入口和搜索索引维护。</p>
        </div>
        <div class="filter-row">
          <el-button type="primary" :icon="Document" @click="router.push('/posts/new')">写文章</el-button>
          <el-button :icon="Collection" @click="router.push('/projects/new')">新项目</el-button>
          <el-button :icon="Refresh" :loading="syncing" @click="syncSearch">同步搜索</el-button>
        </div>
      </div>
      <div class="panel-body">
        <el-row :gutter="14">
          <el-col :lg="12" :sm="24">
            <el-table :data="data?.recentPosts || []" size="small">
              <el-table-column label="最近文章" min-width="180">
                <template #default="{ row }">
                  <RouterLink class="link-muted" :to="`/posts/${row.id}`">{{ row.title }}</RouterLink>
                </template>
              </el-table-column>
              <el-table-column prop="status" label="状态" width="90" />
            </el-table>
          </el-col>
          <el-col :lg="12" :sm="24">
            <el-table :data="data?.recentProjects || []" size="small">
              <el-table-column label="最近项目" min-width="180">
                <template #default="{ row }">
                  <RouterLink class="link-muted" :to="`/projects/${row.id}`">{{ row.name }}</RouterLink>
                </template>
              </el-table-column>
              <el-table-column prop="progress" label="进度" width="90">
                <template #default="{ row }">{{ row.progress }}%</template>
              </el-table-column>
            </el-table>
          </el-col>
        </el-row>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">最近瞬间</h2>
          <p class="panel-desc">短记录可以直接进入瞬间页维护。</p>
        </div>
        <el-button :icon="Timer" @click="router.push('/moments')">管理瞬间</el-button>
      </div>
      <el-table :data="data?.recentMoments || []">
        <el-table-column prop="content" label="内容" min-width="280" show-overflow-tooltip />
        <el-table-column prop="kind" label="类型" width="110" />
        <el-table-column prop="created_at" label="时间" width="180" />
      </el-table>
    </div>
  </section>
</template>

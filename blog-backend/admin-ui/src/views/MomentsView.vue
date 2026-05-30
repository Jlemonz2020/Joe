<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Delete, Edit, Hide, Plus } from "@element-plus/icons-vue";
import { adminApi, messageFromError } from "@/api";
import type { MomentItem } from "@/types";

const loading = ref(false);
const saving = ref(false);
const items = ref<MomentItem[]>([]);
const filters = reactive({
  status: "",
  kind: ""
});
const form = reactive<Partial<MomentItem> & { tagText: string }>({
  id: undefined,
  content: "",
  kind: "life",
  status: "published",
  tagText: ""
});

async function load() {
  loading.value = true;
  try {
    items.value = await adminApi.listMoments(filters);
  } catch (error) {
    ElMessage.error(messageFromError(error));
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  Object.assign(form, { id: undefined, content: "", kind: "life", status: "published", tagText: "" });
}

function editMoment(row: MomentItem) {
  Object.assign(form, {
    id: row.id,
    content: row.content,
    kind: row.kind,
    status: row.status,
    tagText: row.tags.join(", ")
  });
}

async function save() {
  if (!form.content?.trim()) {
    ElMessage.warning("内容不能为空");
    return;
  }
  saving.value = true;
  try {
    await adminApi.saveMoment(form);
    ElMessage.success(form.id ? "已更新" : "已发布");
    resetForm();
    await load();
  } catch (error) {
    ElMessage.error(messageFromError(error));
  } finally {
    saving.value = false;
  }
}

async function hideMoment(row: MomentItem) {
  await ElMessageBox.confirm("确认隐藏这条瞬间？", "隐藏瞬间", { type: "warning" });
  await adminApi.hideMoment(row.id);
  ElMessage.success("已隐藏");
  await load();
}

async function destroyMoment(row: MomentItem) {
  await ElMessageBox.confirm("彻底删除这条瞬间且不可恢复，继续？", "删除瞬间", { type: "error" });
  await adminApi.destroyMoment(row.id);
  ElMessage.success("已删除");
  await load();
}

onMounted(load);
</script>

<template>
  <section class="page-stack">
    <div class="panel">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">{{ form.id ? "编辑瞬间" : "发一条瞬间" }}</h2>
          <p class="panel-desc">短记录和临时状态，发布后前台会读取。</p>
        </div>
        <el-button v-if="form.id" @click="resetForm">取消编辑</el-button>
      </div>
      <div class="panel-body">
        <el-form label-position="top">
          <el-form-item label="内容">
            <el-input v-model="form.content" type="textarea" :rows="5" maxlength="1000" show-word-limit />
          </el-form-item>
          <div class="form-grid">
            <el-form-item label="类型">
              <el-select v-model="form.kind" style="width: 100%">
                <el-option label="技术" value="tech" />
                <el-option label="项目" value="project" />
                <el-option label="生活" value="life" />
              </el-select>
            </el-form-item>
            <el-form-item label="状态">
              <el-select v-model="form.status" style="width: 100%">
                <el-option label="发布" value="published" />
                <el-option label="草稿" value="draft" />
              </el-select>
            </el-form-item>
          </div>
          <el-form-item label="标签，逗号分隔">
            <el-input v-model="form.tagText" placeholder="Linux, 博客" />
          </el-form-item>
          <el-button type="primary" :icon="Plus" :loading="saving" @click="save">
            {{ form.id ? "保存瞬间" : "发布瞬间" }}
          </el-button>
        </el-form>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">瞬间列表</h2>
          <p class="panel-desc">支持隐藏、编辑和彻底删除。</p>
        </div>
        <div class="filter-row">
          <el-select v-model="filters.status" clearable placeholder="状态" style="width: 130px" @change="load">
            <el-option label="发布" value="published" />
            <el-option label="草稿" value="draft" />
          </el-select>
          <el-select v-model="filters.kind" clearable placeholder="类型" style="width: 130px" @change="load">
            <el-option label="技术" value="tech" />
            <el-option label="项目" value="project" />
            <el-option label="生活" value="life" />
          </el-select>
        </div>
      </div>
      <el-table v-loading="loading" :data="items" row-key="id">
        <el-table-column prop="content" label="内容" min-width="300" show-overflow-tooltip />
        <el-table-column prop="kind" label="类型" width="100" />
        <el-table-column prop="status" label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="row.status === 'published' ? 'success' : 'info'">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="时间" width="180" />
        <el-table-column label="操作" width="270" fixed="right">
          <template #default="{ row }">
            <el-button size="small" :icon="Edit" @click="editMoment(row)">编辑</el-button>
            <el-button size="small" :icon="Hide" @click="hideMoment(row)">隐藏</el-button>
            <el-button size="small" type="danger" :icon="Delete" @click="destroyMoment(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </section>
</template>

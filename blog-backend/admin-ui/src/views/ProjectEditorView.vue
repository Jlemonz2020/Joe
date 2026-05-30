<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { Back, Picture, View } from "@element-plus/icons-vue";
import { adminApi, messageFromError } from "@/api";
import MarkdownEditor from "@/components/MarkdownEditor.vue";
import type { ProjectItem } from "@/types";

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const uploadingCover = ref(false);
const coverInput = ref<HTMLInputElement | null>(null);
const form = reactive<Partial<ProjectItem>>({
  name: "",
  slug: "",
  summary: "",
  status_text: "",
  progress: 0,
  sort_order: 0,
  cover_url: "",
  content_md: "# 新项目\n\n## 当前状态\n\n\n## 最近更新\n\n\n## 下一步\n\n- ",
  status: "active"
});

const isNew = computed(() => route.name === "project-new");
const editorStats = computed(() => {
  const text = form.content_md || "";
  return `${text.split("\n").length} lines / ${text.length} chars`;
});

function fillProject(project: ProjectItem) {
  Object.assign(form, project);
}

function pickCover() {
  coverInput.value?.click();
}

async function uploadCover(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    ElMessage.warning("请选择图片文件");
    input.value = "";
    return;
  }

  uploadingCover.value = true;
  try {
    const uploaded = await adminApi.uploadImage(file);
    form.cover_url = uploaded.url;
    ElMessage.success("封面图已上传");
  } catch (error) {
    ElMessage.error(messageFromError(error));
  } finally {
    uploadingCover.value = false;
    input.value = "";
  }
}

async function load() {
  if (isNew.value) return;
  loading.value = true;
  try {
    fillProject(await adminApi.getProject(String(route.params.id)));
  } catch (error) {
    ElMessage.error(messageFromError(error));
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!form.name?.trim()) {
    ElMessage.warning("项目名称不能为空");
    return;
  }
  if (!form.content_md?.trim()) {
    ElMessage.warning("Markdown 正文不能为空");
    return;
  }
  saving.value = true;
  try {
    const saved = await adminApi.saveProject(form);
    fillProject(saved);
    ElMessage.success("已保存");
    if (isNew.value) await router.replace(`/projects/${saved.id}`);
  } catch (error) {
    ElMessage.error(messageFromError(error));
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section v-loading="loading" class="editor-page">
    <div class="panel editor-main">
      <div class="editor-toolbar">
        <div class="editor-title">
          <strong>{{ form.name || "未命名项目" }}</strong>
          <span>{{ form.slug || "保存时会根据名称生成 slug" }}</span>
        </div>
        <div class="filter-row">
          <el-button :icon="Back" @click="router.push('/projects')">列表</el-button>
          <el-button v-if="form.id" :icon="View" tag="a" :href="`/project.html?id=${form.id}`" target="_blank">前台</el-button>
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
        </div>
      </div>
      <MarkdownEditor v-model="form.content_md!" @save="save" />
      <div class="editor-status">
        <span>Project Markdown</span>
        <span>{{ editorStats }}</span>
      </div>
    </div>

    <aside class="panel editor-side">
      <el-form label-position="top">
        <el-form-item label="项目名称">
          <el-input v-model="form.name" maxlength="120" show-word-limit />
        </el-form-item>
        <el-form-item label="Slug">
          <el-input v-model="form.slug" placeholder="留空时按名称生成" />
        </el-form-item>
        <el-form-item label="卡片状态文案">
          <el-input v-model="form.status_text" maxlength="255" show-word-limit />
        </el-form-item>
        <el-form-item label="摘要">
          <el-input v-model="form.summary" type="textarea" :rows="4" maxlength="500" show-word-limit />
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="进度">
            <el-input-number v-model="form.progress" :min="0" :max="100" style="width: 100%" />
          </el-form-item>
          <el-form-item label="排序">
            <el-input-number v-model="form.sort_order" :min="0" :max="9999" style="width: 100%" />
          </el-form-item>
        </div>
        <el-form-item label="状态">
          <el-segmented
            v-model="form.status"
            :options="[
              { label: '前台显示', value: 'active' },
              { label: '隐藏', value: 'archived' }
            ]"
          />
        </el-form-item>
        <el-form-item label="展示图 / 封面">
          <div class="image-field">
            <el-input v-model="form.cover_url" placeholder="/uploads/project-cover.jpg" />
            <el-button :icon="Picture" :loading="uploadingCover" @click="pickCover">上传</el-button>
            <input ref="coverInput" class="hidden-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="uploadCover">
          </div>
          <img v-if="form.cover_url" class="image-preview" :src="form.cover_url" alt="">
        </el-form-item>
        <el-alert show-icon :closable="false" title="保存后会刷新前台项目列表和详情页。" type="info" />
      </el-form>
    </aside>
  </section>
</template>

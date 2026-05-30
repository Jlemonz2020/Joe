<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { Back, Picture, View } from "@element-plus/icons-vue";
import { adminApi, messageFromError } from "@/api";
import MarkdownEditor from "@/components/MarkdownEditor.vue";
import type { PostItem } from "@/types";

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const uploadingCover = ref(false);
const coverInput = ref<HTMLInputElement | null>(null);
const form = reactive<Partial<PostItem>>({
  title: "",
  slug: "",
  summary: "",
  content_md: "",
  cover_url: "",
  status: "draft"
});

const isNew = computed(() => route.name === "post-new");
const editorStats = computed(() => {
  const text = form.content_md || "";
  const words = text.trim().match(/[\w\u4e00-\u9fff]+/g)?.length || 0;
  return `${text.split("\n").length} lines / ${text.length} chars / ${words} words`;
});

function fillPost(post: PostItem) {
  Object.assign(form, post);
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
    fillPost(await adminApi.getPost(String(route.params.id)));
  } catch (error) {
    ElMessage.error(messageFromError(error));
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!form.title?.trim()) {
    ElMessage.warning("标题不能为空");
    return;
  }
  if (!form.content_md?.trim()) {
    ElMessage.warning("正文不能为空");
    return;
  }
  saving.value = true;
  try {
    const saved = await adminApi.savePost(form);
    fillPost(saved);
    ElMessage.success("已保存");
    if (isNew.value) await router.replace(`/posts/${saved.id}`);
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
          <strong>{{ form.title || "未命名文章" }}</strong>
          <span>{{ form.slug || "保存时会根据标题生成 slug" }}</span>
        </div>
        <div class="filter-row">
          <el-button :icon="Back" @click="router.push('/posts')">列表</el-button>
          <el-button v-if="form.slug" :icon="View" tag="a" :href="`/post.html?slug=${form.slug}`" target="_blank">前台</el-button>
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
        </div>
      </div>
      <MarkdownEditor v-model="form.content_md!" @save="save" />
      <div class="editor-status">
        <span>Markdown</span>
        <span>{{ editorStats }}</span>
      </div>
    </div>

    <aside class="panel editor-side">
      <el-form label-position="top">
        <el-form-item label="标题">
          <el-input v-model="form.title" maxlength="200" show-word-limit />
        </el-form-item>
        <el-form-item label="Slug">
          <el-input v-model="form.slug" placeholder="留空时按标题生成" />
        </el-form-item>
        <el-form-item label="状态">
          <el-segmented
            v-model="form.status"
            :options="[
              { label: '草稿', value: 'draft' },
              { label: '发布', value: 'published' }
            ]"
          />
        </el-form-item>
        <el-form-item label="摘要">
          <el-input v-model="form.summary" type="textarea" :rows="5" maxlength="500" show-word-limit />
        </el-form-item>
        <el-form-item label="展示图 / 封面">
          <div class="image-field">
            <el-input v-model="form.cover_url" placeholder="/uploads/cover.jpg" />
            <el-button :icon="Picture" :loading="uploadingCover" @click="pickCover">上传</el-button>
            <input ref="coverInput" class="hidden-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="uploadCover">
          </div>
          <img v-if="form.cover_url" class="image-preview" :src="form.cover_url" alt="">
        </el-form-item>
        <el-alert
          show-icon
          :closable="false"
          title="Ctrl / Cmd + S 可直接保存。"
          type="info"
        />
      </el-form>
    </aside>
  </section>
</template>

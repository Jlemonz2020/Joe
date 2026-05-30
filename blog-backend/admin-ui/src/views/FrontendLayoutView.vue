<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Delete, Plus, Refresh, View } from "@element-plus/icons-vue";
import { adminApi, messageFromError } from "@/api";
import type {
  CommentItem,
  FooterSection,
  FrontendArchiveCategory,
  FrontendChip,
  FrontendEditorPayload,
  FrontendFooterTag,
  FrontendLayout,
  FrontendMomentKind,
  FrontendSearchSuggestion,
  FrontendUi,
  MomentItem,
  PostItem,
  ProjectItem,
  TextDefinition
} from "@/types";

type PageKey = "index" | "archive" | "moments" | "projects" | "about" | "post" | "project";
type ContentType = "post" | "project" | "moment" | "comment";
type ChipPage = "archive" | "projects" | "about";

const pageOptions: { label: string; value: PageKey; path: string }[] = [
  { label: "首页", value: "index", path: "/index.html" },
  { label: "小记", value: "archive", path: "/archive.html" },
  { label: "瞬间", value: "moments", path: "/moments.html" },
  { label: "项目", value: "projects", path: "/projects.html" },
  { label: "关于", value: "about", path: "/about.html" },
  { label: "文章详情", value: "post", path: "/post.html" },
  { label: "项目详情", value: "project", path: "/project.html" }
];

const loading = ref(false);
const saving = ref(false);
const restoring = ref(false);
const previewKey = ref(0);
const activePage = ref<PageKey>("index");
const activeTab = ref("select");
const selectedTarget = ref("");
const selectedTextKey = ref("");
const selectedContentType = ref<ContentType>("post");
const selectedContentId = ref<number | null>(null);
const iframeRef = ref<HTMLIFrameElement | null>(null);

const definitions = ref<TextDefinition[]>([]);
const backup = ref<FrontendEditorPayload["backup"]>(null);
const texts = ref<Record<string, string>>({});
const rules = ref("");
const footerSections = ref<FooterSection[]>([]);
const content = reactive<FrontendEditorPayload["content"]>({
  posts: [],
  projects: [],
  moments: [],
  comments: []
});

const layout = reactive<FrontendLayout>({
  home: {
    width: "balanced",
    density: "comfortable",
    projectPreviewLimit: 4,
    momentPreviewLimit: 2,
    showStatusStrip: true,
    showProjectPreview: true,
    showMomentPreview: true,
    showProfileCard: true,
    showStatsCard: true,
    showCategoryCard: true
  },
  archive: {
    defaultCategory: "",
    showSearchPanel: true,
    showGithubPanel: true
  },
  moments: {
    defaultKind: "all",
    showDraftPanel: true
  },
  projects: {
    cardStyle: "cover",
    showRoadmap: true,
    showMaintain: true
  },
  footer: {
    motion: "candles"
  }
});

const ui = reactive<FrontendUi>({
  archiveCategories: [],
  momentKinds: [],
  pageChips: { archive: [], projects: [], about: [] },
  footer: { brandBody: "", tags: [] },
  searchSuggestions: [],
  sectionTitles: { homeProjects: "Project", homeMoments: "Moments", homeCategory: "分类入口" }
});

const postForm = reactive<Partial<PostItem>>({ title: "", slug: "", summary: "", content_md: "", cover_url: "", status: "draft" });
const projectForm = reactive<Partial<ProjectItem>>({ name: "", slug: "", summary: "", status_text: "", progress: 0, sort_order: 0, cover_url: "", content_md: "", status: "active" });
const momentForm = reactive<Partial<MomentItem> & { tagText: string }>({ content: "", kind: "life", tagText: "", image_url: "", status: "published" });
const commentForm = reactive<Partial<CommentItem>>({ author_name: "", content: "", status: "published" });

const textGroups = computed(() => {
  const map = new Map<string, TextDefinition[]>();
  for (const item of definitions.value) {
    if (!map.has(item.group)) map.set(item.group, []);
    map.get(item.group)!.push(item);
  }
  return [...map.entries()].map(([label, items]) => ({ label, items }));
});

const currentPagePath = computed(() => {
  const option = pageOptions.find((item) => item.value === activePage.value) || pageOptions[0];
  const params = new URLSearchParams({ editor: "1", t: String(previewKey.value) });
  if (activePage.value === "post") {
    const post = content.posts.find((item) => item.slug) || content.posts[0];
    if (post?.slug) params.set("slug", post.slug);
  }
  if (activePage.value === "project") {
    const project = content.projects[0];
    if (project?.id) params.set("id", String(project.id));
  }
  return `${option.path}?${params.toString()}`;
});

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function fill(payload: FrontendEditorPayload) {
  definitions.value = payload.definitions;
  texts.value = { ...payload.texts };
  rules.value = payload.rules || "";
  footerSections.value = clone(payload.footerSections || []);
  backup.value = payload.backup;
  Object.assign(layout.home, payload.layout.home);
  Object.assign(layout.archive, payload.layout.archive);
  Object.assign(layout.moments, payload.layout.moments);
  Object.assign(layout.projects, payload.layout.projects);
  Object.assign(layout.footer, payload.layout.footer);
  ui.archiveCategories = clone(payload.ui.archiveCategories || []);
  ui.momentKinds = clone(payload.ui.momentKinds || []);
  ui.pageChips.archive = clone(payload.ui.pageChips.archive || []);
  ui.pageChips.projects = clone(payload.ui.pageChips.projects || []);
  ui.pageChips.about = clone(payload.ui.pageChips.about || []);
  ui.footer.brandBody = payload.ui.footer.brandBody || "";
  ui.footer.tags = clone(payload.ui.footer.tags || []);
  ui.searchSuggestions = clone(payload.ui.searchSuggestions || []);
  Object.assign(ui.sectionTitles, payload.ui.sectionTitles);
  content.posts = payload.content.posts || [];
  content.projects = payload.content.projects || [];
  content.moments = payload.content.moments || [];
  content.comments = payload.content.comments || [];
}

async function load() {
  loading.value = true;
  try {
    fill(await adminApi.getFrontendEditor());
  } catch (error) {
    ElMessage.error(messageFromError(error));
  } finally {
    loading.value = false;
  }
}

async function saveStaticConfig() {
  saving.value = true;
  try {
    fill(await adminApi.saveFrontendEditor({
      texts: texts.value,
      rules: rules.value,
      footerSections: footerSections.value,
      layout: clone(layout),
      ui: clone(ui)
    }));
    previewKey.value += 1;
    ElMessage.success("前台配置已保存并发布");
  } catch (error) {
    ElMessage.error(messageFromError(error));
  } finally {
    saving.value = false;
  }
}

async function restoreBackup() {
  if (!backup.value) {
    ElMessage.warning("没有可恢复的上一版");
    return;
  }
  await ElMessageBox.confirm("恢复后会立即发布上一版前台配置，继续？", "恢复上一版", { type: "warning" });
  restoring.value = true;
  try {
    fill(await adminApi.restoreFrontendEditor());
    previewKey.value += 1;
    ElMessage.success("已恢复上一版");
  } catch (error) {
    ElMessage.error(messageFromError(error));
  } finally {
    restoring.value = false;
  }
}

function reloadPreview() {
  previewKey.value += 1;
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}`;
}

function addCategory() {
  const id = makeId("cat");
  ui.archiveCategories.push({ id, label: "新分类", slug: id, description: "", countText: "", href: `/archive.html?cat=${id}`, visibleInHome: true, visibleInArchive: true, sortOrder: ui.archiveCategories.length * 10 });
}

function addMomentKind() {
  const id = makeId("kind");
  ui.momentKinds.push({ id, label: "新类型", kind: id, subLabel: "", visible: true, sortOrder: ui.momentKinds.length * 10 });
}

function addChip(page: ChipPage) {
  const id = makeId("chip");
  ui.pageChips[page].push({ id, label: "新标签", subLabel: "", visible: true, sortOrder: ui.pageChips[page].length * 10 });
}

function addFooterTag() {
  const id = makeId("tag");
  ui.footer.tags.push({ id, label: "新标签", visible: true, sortOrder: ui.footer.tags.length * 10 });
}

function addSuggestion() {
  const id = makeId("link");
  ui.searchSuggestions.push({ id, label: "新入口", href: "/index.html", visible: true, sortOrder: ui.searchSuggestions.length * 10 });
}

function removeAt<T>(list: T[], index: number) {
  list.splice(index, 1);
}

function addFooterSection() {
  footerSections.value.push({ title: "新栏目", links: [{ label: "新链接", href: "/index.html", desc: "" }] });
}

function addFooterLink(section: FooterSection) {
  section.links.push({ label: "新链接", href: "/index.html", desc: "" });
}

function resetContentForms() {
  Object.assign(postForm, { id: undefined, title: "", slug: "", summary: "", content_md: "# 新文章\n\n", cover_url: "", status: "draft" });
  Object.assign(projectForm, { id: undefined, name: "", slug: "", summary: "", status_text: "", progress: 0, sort_order: 0, cover_url: "", content_md: "# 新项目\n\n", status: "active" });
  Object.assign(momentForm, { id: undefined, content: "", kind: "life", tagText: "", image_url: "", status: "published" });
  Object.assign(commentForm, { id: undefined, author_name: "", content: "", status: "published" });
}

async function selectContent(type: ContentType, id?: number | null) {
  selectedContentType.value = type;
  selectedContentId.value = id || null;
  resetContentForms();
  try {
    if (type === "post" && id) Object.assign(postForm, await adminApi.getPost(id));
    if (type === "project" && id) Object.assign(projectForm, await adminApi.getProject(id));
    if (type === "moment" && id) {
      const row = content.moments.find((item) => item.id === id);
      if (row) Object.assign(momentForm, row, { tagText: row.tags.join(", ") });
    }
    if (type === "comment" && id) Object.assign(commentForm, await adminApi.getComment(id));
    activeTab.value = "content";
  } catch (error) {
    ElMessage.error(messageFromError(error));
  }
}

async function saveContent() {
  try {
    if (selectedContentType.value === "post") await adminApi.savePost(postForm);
    if (selectedContentType.value === "project") await adminApi.saveProject(projectForm);
    if (selectedContentType.value === "moment") await adminApi.saveMoment(momentForm);
    if (selectedContentType.value === "comment") await adminApi.saveComment(commentForm);
    ElMessage.success("内容已保存");
    await load();
    reloadPreview();
  } catch (error) {
    ElMessage.error(messageFromError(error));
  }
}

async function uploadImage(event: Event, target: "post" | "project" | "moment") {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const uploaded = await adminApi.uploadImage(file);
    if (target === "post") postForm.cover_url = uploaded.url;
    if (target === "project") projectForm.cover_url = uploaded.url;
    if (target === "moment") momentForm.image_url = uploaded.url;
    ElMessage.success("图片已上传");
  } catch (error) {
    ElMessage.error(messageFromError(error));
  } finally {
    input.value = "";
  }
}

function handleEditorMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin || event.data?.source !== "jlemonz-frontend-editor") return;
  const target = String(event.data.target || "");
  selectedTarget.value = target;
  if (target.startsWith("text:")) {
    selectedTextKey.value = target.slice(5);
    activeTab.value = "text";
    return;
  }
  if (target.startsWith("ui:")) {
    activeTab.value = "ui";
    return;
  }
  if (target.startsWith("layout:")) {
    activeTab.value = "layout";
    return;
  }
  if (target.startsWith("content:")) {
    const [, type, rawId] = target.split(":");
    const id = Number(rawId);
    if (["post", "project", "moment", "comment"].includes(type) && Number.isFinite(id)) {
      selectContent(type as ContentType, id);
    }
  }
}

onMounted(() => {
  load();
  window.addEventListener("message", handleEditorMessage);
});

onBeforeUnmount(() => {
  window.removeEventListener("message", handleEditorMessage);
});
</script>

<template>
  <section v-loading="loading" class="frontend-editor">
    <div class="frontend-editor-toolbar panel">
      <div>
        <h2 class="panel-title">前台可视化编辑</h2>
        <p class="panel-desc">左侧是真实前台。点击页面元素后，在右侧编辑文字、分类、筛选、标签或动态内容。</p>
      </div>
      <div class="toolbar-line">
        <el-select v-model="activePage" style="width: 140px" @change="reloadPreview">
          <el-option v-for="item in pageOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-button :icon="Refresh" @click="reloadPreview">刷新预览</el-button>
        <el-button :icon="View" tag="a" :href="currentPagePath.replace(/([?&])editor=1&?/, '$1').replace(/[?&]t=\\d+/, '')" target="_blank">打开前台</el-button>
        <el-button :loading="restoring" :disabled="!backup" @click="restoreBackup">恢复上一版</el-button>
        <el-button type="primary" :loading="saving" @click="saveStaticConfig">保存并发布</el-button>
      </div>
    </div>

    <div class="frontend-editor-grid">
      <section class="frontend-preview panel">
        <iframe ref="iframeRef" :key="previewKey" :src="currentPagePath" title="前台实时预览" />
      </section>

      <aside class="frontend-inspector panel">
        <div class="inspector-target">
          <strong>{{ selectedTarget || "尚未选择元素" }}</strong>
          <span>{{ backup ? `上一版：${backup.savedAt}` : "保存前会自动备份当前配置" }}</span>
        </div>

        <el-tabs v-model="activeTab">
          <el-tab-pane label="选中项" name="select">
            <p class="muted">在左侧预览中点击文字、分类、标签、卡片或留言。没有高亮的内容可以从下面几个标签页直接编辑。</p>
          </el-tab-pane>

          <el-tab-pane label="文字" name="text">
            <el-alert v-if="selectedTextKey" :title="`当前：${selectedTextKey}`" type="info" :closable="false" show-icon />
            <el-form label-position="top" class="inspector-form">
              <el-form-item v-if="selectedTextKey" label="选中文字">
                <el-input v-model="texts[selectedTextKey]" type="textarea" :rows="4" />
              </el-form-item>
              <el-tabs tab-position="left" class="text-key-tabs">
                <el-tab-pane v-for="group in textGroups" :key="group.label" :label="group.label">
                  <el-form-item v-for="item in group.items" :key="item.key" :label="`${item.label} · ${item.key}`">
                    <el-input v-model="texts[item.key]" type="textarea" :rows="2" :placeholder="item.defaultValue" />
                  </el-form-item>
                </el-tab-pane>
              </el-tabs>
            </el-form>
          </el-tab-pane>

          <el-tab-pane label="分类/标签" name="ui">
            <div class="inspector-section">
              <div class="section-line"><strong>首页分类 / 小记筛选</strong><el-button size="small" :icon="Plus" @click="addCategory">添加</el-button></div>
              <div v-for="(item, index) in ui.archiveCategories" :key="item.id" class="category-edit-card">
                <div class="edit-field">
                  <span>名称</span>
                  <el-input v-model="item.label" placeholder="Linux" />
                </div>
                <div class="edit-field">
                  <span>slug</span>
                  <el-input v-model="item.slug" placeholder="linux" />
                </div>
                <div class="edit-field field-wide">
                  <span>说明</span>
                  <el-input v-model="item.description" placeholder="命令、驱动、系统记录" />
                </div>
                <div class="edit-field">
                  <span>数量</span>
                  <el-input v-model="item.countText" placeholder="18" />
                </div>
                <div class="edit-field field-link">
                  <span>跳转链接</span>
                  <el-input v-model="item.href" placeholder="/archive.html?cat=linux" />
                </div>
                <div class="edit-field field-sort">
                  <span>排序</span>
                  <el-input-number v-model="item.sortOrder" :min="0" :max="9999" />
                </div>
                <div class="category-flags">
                  <el-checkbox v-model="item.visibleInHome">首页显示</el-checkbox>
                  <el-checkbox v-model="item.visibleInArchive">小记显示</el-checkbox>
                </div>
                <el-button class="category-delete" :icon="Delete" @click="removeAt(ui.archiveCategories, index)" />
              </div>
            </div>

            <div class="inspector-section">
              <div class="section-line"><strong>瞬间筛选</strong><el-button size="small" :icon="Plus" @click="addMomentKind">添加</el-button></div>
              <div v-for="(item, index) in ui.momentKinds" :key="item.id" class="editable-row compact-row">
                <el-input v-model="item.label" placeholder="名称" />
                <el-input v-model="item.kind" placeholder="kind" />
                <el-input v-model="item.subLabel" placeholder="小字" />
                <el-input-number v-model="item.sortOrder" :min="0" :max="9999" />
                <el-checkbox v-model="item.visible">显示</el-checkbox>
                <el-button :icon="Delete" @click="removeAt(ui.momentKinds, index)" />
              </div>
            </div>

            <div class="inspector-section" v-for="pageName in (['archive', 'projects', 'about'] as ChipPage[])" :key="pageName">
              <div class="section-line"><strong>{{ pageName }} 页面标签</strong><el-button size="small" :icon="Plus" @click="addChip(pageName)">添加</el-button></div>
              <div v-for="(item, index) in ui.pageChips[pageName]" :key="item.id" class="editable-row compact-row">
                <el-input v-model="item.label" placeholder="名称" />
                <el-input v-model="item.subLabel" placeholder="小字" />
                <el-input-number v-model="item.sortOrder" :min="0" :max="9999" />
                <el-checkbox v-model="item.visible">显示</el-checkbox>
                <el-button :icon="Delete" @click="removeAt(ui.pageChips[pageName], index)" />
              </div>
            </div>

            <div class="inspector-section">
              <strong>首页模块标题</strong>
              <div class="form-grid">
                <el-input v-model="ui.sectionTitles.homeProjects" placeholder="项目区标题" />
                <el-input v-model="ui.sectionTitles.homeMoments" placeholder="瞬间区标题" />
                <el-input v-model="ui.sectionTitles.homeCategory" placeholder="分类区标题" />
              </div>
            </div>

            <div class="inspector-section">
              <strong>页脚品牌与标签</strong>
              <el-input v-model="ui.footer.brandBody" type="textarea" :rows="2" />
              <div class="section-line"><span></span><el-button size="small" :icon="Plus" @click="addFooterTag">添加标签</el-button></div>
              <div v-for="(item, index) in ui.footer.tags" :key="item.id" class="editable-row compact-row">
                <el-input v-model="item.label" placeholder="标签" />
                <el-input-number v-model="item.sortOrder" :min="0" :max="9999" />
                <el-checkbox v-model="item.visible">显示</el-checkbox>
                <el-button :icon="Delete" @click="removeAt(ui.footer.tags, index)" />
              </div>
            </div>

            <div class="inspector-section">
              <div class="section-line"><strong>搜索推荐</strong><el-button size="small" :icon="Plus" @click="addSuggestion">添加</el-button></div>
              <div v-for="(item, index) in ui.searchSuggestions" :key="item.id" class="editable-row compact-row">
                <el-input v-model="item.label" placeholder="名称" />
                <el-input v-model="item.href" placeholder="链接" />
                <el-input-number v-model="item.sortOrder" :min="0" :max="9999" />
                <el-checkbox v-model="item.visible">显示</el-checkbox>
                <el-button :icon="Delete" @click="removeAt(ui.searchSuggestions, index)" />
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="动态内容" name="content">
            <div class="content-picker">
              <el-segmented v-model="selectedContentType" :options="[
                { label: '文章', value: 'post' },
                { label: '项目', value: 'project' },
                { label: '瞬间', value: 'moment' },
                { label: '留言', value: 'comment' }
              ]" />
              <el-select v-if="selectedContentType === 'post'" v-model="selectedContentId" clearable filterable placeholder="选择文章" @change="selectContent('post', selectedContentId)">
                <el-option v-for="item in content.posts" :key="item.id" :label="item.title" :value="item.id" />
              </el-select>
              <el-select v-if="selectedContentType === 'project'" v-model="selectedContentId" clearable filterable placeholder="选择项目" @change="selectContent('project', selectedContentId)">
                <el-option v-for="item in content.projects" :key="item.id" :label="item.name" :value="item.id" />
              </el-select>
              <el-select v-if="selectedContentType === 'moment'" v-model="selectedContentId" clearable filterable placeholder="选择瞬间" @change="selectContent('moment', selectedContentId)">
                <el-option v-for="item in content.moments" :key="item.id" :label="item.content" :value="item.id" />
              </el-select>
              <el-select v-if="selectedContentType === 'comment'" v-model="selectedContentId" clearable filterable placeholder="选择留言" @change="selectContent('comment', selectedContentId)">
                <el-option v-for="item in content.comments" :key="item.id" :label="`${item.author_name}: ${item.content}`" :value="item.id" />
              </el-select>
            </div>

            <el-form v-if="selectedContentType === 'post'" label-position="top" class="inspector-form">
              <el-form-item label="标题"><el-input v-model="postForm.title" /></el-form-item>
              <el-form-item label="Slug"><el-input v-model="postForm.slug" /></el-form-item>
              <el-form-item label="状态"><el-select v-model="postForm.status"><el-option label="草稿" value="draft" /><el-option label="发布" value="published" /></el-select></el-form-item>
              <el-form-item label="摘要"><el-input v-model="postForm.summary" type="textarea" :rows="3" /></el-form-item>
              <el-form-item label="封面"><el-input v-model="postForm.cover_url" /><input type="file" accept="image/*" @change="uploadImage($event, 'post')" /></el-form-item>
              <el-form-item label="正文 Markdown"><el-input v-model="postForm.content_md" type="textarea" :rows="12" /></el-form-item>
            </el-form>

            <el-form v-if="selectedContentType === 'project'" label-position="top" class="inspector-form">
              <el-form-item label="名称"><el-input v-model="projectForm.name" /></el-form-item>
              <el-form-item label="Slug"><el-input v-model="projectForm.slug" /></el-form-item>
              <el-form-item label="卡片状态"><el-input v-model="projectForm.status_text" /></el-form-item>
              <el-form-item label="摘要"><el-input v-model="projectForm.summary" type="textarea" :rows="3" /></el-form-item>
              <div class="form-grid"><el-form-item label="进度"><el-input-number v-model="projectForm.progress" :min="0" :max="100" /></el-form-item><el-form-item label="排序"><el-input-number v-model="projectForm.sort_order" :min="0" :max="9999" /></el-form-item></div>
              <el-form-item label="状态"><el-select v-model="projectForm.status"><el-option label="显示" value="active" /><el-option label="隐藏" value="archived" /></el-select></el-form-item>
              <el-form-item label="封面"><el-input v-model="projectForm.cover_url" /><input type="file" accept="image/*" @change="uploadImage($event, 'project')" /></el-form-item>
              <el-form-item label="正文 Markdown"><el-input v-model="projectForm.content_md" type="textarea" :rows="12" /></el-form-item>
            </el-form>

            <el-form v-if="selectedContentType === 'moment'" label-position="top" class="inspector-form">
              <el-form-item label="内容"><el-input v-model="momentForm.content" type="textarea" :rows="4" /></el-form-item>
              <div class="form-grid"><el-form-item label="类型"><el-input v-model="momentForm.kind" /></el-form-item><el-form-item label="状态"><el-select v-model="momentForm.status"><el-option label="发布" value="published" /><el-option label="草稿" value="draft" /></el-select></el-form-item></div>
              <el-form-item label="标签"><el-input v-model="momentForm.tagText" placeholder="Linux, 博客" /></el-form-item>
              <el-form-item label="图片"><el-input v-model="momentForm.image_url" /><input type="file" accept="image/*" @change="uploadImage($event, 'moment')" /></el-form-item>
            </el-form>

            <el-form v-if="selectedContentType === 'comment'" label-position="top" class="inspector-form">
              <el-form-item label="昵称"><el-input v-model="commentForm.author_name" /></el-form-item>
              <el-form-item label="状态"><el-select v-model="commentForm.status"><el-option label="发布" value="published" /><el-option label="待处理" value="pending" /><el-option label="隐藏" value="hidden" /></el-select></el-form-item>
              <el-form-item label="内容"><el-input v-model="commentForm.content" type="textarea" :rows="5" /></el-form-item>
            </el-form>

            <el-button type="primary" @click="saveContent">保存动态内容</el-button>
          </el-tab-pane>

          <el-tab-pane label="布局" name="layout">
            <el-form label-position="top" class="inspector-form">
              <el-form-item label="首页宽度">
                <el-radio-group v-model="layout.home.width">
                  <el-radio-button label="narrow">窄</el-radio-button>
                  <el-radio-button label="balanced">标准</el-radio-button>
                  <el-radio-button label="wide">宽</el-radio-button>
                </el-radio-group>
              </el-form-item>
              <el-form-item label="首页密度">
                <el-radio-group v-model="layout.home.density">
                  <el-radio-button label="compact">紧凑</el-radio-button>
                  <el-radio-button label="comfortable">正常</el-radio-button>
                  <el-radio-button label="airy">舒展</el-radio-button>
                </el-radio-group>
              </el-form-item>
              <div class="form-grid">
                <el-form-item label="首页项目数量"><el-input-number v-model="layout.home.projectPreviewLimit" :min="1" :max="8" /></el-form-item>
                <el-form-item label="首页瞬间数量"><el-input-number v-model="layout.home.momentPreviewLimit" :min="1" :max="6" /></el-form-item>
              </div>
              <div class="layout-checks">
                <el-checkbox v-model="layout.home.showStatusStrip">状态卡</el-checkbox>
                <el-checkbox v-model="layout.home.showProjectPreview">项目预览</el-checkbox>
                <el-checkbox v-model="layout.home.showMomentPreview">瞬间预览</el-checkbox>
                <el-checkbox v-model="layout.home.showProfileCard">头像摸鱼</el-checkbox>
                <el-checkbox v-model="layout.home.showStatsCard">统计</el-checkbox>
                <el-checkbox v-model="layout.home.showCategoryCard">分类入口</el-checkbox>
                <el-checkbox v-model="layout.archive.showSearchPanel">小记搜索卡</el-checkbox>
                <el-checkbox v-model="layout.archive.showGithubPanel">GitHub 密度</el-checkbox>
                <el-checkbox v-model="layout.moments.showDraftPanel">瞬间草稿</el-checkbox>
                <el-checkbox v-model="layout.projects.showRoadmap">项目下一步</el-checkbox>
                <el-checkbox v-model="layout.projects.showMaintain">项目维护说明</el-checkbox>
              </div>
              <el-form-item label="小记默认分类"><el-input v-model="layout.archive.defaultCategory" /></el-form-item>
              <el-form-item label="瞬间默认筛选"><el-input v-model="layout.moments.defaultKind" /></el-form-item>
              <el-form-item label="项目卡片样式"><el-select v-model="layout.projects.cardStyle"><el-option label="展示图" value="cover" /><el-option label="紧凑" value="compact" /><el-option label="纯文字" value="minimal" /></el-select></el-form-item>
              <el-form-item label="页脚动效"><el-select v-model="layout.footer.motion"><el-option label="蜡烛" value="candles" /><el-option label="方块" value="loader" /><el-option label="两个都要" value="both" /><el-option label="关闭" value="none" /></el-select></el-form-item>
            </el-form>
          </el-tab-pane>

          <el-tab-pane label="页脚/规则" name="footer">
            <div class="section-line"><strong>页脚栏目</strong><el-button size="small" :icon="Plus" @click="addFooterSection">添加栏目</el-button></div>
            <div v-for="(section, sectionIndex) in footerSections" :key="sectionIndex" class="footer-section-card">
              <div class="section-line">
                <el-input v-model="section.title" placeholder="栏目名" />
                <el-button :icon="Plus" @click="addFooterLink(section)">链接</el-button>
                <el-button :icon="Delete" @click="removeAt(footerSections, sectionIndex)" />
              </div>
              <div v-for="(link, linkIndex) in section.links" :key="linkIndex" class="editable-row compact-row">
                <el-input v-model="link.label" placeholder="链接名" />
                <el-input v-model="link.href" placeholder="地址" />
                <el-input v-model="link.desc" placeholder="说明" />
                <el-button :icon="Delete" @click="removeAt(section.links, linkIndex)" />
              </div>
            </div>
            <el-form-item label="高级规则">
              <el-input v-model="rules" type="textarea" :rows="6" />
            </el-form-item>
          </el-tab-pane>
        </el-tabs>
      </aside>
    </div>
  </section>
</template>

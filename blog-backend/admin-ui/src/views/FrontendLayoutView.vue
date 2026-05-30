<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { Link, Refresh, View } from "@element-plus/icons-vue";
import { adminApi, messageFromError } from "@/api";
import type { FrontendLayout } from "@/types";

type HomeToggleKey =
  | "showStatusStrip"
  | "showProjectPreview"
  | "showMomentPreview"
  | "showProfileCard"
  | "showStatsCard"
  | "showCategoryCard";

const defaultLayout: FrontendLayout = {
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
};

const loading = ref(false);
const saving = ref(false);
const form = reactive<FrontendLayout>(cloneLayout(defaultLayout));

const homeToggles: { key: HomeToggleKey; label: string; desc: string }[] = [
  { key: "showStatusStrip", label: "状态卡", desc: "首页三块短文案" },
  { key: "showProjectPreview", label: "项目预览", desc: "Workbench 模块" },
  { key: "showMomentPreview", label: "瞬间预览", desc: "Moments 模块" },
  { key: "showProfileCard", label: "头像摸鱼", desc: "右侧头像卡" },
  { key: "showStatsCard", label: "统计数字", desc: "文章/瞬间/项目" },
  { key: "showCategoryCard", label: "分类入口", desc: "归档快捷入口" }
];

const previewUrl = computed(() => {
  const params = new URLSearchParams();
  if (form.archive.defaultCategory) params.set("cat", form.archive.defaultCategory);
  return `/archive.html${params.toString() ? `?${params}` : ""}`;
});

function cloneLayout(layout: FrontendLayout): FrontendLayout {
  return JSON.parse(JSON.stringify(layout));
}

function fill(layout: FrontendLayout) {
  Object.assign(form.home, layout.home);
  Object.assign(form.archive, layout.archive);
  Object.assign(form.moments, layout.moments);
  Object.assign(form.projects, layout.projects);
  Object.assign(form.footer, layout.footer);
}

async function load() {
  loading.value = true;
  try {
    fill(await adminApi.getFrontendLayout());
  } catch (error) {
    ElMessage.error(messageFromError(error));
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    fill(await adminApi.saveFrontendLayout(cloneLayout(form)));
    ElMessage.success("前台布局已保存");
  } catch (error) {
    ElMessage.error(messageFromError(error));
  } finally {
    saving.value = false;
  }
}

function resetDefault() {
  fill(cloneLayout(defaultLayout));
}

onMounted(load);
</script>

<template>
  <section v-loading="loading" class="page-stack">
    <div class="panel">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">前台布局编辑</h2>
          <p class="panel-desc">这里保存的配置会直接影响前台模块显示、列表数量、默认筛选和底部动效。</p>
        </div>
        <div class="toolbar-line">
          <el-button :icon="Refresh" @click="resetDefault">还原默认</el-button>
          <el-button :icon="View" tag="a" href="/index.html" target="_blank">打开前台</el-button>
          <el-button type="primary" :loading="saving" @click="save">保存布局</el-button>
        </div>
      </div>

      <div class="panel-body layout-editor-shell">
        <div class="layout-editor-form">
          <section class="layout-edit-block">
            <div class="layout-edit-title">
              <strong>首页</strong>
              <span>宽度、密度和首页模块开关</span>
            </div>
            <el-form label-position="top">
              <el-form-item label="页面宽度">
                <el-radio-group v-model="form.home.width" class="segmented-group">
                  <el-radio-button label="narrow">窄</el-radio-button>
                  <el-radio-button label="balanced">标准</el-radio-button>
                  <el-radio-button label="wide">宽</el-radio-button>
                </el-radio-group>
              </el-form-item>
              <el-form-item label="内容密度">
                <el-radio-group v-model="form.home.density" class="segmented-group">
                  <el-radio-button label="compact">紧凑</el-radio-button>
                  <el-radio-button label="comfortable">正常</el-radio-button>
                  <el-radio-button label="airy">舒展</el-radio-button>
                </el-radio-group>
              </el-form-item>
              <div class="layout-number-grid">
                <el-form-item label="首页项目数量">
                  <el-input-number v-model="form.home.projectPreviewLimit" :min="1" :max="8" />
                </el-form-item>
                <el-form-item label="首页瞬间数量">
                  <el-input-number v-model="form.home.momentPreviewLimit" :min="1" :max="6" />
                </el-form-item>
              </div>
            </el-form>
            <div class="layout-toggle-grid">
              <label v-for="item in homeToggles" :key="item.key" class="layout-toggle-row">
                <span><strong>{{ item.label }}</strong><small>{{ item.desc }}</small></span>
                <el-switch v-model="form.home[item.key]" />
              </label>
            </div>
          </section>

          <section class="layout-edit-block">
            <div class="layout-edit-title">
              <strong>子页面</strong>
              <span>归档筛选、瞬间草稿和项目辅助模块</span>
            </div>
            <el-form label-position="top">
              <el-form-item label="小记默认分类">
                <el-select v-model="form.archive.defaultCategory">
                  <el-option label="全部" value="" />
                  <el-option label="Linux" value="linux" />
                  <el-option label="树莓" value="raspberry-pi" />
                  <el-option label="服务" value="server" />
                  <el-option label="生活" value="life" />
                </el-select>
              </el-form-item>
              <el-form-item label="瞬间默认筛选">
                <el-select v-model="form.moments.defaultKind">
                  <el-option label="全部" value="all" />
                  <el-option label="项目" value="project" />
                  <el-option label="生活" value="life" />
                  <el-option label="技术" value="tech" />
                </el-select>
              </el-form-item>
              <el-form-item label="项目卡片样式">
                <el-radio-group v-model="form.projects.cardStyle" class="segmented-group">
                  <el-radio-button label="cover">展示图</el-radio-button>
                  <el-radio-button label="compact">紧凑</el-radio-button>
                  <el-radio-button label="minimal">纯文字</el-radio-button>
                </el-radio-group>
              </el-form-item>
            </el-form>
            <div class="layout-toggle-grid">
              <label class="layout-toggle-row"><span><strong>小记搜索卡</strong><small>筛选和标题搜索</small></span><el-switch v-model="form.archive.showSearchPanel" /></label>
              <label class="layout-toggle-row"><span><strong>GitHub 密度</strong><small>小记页侧栏热力图</small></span><el-switch v-model="form.archive.showGithubPanel" /></label>
              <label class="layout-toggle-row"><span><strong>瞬间草稿</strong><small>公开页的输入展示块</small></span><el-switch v-model="form.moments.showDraftPanel" /></label>
              <label class="layout-toggle-row"><span><strong>下一步</strong><small>项目页 roadmap</small></span><el-switch v-model="form.projects.showRoadmap" /></label>
              <label class="layout-toggle-row"><span><strong>维护说明</strong><small>项目页右侧说明</small></span><el-switch v-model="form.projects.showMaintain" /></label>
            </div>
          </section>

          <section class="layout-edit-block">
            <div class="layout-edit-title">
              <strong>页脚动效</strong>
              <span>保留主题感，但可以关掉或只留一个动画</span>
            </div>
            <el-radio-group v-model="form.footer.motion" class="segmented-group">
              <el-radio-button label="candles">蜡烛</el-radio-button>
              <el-radio-button label="loader">方块</el-radio-button>
              <el-radio-button label="both">两个都要</el-radio-button>
              <el-radio-button label="none">关闭</el-radio-button>
            </el-radio-group>
          </section>
        </div>

        <aside class="layout-live-preview" :data-width="form.home.width" :data-density="form.home.density">
          <div class="layout-preview-hero">
            <span>Jlemonz</span>
            <strong>{{ form.home.width === "narrow" ? "窄版首页" : form.home.width === "wide" ? "宽版首页" : "标准首页" }}</strong>
            <small>{{ form.home.density === "compact" ? "紧凑密度" : form.home.density === "airy" ? "舒展密度" : "正常密度" }}</small>
          </div>
          <div class="layout-preview-strip" v-if="form.home.showStatusStrip">
            <i></i><i></i><i></i>
          </div>
          <div class="layout-preview-grid">
            <div v-if="form.home.showProjectPreview" class="layout-preview-panel tall">项目 {{ form.home.projectPreviewLimit }}</div>
            <div v-if="form.home.showMomentPreview" class="layout-preview-panel">瞬间 {{ form.home.momentPreviewLimit }}</div>
            <div v-if="form.home.showProfileCard" class="layout-preview-panel">头像</div>
            <div v-if="form.home.showStatsCard" class="layout-preview-panel">统计</div>
            <div v-if="form.home.showCategoryCard" class="layout-preview-panel">分类</div>
          </div>
          <div class="layout-preview-actions">
            <el-button :icon="Link" tag="a" href="/index.html" target="_blank">看首页</el-button>
            <el-button :icon="Link" tag="a" :href="previewUrl" target="_blank">看小记</el-button>
          </div>
        </aside>
      </div>
    </div>
  </section>
</template>

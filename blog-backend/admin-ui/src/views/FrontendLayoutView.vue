<script setup lang="ts">
import { Link, View } from "@element-plus/icons-vue";

const pages = [
  {
    title: "首页",
    path: "/index.html",
    role: "Hero、GitHub 热力图、状态卡、项目预览、瞬间预览",
    data: "站点文案、GitHub、项目、瞬间、摸鱼模块"
  },
  {
    title: "瞬间",
    path: "/moments.html",
    role: "分类筛选、时间线、图文瞬间",
    data: "瞬间内容、类型、标签、展示图片"
  },
  {
    title: "小记",
    path: "/archive.html",
    role: "分类筛选、标题过滤、文章列表",
    data: "文章标题、摘要、分类、展示图"
  },
  {
    title: "项目",
    path: "/projects.html",
    role: "项目卡片、进度、展示图、下一步",
    data: "项目名称、状态文案、进度、封面"
  },
  {
    title: "关于",
    path: "/about.html",
    role: "站点状态、留言、联系方式",
    data: "站点文案、留言、页脚友链"
  }
];
</script>

<template>
  <section class="page-stack">
    <div class="panel">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">前台页面布局</h2>
          <p class="panel-desc">这里用后台语言梳理每个前台页面的数据来源，方便改文案、图片和内容时对齐。</p>
        </div>
        <el-button :icon="View" tag="a" href="/index.html" target="_blank">打开前台</el-button>
      </div>
      <div class="panel-body frontend-layout-grid">
        <article v-for="page in pages" :key="page.path" class="layout-preview-card">
          <div>
            <strong>{{ page.title }}</strong>
            <span>{{ page.role }}</span>
          </div>
          <p>{{ page.data }}</p>
          <el-button :icon="Link" tag="a" :href="page.path" target="_blank">查看页面</el-button>
        </article>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">维护规则</h2>
          <p class="panel-desc">前台展示只读取已发布内容；图片在文章、项目和瞬间里各自维护。</p>
        </div>
      </div>
      <div class="panel-body layout-rule-grid">
        <div><strong>文案</strong><span>在“文案友链”里改，前台按 data-text-key 替换。</span></div>
        <div><strong>正文图片</strong><span>文章/项目编辑器里点“正文图片”，会自动插入 Markdown 图片。</span></div>
        <div><strong>展示图</strong><span>文章、项目、瞬间侧栏上传，前台列表和详情会展示。</span></div>
        <div><strong>筛选</strong><span>瞬间按类型筛选，小记按分类参数筛选。</span></div>
      </div>
    </div>
  </section>
</template>

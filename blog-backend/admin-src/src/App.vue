<template>
  <main v-if="!user" class="login-page">
    <form class="login-card" @submit.prevent="login">
      <div class="brand-mark">J</div>
      <h1 class="admin-login-title" aria-label="Jlemonz 后台">
        <span class="admin-title-main" data-word="Jlemonz">Jlemonz</span>
        <span class="admin-title-badge">后台</span>
      </h1>
      <p>登录后维护内容和前台展示。</p>
      <el-input v-model="loginForm.username" size="large" placeholder="用户名" autocomplete="username" />
      <el-input v-model="loginForm.password" size="large" placeholder="密码" type="password" autocomplete="current-password" show-password />
      <el-button native-type="submit" type="primary" size="large" :loading="busy">登录</el-button>
    </form>
  </main>

  <div v-else class="admin-shell" :class="{ collapsed }">
    <aside class="sidebar">
      <button class="brand" type="button" @click="go('/')">
        <span class="brand-mark">J</span>
        <span class="brand-copy"><strong>Jlemonz</strong><small>后台工作台</small></span>
      </button>
      <nav class="menu-scroll">
        <section v-for="group in menu" :key="group.title" class="menu-group">
          <p>{{ group.title }}</p>
          <button v-for="item in group.items" :key="item.path" type="button" :class="{ active: isActive(item.path) }" @click="go(item.path)">
            <span class="menu-icon" aria-hidden="true">{{ item.icon }}</span>
            <span class="menu-label">{{ item.label }}</span>
          </button>
        </section>
      </nav>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <div class="top-left">
          <el-button circle @click="collapsed = !collapsed">☰</el-button>
          <div>
            <span class="crumb">后台 / {{ currentTitle }}</span>
            <h1>{{ currentTitle }}</h1>
          </div>
        </div>
        <div class="top-actions">
          <span v-if="devAccessEnabled" class="dev-access-badge">开发模式 / 全权限</span>
          <el-button @click="go('/posts/new')">新文章</el-button>
          <el-button @click="logout">退出</el-button>
        </div>
      </header>

      <section v-if="view === 'dashboard'" class="page-stack dashboard-page">
        <div class="dashboard-hero panel">
          <div class="dashboard-hero-copy">
            <span class="eyebrow">Jlemonz Control Room</span>
            <h2>内容、系统和发布状态，一眼看清。</h2>
            <p>把最常用的入口和风险状态放在第一屏；少一点表格感，多一点真正后台工作台的节奏。</p>
            <div class="button-row">
              <el-button type="primary" @click="go('/frontend')">页面装修</el-button>
              <el-button @click="go('/about-gallery')">About 图库</el-button>
              <el-button @click="go('/texts')">文案管理</el-button>
              <el-button @click="go('/system')">系统状态</el-button>
            </div>
          </div>
          <div class="dashboard-hero-orbit">
            <article>
              <span>内容总量</span>
              <strong>{{ dashboardMetrics.reduce((sum, item) => sum + Number(item.value || 0), 0) }}</strong>
            </article>
            <article>
              <span>今日重点</span>
              <strong>维护</strong>
              <p>{{ systemStatus?.modeLabel || '运行中' }}</p>
            </article>
          </div>
        </div>
        <div class="metric-grid">
          <article v-for="metric in dashboardMetrics" :key="metric.label" class="metric-card" :class="metric.tone">
            <span class="metric-icon">{{ metric.icon }}</span>
            <div>
              <span>{{ metric.label }}</span>
              <strong>{{ metric.value }}</strong>
              <p>{{ metric.hint }}</p>
            </div>
          </article>
        </div>
        <div class="panel ops-panel" v-if="systemStatus">
          <div class="panel-head">
            <div><h2>后台巡检</h2><p>数据库、上传、静态构建和搜索状态集中看，不用猜哪里坏了。</p></div>
            <div class="button-row"><el-button @click="loadSystemStatus">刷新巡检</el-button><el-button type="primary" @click="go('/system')">查看系统</el-button></div>
          </div>
          <div class="panel-body ops-grid">
            <article v-for="check in dashboardChecks" :key="check.key" class="ops-card" :class="toneClass(check)">
              <span>{{ check.label }}</span>
              <strong>{{ check.value }}</strong>
              <p>{{ check.detail }}</p>
            </article>
          </div>
        </div>
        <div class="panel recent-panel">
          <div class="panel-head">
            <div><h2>最近内容</h2><p>文章、瞬间和项目的最新状态。</p></div>
            <el-button @click="refreshDashboard">刷新</el-button>
          </div>
          <div class="panel-body recent-content-grid">
            <section class="recent-column">
              <h3>文章</h3>
              <article v-for="item in overview.recentPosts" :key="item.id" class="recent-item">{{ item.title }}</article>
              <p v-if="!overview.recentPosts?.length" class="muted">暂无文章</p>
            </section>
            <section class="recent-column">
              <h3>瞬间</h3>
              <article v-for="item in overview.recentMoments" :key="item.id" class="recent-item">{{ item.content }}</article>
              <p v-if="!overview.recentMoments?.length" class="muted">暂无瞬间</p>
            </section>
            <section class="recent-column">
              <h3>项目</h3>
              <article v-for="item in overview.recentProjects" :key="item.id" class="recent-item">{{ item.name }}</article>
              <p v-if="!overview.recentProjects?.length" class="muted">暂无项目</p>
            </section>
          </div>
        </div>
      </section>

      <section v-else-if="view === 'posts'" class="page-stack">
        <div class="panel">
          <div class="panel-head">
            <div><h2>文章</h2><p>管理公开札记和草稿。</p></div>
            <div class="button-row">
              <el-button-group>
                <el-button :type="trashMode.posts ? 'default' : 'primary'" @click="setTrashMode('posts', false)">当前</el-button>
                <el-button :type="trashMode.posts ? 'primary' : 'default'" @click="setTrashMode('posts', true)">回收站</el-button>
              </el-button-group>
              <el-button v-if="!trashMode.posts" type="primary" @click="editPost()">新文章</el-button>
            </div>
          </div>
          <div class="content-tools">
            <div class="content-filters">
              <el-input v-model="contentFilters.posts.q" clearable placeholder="搜索标题、Slug 或摘要" @keyup.enter="loadPosts" />
              <el-select v-model="contentFilters.posts.status" clearable placeholder="状态">
                <el-option label="草稿" value="draft" />
                <el-option label="已发布" value="published" />
              </el-select>
              <el-button @click="loadPosts">筛选</el-button>
              <el-button text @click="resetContentFilters('posts')">重置</el-button>
            </div>
            <div class="content-bulk">
              <span class="selection-count">已选 {{ selectedContentIds('posts').length }} 条</span>
              <el-button tag="a" :href="contentExportHref('posts')" target="_blank">导出 CSV</el-button>
              <template v-if="trashMode.posts">
                <el-button type="success" :disabled="selectedContentIds('posts').length === 0" @click="runBatchContent('posts', 'restore')">批量恢复</el-button>
              </template>
              <template v-else>
                <el-button :disabled="selectedContentIds('posts').length === 0" @click="runBatchContent('posts', 'publish')">批量发布</el-button>
                <el-button :disabled="selectedContentIds('posts').length === 0" @click="runBatchContent('posts', 'hide')">批量草稿</el-button>
                <el-button type="danger" plain :disabled="selectedContentIds('posts').length === 0" @click="runBatchContent('posts', 'delete')">批量回收</el-button>
              </template>
            </div>
          </div>
          <el-table :data="posts" stripe row-key="id" @selection-change="setContentSelection('posts', $event)">
            <el-table-column type="selection" width="44" />
            <el-table-column prop="title" label="标题" min-width="220" />
            <el-table-column prop="slug" label="Slug" width="180" />
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <el-tag size="small" effect="plain" :type="row.status === 'published' ? 'success' : 'info'">{{ contentStatusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="250">
              <template #default="{ row }">
                <template v-if="row.deleted_at">
                  <el-button size="small" type="success" @click="restorePost(row.id)">恢复</el-button>
                </template>
                <template v-else>
                  <el-button size="small" @click="editPost(row.id)">编辑</el-button>
                  <el-button size="small" @click="hidePost(row.id)">隐藏</el-button>
                  <el-button size="small" type="danger" @click="destroyPost(row.id)">移入回收站</el-button>
                </template>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </section>

      <section v-else-if="view === 'post-editor'" class="editor-page">
        <div class="panel editor-main">
          <div class="panel-head">
            <div><h2>{{ postForm.id ? '编辑文章' : '新文章' }}</h2><p>Markdown 正文会同步到前台详情页。</p></div>
            <div class="button-row"><el-button @click="go('/posts')">返回</el-button><el-button type="primary" @click="savePost">保存</el-button></div>
          </div>
          <div class="panel-body editor-form">
            <el-input v-model="postForm.title" placeholder="标题" />
            <el-input v-model="postForm.slug" placeholder="slug" />
            <el-input v-model="postForm.summary" placeholder="摘要" type="textarea" :rows="2" />
            <el-input v-model="postForm.cover_url" placeholder="封面 URL" />
            <div class="button-row">
              <el-select v-model="postForm.status"><el-option label="草稿" value="draft" /><el-option label="发布" value="published" /></el-select>
              <label class="image-upload-button">
                上传并裁剪封面
                <input type="file" :accept="acceptedImageTypes" @change="openCropUpload($event, postForm, 'cover_url', 'square')" />
              </label>
            </div>
            <img v-if="postForm.cover_url" class="image-preview" :src="postForm.cover_url" alt="">
            <MarkdownBodyEditor v-model="postForm.content_md" title="文章正文" :accepted-image-types="acceptedImageTypes" @upload-image="uploadMarkdownImage($event, postForm, 'content_md')" />
          </div>
        </div>
      </section>

      <section v-else-if="view === 'moments'" class="page-stack">
        <div class="panel">
          <div class="panel-head">
            <div><h2>瞬间</h2><p>短记录、图片和标签。</p></div>
            <div class="button-row">
              <el-button-group>
                <el-button :type="trashMode.moments ? 'default' : 'primary'" @click="setTrashMode('moments', false)">当前</el-button>
                <el-button :type="trashMode.moments ? 'primary' : 'default'" @click="setTrashMode('moments', true)">回收站</el-button>
              </el-button-group>
              <el-button v-if="!trashMode.moments" type="primary" @click="resetMoment">新瞬间</el-button>
            </div>
          </div>
          <div v-if="!trashMode.moments" class="panel-body compact-form">
            <el-input v-model="momentForm.content" type="textarea" :rows="3" placeholder="内容" />
            <el-input v-model="momentForm.kind" placeholder="类型，例如 life" />
            <el-input v-model="momentForm.tagText" placeholder="标签，逗号分隔" />
            <el-input v-model="momentForm.image_url" placeholder="图片 URL" />
            <el-select v-model="momentForm.status"><el-option label="发布" value="published" /><el-option label="草稿" value="draft" /></el-select>
            <div class="button-row">
              <label class="image-upload-button">
                上传并裁剪图片
                <input type="file" :accept="acceptedImageTypes" @change="openCropUpload($event, momentForm, 'image_url', 'square')" />
              </label>
              <el-button type="primary" @click="saveMoment">保存瞬间</el-button>
            </div>
            <img v-if="momentForm.image_url" class="image-preview" :src="momentForm.image_url" alt="">
          </div>
        </div>
        <div class="panel">
          <div class="content-tools">
            <div class="content-filters">
              <el-input v-model="contentFilters.moments.q" clearable placeholder="搜索内容或类型" @keyup.enter="loadMoments" />
              <el-select v-model="contentFilters.moments.status" clearable placeholder="状态">
                <el-option label="草稿" value="draft" />
                <el-option label="已发布" value="published" />
              </el-select>
              <el-input v-model="contentFilters.moments.kind" clearable placeholder="类型：life / note" />
              <el-button @click="loadMoments">筛选</el-button>
              <el-button text @click="resetContentFilters('moments')">重置</el-button>
            </div>
            <div class="content-bulk">
              <span class="selection-count">已选 {{ selectedContentIds('moments').length }} 条</span>
              <el-button tag="a" :href="contentExportHref('moments')" target="_blank">导出 CSV</el-button>
              <template v-if="trashMode.moments">
                <el-button type="success" :disabled="selectedContentIds('moments').length === 0" @click="runBatchContent('moments', 'restore')">批量恢复</el-button>
              </template>
              <template v-else>
                <el-button :disabled="selectedContentIds('moments').length === 0" @click="runBatchContent('moments', 'publish')">批量发布</el-button>
                <el-button :disabled="selectedContentIds('moments').length === 0" @click="runBatchContent('moments', 'hide')">批量草稿</el-button>
                <el-button type="danger" plain :disabled="selectedContentIds('moments').length === 0" @click="runBatchContent('moments', 'delete')">批量回收</el-button>
              </template>
            </div>
          </div>
          <el-table :data="moments" stripe row-key="id" @selection-change="setContentSelection('moments', $event)">
            <el-table-column type="selection" width="44" />
            <el-table-column prop="content" label="内容" min-width="260" />
            <el-table-column prop="kind" label="类型" width="110" />
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <el-tag size="small" effect="plain" :type="row.status === 'published' ? 'success' : 'info'">{{ contentStatusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="250">
              <template #default="{ row }">
                <template v-if="row.deleted_at">
                  <el-button size="small" type="success" @click="restoreMoment(row.id)">恢复</el-button>
                </template>
                <template v-else>
                  <el-button size="small" @click="editMoment(row)">编辑</el-button>
                  <el-button size="small" @click="hideMoment(row.id)">隐藏</el-button>
                  <el-button size="small" type="danger" @click="destroyMoment(row.id)">移入回收站</el-button>
                </template>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </section>

      <section v-else-if="view === 'hz'" class="page-stack hz-page">
        <div class="panel">
          <div class="panel-head">
            <div>
              <span class="eyebrow">Hz Library</span>
              <h2>Hz</h2>
              <p>维护前台随机小字、歌词和短句；保存后会进入后端内容库。</p>
            </div>
            <div class="button-row">
              <el-button-group>
                <el-button :type="trashMode.hzQuotes ? 'default' : 'primary'" @click="trashMode.hzQuotes = false; loadHzQuotes()">当前</el-button>
                <el-button :type="trashMode.hzQuotes ? 'primary' : 'default'" @click="trashMode.hzQuotes = true; loadHzQuotes()">回收站</el-button>
              </el-button-group>
              <el-button @click="resetHzQuote">新短句</el-button>
            </div>
          </div>
          <div v-if="!trashMode.hzQuotes" class="panel-body editor-form hz-editor">
            <el-input v-model="hzQuoteForm.text" type="textarea" :rows="5" placeholder="写一句歌词、小字或 Hz 短句，支持换行" />
            <div class="hz-side-form">
              <el-select v-model="hzQuoteForm.status"><el-option label="发布" value="published" /><el-option label="草稿" value="draft" /></el-select>
              <el-input-number v-model="hzQuoteForm.sortOrder" :min="-9999" :max="9999" />
              <label class="switch-row"><span>前台显示</span><el-switch v-model="hzQuoteForm.visible" /></label>
              <el-button type="primary" @click="saveHzQuote">保存 Hz</el-button>
            </div>
          </div>
        </div>
        <div class="panel">
          <div class="content-tools">
            <div class="content-filters">
              <el-input v-model="contentFilters.hzQuotes.q" clearable placeholder="搜索短句内容" />
              <el-select v-model="contentFilters.hzQuotes.status" clearable placeholder="状态">
                <el-option label="草稿" value="draft" />
                <el-option label="已发布" value="published" />
              </el-select>
            </div>
          </div>
          <el-table :data="filteredHzQuotes" stripe row-key="id">
            <el-table-column label="内容" min-width="320">
              <template #default="{ row }">
                <div class="quote-preview">{{ row.text }}</div>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <el-tag size="small" effect="plain" :type="row.status === 'published' ? 'success' : 'info'">{{ contentStatusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="sortOrder" label="排序" width="90" />
            <el-table-column label="更新时间" width="180"><template #default="{ row }">{{ formatAuditTime(row.updatedAt || row.createdAt) }}</template></el-table-column>
            <el-table-column label="操作" width="280">
              <template #default="{ row }">
                <template v-if="row.deletedAt">
                  <el-button size="small" type="success" @click="restoreHzQuote(row.id)">恢复</el-button>
                </template>
                <template v-else>
                  <el-button size="small" @click="editHzQuote(row)">编辑</el-button>
                  <el-button v-if="row.status !== 'published'" size="small" type="success" plain @click="publishHzQuote(row.id)">发布</el-button>
                  <el-button v-else size="small" @click="hideHzQuote(row.id)">隐藏</el-button>
                  <el-button size="small" type="danger" @click="destroyHzQuote(row.id)">移入回收站</el-button>
                </template>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </section>

      <section v-else-if="view === 'projects'" class="page-stack">
        <div class="panel">
          <div class="panel-head">
            <div><h2>项目</h2><p>维护项目页和项目详情。</p></div>
            <div class="button-row">
              <el-button-group>
                <el-button :type="trashMode.projects ? 'default' : 'primary'" @click="setTrashMode('projects', false)">当前</el-button>
                <el-button :type="trashMode.projects ? 'primary' : 'default'" @click="setTrashMode('projects', true)">回收站</el-button>
              </el-button-group>
              <el-button v-if="!trashMode.projects" type="primary" @click="resetProject">新项目</el-button>
            </div>
          </div>
          <div v-if="!trashMode.projects" class="panel-body compact-form">
            <el-input v-model="projectForm.name" placeholder="名称" />
            <el-input v-model="projectForm.slug" placeholder="slug" />
            <el-input v-model="projectForm.summary" placeholder="摘要" />
            <el-input v-model="projectForm.status_text" placeholder="状态文字" />
            <el-input-number v-model="projectForm.progress" :min="0" :max="100" />
            <el-input-number v-model="projectForm.sort_order" :min="0" :max="9999" />
            <el-input v-model="projectForm.cover_url" placeholder="封面 URL" />
            <el-select v-model="projectForm.status"><el-option label="显示" value="active" /><el-option label="归档" value="archived" /></el-select>
            <MarkdownBodyEditor v-model="projectForm.content_md" title="项目正文" :accepted-image-types="acceptedImageTypes" @upload-image="uploadMarkdownImage($event, projectForm, 'content_md')" />
            <div class="button-row full">
              <label class="image-upload-button">
                导入 Markdown
                <input type="file" accept=".md,.markdown,text/markdown,text/plain" @change="importProjectMarkdown" />
              </label>
              <label class="image-upload-button">
                上传并裁剪封面
                <input type="file" :accept="acceptedImageTypes" @change="openCropUpload($event, projectForm, 'cover_url', 'square')" />
              </label>
              <el-button type="primary" @click="saveProject">保存项目</el-button>
            </div>
            <img v-if="projectForm.cover_url" class="image-preview" :src="projectForm.cover_url" alt="">
          </div>
        </div>
        <div class="panel">
          <div class="content-tools">
            <div class="content-filters">
              <el-input v-model="contentFilters.projects.q" clearable placeholder="搜索名称、Slug、摘要或状态文字" @keyup.enter="loadProjects" />
              <el-select v-model="contentFilters.projects.status" clearable placeholder="状态">
                <el-option label="展示中" value="active" />
                <el-option label="已归档" value="archived" />
              </el-select>
              <el-button @click="loadProjects">筛选</el-button>
              <el-button text @click="resetContentFilters('projects')">重置</el-button>
            </div>
            <div class="content-bulk">
              <span class="selection-count">已选 {{ selectedContentIds('projects').length }} 条</span>
              <el-button tag="a" :href="contentExportHref('projects')" target="_blank">导出 CSV</el-button>
              <template v-if="trashMode.projects">
                <el-button type="success" :disabled="selectedContentIds('projects').length === 0" @click="runBatchContent('projects', 'restore')">批量恢复</el-button>
              </template>
              <template v-else>
                <el-button :disabled="selectedContentIds('projects').length === 0" @click="runBatchContent('projects', 'publish')">批量展示</el-button>
                <el-button :disabled="selectedContentIds('projects').length === 0" @click="runBatchContent('projects', 'hide')">批量归档</el-button>
                <el-button type="danger" plain :disabled="selectedContentIds('projects').length === 0" @click="runBatchContent('projects', 'delete')">批量回收</el-button>
              </template>
            </div>
          </div>
          <el-table :data="projects" stripe row-key="id" @selection-change="setContentSelection('projects', $event)">
            <el-table-column type="selection" width="44" />
            <el-table-column prop="name" label="名称" min-width="180" />
            <el-table-column prop="status_text" label="状态" min-width="220" />
            <el-table-column prop="progress" label="进度" width="90" />
            <el-table-column label="操作" width="250">
              <template #default="{ row }">
                <template v-if="row.deleted_at">
                  <el-button size="small" type="success" @click="restoreProject(row.id)">恢复</el-button>
                </template>
                <template v-else>
                  <el-button size="small" @click="editProject(row)">编辑</el-button>
                  <el-button size="small" @click="hideProject(row.id)">归档</el-button>
                  <el-button size="small" type="danger" @click="destroyProject(row.id)">移入回收站</el-button>
                </template>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </section>

      <section v-else-if="view === 'interviews'" class="page-stack interview-admin-page">
        <div class="panel interview-command-panel">
          <div class="panel-head">
            <div><h2>面试作战室</h2><p>专题、题库、面经和旧内容兼容集中维护；默认使用新版题库，不再把所有内容堆在一个表单里。</p></div>
            <div class="button-row">
              <el-button @click="loadInterviewWorkspace">刷新面试库</el-button>
              <el-button @click="resetInterviewGoal">新目标</el-button>
              <el-button @click="resetInterviewGoalUpdate">新复盘</el-button>
              <el-button type="primary" @click="resetInterviewQuestion">新题目</el-button>
              <el-button @click="resetInterviewReview">新面经</el-button>
            </div>
          </div>
          <div class="panel-body content-stat-grid interview-command-stats">
            <article><span>专题</span><strong>{{ interviewAdminSummary.topics }}</strong><p>{{ interviewAdminSummary.visibleTopics }} 个正在展示。</p></article>
            <article><span>目标计划</span><strong>{{ interviewAdminSummary.goals }}</strong><p>{{ interviewAdminSummary.visibleGoals }} 个节点前台可见。</p></article>
            <article><span>题库</span><strong>{{ interviewAdminSummary.questions }}</strong><p>{{ interviewAdminSummary.publishedQuestions }} 题已发布。</p></article>
            <article><span>训练完整</span><strong>{{ interviewDailySummary.completeQuestions }}</strong><p>{{ interviewDailySummary.missingQuestions }} 题还缺训练字段。</p></article>
            <article><span>今日题单</span><strong>{{ interviewDailySummary.todayTotal }}</strong><p>{{ interviewDailySummary.todayLabel }}</p></article>
            <article><span>旧内容</span><strong>{{ interviewAdminSummary.legacy }}</strong><p>保留兼容，可逐步迁移到题库。</p></article>
          </div>
          <div class="panel-body interview-daily-console">
            <div>
              <span class="mini-label">每日题单发布检查</span>
              <h3>{{ interviewDailySummary.date || '今日' }} · {{ interviewDailySummary.todayTitle }}</h3>
              <p>优先发布训练字段完整的题；旧题缺字段时前台会显示空状态，不会崩。</p>
            </div>
            <div class="button-row">
              <el-button @click="loadInterviewDailyStatus">刷新状态</el-button>
              <el-button type="primary" :loading="interviewDailyBusy" @click="publishInterviewDailySet">生成/更新今日 50 题</el-button>
            </div>
          </div>
        </div>

        <div class="interview-admin-grid">
          <div class="panel interview-editor-panel">
            <el-tabs v-model="interviewAdminTab">
              <el-tab-pane label="题库" name="questions">
                <div class="panel-body compact-form interview-form-card">
                  <div class="button-row full">
                    <el-select v-model="interviewQuestionForm.topicId" placeholder="所属专题">
                      <el-option v-for="topic in interviewTopicOptions" :key="topic.id" :label="topic.title" :value="topic.id" />
                    </el-select>
                    <el-select v-model="interviewQuestionForm.status" placeholder="状态">
                      <el-option label="草稿" value="draft" />
                      <el-option label="发布" value="published" />
                    </el-select>
                  </div>
                  <el-input v-model="interviewQuestionForm.title" placeholder="题目标题，例如：HashMap 为什么线程不安全？" />
                  <el-input v-model="interviewQuestionForm.slug" placeholder="slug，可留空自动生成" />
                  <el-input v-model="interviewQuestionForm.summary" placeholder="一句话摘要，前台卡片会用到" type="textarea" :rows="2" />
                  <div class="button-row full">
                    <el-select v-model="interviewQuestionForm.difficulty" placeholder="难度标签">
                      <el-option v-for="option in interviewDifficultyOptions" :key="option" :label="option" :value="option" />
                    </el-select>
                    <el-input v-model="interviewQuestionForm.source" placeholder="来源，例如 Java 基础 / 字节面经" />
                    <el-input-number v-model="interviewQuestionForm.sortOrder" :min="0" :max="9999" />
                  </div>
                  <el-input v-model="interviewQuestionForm.tagText" placeholder="标签，逗号分隔，例如 Java,集合,并发" />
                  <el-select v-model="interviewQuestionForm.goalIds" multiple collapse-tags collapse-tags-tooltip clearable placeholder="所属目标，可多选">
                    <el-option v-for="goal in interviewGoalOptions" :key="goal.id" :label="goal.optionLabel" :value="String(goal.id)" />
                  </el-select>
                  <div class="interview-training-fields">
                    <label v-for="field in interviewTrainingFieldDefs" :key="field.key" class="interview-training-field">
                      <span>{{ field.label }}</span>
                      <el-input v-model="interviewQuestionForm[field.textKey]" type="textarea" :rows="field.rows" :placeholder="field.placeholder" />
                    </label>
                  </div>
                  <MarkdownBodyEditor v-model="interviewQuestionForm.answer_md" title="标准答案 / 复盘笔记" :accepted-image-types="acceptedImageTypes" @upload-image="uploadMarkdownImage($event, interviewQuestionForm, 'answer_md')" />
                  <div class="button-row full">
                    <label class="image-upload-button">
                      导入题目 MD
                      <input type="file" accept=".md,.markdown,text/markdown,text/plain" @change="importInterviewQuestionMarkdown" />
                    </label>
                    <el-button @click="resetInterviewQuestion">清空</el-button>
                    <el-button type="primary" @click="saveInterviewQuestion">保存题目</el-button>
                  </div>
                </div>
              </el-tab-pane>

              <el-tab-pane label="专题" name="topics">
                <div class="panel-body compact-form interview-form-card">
                  <el-input v-model="interviewTopicForm.title" placeholder="专题名称，例如：Java 八股文" />
                  <el-input v-model="interviewTopicForm.slug" placeholder="slug，例如 java-basic" />
                  <el-input v-model="interviewTopicForm.description" placeholder="专题说明" type="textarea" :rows="4" />
                  <div class="button-row full">
                    <el-input-number v-model="interviewTopicForm.sortOrder" :min="0" :max="9999" />
                    <el-switch v-model="interviewTopicForm.visible" active-text="展示" inactive-text="隐藏" />
                  </div>
                  <div class="button-row full">
                    <el-button @click="resetInterviewTopic">清空</el-button>
                    <el-button type="primary" @click="saveInterviewTopic">保存专题</el-button>
                  </div>
                </div>
              </el-tab-pane>

              <el-tab-pane label="目标计划" name="goals">
                <div class="panel-body compact-form interview-form-card">
                  <el-alert title="目标树会在前台组成机器人路线图；“其他”为兜底分类，不建议隐藏或改名。" type="info" show-icon :closable="false" />
                  <div class="button-row full">
                    <el-select v-model="interviewGoalForm.parentId" clearable placeholder="父级目标">
                      <el-option label="根节点" value="" />
                      <el-option v-for="goal in interviewGoalOptions" :key="goal.id" :label="goal.optionLabel" :value="String(goal.id)" :disabled="String(goal.id) === String(interviewGoalForm.id)" />
                    </el-select>
                    <el-select v-model="interviewGoalForm.status" placeholder="进度状态">
                      <el-option v-for="option in interviewGoalStatusOptions" :key="option.value" :label="option.label" :value="option.value" />
                    </el-select>
                  </div>
                  <el-input v-model="interviewGoalForm.title" placeholder="目标名称，例如 FOC / ROS2 / STM32" />
                  <el-input v-model="interviewGoalForm.slug" placeholder="slug，可留空自动生成；其他分类固定为 other" />
                  <el-input v-model="interviewGoalForm.summary" placeholder="目标说明，前台卡片会展示" type="textarea" :rows="3" />
                  <div class="button-row full">
                    <el-input-number v-model="interviewGoalForm.targetCount" :min="0" :max="9999" />
                    <el-input-number v-model="interviewGoalForm.manualProgress" :min="0" :max="100" />
                    <el-input-number v-model="interviewGoalForm.sortOrder" :min="0" :max="9999" />
                  </div>
                  <div class="button-row full">
                    <el-input v-model="interviewGoalForm.accent" placeholder="强调色，例如 #e95f98" />
                    <el-input v-model="interviewGoalForm.icon" placeholder="图标文本，例如 foc / linux" />
                    <el-switch v-model="interviewGoalForm.visible" active-text="展示" inactive-text="隐藏" :disabled="interviewGoalForm.slug === 'other'" />
                  </div>
                  <div class="button-row full">
                    <el-button @click="resetInterviewGoal">清空目标</el-button>
                    <el-button type="primary" @click="saveInterviewGoal">保存目标</el-button>
                  </div>
                </div>

                <div class="panel-body compact-form interview-form-card">
                  <div class="button-row full">
                    <el-select v-model="interviewGoalUpdateForm.goalId" clearable placeholder="关联目标">
                      <el-option v-for="goal in interviewGoalOptions" :key="goal.id" :label="goal.optionLabel" :value="String(goal.id)" />
                    </el-select>
                    <el-select v-model="interviewGoalUpdateForm.type" placeholder="记录类型">
                      <el-option v-for="option in interviewGoalUpdateTypeOptions" :key="option.value" :label="option.label" :value="option.value" />
                    </el-select>
                    <el-select v-model="interviewGoalUpdateForm.status" placeholder="状态">
                      <el-option label="草稿" value="draft" />
                      <el-option label="发布" value="published" />
                    </el-select>
                  </div>
                  <el-input v-model="interviewGoalUpdateForm.title" placeholder="记录标题，例如 FOC 电流环错题复盘" />
                  <div class="button-row full">
                    <el-select v-model="interviewGoalUpdateForm.relatedQuestionId" clearable filterable placeholder="关联题目，可选">
                      <el-option v-for="question in interviewQuestions" :key="question.id" :label="question.title" :value="question.id" />
                    </el-select>
                    <el-date-picker v-model="interviewGoalUpdateForm.happenedAt" type="date" value-format="YYYY-MM-DD" placeholder="发生日期" />
                    <el-input-number v-model="interviewGoalUpdateForm.sortOrder" :min="0" :max="9999" />
                  </div>
                  <MarkdownBodyEditor v-model="interviewGoalUpdateForm.body_md" title="进度 / 错题 / 复盘内容" :accepted-image-types="acceptedImageTypes" @upload-image="uploadMarkdownImage($event, interviewGoalUpdateForm, 'body_md')" />
                  <div class="button-row full">
                    <el-button @click="resetInterviewGoalUpdate">清空记录</el-button>
                    <el-button type="primary" @click="saveInterviewGoalUpdate">保存记录</el-button>
                  </div>
                </div>
              </el-tab-pane>

              <el-tab-pane label="面经" name="reviews">
                <div class="panel-body compact-form interview-form-card">
                  <div class="button-row full">
                    <el-input v-model="interviewReviewForm.companyAlias" placeholder="公司/方向，例如 字节 / 阿里云" />
                    <el-input v-model="interviewReviewForm.positionName" placeholder="岗位，例如 后端开发实习" />
                  </div>
                  <div class="button-row full">
                    <el-input v-model="interviewReviewForm.interviewRound" placeholder="轮次，例如 一面 / HR 面" />
                    <el-input v-model="interviewReviewForm.resultStatus" placeholder="结果，例如 已过 / 挂了 / 待反馈" />
                    <el-select v-model="interviewReviewForm.status" placeholder="状态">
                      <el-option label="草稿" value="draft" />
                      <el-option label="发布" value="published" />
                    </el-select>
                  </div>
                  <div class="button-row full">
                    <el-date-picker v-model="interviewReviewForm.happenedAt" type="date" value-format="YYYY-MM-DD" placeholder="面试日期" />
                    <el-input-number v-model="interviewReviewForm.sortOrder" :min="0" :max="9999" />
                  </div>
                  <MarkdownBodyEditor v-model="interviewReviewForm.summary_md" title="面经复盘" :accepted-image-types="acceptedImageTypes" @upload-image="uploadMarkdownImage($event, interviewReviewForm, 'summary_md')" />
                  <MarkdownBodyEditor v-model="interviewReviewForm.improvement_md" title="改进计划" :accepted-image-types="acceptedImageTypes" @upload-image="uploadMarkdownImage($event, interviewReviewForm, 'improvement_md')" />
                  <div class="button-row full">
                    <label class="image-upload-button">
                      导入面经 MD
                      <input type="file" accept=".md,.markdown,text/markdown,text/plain" @change="importInterviewReviewMarkdown" />
                    </label>
                    <el-button @click="resetInterviewReview">清空</el-button>
                    <el-button type="primary" @click="saveInterviewReview">保存面经</el-button>
                  </div>
                </div>
              </el-tab-pane>

              <el-tab-pane label="旧内容" name="legacy">
                <div v-if="!trashMode.interviews" class="panel-body compact-form interview-form-card">
                  <el-alert title="旧内容仍可编辑，但建议新内容用“题库 / 面经”管理，方便专题化和搜索治理。" type="info" show-icon :closable="false" />
                  <el-input v-model="interviewForm.title" placeholder="标题" />
                  <el-input v-model="interviewForm.slug" placeholder="slug" />
                  <el-input v-model="interviewForm.summary" placeholder="摘要" type="textarea" :rows="2" />
                  <div class="button-row full">
                    <el-select v-model="interviewForm.section" placeholder="分区"><el-option label="八股文专区" value="bagu" /><el-option label="面经" value="experience" /><el-option label="每日 50 题" value="daily50" /></el-select>
                    <el-select v-model="interviewForm.status"><el-option label="草稿" value="draft" /><el-option label="发布" value="published" /></el-select>
                    <el-input v-model="interviewForm.difficulty" placeholder="难度/标签，例如 高频" />
                    <el-input v-model="interviewForm.tagText" placeholder="标签，逗号分隔" />
                  </div>
                  <div class="button-row full">
                    <el-input-number v-model="interviewForm.question_count" :min="0" :max="999" />
                    <el-input-number v-model="interviewForm.finished_count" :min="0" :max="999" />
                    <el-input-number v-model="interviewForm.sort_order" :min="0" :max="9999" />
                  </div>
                  <MarkdownBodyEditor v-model="interviewForm.content_md" title="面试正文" :accepted-image-types="acceptedImageTypes" @upload-image="uploadMarkdownImage($event, interviewForm, 'content_md')" />
                  <div class="button-row full">
                    <label class="image-upload-button">
                      导入 Markdown
                      <input type="file" accept=".md,.markdown,text/markdown,text/plain" @change="importInterviewMarkdown" />
                    </label>
                    <el-button type="primary" @click="saveInterview">保存旧内容</el-button>
                  </div>
                </div>
              </el-tab-pane>
            </el-tabs>
          </div>

          <div class="panel interview-list-panel">
            <el-tabs v-model="interviewAdminTab">
              <el-tab-pane label="题库列表" name="questions">
                <div class="content-tools">
                  <div class="content-filters">
                    <el-input v-model="interviewQuestionFilters.q" clearable placeholder="搜索题目、摘要或答案" @keyup.enter="loadInterviewQuestions" />
                    <el-select v-model="interviewQuestionFilters.topic" clearable placeholder="专题">
                      <el-option v-for="topic in interviewTopicOptions" :key="topic.id" :label="topic.title" :value="topic.slug" />
                    </el-select>
                    <el-select v-model="interviewQuestionFilters.status" clearable placeholder="状态">
                      <el-option label="草稿" value="draft" />
                      <el-option label="已发布" value="published" />
                    </el-select>
                    <el-button @click="loadInterviewQuestions">筛选</el-button>
                    <el-button text @click="resetInterviewQuestionFilters">重置</el-button>
                  </div>
                  <div class="content-batch-bar interview-batch-bar">
                    <span class="selection-count">已选 {{ selectedContentIds('interviewQuestions').length }} 题</span>
                    <div class="button-row">
                      <label class="image-upload-button compact-upload-button">
                        批量导入 MD
                        <input type="file" multiple accept=".md,.markdown,text/markdown,text/plain" @change="importInterviewQuestionMarkdownBatch" />
                      </label>
                      <el-button :disabled="selectedContentIds('interviewQuestions').length === 0" @click="runBatchContent('interviewQuestions', 'publish')">批量发布</el-button>
                      <el-button :disabled="selectedContentIds('interviewQuestions').length === 0" @click="runBatchContent('interviewQuestions', 'hide')">转为草稿</el-button>
                      <el-button type="danger" plain :disabled="selectedContentIds('interviewQuestions').length === 0" @click="runBatchContent('interviewQuestions', 'delete')">移入回收</el-button>
                    </div>
                  </div>
                </div>
                <el-table :data="interviewQuestions" stripe row-key="id" @selection-change="setContentSelection('interviewQuestions', $event)">
                  <el-table-column type="selection" width="48" />
                  <el-table-column label="题目" min-width="260">
                    <template #default="{ row }">
                      <strong>{{ row.title }}</strong>
                      <small class="audit-resource-id">{{ row.topicTitle || topicLabelById(row.topicId) || '未归档专题' }} · {{ questionGoalTitles(row) }}</small>
                      <small class="audit-resource-id">{{ row.summary || '暂无摘要' }}</small>
                    </template>
                  </el-table-column>
                  <el-table-column prop="difficulty" label="难度" width="110" />
                  <el-table-column label="训练完整度" width="150">
                    <template #default="{ row }">
                      <div class="training-completeness" :class="{ ok: interviewTrainingCompleteness(row).missing.length === 0 }">
                        <strong>{{ interviewTrainingCompleteness(row).complete }}/{{ interviewTrainingCompleteness(row).total }}</strong>
                        <small>{{ interviewTrainingMissingText(row) }}</small>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag size="small" effect="plain" :type="row.status === 'published' ? 'success' : 'info'">{{ contentStatusLabel(row.status) }}</el-tag></template></el-table-column>
                  <el-table-column label="更新" width="150"><template #default="{ row }">{{ formatAuditTime(row.updatedAt) }}</template></el-table-column>
                  <el-table-column label="操作" width="250">
                    <template #default="{ row }">
                      <el-button size="small" @click="editInterviewQuestion(row)">编辑</el-button>
                      <el-button size="small" @click="hideInterviewQuestion(row.id)">草稿</el-button>
                      <el-button size="small" type="success" @click="publishInterviewQuestion(row.id)">发布</el-button>
                      <el-button size="small" type="danger" plain @click="destroyInterviewQuestion(row.id)">回收</el-button>
                    </template>
                  </el-table-column>
                </el-table>
              </el-tab-pane>

              <el-tab-pane label="专题列表" name="topics">
                <el-table :data="interviewTopics" stripe row-key="id">
                  <el-table-column label="专题" min-width="240">
                    <template #default="{ row }">
                      <strong>{{ row.title }}</strong>
                      <small class="audit-resource-id">{{ row.slug }} · {{ row.description || '暂无说明' }}</small>
                    </template>
                  </el-table-column>
                  <el-table-column label="题目" width="130"><template #default="{ row }">{{ row.publishedQuestionCount || 0 }}/{{ row.questionCount || 0 }}</template></el-table-column>
                  <el-table-column label="展示" width="90"><template #default="{ row }"><el-tag size="small" effect="plain" :type="row.visible ? 'success' : 'info'">{{ row.visible ? '展示' : '隐藏' }}</el-tag></template></el-table-column>
                  <el-table-column label="操作" width="230">
                    <template #default="{ row }">
                      <el-button size="small" @click="editInterviewTopic(row)">编辑</el-button>
                      <el-button size="small" @click="hideInterviewTopic(row.id)">隐藏</el-button>
                      <el-button size="small" type="success" @click="publishInterviewTopic(row.id)">展示</el-button>
                      <el-button size="small" type="danger" plain @click="destroyInterviewTopic(row.id)">回收</el-button>
                    </template>
                  </el-table-column>
                </el-table>
              </el-tab-pane>

              <el-tab-pane label="目标计划" name="goals">
                <div class="content-tools">
                  <div class="content-filters">
                    <el-button @click="loadInterviewGoals">刷新目标</el-button>
                    <el-button @click="loadInterviewGoalUpdates">刷新记录</el-button>
                  </div>
                </div>
                <el-table :data="interviewGoals" stripe row-key="id">
                  <el-table-column label="目标节点" min-width="260">
                    <template #default="{ row }">
                      <strong>{{ row.title }}</strong>
                      <small class="audit-resource-id">{{ goalLabelById(row.parentId) || '根节点' }} · {{ row.slug }} · {{ row.summary || '暂无说明' }}</small>
                    </template>
                  </el-table-column>
                  <el-table-column label="状态" width="110"><template #default="{ row }"><el-tag size="small" effect="plain">{{ row.statusLabel || goalStatusLabel(row.status) }}</el-tag></template></el-table-column>
                  <el-table-column label="进度" width="150">
                    <template #default="{ row }">{{ row.manualProgress || 0 }}% 手动 / {{ row.autoProgress || 0 }}% 题库</template>
                  </el-table-column>
                  <el-table-column label="题目/错题" width="130"><template #default="{ row }">{{ row.questionCount || 0 }} / {{ (row.weakCount || 0) + (row.mistakeCount || 0) }}</template></el-table-column>
                  <el-table-column label="展示" width="90"><template #default="{ row }"><el-tag size="small" effect="plain" :type="row.visible ? 'success' : 'info'">{{ row.visible ? '展示' : '隐藏' }}</el-tag></template></el-table-column>
                  <el-table-column label="操作" width="280">
                    <template #default="{ row }">
                      <el-button size="small" @click="editInterviewGoal(row)">编辑</el-button>
                      <el-button size="small" :disabled="row.slug === 'other'" @click="hideInterviewGoal(row.id)">隐藏</el-button>
                      <el-button size="small" type="success" @click="publishInterviewGoal(row.id)">展示</el-button>
                      <el-button size="small" type="danger" plain :disabled="row.slug === 'other'" @click="destroyInterviewGoal(row.id)">回收</el-button>
                    </template>
                  </el-table-column>
                </el-table>

                <el-divider content-position="left">进度 / 错题 / 复盘记录</el-divider>
                <el-table :data="interviewGoalUpdates" stripe row-key="id">
                  <el-table-column label="记录" min-width="280">
                    <template #default="{ row }">
                      <strong>{{ row.title }}</strong>
                      <small class="audit-resource-id">{{ row.goalTitle || goalLabelById(row.goalId) || '其他' }} · {{ row.relatedQuestionTitle || '无关联题目' }}</small>
                    </template>
                  </el-table-column>
                  <el-table-column label="类型" width="100"><template #default="{ row }"><el-tag size="small" effect="plain">{{ goalUpdateTypeLabel(row.type) }}</el-tag></template></el-table-column>
                  <el-table-column label="日期" width="130"><template #default="{ row }">{{ row.happenedAt || '-' }}</template></el-table-column>
                  <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag size="small" effect="plain" :type="row.status === 'published' ? 'success' : 'info'">{{ contentStatusLabel(row.status) }}</el-tag></template></el-table-column>
                  <el-table-column label="操作" width="250">
                    <template #default="{ row }">
                      <el-button size="small" @click="editInterviewGoalUpdate(row)">编辑</el-button>
                      <el-button size="small" @click="hideInterviewGoalUpdate(row.id)">草稿</el-button>
                      <el-button size="small" type="success" @click="publishInterviewGoalUpdate(row.id)">发布</el-button>
                      <el-button size="small" type="danger" plain @click="destroyInterviewGoalUpdate(row.id)">回收</el-button>
                    </template>
                  </el-table-column>
                </el-table>
              </el-tab-pane>

              <el-tab-pane label="面经列表" name="reviews">
                <div class="content-tools">
                  <div class="content-filters">
                    <el-input v-model="interviewReviewFilters.q" clearable placeholder="搜索公司、岗位或复盘内容" @keyup.enter="loadInterviewReviews" />
                    <el-select v-model="interviewReviewFilters.status" clearable placeholder="状态">
                      <el-option label="草稿" value="draft" />
                      <el-option label="已发布" value="published" />
                    </el-select>
                    <el-button @click="loadInterviewReviews">筛选</el-button>
                    <el-button text @click="resetInterviewReviewFilters">重置</el-button>
                  </div>
                  <div class="content-batch-bar interview-batch-bar">
                    <span class="selection-count">已选 {{ selectedContentIds('interviewReviews').length }} 篇</span>
                    <div class="button-row">
                      <label class="image-upload-button compact-upload-button">
                        批量导入 MD
                        <input type="file" multiple accept=".md,.markdown,text/markdown,text/plain" @change="importInterviewReviewMarkdownBatch" />
                      </label>
                      <el-button :disabled="selectedContentIds('interviewReviews').length === 0" @click="runBatchContent('interviewReviews', 'publish')">批量发布</el-button>
                      <el-button :disabled="selectedContentIds('interviewReviews').length === 0" @click="runBatchContent('interviewReviews', 'hide')">转为草稿</el-button>
                      <el-button type="danger" plain :disabled="selectedContentIds('interviewReviews').length === 0" @click="runBatchContent('interviewReviews', 'delete')">移入回收</el-button>
                    </div>
                  </div>
                </div>
                <el-table :data="interviewReviews" stripe row-key="id" @selection-change="setContentSelection('interviewReviews', $event)">
                  <el-table-column type="selection" width="48" />
                  <el-table-column label="面经" min-width="260">
                    <template #default="{ row }">
                      <strong>{{ row.companyAlias }} · {{ row.positionName || '岗位未填' }}</strong>
                      <small class="audit-resource-id">{{ row.interviewRound || '轮次未填' }} · {{ row.resultStatus || '结果未填' }}</small>
                    </template>
                  </el-table-column>
                  <el-table-column label="日期" width="130"><template #default="{ row }">{{ row.happenedAt || '-' }}</template></el-table-column>
                  <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag size="small" effect="plain" :type="row.status === 'published' ? 'success' : 'info'">{{ contentStatusLabel(row.status) }}</el-tag></template></el-table-column>
                  <el-table-column label="操作" width="250">
                    <template #default="{ row }">
                      <el-button size="small" @click="editInterviewReview(row)">编辑</el-button>
                      <el-button size="small" @click="hideInterviewReview(row.id)">草稿</el-button>
                      <el-button size="small" type="success" @click="publishInterviewReview(row.id)">发布</el-button>
                      <el-button size="small" type="danger" plain @click="destroyInterviewReview(row.id)">回收</el-button>
                    </template>
                  </el-table-column>
                </el-table>
              </el-tab-pane>

              <el-tab-pane label="旧内容列表" name="legacy">
                <div class="content-tools">
                  <div class="content-filters">
                    <el-input v-model="contentFilters.interviews.q" clearable placeholder="搜索标题、Slug 或摘要" @keyup.enter="loadLegacyInterviews" />
                    <el-select v-model="contentFilters.interviews.section" clearable placeholder="分区">
                      <el-option label="八股文专区" value="bagu" />
                      <el-option label="面经" value="experience" />
                      <el-option label="每日 50 题" value="daily50" />
                    </el-select>
                    <el-select v-model="contentFilters.interviews.status" clearable placeholder="状态">
                      <el-option label="草稿" value="draft" />
                      <el-option label="已发布" value="published" />
                    </el-select>
                    <el-button @click="loadLegacyInterviews">筛选</el-button>
                    <el-button text @click="resetContentFilters('interviews')">重置</el-button>
                  </div>
                  <div class="content-bulk">
                    <el-button-group>
                      <el-button :type="trashMode.interviews ? 'default' : 'primary'" @click="setTrashMode('interviews', false)">当前</el-button>
                      <el-button :type="trashMode.interviews ? 'primary' : 'default'" @click="setTrashMode('interviews', true)">回收站</el-button>
                    </el-button-group>
                    <span class="selection-count">已选 {{ selectedContentIds('interviews').length }} 条</span>
                    <el-button tag="a" :href="contentExportHref('interviews')" target="_blank">导出 CSV</el-button>
                    <template v-if="trashMode.interviews">
                      <el-button type="success" :disabled="selectedContentIds('interviews').length === 0" @click="runBatchContent('interviews', 'restore')">批量恢复</el-button>
                    </template>
                    <template v-else>
                      <el-button :disabled="selectedContentIds('interviews').length === 0" @click="runBatchContent('interviews', 'publish')">批量发布</el-button>
                      <el-button :disabled="selectedContentIds('interviews').length === 0" @click="runBatchContent('interviews', 'hide')">批量草稿</el-button>
                      <el-button type="danger" plain :disabled="selectedContentIds('interviews').length === 0" @click="runBatchContent('interviews', 'delete')">批量回收</el-button>
                    </template>
                  </div>
                </div>
                <el-table :data="interviews" stripe row-key="id" @selection-change="setContentSelection('interviews', $event)">
                  <el-table-column type="selection" width="44" />
                  <el-table-column prop="title" label="标题" min-width="220" />
                  <el-table-column prop="section_label" label="分区" width="130" />
                  <el-table-column label="状态" width="100">
                    <template #default="{ row }">
                      <el-tag size="small" effect="plain" :type="row.status === 'published' ? 'success' : 'info'">{{ contentStatusLabel(row.status) }}</el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column label="进度" width="110">
                    <template #default="{ row }">{{ row.question_count ? ((row.finished_count || 0) + '/' + row.question_count) : '-' }}</template>
                  </el-table-column>
                  <el-table-column label="操作" width="260">
                    <template #default="{ row }">
                      <template v-if="row.deleted_at">
                        <el-button size="small" type="success" @click="restoreInterview(row.id)">恢复</el-button>
                      </template>
                      <template v-else>
                        <el-button size="small" @click="editInterview(row)">编辑</el-button>
                        <el-button size="small" @click="hideInterview(row.id)">草稿</el-button>
                        <el-button size="small" type="danger" @click="destroyInterview(row.id)">移入回收站</el-button>
                      </template>
                    </template>
                  </el-table-column>
                </el-table>
              </el-tab-pane>
            </el-tabs>
          </div>
        </div>
      </section>

      <section v-else-if="view === 'comments'" class="page-stack">
        <div class="panel">
          <div class="panel-head">
            <div><h2>留言</h2><p>审核、隐藏和回收前台留言。</p></div>
            <div class="button-row">
              <el-button-group>
                <el-button :type="trashMode.comments ? 'default' : 'primary'" @click="setTrashMode('comments', false)">当前</el-button>
                <el-button :type="trashMode.comments ? 'primary' : 'default'" @click="setTrashMode('comments', true)">回收站</el-button>
              </el-button-group>
              <el-button @click="loadComments">刷新</el-button>
            </div>
          </div>
          <div class="content-tools">
            <div class="content-filters">
              <el-input v-model="contentFilters.comments.q" clearable placeholder="搜索昵称、内容或位置" @keyup.enter="loadComments" />
              <el-select v-model="contentFilters.comments.status" clearable placeholder="审核状态">
                <el-option label="待审核" value="pending" />
                <el-option label="已发布" value="published" />
                <el-option label="已隐藏" value="hidden" />
              </el-select>
              <el-input v-model="contentFilters.comments.target" clearable placeholder="位置：post:slug / project:id" />
              <el-button @click="loadComments">筛选</el-button>
              <el-button text @click="resetContentFilters('comments')">重置</el-button>
            </div>
            <div class="content-bulk">
              <span class="selection-count">已选 {{ selectedContentIds('comments').length }} 条</span>
              <el-button tag="a" :href="contentExportHref('comments')" target="_blank">导出 CSV</el-button>
              <template v-if="trashMode.comments">
                <el-button type="success" :disabled="selectedContentIds('comments').length === 0" @click="runBatchContent('comments', 'restore')">批量恢复</el-button>
              </template>
              <template v-else>
                <el-button :disabled="selectedContentIds('comments').length === 0" @click="runBatchContent('comments', 'publish')">批量发布</el-button>
                <el-button :disabled="selectedContentIds('comments').length === 0" @click="runBatchContent('comments', 'hide')">批量隐藏</el-button>
                <el-button type="danger" plain :disabled="selectedContentIds('comments').length === 0" @click="runBatchContent('comments', 'delete')">批量回收</el-button>
              </template>
            </div>
          </div>
          <el-table :data="comments" stripe row-key="id" @selection-change="setContentSelection('comments', $event)">
            <el-table-column type="selection" width="44" />
            <el-table-column prop="author_name" label="昵称" width="140" />
            <el-table-column prop="target" label="位置" width="160" />
            <el-table-column prop="content" label="内容" min-width="260" />
            <el-table-column label="审核" width="210">
              <template #default="{ row }">
                <div class="comment-review-cell">
                  <el-tag size="small" effect="plain" :type="commentStatusType(row.status)">{{ commentStatusLabel(row.status) }}</el-tag>
                  <small v-if="row.moderation_reason">{{ row.moderation_reason }}</small>
                  <small v-else-if="row.reviewed_at">已复核：{{ formatAuditTime(row.reviewed_at) }}</small>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="匿名指纹" width="150">
              <template #default="{ row }">
                <code class="comment-fingerprint">{{ shortHash(row.ip_hash) }}</code>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="280">
              <template #default="{ row }">
                <template v-if="row.deleted_at">
                  <el-button size="small" type="success" @click="restoreComment(row.id)">恢复</el-button>
                </template>
                <template v-else>
                  <el-button size="small" @click="publishComment(row.id)">发布</el-button>
                  <el-button size="small" @click="hideComment(row.id)">隐藏</el-button>
                  <el-button size="small" type="danger" @click="destroyComment(row.id)">移入回收站</el-button>
                </template>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </section>

      <section v-else-if="view === 'frontend'" class="frontend-editor">
        <div class="panel frontend-toolbar">
          <div class="panel-body toolbar-line">
            <div>
              <h2>页面装修</h2>
              <p>点左侧真实页面元素，右侧只编辑当前对象。草稿不会影响真实前台。</p>
            </div>
            <div class="button-row">
              <el-select v-model="editorPage" class="page-select" @change="reloadPreview">
                <el-option v-for="page in editorPages" :key="page.path" :label="page.label" :value="page.path" />
              </el-select>
              <el-radio-group v-model="editorViewport"><el-radio-button label="desktop">桌面</el-radio-button><el-radio-button label="mobile">手机</el-radio-button></el-radio-group>
              <el-button @click="reloadPreview">刷新预览</el-button>
              <el-button @click="saveFrontendDraft" :loading="editorSaving">保存草稿</el-button>
              <el-button type="primary" @click="publishFrontend" :loading="editorSaving">发布</el-button>
              <el-button @click="restoreFrontend">恢复上一版</el-button>
            </div>
          </div>
        </div>

        <div v-if="editorPayload" class="frontend-grid" v-loading="editorLoading">
          <section class="panel preview-panel" :class="editorViewport">
            <iframe ref="previewFrame" :src="previewSrc" @load="sendPreviewPatch"></iframe>
          </section>
          <aside class="panel inspector-panel">
            <div class="inspector-head">
              <strong>{{ selectedLabel }}</strong>
              <span>草稿：{{ editorDraftLabel }}</span>
            </div>
            <el-tabs v-model="editorTab">
              <el-tab-pane label="选中项" name="selected">
                <div v-if="selectedTextKey" class="inspector-section">
                  <label>{{ textLabel(selectedTextKey) }}</label>
                  <textarea :value="editorPayload.texts[selectedTextKey]" rows="4" @input="updateEditorText(selectedTextKey, $event.target.value)"></textarea>
                </div>
                <div v-else-if="selectedContent" class="inspector-section">
                  <h3>{{ selectedContent.title }}</h3>
                  <p>{{ selectedContent.desc }}</p>
                  <el-button type="primary" @click="go(selectedContent.path)">打开编辑页</el-button>
                </div>
                <div v-else-if="selectedUiEditor" class="inspector-section selected-ui-editor">
                  <h3>{{ selectedUiEditor.title }}</h3>
                  <template v-if="selectedUiEditor.type === 'archive-category'">
                    <label>名称<el-input v-model="selectedUiEditor.item.label" @input="sendPreviewPatch" /></label>
                    <label>说明<el-input v-model="selectedUiEditor.item.description" @input="sendPreviewPatch" /></label>
                    <label>数量文本<el-input v-model="selectedUiEditor.item.countText" @input="sendPreviewPatch" /></label>
                    <label>slug<el-input v-model="selectedUiEditor.item.slug" @input="sendPreviewPatch" /></label>
                    <label>链接<el-input v-model="selectedUiEditor.item.href" @input="sendPreviewPatch" /></label>
                    <label>排序<el-input-number v-model="selectedUiEditor.item.sortOrder" :min="0" :max="9999" @change="sendPreviewPatch" /></label>
                    <div class="switch-row"><span>首页显示</span><el-switch v-model="selectedUiEditor.item.visibleInHome" @change="sendPreviewPatch" /></div>
                    <div class="switch-row"><span>小记页显示</span><el-switch v-model="selectedUiEditor.item.visibleInArchive" @change="sendPreviewPatch" /></div>
                  </template>
                  <template v-else-if="selectedUiEditor.type === 'about-stack-list'">
                    <p>编辑关于页 Stack 卡片里的全部技术项。</p>
                    <div class="ui-editor-list compact">
                      <article v-for="(item, index) in editorPayload.ui.aboutStackItems" :key="item.id || index" class="ui-edit-card" :class="{ selected: selectedUiTarget === `ui:about-stack:${item.id}` }" @click="selectUiTarget(`ui:about-stack:${item.id}`, item.label || item.id)">
                        <div class="ui-field-grid stack-fields">
                          <label>标识<input v-model="item.id" @input="sendPreviewPatch" /></label>
                          <label>文字<input v-model="item.label" @input="sendPreviewPatch" /></label>
                          <label>排序<input v-model.number="item.sortOrder" type="number" @input="sendPreviewPatch" /></label>
                          <label><input v-model="item.visible" type="checkbox" @change="sendPreviewPatch" /> 显示</label>
                          <button type="button" @click.stop="removeStackItem(index)">删除</button>
                        </div>
                      </article>
                      <button type="button" class="plain-button" @click="addStackItem">添加技术项</button>
                    </div>
                  </template>
                  <template v-else-if="selectedUiEditor.type === 'about-stack'">
                    <label>文字<el-input v-model="selectedUiEditor.item.label" @input="sendPreviewPatch" /></label>
                    <label>标识<el-input v-model="selectedUiEditor.item.id" @input="sendPreviewPatch" /></label>
                    <label>排序<el-input-number v-model="selectedUiEditor.item.sortOrder" :min="0" :max="9999" @change="sendPreviewPatch" /></label>
                    <div class="switch-row"><span>显示</span><el-switch v-model="selectedUiEditor.item.visible" @change="sendPreviewPatch" /></div>
                  </template>
                  <template v-else-if="selectedUiEditor.type === 'about-gallery'">
                    <img v-if="selectedUiEditor.item.url" class="image-preview about-gallery-preview" :src="selectedUiEditor.item.url" alt="">
                    <label>图片链接<el-input v-model="selectedUiEditor.item.url" placeholder="https:// 或 /uploads/..." @input="sendPreviewPatch" /></label>
                    <label>排序<el-input-number v-model="selectedUiEditor.item.sortOrder" :min="0" :max="9999" @change="sendPreviewPatch" /></label>
                    <div class="switch-row"><span>前台显示</span><el-switch v-model="selectedUiEditor.item.visible" @change="sendPreviewPatch" /></div>
                  </template>
                  <template v-else-if="selectedUiEditor.type === 'profile'">
                    <img class="image-preview round" :src="selectedUiEditor.item.avatarUrl" alt="">
                    <label>头像 URL<el-input v-model="selectedUiEditor.item.avatarUrl" @input="sendPreviewPatch" /></label>
                    <label class="image-upload-button">
                      上传头像
                      <input type="file" :accept="acceptedImageTypes" @change="openCropUpload($event, selectedUiEditor.item, 'avatarUrl', 'avatar')" />
                    </label>
                  </template>
                  <el-button @click="editorTab = 'ui'">打开完整列表</el-button>
                </div>
                <div v-else-if="selectedUiInfo" class="inspector-section">
                  <h3>{{ selectedUiInfo.title }}</h3>
                  <el-input v-model="selectedUiInfo.model.value" @input="sendPreviewPatch" />
                </div>
                <p v-else class="empty-note">点击左侧页面里的标题、导航、卡片、标签或留言。</p>
              </el-tab-pane>
              <el-tab-pane label="文案" name="texts">
                <el-input v-model="textSearch" placeholder="搜索文案 key 或标签" clearable />
                <div class="text-list">
                  <label v-for="item in filteredDefinitions" :key="item.key" class="text-row">
                    <span>{{ item.label }} · {{ item.key }}</span>
                    <textarea :value="editorPayload.texts[item.key]" rows="2" @input="updateEditorText(item.key, $event.target.value)"></textarea>
                  </label>
                </div>
              </el-tab-pane>
              <el-tab-pane label="分类/标签" name="ui">
                <h3>头像</h3>
                <div class="image-field-card">
                  <img :src="editorPayload.ui.profile.avatarUrl" alt="">
                  <div>
                    <strong>头像</strong>
                    <el-input v-model="editorPayload.ui.profile.avatarUrl" placeholder="头像 URL" @input="sendPreviewPatch" />
                    <label class="image-upload-button">
                      圆形裁剪头像
                      <input type="file" :accept="acceptedImageTypes" @change="openCropUpload($event, editorPayload.ui.profile, 'avatarUrl', 'avatar')" />
                    </label>
                  </div>
                </div>
                <h3>首页/札记分类</h3>
                <div class="ui-editor-list">
                  <article v-for="(item, index) in editorPayload.ui.archiveCategories" :key="item.id || index" class="ui-edit-card" :class="{ selected: selectedUiTarget === `ui:archive-category:${item.id}` }" @click="selectUiTarget(`ui:archive-category:${item.id}`, item.label || item.id)">
                    <header>
                      <strong>{{ item.label || '未命名分类' }}</strong>
                      <button type="button" @click.stop="removeArchiveCategory(index)">删除</button>
                    </header>
                    <div class="ui-field-grid">
                      <label>名称<input v-model="item.label" @input="sendPreviewPatch" /></label>
                      <label>slug<input v-model="item.slug" @input="sendPreviewPatch" /></label>
                      <label>说明<input v-model="item.description" @input="sendPreviewPatch" /></label>
                      <label>数量文本<input v-model="item.countText" @input="sendPreviewPatch" /></label>
                      <label class="wide">链接<input v-model="item.href" @input="sendPreviewPatch" /></label>
                      <label>排序<input v-model.number="item.sortOrder" type="number" @input="sendPreviewPatch" /></label>
                    </div>
                    <div class="check-row">
                      <label><input v-model="item.visibleInHome" type="checkbox" @change="sendPreviewPatch" /> 首页显示</label>
                      <label><input v-model="item.visibleInArchive" type="checkbox" @change="sendPreviewPatch" /> 札记页显示</label>
                    </div>
                  </article>
                  <button type="button" class="plain-button" @click="addArchiveCategory">添加分类</button>
                </div>
                <h3>关于页技术栈</h3>
                <div class="ui-editor-list compact">
                  <article v-for="(item, index) in editorPayload.ui.aboutStackItems" :key="item.id || index" class="ui-edit-card" :class="{ selected: selectedUiTarget === `ui:about-stack:${item.id}` }" @click="selectUiTarget(`ui:about-stack:${item.id}`, item.label || item.id)">
                    <div class="ui-field-grid stack-fields">
                      <label>标识<input v-model="item.id" @input="sendPreviewPatch" /></label>
                      <label>文字<input v-model="item.label" @input="sendPreviewPatch" /></label>
                      <label>排序<input v-model.number="item.sortOrder" type="number" @input="sendPreviewPatch" /></label>
                      <label><input v-model="item.visible" type="checkbox" @change="sendPreviewPatch" /> 显示</label>
                      <button type="button" @click.stop="removeStackItem(index)">删除</button>
                    </div>
                  </article>
                  <button type="button" class="plain-button" @click="addStackItem">添加技术项</button>
                </div>
                <h3>About 图库</h3>
                <p class="muted-hint">图库已单独整理到“前端 → About 图库”，支持批量加图、顺序调整和发布。</p>
                <div class="empty-note gallery-empty-state">
                  当前配置 {{ editorPayload.ui.aboutGalleryImages?.length || 0 }} 张图片。
                  <el-button size="small" @click="go('/about-gallery')">去 About 图库维护</el-button>
                </div>
                <h3>瞬间筛选</h3>
                <div class="editable-list">
                  <div v-for="(item, index) in editorPayload.ui.momentKinds" :key="item.id || index" class="editable-row">
                    <input v-model="item.label" placeholder="名称" @input="sendPreviewPatch" />
                    <input v-model="item.kind" placeholder="kind" @input="sendPreviewPatch" />
                    <input v-model="item.href" placeholder="链接" @input="sendPreviewPatch" />
                    <label><input v-model="item.visible" type="checkbox" @change="sendPreviewPatch" /> 显示</label>
                    <button type="button" @click="removeMomentKind(index)">删除</button>
                  </div>
                  <button type="button" class="plain-button" @click="addMomentKind">添加</button>
                </div>
                <h3>搜索建议</h3>
                <div class="editable-list">
                  <div v-for="(item, index) in editorPayload.ui.searchSuggestions" :key="item.id || index" class="editable-row">
                    <input v-model="item.label" placeholder="名称" @input="sendPreviewPatch" />
                    <input v-model="item.slug" placeholder="slug" @input="sendPreviewPatch" />
                    <input v-model="item.href" placeholder="链接" @input="sendPreviewPatch" />
                    <label><input v-model="item.visible" type="checkbox" @change="sendPreviewPatch" /> 显示</label>
                    <button type="button" @click="removeSearchSuggestion(index)">删除</button>
                  </div>
                  <button type="button" class="plain-button" @click="addSearchSuggestion">添加</button>
                </div>
              </el-tab-pane>
              <el-tab-pane label="布局" name="layout">
                <div class="layout-grid">
                  <label v-for="item in layoutSwitches" :key="item.path" class="switch-row">
                    <span>{{ item.label }}</span>
                    <el-switch v-model="item.model.value" @change="sendPreviewPatch" />
                  </label>
                </div>
                <div class="layout-grid">
                  <label>首页宽度<el-select v-model="editorPayload.layout.home.width" @change="sendPreviewPatch"><el-option label="标准" value="standard" /><el-option label="窄" value="narrow" /><el-option label="宽" value="wide" /></el-select></label>
                  <label>密度<el-select v-model="editorPayload.layout.home.density" @change="sendPreviewPatch"><el-option label="标准" value="standard" /><el-option label="紧凑" value="compact" /><el-option label="舒展" value="airy" /></el-select></label>
                  <label>项目卡片<el-select v-model="editorPayload.layout.projects.cardStyle" @change="sendPreviewPatch"><el-option label="封面" value="cover" /><el-option label="紧凑" value="compact" /><el-option label="极简" value="minimal" /></el-select></label>
                </div>
              </el-tab-pane>
              <el-tab-pane label="页脚/规则" name="footer">
                <label class="full-field">页脚说明<el-input v-model="editorPayload.ui.footer.brandBody" type="textarea" :rows="3" @input="sendPreviewPatch" /></label>
                <div v-for="(section, index) in editorPayload.footerSections" :key="index" class="footer-edit-card">
                  <el-input v-model="section.title" placeholder="栏目标题" @input="sendPreviewPatch" />
                  <div v-for="(link, linkIndex) in section.links" :key="linkIndex" class="footer-link-row">
                    <el-input v-model="link.label" placeholder="名称" @input="sendPreviewPatch" />
                    <el-input v-model="link.href" placeholder="链接" @input="sendPreviewPatch" />
                    <el-input v-model="link.desc" placeholder="说明" @input="sendPreviewPatch" />
                    <el-button @click="section.links.splice(linkIndex, 1); sendPreviewPatch()">删</el-button>
                  </div>
                  <div class="button-row"><el-button @click="section.links.push({ label: '', href: '', desc: '' }); sendPreviewPatch()">加链接</el-button><el-button @click="editorPayload.footerSections.splice(index, 1); sendPreviewPatch()">删栏目</el-button></div>
                </div>
                <el-button @click="editorPayload.footerSections.push({ title: '', links: [] }); sendPreviewPatch()">加栏目</el-button>
                <label class="full-field">高级规则<el-input v-model="editorPayload.rules" type="textarea" :rows="6" @input="sendPreviewPatch" /></label>
              </el-tab-pane>
            </el-tabs>
          </aside>
        </div>
        <div v-else class="panel">
          <div class="panel-body empty-note">正在加载页面装修配置...</div>
        </div>
      </section>

      <section v-else-if="view === 'about-gallery'" class="page-stack about-gallery-page" v-loading="editorLoading">
        <div class="panel about-gallery-hero">
          <div class="panel-head">
            <div>
              <span class="eyebrow">About Gallery</span>
              <h2>About 图库</h2>
              <p>添加位置：后台 → 前端 → About 图库。这里维护关于页的 Reze 图片墙。</p>
            </div>
            <div class="button-row">
              <el-button tag="a" href="/about.html" target="_blank">打开关于页</el-button>
              <el-button @click="addAboutGalleryImage">添加图片</el-button>
              <el-button
                class="about-gallery-clean-button"
                type="warning"
                plain
                :disabled="aboutGalleryDuplicateCount === 0 || editorSaving"
                @click="removeDuplicateAboutGalleryImages"
              >
                清理重复{{ aboutGalleryDuplicateCount ? `（${aboutGalleryDuplicateCount}）` : "" }}
              </el-button>
              <el-button type="primary" :loading="editorSaving" @click="saveAboutGallery">保存发布</el-button>
            </div>
          </div>
          <div class="panel-body about-gallery-admin-shell">
            <div class="about-gallery-admin-summary">
              <article><span>已配置</span><strong>{{ aboutGalleryImages.length }}</strong><p>容量 {{ aboutGalleryLimit }} 张，还能继续加 {{ aboutGalleryRemaining }} 张。</p></article>
              <article><span>前台显示</span><strong>{{ aboutGalleryVisibleCount }}</strong><p>关闭显示的图片不会出现在 About 页。</p></article>
              <article><span>排序规则</span><strong>顺序保存</strong><p>用上移下移调整，保存后就是 1、2、3。</p></article>
            </div>
            <div class="about-gallery-bulk-card">
              <div>
                <span class="mini-label">Quick Add</span>
                <h3>批量添加图片</h3>
                <p>每行一个链接，支持 https、/uploads、/assets；重复链接会自动跳过。</p>
              </div>
              <label>
                <span>图片链接</span>
                <el-input v-model="aboutGalleryBulkText" type="textarea" :rows="4" placeholder="https://example.com/photo-01.jpg&#10;/uploads/about/reze-02.webp"></el-input>
              </label>
              <div class="about-gallery-bulk-actions">
                <el-button type="primary" @click="appendAboutGalleryBulkImages">批量加入</el-button>
                <el-button @click="normalizeAboutGalleryAdminOrder()">重排为 1,2,3</el-button>
              </div>
            </div>
            <div v-if="!aboutGalleryImages.length" class="empty-note gallery-empty-state">
              还没有图片。点“添加图片”，粘贴 https 图片链接，或上传本地图片后保存发布。
            </div>
            <div class="about-gallery-admin-list">
              <article v-for="(item, index) in aboutGalleryImages" :key="item.id || index" class="about-gallery-admin-card" :class="{ 'is-hidden': !item.visible }">
                <div class="about-gallery-admin-thumb-wrap">
                  <img v-if="item.url" :src="item.url" alt="" class="about-gallery-admin-thumb">
                  <span v-else>IMG</span>
                  <b>#{{ index + 1 }}</b>
                </div>
                <div class="about-gallery-admin-fields">
                  <div class="about-gallery-card-topline">
                    <div>
                      <span class="mini-label">Gallery Item</span>
                      <strong>第 {{ index + 1 }} 张</strong>
                    </div>
                    <el-switch v-model="item.visible" active-text="显示" inactive-text="隐藏" @change="sendPreviewPatch" />
                  </div>
                  <label class="about-gallery-url-field">
                    <span>图片链接</span>
                    <el-input v-model="item.url" placeholder="https:// 或 /uploads/..." clearable @input="sendPreviewPatch" />
                  </label>
                  <div class="about-gallery-admin-actions">
                    <el-button-group>
                      <el-button size="small" :disabled="index === 0" @click.stop="moveAboutGalleryImage(index, -1)">上移</el-button>
                      <el-button size="small" :disabled="index === aboutGalleryImages.length - 1" @click.stop="moveAboutGalleryImage(index, 1)">下移</el-button>
                    </el-button-group>
                    <label class="image-upload-button compact-upload">
                      上传图片
                      <input type="file" :accept="acceptedImageTypes" @change="uploadInto($event, item, 'url')" />
                    </label>
                    <el-button size="small" type="danger" plain @click.stop="removeAboutGalleryImage(index)">删除</el-button>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section v-else-if="view === 'nav-footer'" class="page-stack nav-footer-page" v-loading="editorLoading">
        <div class="panel texts-hero">
          <div class="panel-head">
            <div>
              <span class="eyebrow">Navigation & Footer</span>
              <h2>导航页脚</h2>
              <p>页尾说明和链接栏目放在这里，复杂页面文字仍去“文案管理”。</p>
            </div>
            <div class="button-row">
              <el-button tag="a" href="/" target="_blank">打开前台</el-button>
              <el-button type="primary" :loading="editorSaving" @click="saveNavFooter">保存发布</el-button>
            </div>
          </div>
          <div class="panel-body nav-footer-editor" v-if="editorPayload">
            <label class="full-field">页脚说明<el-input v-model="editorPayload.ui.footer.brandBody" type="textarea" :rows="3" @input="sendPreviewPatch" /></label>
            <section v-for="(section, index) in editorPayload.footerSections" :key="index" class="footer-edit-card nav-footer-card">
              <el-input v-model="section.title" placeholder="栏目标题" @input="sendPreviewPatch" />
              <div v-for="(link, linkIndex) in section.links" :key="linkIndex" class="footer-link-row">
                <el-input v-model="link.label" placeholder="名称" @input="sendPreviewPatch" />
                <el-input v-model="link.href" placeholder="链接" @input="sendPreviewPatch" />
                <el-input v-model="link.desc" placeholder="说明" @input="sendPreviewPatch" />
                <el-button @click="section.links.splice(linkIndex, 1); sendPreviewPatch()">删</el-button>
              </div>
              <div class="button-row">
                <el-button @click="section.links.push({ label: '', href: '', desc: '' }); sendPreviewPatch()">加链接</el-button>
                <el-button type="danger" plain @click="editorPayload.footerSections.splice(index, 1); sendPreviewPatch()">删栏目</el-button>
              </div>
            </section>
            <el-button @click="editorPayload.footerSections.push({ title: '', links: [] }); sendPreviewPatch()">加栏目</el-button>
          </div>
          <div v-else class="panel-body empty-note">正在加载导航页脚配置...</div>
        </div>
      </section>

      <section v-else-if="view === 'media'" class="page-stack media-page">
        <div class="panel">
          <div class="panel-head">
            <div>
              <span class="eyebrow">Media Assets</span>
              <h2>媒体资源</h2>
              <p>上传图片、查看引用和清理未使用资源，About 图库可直接使用这里的 /uploads 链接。</p>
            </div>
            <div class="button-row">
              <label class="image-upload-button">
                上传图片
                <input type="file" :accept="acceptedImageTypes" @change="uploadStandaloneAsset" />
              </label>
              <el-button @click="rescanMediaAssets">重扫引用</el-button>
              <el-button @click="loadMediaConsole">刷新</el-button>
            </div>
          </div>
          <div class="panel-body content-stat-grid">
            <article><span>媒体文件</span><strong>{{ cmsConsole.mediaAssets.length }}</strong><p>后台已登记的上传资源。</p></article>
            <article><span>可清理</span><strong>{{ cmsConsole.orphanMediaAssets.length }}</strong><p>引用数为 0 的媒体资源。</p></article>
            <article><span>上传路径</span><strong>/uploads</strong><p>复制链接可用于 About 图库。</p></article>
          </div>
          <el-table :data="cmsConsole.mediaAssets" stripe>
            <el-table-column label="文件" min-width="220">
              <template #default="{ row }">
                <div class="media-file-cell">
                  <img v-if="row.url" :src="row.url" alt="">
                  <div><strong>{{ row.filename }}</strong><small>{{ row.url || row.path }}</small></div>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="mime" label="类型" width="130" />
            <el-table-column label="大小" width="110"><template #default="{ row }">{{ formatFileSize(row.size) }}</template></el-table-column>
            <el-table-column prop="ref_count" label="引用" width="80" />
            <el-table-column label="最近引用" width="170"><template #default="{ row }">{{ formatAuditTime(row.last_ref_at || row.last_seen_at) }}</template></el-table-column>
            <el-table-column label="操作" width="130">
              <template #default="{ row }">
                <el-button v-if="Number(row.ref_count || 0) === 0" size="small" type="danger" @click="cleanupMediaAsset(row.id)">清理</el-button>
                <span v-else class="muted">使用中</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </section>

      <section v-else-if="view === 'texts'" class="page-stack texts-page">
        <div class="panel texts-hero">
          <div class="panel-head">
            <div>
              <span class="eyebrow">Copy Desk</span>
              <h2>文案管理</h2>
              <p>把全站文案按页面和模块分组，一次扫完也不会像在看数据库字段。</p>
            </div>
            <div class="button-row">
              <el-button @click="go('/frontend')">页面装修</el-button>
              <el-button type="primary" @click="saveSiteTexts">保存文案</el-button>
            </div>
          </div>
          <div class="panel-body text-group-grid" v-if="siteTexts">
            <section v-for="group in siteTextGroups" :key="group.key" class="text-group-card" :class="`tone-${group.tone}`">
              <header>
                <span>{{ group.icon }}</span>
                <div>
                  <h3>{{ group.title }}</h3>
                  <p>{{ group.items.length }} 个文案项</p>
                </div>
              </header>
              <label v-for="item in group.items" :key="item.key" class="text-field-card">
                <span>{{ item.label }}</span>
                <small>{{ item.key }}</small>
                <el-input v-model="siteTexts.texts[item.key]" type="textarea" :rows="2" />
              </label>
            </section>
            <details class="text-group-card tone-ops full-field advanced-rules-drawer">
              <summary>
                <span>※</span>
                <div>
                  <h3>高级规则</h3>
                  <p>用于临时覆盖没有预置 key 的前台文字，平时不用展开。</p>
                </div>
              </summary>
              <el-input v-model="siteTexts.rules" type="textarea" :rows="8" />
            </details>
          </div>
        </div>
      </section>

      <section v-else-if="view === 'settings'" class="page-stack settings-page">
        <div class="panel settings-hero">
          <div class="panel-head">
            <div>
              <span class="eyebrow">System Preferences</span>
              <h2>系统设置</h2>
              <p>站点身份、内容工作流、外部集成和运维提示统一放这里，不再只有一个输入框。</p>
            </div>
            <el-button type="primary" @click="saveSettings">保存设置</el-button>
          </div>
          <div class="panel-body settings-grid">
            <section class="settings-card identity-card">
              <header><span>站</span><div><h3>站点身份</h3><p>后台和前台统一认知。</p></div></header>
              <el-input v-model="settings.siteName" placeholder="站点名称，例如 Jlemonz2020" />
              <el-input v-model="settings.siteTagline" placeholder="站点副标题，例如 Ubuntu / ROS / FOC" />
              <el-input v-model="settings.adminWelcome" type="textarea" :rows="3" placeholder="后台欢迎语或维护提示" />
            </section>
            <section class="settings-card content-card">
              <header><span>文</span><div><h3>内容工作流</h3><p>让写作、发布和复盘有默认规则。</p></div></header>
              <el-input v-model="settings.defaultAuthor" placeholder="默认作者" />
              <el-input v-model="settings.contentFocus" type="textarea" :rows="3" placeholder="近期内容重点，例如 Ubuntu 环境 / ROS 项目 / FOC 调试" />
              <el-input v-model="settings.publishPolicy" type="textarea" :rows="3" placeholder="发布前检查规则，例如 标题、摘要、封面、标签" />
            </section>
            <section class="settings-card integration-card">
              <header><span>链</span><div><h3>集成与搜索</h3><p>GitHub 和站内搜索相关配置。</p></div></header>
              <el-input v-model="settings.githubUsername" placeholder="GitHub 用户名" />
              <el-input v-model="settings.searchHint" placeholder="搜索提示词，例如 Ubuntu、ROS、FOC、嵌入式调试..." />
              <el-input v-model="settings.reviewChecklist" type="textarea" :rows="3" placeholder="人工复核清单，例如 链接、图片、敏感信息" />
            </section>
            <section class="settings-card ops-card">
              <header><span>运</span><div><h3>运维备注</h3><p>把维护状态写清楚，回头不靠记忆。</p></div></header>
              <el-select v-model="settings.maintenanceStatus" placeholder="维护状态">
                <el-option label="正常运行" value="normal" />
                <el-option label="维护观察" value="watching" />
                <el-option label="暂缓发布" value="paused" />
              </el-select>
              <el-input v-model="settings.backupNote" type="textarea" :rows="4" placeholder="备份 / 部署 / 数据库注意事项" />
            </section>
          </div>
        </div>
      </section>

      <section v-else-if="view === 'system'" class="page-stack system-page">
        <div class="panel system-hero">
          <div class="panel-head">
            <div><h2>系统状态</h2><p>把运行模式、内容统计、上传目录和构建状态放到一个地方，后台不再黑盒。</p></div>
            <div class="button-row"><el-button @click="loadSystemStatus">刷新</el-button><el-button type="primary" @click="syncSearch">同步搜索</el-button></div>
          </div>
          <div class="panel-body system-summary" v-if="systemStatus">
            <article>
              <span>运行模式</span>
              <strong>{{ systemStatus.modeLabel }}</strong>
              <p>{{ systemStatus.modeDetail }}</p>
            </article>
            <article>
              <span>当前用户</span>
              <strong>{{ systemStatus.user?.username || '未识别' }}</strong>
              <p>{{ systemStatus.user?.preview ? '本地预览账号，适合调试 UI 与内容。' : '数据库管理员账号。' }}</p>
            </article>
            <article>
              <span>生成时间</span>
              <strong>{{ systemStatus.generatedAtText }}</strong>
              <p>每次刷新都会重新检查服务端状态。</p>
            </article>
          </div>
        </div>

        <div class="system-grid" v-if="systemStatus">
          <div class="panel">
            <div class="panel-head"><div><h2>服务巡检</h2><p>优先处理红色或黄色项。</p></div></div>
            <div class="panel-body status-list">
              <article v-for="check in systemChecks" :key="check.key" class="status-row" :class="toneClass(check)">
                <span>{{ check.label }}</span>
                <strong>{{ check.value }}</strong>
                <p>{{ check.detail }}</p>
              </article>
            </div>
          </div>
          <div class="panel">
            <div class="panel-head"><div><h2>资源路径</h2><p>确认后台静态包、上传目录和备份目录都在位。</p></div></div>
            <div class="panel-body resource-list">
              <article v-for="item in systemResources" :key="item.label">
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
                <code>{{ item.path }}</code>
                <p>{{ item.detail }}</p>
              </article>
            </div>
          </div>
        </div>

        <div class="panel" v-if="systemStatus">
          <div class="panel-head"><div><h2>内容资产</h2><p>后台真正管控的内容量和发布状态。</p></div></div>
          <div class="panel-body content-stat-grid">
            <article v-for="item in systemContentStats" :key="item.label">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
              <p>{{ item.detail }}</p>
            </article>
          </div>
        </div>

        <div class="panel" v-if="integrationStatus">
          <div class="panel-head">
            <div><h2>集成状态</h2><p>GitHub 仓库、贡献日历、RSS/Sitemap 和摸鱼日历集中治理，后台不再靠猜。</p></div>
            <div class="button-row">
              <el-button :loading="integrationBusy" @click="loadIntegrationStatus">刷新集成</el-button>
              <el-button :loading="integrationBusy" type="primary" @click="syncGithubRepositories">同步仓库</el-button>
              <el-button :loading="integrationBusy" @click="refreshGithubContributions">刷新贡献</el-button>
            </div>
          </div>
          <div class="panel-body content-stat-grid">
            <article><span>GitHub 用户</span><strong>{{ githubIntegration.username || '-' }}</strong><p>{{ githubIntegration.tokenConfigured ? '已配置 Token，可稳定读取。' : '未配置 Token，使用公开接口降级读取。' }}</p></article>
            <article><span>公开仓库</span><strong>{{ githubRepositories.length }}</strong><p>排除 fork / archived 后展示。</p></article>
            <article><span>贡献总数</span><strong>{{ githubContributionTotal }}</strong><p>{{ githubContributionMeta }}</p></article>
            <article><span>摸鱼模块</span><strong>{{ moyuIntegration.modules || 0 }}</strong><p>{{ moyuIntegration.refreshedAt ? `最近刷新：${formatAuditTime(moyuIntegration.refreshedAt)}` : '等待每日快照。' }}</p></article>
          </div>
          <div class="interaction-grid">
            <el-table class="stack-table" :data="githubRepositories" stripe>
              <el-table-column label="仓库" min-width="240">
                <template #default="{ row }">
                  <strong>{{ row.full_name || row.name }}</strong>
                  <small class="audit-resource-id">{{ row.description || '没有仓库说明' }}</small>
                </template>
              </el-table-column>
              <el-table-column prop="language" label="语言" width="110" />
              <el-table-column prop="stargazers_count" label="Stars" width="90" />
              <el-table-column prop="forks_count" label="Forks" width="90" />
              <el-table-column label="最近推送" width="170"><template #default="{ row }">{{ formatAuditTime(row.pushed_at) }}</template></el-table-column>
              <el-table-column label="打开" width="90"><template #default="{ row }"><el-button tag="a" :href="row.html_url" target="_blank" size="small">GitHub</el-button></template></el-table-column>
            </el-table>
            <el-table class="stack-table" :data="githubJobs" stripe>
              <el-table-column label="同步记录" min-width="180">
                <template #default="{ row }">
                  <strong>{{ taskStatusLabel(row.status) }}</strong>
                  <small class="audit-resource-id">{{ row.message || 'GitHub 仓库同步' }}</small>
                </template>
              </el-table-column>
              <el-table-column prop="repo_count" label="数量" width="90" />
              <el-table-column label="完成时间" width="170"><template #default="{ row }">{{ formatAuditTime(row.finished_at || row.created_at) }}</template></el-table-column>
            </el-table>
          </div>
          <div class="panel-body status-list integration-links">
            <article>
              <span>RSS</span>
              <strong>{{ feedLinks.rss || '/rss.xml' }}</strong>
              <p>公开订阅源已由后端生成。</p>
            </article>
            <article>
              <span>Sitemap</span>
              <strong>{{ feedLinks.sitemap || '/sitemap.xml' }}</strong>
              <p>搜索引擎地图已由后端生成。</p>
            </article>
          </div>
        </div>

        <div class="panel" v-if="interactionInsights">
          <div class="panel-head">
            <div><h2>互动观察</h2><p>最近 {{ interactionInsights.rangeDays || 7 }} 天访问、点赞和留言趋势，前台 PV 已做同访客去重。</p></div>
            <div class="button-row"><el-button @click="loadInteractionInsights">刷新互动</el-button><el-button @click="go('/comments')">处理留言</el-button></div>
          </div>
          <div class="panel-body content-stat-grid interaction-stat-grid">
            <article><span>访问量</span><strong>{{ interactionSummary.views }}</strong><p>页面和详情页 PV。</p></article>
            <article><span>独立访客</span><strong>{{ interactionSummary.uniqueVisitors }}</strong><p>按匿名指纹去重。</p></article>
            <article><span>点赞总数</span><strong>{{ interactionSummary.totalLikes }}</strong><p>{{ interactionSummary.likeTargets }} 个对象收到点赞。</p></article>
            <article><span>点赞动作</span><strong>{{ interactionSummary.reactionEvents }}</strong><p>最近周期内实际点击次数。</p></article>
            <article><span>点赞访客</span><strong>{{ interactionSummary.uniqueReactors }}</strong><p>按匿名访客去重。</p></article>
            <article><span>新增留言</span><strong>{{ interactionSummary.comments }}</strong><p>{{ interactionSummary.pendingComments }} 条待审核。</p></article>
          </div>
          <div class="interaction-grid">
            <el-table class="stack-table" :data="topViewTargets" stripe>
              <el-table-column label="热门访问" min-width="220">
                <template #default="{ row }">
                  <strong>{{ targetLabel(row.target) }}</strong>
                  <small class="audit-resource-id">{{ row.target }}</small>
                </template>
              </el-table-column>
              <el-table-column prop="views" label="PV" width="90" />
              <el-table-column prop="visitors" label="访客" width="90" />
              <el-table-column label="最近访问" width="170"><template #default="{ row }">{{ formatAuditTime(row.latest_at) }}</template></el-table-column>
            </el-table>
            <el-table class="stack-table" :data="topReactionTargets" stripe>
              <el-table-column label="热门点赞" min-width="220">
                <template #default="{ row }">
                  <strong>{{ targetLabel(row.target) }}</strong>
                  <small class="audit-resource-id">{{ row.target }}</small>
                </template>
              </el-table-column>
              <el-table-column prop="likes" label="点赞" width="90" />
              <el-table-column label="更新时间" width="170"><template #default="{ row }">{{ formatAuditTime(row.updated_at) }}</template></el-table-column>
            </el-table>
          </div>
        </div>

        <div class="panel" v-if="taskCenter">
          <div class="panel-head">
            <div><h2>任务中心</h2><p>审核、媒体治理、搜索同步、备份快照集中看；先处理黄色和红色任务。</p></div>
            <div class="button-row"><el-button @click="loadTaskCenter">刷新任务</el-button><el-button type="primary" @click="createBackupSnapshot">创建备份</el-button></div>
          </div>
          <div class="panel-body content-stat-grid">
            <article><span>待审留言</span><strong>{{ taskSummary.pendingComments }}</strong><p>评论审核队列。</p></article>
            <article><span>孤儿媒体</span><strong>{{ taskSummary.orphanMediaAssets }}</strong><p>未被引用的媒体资源。</p></article>
            <article><span>回收站</span><strong>{{ taskSummary.trashItems }}</strong><p>软删内容数量。</p></article>
            <article><span>失败任务</span><strong>{{ taskSummary.failedJobs }}</strong><p>最近 7 天失败的同步/备份。</p></article>
            <article><span>GitHub 仓库</span><strong>{{ taskSummary.githubRepositories || 0 }}</strong><p>{{ taskSummary.githubSyncJobs || 0 }} 条同步记录。</p></article>
          </div>
          <el-table class="stack-table" :data="taskItems" stripe>
            <el-table-column label="任务" min-width="180">
              <template #default="{ row }">
                <strong>{{ row.label }}</strong>
                <small class="audit-resource-id">{{ taskKindLabel(row.kind) }}</small>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="110">
              <template #default="{ row }"><el-tag effect="plain" :type="taskTone(row.tone)">{{ taskStatusLabel(row.status) }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="detail" label="说明" min-width="260" />
            <el-table-column label="时间" width="170"><template #default="{ row }">{{ formatAuditTime(row.finished_at || row.started_at || row.created_at) }}</template></el-table-column>
          </el-table>
        </div>
      </section>

      <section v-else-if="view === 'access'" class="page-stack access-page">
        <div class="panel access-hero">
          <div class="panel-head">
            <div><h2>权限中心</h2><p>把后台角色、权限点、用户绑定放到一个可审计页面里，避免“谁能改什么”变成黑盒。</p></div>
            <div class="button-row">
              <el-button @click="loadAccessConsole">刷新</el-button>
              <el-button type="primary" @click="resetRoleForm">新建角色</el-button>
            </div>
          </div>
          <div class="panel-body audit-summary">
            <article><span>角色</span><strong>{{ accessConsole.roles.length }}</strong><p>Owner / Editor / Viewer 及自定义角色。</p></article>
            <article><span>权限点</span><strong>{{ accessConsole.permissions.length }}</strong><p>按内容、CMS、媒体、系统分组治理。</p></article>
            <article><span>后台用户</span><strong>{{ accessConsole.users.length }}</strong><p>每个用户至少保留一个角色。</p></article>
          </div>
        </div>

        <div class="access-grid">
          <div class="panel">
            <div class="panel-head"><div><h2>角色矩阵</h2><p>选择角色后编辑权限；Owner 会自动持有全部权限。</p></div></div>
            <el-table :data="accessConsole.roles" stripe @row-click="editRole">
              <el-table-column label="角色" min-width="180">
                <template #default="{ row }">
                  <div class="role-name-cell">
                    <strong>{{ row.label || row.name }}</strong>
                    <small>{{ row.name }}</small>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="权限" min-width="160">
                <template #default="{ row }">
                  <span>{{ (row.permissions || []).length }} 个权限点</span>
                </template>
              </el-table-column>
              <el-table-column label="类型" width="100">
                <template #default="{ row }">
                  <el-tag size="small" effect="plain" :type="row.is_system ? 'warning' : 'success'">{{ row.is_system ? '系统' : '自定义' }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="100">
                <template #default="{ row }">
                  <el-button size="small" @click.stop="editRole(row)">编辑</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <div class="panel role-editor-card">
            <div class="panel-head"><div><h2>{{ accessConsole.roleForm.id ? '编辑角色' : '新建角色' }}</h2><p>权限按业务能力分组，避免靠记忆分配。</p></div></div>
            <div class="panel-body role-edit-form">
              <div class="role-form-grid">
                <el-input v-model="accessConsole.roleForm.name" placeholder="角色标识，如 reviewer" :disabled="Boolean(accessConsole.roleForm.id)" />
                <el-input v-model="accessConsole.roleForm.label" placeholder="中文名称，如 内容审核" />
                <el-input v-model="accessConsole.roleForm.description" placeholder="角色说明" />
              </div>
              <el-checkbox-group v-model="accessConsole.roleForm.permissions" class="permission-groups" :disabled="accessConsole.roleForm.name === 'owner'">
                <section v-for="group in permissionGroups" :key="group.name" class="permission-group">
                  <h3>{{ group.name }}</h3>
                  <label v-for="permission in group.items" :key="permission.code" class="permission-card">
                    <el-checkbox :label="permission.code">
                      <strong>{{ permission.label }}</strong>
                      <span>{{ permission.description }}</span>
                    </el-checkbox>
                  </label>
                </section>
              </el-checkbox-group>
              <div class="button-row">
                <el-button @click="resetRoleForm">清空</el-button>
                <el-button type="primary" @click="saveAccessRole">保存角色</el-button>
              </div>
            </div>
          </div>
        </div>

        <div class="panel user-role-card">
          <div class="panel-head"><div><h2>用户角色</h2><p>给后台用户分配角色；后端会防止最后一个 Owner 被移除。</p></div></div>
          <div class="panel-body user-role-grid">
            <el-table :data="accessConsole.users" stripe @row-click="selectAccessUser">
              <el-table-column label="用户" min-width="180">
                <template #default="{ row }">
                  <div class="role-name-cell">
                    <strong>{{ row.username }}</strong>
                    <small>{{ row.preview ? '本地预览账号' : `#${row.id}` }}</small>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="当前角色" min-width="220">
                <template #default="{ row }">
                  <div class="role-chip-list">
                    <span v-for="role in row.roleLabels || row.roles" :key="role" class="role-chip">{{ role }}</span>
                    <span v-if="!(row.roles || []).length" class="muted">未分配</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="100">
                <template #default="{ row }">
                  <el-button size="small" @click.stop="selectAccessUser(row)">分配</el-button>
                </template>
              </el-table-column>
            </el-table>

            <aside class="role-assignment-panel">
              <span class="mini-label">当前选择</span>
              <h3>{{ currentAccessUser?.username || '选择一个用户' }}</h3>
              <p>{{ currentAccessUser?.preview ? '预览账号默认拥有 Owner 权限，不建议在本地预览模式改动。' : '勾选角色后保存，变更会进入审计日志。' }}</p>
              <el-checkbox-group v-model="accessConsole.userRoles" class="role-check-list" :disabled="!currentAccessUser || currentAccessUser.preview">
                <el-checkbox v-for="role in accessConsole.roles" :key="role.name" :label="role.name">
                  {{ role.label || role.name }}
                </el-checkbox>
              </el-checkbox-group>
              <el-button type="primary" :disabled="!currentAccessUser || currentAccessUser.preview" @click="saveAccessUserRoles">保存用户角色</el-button>
            </aside>
          </div>
        </div>
      </section>

      <section v-else-if="view === 'audit'" class="page-stack audit-page">
        <div class="panel audit-hero">
          <div class="panel-head">
            <div><h2>审计日志</h2><p>记录后台关键操作：谁改了什么、什么时候改、影响哪个资源。后端不再是黑盒。</p></div>
            <div class="button-row"><el-button @click="loadAuditConsole">刷新</el-button><el-button type="primary" @click="syncSearch">同步搜索</el-button></div>
          </div>
          <div class="panel-body audit-summary">
            <article>
              <span>7 天操作</span>
              <strong>{{ auditSummary.total }}</strong>
              <p>最近 7 天后台关键操作总量。</p>
            </article>
            <article>
              <span>活跃用户</span>
              <strong>{{ auditSummary.activeUsers }}</strong>
              <p>有操作记录的后台账号。</p>
            </article>
            <article>
              <span>今日操作</span>
              <strong>{{ auditSummary.today }}</strong>
              <p>今天产生的后台操作。</p>
            </article>
            <article>
              <span>高风险</span>
              <strong>{{ auditSummary.risky }}</strong>
              <p>删除、恢复、备份失败等需要复核的动作。</p>
            </article>
          </div>
        </div>
        <div class="system-grid">
          <div class="panel">
            <div class="panel-head"><div><h2>动作分布</h2><p>看最近一周主要在做什么。</p></div></div>
            <el-table :data="auditInsights?.byAction || []" stripe>
              <el-table-column label="动作" min-width="160"><template #default="{ row }">{{ actionLabel(row.action) }}</template></el-table-column>
              <el-table-column prop="count" label="次数" width="90" />
              <el-table-column label="最近时间" width="170"><template #default="{ row }">{{ formatAuditTime(row.latest) }}</template></el-table-column>
            </el-table>
          </div>
          <div class="panel">
            <div class="panel-head"><div><h2>资源分布</h2><p>看操作集中在哪类资源。</p></div></div>
            <el-table :data="auditInsights?.byResource || []" stripe>
              <el-table-column label="资源" min-width="160"><template #default="{ row }">{{ resourceLabel(row.resource_type) }}</template></el-table-column>
              <el-table-column prop="count" label="次数" width="90" />
              <el-table-column label="最近时间" width="170"><template #default="{ row }">{{ formatAuditTime(row.latest) }}</template></el-table-column>
            </el-table>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><div><h2>最近操作</h2><p>按时间倒序展示后台操作流水。</p></div></div>
          <el-table :data="auditLogs" stripe>
            <el-table-column label="时间" width="170">
              <template #default="{ row }">{{ formatAuditTime(row.created_at) }}</template>
            </el-table-column>
            <el-table-column prop="username" label="用户" width="120" />
            <el-table-column label="动作" width="150">
              <template #default="{ row }"><el-tag effect="plain">{{ actionLabel(row.action) }}</el-tag></template>
            </el-table-column>
            <el-table-column label="资源" min-width="220">
              <template #default="{ row }">
                <strong>{{ resourceLabel(row.resource_type) }}</strong>
                <small class="audit-resource-id">{{ row.resource_id || 'global' }}</small>
              </template>
            </el-table-column>
            <el-table-column prop="ip" label="IP" width="150" />
          </el-table>
        </div>
      </section>

      <section v-else-if="view === 'cms'" class="page-stack cms-console-page">
        <div class="panel audit-hero">
          <div class="panel-head">
            <div><h2>站点底座</h2><p>统一查看页面区块、导航、主题、版本、媒体和后台任务状态。</p></div>
            <div class="button-row"><el-button @click="loadCmsConsole">刷新</el-button><el-button type="primary" @click="createBackupSnapshot">创建备份快照</el-button></div>
          </div>
          <div class="panel-body audit-summary">
            <article><span>页面区块</span><strong>{{ cmsConsole.pageBlocks.length }}</strong><p>Hero、卡片、模块开关等可配置内容。</p></article>
            <article><span>配置版本</span><strong>{{ cmsConsole.settingVersions.length }}</strong><p>文案、布局、导航和主题的变更快照。</p></article>
            <article><span>内容版本</span><strong>{{ cmsConsole.contentVersions.length }}</strong><p>文章、瞬间、项目、面试的可恢复快照。</p></article>
            <article><span>媒体资源</span><strong>{{ cmsConsole.mediaAssets.length }}</strong><p>后台上传图片会进入资源台账。</p></article>
            <article><span>孤儿资源</span><strong>{{ cmsConsole.orphanMediaAssets.length }}</strong><p>没有被内容引用的可清理文件。</p></article>
          </div>
        </div>

        <div class="system-grid">
          <div class="panel">
            <div class="panel-head"><div><h2>页面区块</h2><p>公开接口 /api/site/cms 会读取 published 区块。</p></div></div>
            <el-table :data="cmsConsole.pageBlocks" stripe>
              <el-table-column prop="page_key" label="页面" width="110" />
              <el-table-column prop="block_key" label="区块" min-width="150" />
              <el-table-column prop="title" label="标题" min-width="160" />
              <el-table-column prop="status" label="状态" width="100" />
            </el-table>
          </div>
          <div class="panel">
            <div class="panel-head"><div><h2>导航与主题</h2><p>导航、主题配置会进入 CMS 缓存和版本记录。</p></div></div>
            <el-table :data="cmsConsole.navigationItems" stripe>
              <el-table-column prop="label" label="导航" min-width="120" />
              <el-table-column prop="href" label="地址" min-width="160" />
              <el-table-column prop="placement" label="位置" width="90" />
              <el-table-column label="可见" width="80"><template #default="{ row }">{{ row.visible ? '是' : '否' }}</template></el-table-column>
            </el-table>
            <el-table class="stack-table" :data="cmsConsole.themeSettings" stripe>
              <el-table-column prop="scope_key" label="主题配置" min-width="160" />
              <el-table-column prop="status" label="状态" width="100" />
            </el-table>
          </div>
        </div>

        <div class="system-grid">
          <div class="panel">
            <div class="panel-head"><div><h2>配置版本</h2><p>最近保存的配置快照，可用于后续回滚。</p></div></div>
            <el-table :data="cmsConsole.settingVersions" stripe>
              <el-table-column prop="scope_key" label="范围" min-width="180" />
              <el-table-column prop="version" label="版本" width="80" />
              <el-table-column prop="reason" label="原因" min-width="160" />
              <el-table-column label="时间" width="170"><template #default="{ row }">{{ formatAuditTime(row.created_at) }}</template></el-table-column>
              <el-table-column label="操作" width="100">
                <template #default="{ row }">
                  <el-button size="small" type="primary" plain @click="restoreSettingVersion(row.id)">恢复</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <div class="panel">
            <div class="panel-head"><div><h2>内容版本</h2><p>内容保存、下架、恢复和删除都会留快照，误操作可回滚。</p></div></div>
            <el-table :data="cmsConsole.contentVersions" stripe>
              <el-table-column label="内容" min-width="240">
                <template #default="{ row }">
                  <div class="version-resource">
                    <strong>{{ resourceLabel(row.resource_type) }}</strong>
                    <span>#{{ row.resource_id }}</span>
                  </div>
                  <div class="version-title">{{ row.title || row.slug || '未命名内容' }}</div>
                </template>
              </el-table-column>
              <el-table-column prop="version" label="版本" width="80" />
              <el-table-column label="状态" width="100">
                <template #default="{ row }">
                  <el-tag size="small" effect="plain" :type="row.status === 'published' ? 'success' : 'info'">{{ contentStatusLabel(row.status) }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="reason" label="原因" min-width="120" />
              <el-table-column label="时间" width="170"><template #default="{ row }">{{ formatAuditTime(row.created_at) }}</template></el-table-column>
              <el-table-column label="操作" width="100">
                <template #default="{ row }">
                  <el-button size="small" type="primary" plain @click="restoreContentVersion(row.id)">恢复</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <div class="panel">
            <div class="panel-head">
              <div><h2>媒体与任务</h2><p>上传、引用扫描、搜索同步、备份快照都能在后端追踪。</p></div>
              <div class="button-row">
                <el-button @click="rescanMediaAssets">重扫引用</el-button>
                <el-button @click="loadCmsConsole">刷新</el-button>
              </div>
            </div>
            <div class="panel-body content-stat-grid">
              <article><span>搜索任务</span><strong>{{ cmsConsole.searchSyncJobs.length }}</strong><p>同步 Meilisearch 的 job 记录。</p></article>
              <article><span>备份快照</span><strong>{{ cmsConsole.backupJobs.length }}</strong><p>JSON 快照与计划备份记录。</p></article>
              <article><span>媒体文件</span><strong>{{ cmsConsole.mediaAssets.length }}</strong><p>上传资源数量。</p></article>
              <article><span>可清理</span><strong>{{ cmsConsole.orphanMediaAssets.length }}</strong><p>引用数为 0 的媒体。</p></article>
            </div>
            <el-table :data="cmsConsole.mediaAssets" stripe>
              <el-table-column prop="filename" label="文件" min-width="160" />
              <el-table-column prop="mime" label="类型" width="120" />
              <el-table-column label="大小" width="110"><template #default="{ row }">{{ formatFileSize(row.size) }}</template></el-table-column>
              <el-table-column prop="ref_count" label="引用" width="80" />
              <el-table-column label="最近引用" width="170"><template #default="{ row }">{{ formatAuditTime(row.last_ref_at || row.last_seen_at) }}</template></el-table-column>
              <el-table-column label="操作" width="120">
                <template #default="{ row }">
                  <el-button v-if="Number(row.ref_count || 0) === 0" size="small" type="danger" @click="cleanupMediaAsset(row.id)">清理</el-button>
                  <span v-else class="muted">使用中</span>
                </template>
              </el-table-column>
            </el-table>
            <el-table class="stack-table" :data="cmsConsole.backupJobs" stripe>
              <el-table-column label="备份状态" width="110">
                <template #default="{ row }">
                  <el-tag size="small" effect="plain" :type="backupStatusTone(row.status)">{{ backupStatusLabel(row.status) }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="scope" label="范围" width="100" />
              <el-table-column label="快照文件" min-width="240">
                <template #default="{ row }">
                  <span class="mono-path">{{ row.artifact_path || '尚未生成文件' }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="message" label="备注" min-width="180" />
              <el-table-column label="完成时间" width="170"><template #default="{ row }">{{ formatAuditTime(row.finished_at || row.created_at) }}</template></el-table-column>
              <el-table-column label="操作" width="170">
                <template #default="{ row }">
                  <el-button v-if="row.status === 'success'" size="small" tag="a" :href="adminApi.backupDownloadUrl(row.id)" target="_blank">下载</el-button>
                  <el-button v-if="row.status === 'success'" size="small" type="warning" plain @click="restoreBackupSnapshot(row.id)">恢复</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </section>
    </section>
  </div>

  <teleport to="body">
    <div v-if="crop.visible" class="crop-backdrop" @pointerup="stopCropDrag" @pointercancel="stopCropDrag">
      <section class="crop-dialog" role="dialog" aria-modal="true" aria-label="图片裁剪">
        <div class="panel-head">
          <div><h2>{{ crop.mode === 'avatar' ? '圆形头像裁剪' : '正方形图片裁剪' }}</h2><p>拖动图片调整位置，用滑块调整缩放后再上传。</p></div>
          <el-button @click="closeCrop">取消</el-button>
        </div>
        <div class="crop-body">
          <canvas
            ref="cropCanvas"
            class="crop-canvas"
            :class="{ circle: crop.mode === 'avatar' }"
            width="720"
            height="720"
            @pointerdown="startCropDrag"
            @pointermove="moveCropDrag"
            @wheel.prevent="zoomCropWheel"
          ></canvas>
          <label class="crop-range">缩放 <input v-model.number="crop.zoom" type="range" min="1" max="3" step="0.01" @input="drawCropStage"></label>
        </div>
        <div class="crop-actions">
          <el-button @click="closeCrop">取消</el-button>
          <el-button type="primary" :loading="crop.uploading" @click="confirmCropUpload">裁剪并上传</el-button>
        </div>
      </section>
    </div>
  </teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { adminApi } from "./api";
import MarkdownBodyEditor from "./components/MarkdownBodyEditor.vue";

const clone = (value) => JSON.parse(JSON.stringify(value || {}));
const user = ref(null);
const busy = ref(false);
const collapsed = ref(false);
const route = ref(normalizeRoute(location.pathname));
const loginForm = reactive({ username: "", password: "" });
const devAccessEnabled = computed(() => Boolean(user.value?.devMode || user.value?.isOwner));

const overview = ref({});
const posts = ref([]);
const moments = ref([]);
const hzQuotes = ref([]);
const projects = ref([]);
const interviews = ref([]);
const interviewTopics = ref([]);
const interviewGoals = ref([]);
const interviewGoalUpdates = ref([]);
const interviewQuestions = ref([]);
const interviewReviews = ref([]);
const interviewDailyStatus = ref(null);
const interviewDailyBusy = ref(false);
const comments = ref([]);
const interviewAdminTab = ref("questions");
const trashMode = reactive({
  posts: false,
  moments: false,
  hzQuotes: false,
  projects: false,
  interviews: false,
  comments: false
});
const contentFilters = reactive({
  posts: { q: "", status: "" },
  moments: { q: "", status: "", kind: "" },
  hzQuotes: { q: "", status: "" },
  projects: { q: "", status: "" },
  interviews: { q: "", status: "", section: "" },
  comments: { q: "", status: "", target: "" }
});
const interviewQuestionFilters = reactive({ q: "", status: "", topic: "" });
const interviewReviewFilters = reactive({ q: "", status: "" });
const interviewDifficultyOptions = ["基础", "进阶", "项目追问", "高频必会"];
const interviewGoalStatusOptions = [
  { label: "计划中", value: "planned" },
  { label: "进行中", value: "doing" },
  { label: "复盘中", value: "review" },
  { label: "已掌握", value: "mastered" }
];
const interviewGoalUpdateTypeOptions = [
  { label: "进度", value: "progress" },
  { label: "错题", value: "mistake" },
  { label: "笔记", value: "note" }
];
const interviewTrainingFieldDefs = [
  { key: "points", textKey: "pointsText", label: "核心要点", rows: 3, placeholder: "每行一个要点，例如：先讲结论\n补关键原理\n给项目例子" },
  { key: "followUps", textKey: "followUpsText", label: "追问", rows: 3, placeholder: "每行一个追问，例如：如果线上出问题你怎么排查？" },
  { key: "interviewerFocus", textKey: "interviewerFocusText", label: "面试官看点", rows: 3, placeholder: "每行一个看点，例如：是否能讲清边界条件" },
  { key: "speechTemplate", textKey: "speechTemplateText", label: "60 秒口述模板", rows: 4, placeholder: "按口述顺序逐行写：结论 -> 原理 -> 项目 -> 风险" },
  { key: "commonMistakes", textKey: "commonMistakesText", label: "常见错误回答", rows: 3, placeholder: "每行一个易错点，例如：只背概念不讲场景" },
  { key: "projectPrompts", textKey: "projectPromptsText", label: "项目迁移追问", rows: 3, placeholder: "每行一个项目追问，例如：迁移到你的博客后台怎么讲？" }
];
const contentSelection = reactive({
  posts: [],
  moments: [],
  projects: [],
  interviews: [],
  interviewQuestions: [],
  interviewReviews: [],
  comments: []
});
const settings = reactive({
  siteName: "Jlemonz2020",
  siteTagline: "Ubuntu / ROS / FOC",
  adminWelcome: "今天也把系统维护得更清楚一点。",
  defaultAuthor: "Jlemonz",
  contentFocus: "",
  publishPolicy: "",
  githubUsername: "",
  searchHint: "试试 Ubuntu、ROS、FOC、机器人项目...",
  reviewChecklist: "",
  maintenanceStatus: "normal",
  backupNote: ""
});
const siteTexts = ref(null);
const aboutGalleryImages = ref([]);
const aboutGalleryLimit = ref(1000);
const aboutGalleryBulkText = ref("");
const systemStatus = ref(null);
const auditLogs = ref([]);
const auditInsights = ref(null);
const taskCenter = ref(null);
const interactionInsights = ref(null);
const integrationStatus = ref(null);
const integrationBusy = ref(false);
const cmsConsole = reactive({
  pageBlocks: [],
  navigationItems: [],
  themeSettings: [],
  settingVersions: [],
  contentVersions: [],
  mediaAssets: [],
  orphanMediaAssets: [],
  searchSyncJobs: [],
  backupJobs: []
});
const accessConsole = reactive({
  roles: [],
  permissions: [],
  users: [],
  roleForm: emptyRoleForm(),
  selectedUserId: "",
  userRoles: []
});

const postForm = reactive(emptyPost());
const momentForm = reactive(emptyMoment());
const hzQuoteForm = reactive(emptyHzQuote());
const projectForm = reactive(emptyProject());
const interviewForm = reactive(emptyInterview());
const interviewTopicForm = reactive(emptyInterviewTopic());
const interviewGoalForm = reactive(emptyInterviewGoal());
const interviewGoalUpdateForm = reactive(emptyInterviewGoalUpdate());
const interviewQuestionForm = reactive(emptyInterviewQuestion());
const interviewReviewForm = reactive(emptyInterviewReview());

const editorLoading = ref(false);
const editorSaving = ref(false);
const editorData = ref(null);
const editorPayload = ref(null);
const selectedTarget = ref(null);
const editorTab = ref("selected");
const editorPage = ref("/");
const editorViewport = ref("desktop");
const previewTick = ref(0);
const previewFrame = ref(null);
const textSearch = ref("");
const cropCanvas = ref(null);
const acceptedImageTypes = "image/jpeg,image/png,image/webp,image/gif";
const crop = reactive({
  visible: false,
  uploading: false,
  mode: "square",
  url: "",
  fileName: "image",
  image: null,
  target: null,
  key: "",
  zoom: 1,
  x: 0,
  y: 0,
  dragging: false,
  lastX: 0,
  lastY: 0
});

const editorPages = [
  { label: "首页", path: "/" },
  { label: "瞬间", path: "/moments.html" },
  { label: "小记", path: "/archive.html" },
  { label: "面试", path: "/interview.html" },
  { label: "项目", path: "/projects.html" },
  { label: "关于", path: "/about.html" }
];

const menu = [
  { title: "内容", items: [
    { label: "概览", path: "/", icon: "⌂" },
    { label: "文章", path: "/posts", icon: "文" },
    { label: "瞬间", path: "/moments", icon: "瞬" },
    { label: "Hz", path: "/hz", icon: "♬" },
    { label: "面试", path: "/interviews", icon: "问" },
    { label: "项目", path: "/projects", icon: "项" },
    { label: "留言", path: "/comments", icon: "言" }
  ] },
  { title: "前端", items: [
    { label: "页面装修", path: "/frontend", icon: "◎" },
    { label: "About 图库", path: "/about-gallery", icon: "图" },
    { label: "文案管理", path: "/texts", icon: "文" },
    { label: "导航页脚", path: "/nav-footer", icon: "链" },
    { label: "媒体资源", path: "/media", icon: "资" }
  ] },
  { title: "系统", items: [
    { label: "系统状态", path: "/system", icon: "态" },
    { label: "权限中心", path: "/access", icon: "锁" },
    { label: "审计日志", path: "/audit", icon: "审" },
    { label: "设置", path: "/settings", icon: "⚙" }
  ] }
];

const view = computed(() => {
  if (route.value === "/" || route.value === "") return "dashboard";
  if (route.value === "/posts") return "posts";
  if (route.value === "/posts/new" || /^\/posts\/\d+/.test(route.value)) return "post-editor";
  if (route.value === "/moments") return "moments";
  if (route.value === "/hz") return "hz";
  if (route.value === "/projects") return "projects";
  if (route.value === "/interviews") return "interviews";
  if (route.value === "/comments") return "comments";
  if (route.value === "/frontend" || route.value === "/frontend-layout") return "frontend";
  if (route.value === "/about-gallery") return "about-gallery";
  if (route.value === "/texts") return "texts";
  if (route.value === "/nav-footer") return "nav-footer";
  if (route.value === "/media") return "media";
  if (route.value === "/cms") return "cms";
  if (route.value === "/settings") return "settings";
  if (route.value === "/system") return "system";
  if (route.value === "/access") return "access";
  if (route.value === "/audit") return "audit";
  return "dashboard";
});

const currentTitle = computed(() => ({
  dashboard: "概览",
  posts: "文章",
  "post-editor": postForm.id ? "编辑文章" : "新文章",
  moments: "瞬间",
  hz: "Hz",
  projects: "项目",
  interviews: "面试",
  comments: "留言",
  frontend: "页面装修",
  "about-gallery": "About 图库",
  texts: "文案管理",
  "nav-footer": "导航页脚",
  media: "媒体资源",
  cms: "站点底座",
  settings: "设置",
  system: "系统状态",
  access: "权限中心",
  audit: "审计日志"
}[view.value] || "后台"));

const dashboardMetrics = computed(() => {
  const stats = overview.value.stats || {};
  return [
    { label: "文章", value: stats.posts ?? 0, icon: "文", tone: "tone-pink", hint: "长期札记和草稿" },
    { label: "已发布", value: stats.publishedPosts ?? 0, icon: "发", tone: "tone-cyan", hint: "公开可见内容" },
    { label: "瞬间", value: stats.moments ?? 0, icon: "瞬", tone: "tone-blue", hint: "短记录和状态" },
    { label: "项目", value: stats.projects ?? 0, icon: "项", tone: "tone-green", hint: "作品和实验" },
    { label: "面试", value: stats.interviews ?? 0, icon: "面", tone: "tone-violet", hint: "训练与知识库" },
    { label: "留言", value: stats.comments ?? 0, icon: "留", tone: "tone-yellow", hint: "访客互动" },
    { label: "版本", value: (Number(stats.settingVersions || 0) + Number(stats.contentVersions || 0)), icon: "版", tone: "tone-blue", hint: "可恢复记录" },
    { label: "媒体", value: stats.mediaAssets ?? 0, icon: "图", tone: "tone-cyan", hint: "上传资源" },
    { label: "回收站", value: stats.trashItems ?? 0, icon: "收", tone: "tone-pink", hint: "待清理内容" }
  ];
});

const siteTextGroupMeta = {
  shared: { title: "全站导航", icon: "航", tone: "blue" },
  home: { title: "首页", icon: "首", tone: "pink" },
  archive: { title: "小记", icon: "记", tone: "cyan" },
  moments: { title: "瞬间", icon: "瞬", tone: "green" },
  interview: { title: "面试", icon: "问", tone: "violet" },
  projects: { title: "项目", icon: "项", tone: "yellow" },
  about: { title: "关于", icon: "关", tone: "cyan" },
  footer: { title: "页尾", icon: "链", tone: "blue" },
  seo: { title: "SEO 与分享", icon: "搜", tone: "green" },
  other: { title: "其他文案", icon: "其", tone: "pink" }
};
const siteTextGroups = computed(() => {
  const definitions = siteTexts.value?.definitions || [];
  const groups = new Map();
  const seenKeys = new Set();
  for (const item of definitions) {
    if (!item?.key || seenKeys.has(item.key)) continue;
    seenKeys.add(item.key);
    const scope = String(item.key || "other").split(".")[0] || "other";
    const meta = siteTextGroupMeta[scope] || siteTextGroupMeta.other;
    if (!groups.has(scope)) groups.set(scope, { key: scope, ...meta, items: [] });
    groups.get(scope).items.push(item);
  }
  return [...groups.values()];
});

const filteredHzQuotes = computed(() => {
  const q = contentFilters.hzQuotes.q.trim().toLowerCase();
  const status = contentFilters.hzQuotes.status;
  return hzQuotes.value.filter((item) => {
    const matchedText = !q || String(item.text || "").toLowerCase().includes(q);
    const matchedStatus = !status || item.status === status;
    return matchedText && matchedStatus;
  });
});

const aboutGalleryVisibleCount = computed(() => (
  aboutGalleryImages.value || []
).filter((item) => item.visible !== false && String(item.url || "").trim()).length);
const aboutGalleryRemaining = computed(() => Math.max(0, aboutGalleryLimit.value - aboutGalleryImages.value.length));
const aboutGalleryDuplicateCount = computed(() => {
  const seen = new Set();
  let duplicates = 0;
  for (const item of aboutGalleryImages.value || []) {
    const key = aboutGalleryUrlKey(item?.url);
    if (!key) continue;
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  }
  return duplicates;
});

const previewSrc = computed(() => `${editorPage.value}?editor=1&t=${previewTick.value}`);
const editorDraftLabel = computed(() => editorData.value?.draft?.savedAt || "未保存草稿");
const selectedLabel = computed(() => selectedTarget.value?.target || "尚未选择元素");
const selectedUiTarget = computed(() => selectedTarget.value?.target?.startsWith("ui:") ? selectedTarget.value.target : "");
const systemChecks = computed(() => systemStatus.value?.checks || []);
const dashboardChecks = computed(() => systemChecks.value.slice(0, 4));
const systemResources = computed(() => systemStatus.value?.resources || []);
const systemContentStats = computed(() => systemStatus.value?.contentStats || []);
const taskSummary = computed(() => taskCenter.value?.summary || { pendingComments: 0, orphanMediaAssets: 0, trashItems: 0, failedJobs: 0, githubRepositories: 0, githubSyncJobs: 0 });
const taskItems = computed(() => taskCenter.value?.items || []);
const interactionSummary = computed(() => interactionInsights.value?.summary || { views: 0, uniqueVisitors: 0, likeTargets: 0, totalLikes: 0, reactionEvents: 0, uniqueReactors: 0, comments: 0, pendingComments: 0 });
const interviewTopicOptions = computed(() => interviewTopics.value.filter((topic) => topic.visible || topic.id));
const interviewGoalOptions = computed(() => {
  const items = [...interviewGoals.value].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || Number(a.id || 0) - Number(b.id || 0));
  const byParent = new Map();
  for (const item of items) {
    const key = item.parentId ? String(item.parentId) : "root";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(item);
  }
  const result = [];
  const visit = (parentKey = "root", depth = 0) => {
    for (const item of byParent.get(parentKey) || []) {
      result.push({ ...item, depth, optionLabel: `${"　".repeat(depth)}${item.title}` });
      visit(String(item.id), depth + 1);
    }
  };
  visit();
  return result;
});
const interviewAdminSummary = computed(() => ({
  topics: interviewTopics.value.length,
  visibleTopics: interviewTopics.value.filter((topic) => topic.visible).length,
  goals: interviewGoals.value.length,
  visibleGoals: interviewGoals.value.filter((goal) => goal.visible).length,
  questions: interviewQuestions.value.length,
  publishedQuestions: interviewQuestions.value.filter((item) => item.status === "published").length,
  reviews: interviewReviews.value.length,
  publishedReviews: interviewReviews.value.filter((item) => item.status === "published").length,
  legacy: interviews.value.length
}));
const interviewDailySummary = computed(() => {
  const status = interviewDailyStatus.value || {};
  const completeQuestions = interviewQuestions.value.filter((item) => interviewTrainingCompleteness(item).missing.length === 0).length;
  const publishedQuestions = interviewQuestions.value.filter((item) => item.status === "published").length;
  const missingQuestions = interviewQuestions.value.filter((item) => item.status === "published" && interviewTrainingCompleteness(item).missing.length > 0).length;
  const todaySet = status.todaySet || {};
  return {
    date: status.date || "",
    publishedQuestions,
    completeQuestions,
    missingQuestions,
    todayTitle: todaySet.title || "未发布",
    todayTotal: Number(todaySet.total || 0),
    todayLabel: todaySet.published ? "已发布，可供前台训练" : "还未发布，点击生成"
  };
});
const topViewTargets = computed(() => interactionInsights.value?.topViews || []);
const topReactionTargets = computed(() => interactionInsights.value?.topReactions || []);
const githubIntegration = computed(() => integrationStatus.value?.github || {});
const githubRepositories = computed(() => githubIntegration.value.repositories || []);
const githubJobs = computed(() => githubIntegration.value.jobs || []);
const githubContributionTotal = computed(() => githubIntegration.value.contributions?.total || 0);
const githubContributionMeta = computed(() => {
  const item = githubIntegration.value.contributions;
  if (!item) return "贡献日历尚未生成快照。";
  const source = item.source ? `来源：${item.source}` : "来源：GitHub";
  const time = item.fetchedAt ? ` / ${formatAuditTime(item.fetchedAt)}` : "";
  return `${source}${time}`;
});
const moyuIntegration = computed(() => integrationStatus.value?.moyu || {});
const feedLinks = computed(() => integrationStatus.value?.feeds || {});
const auditSummary = computed(() => auditInsights.value?.summary || { total: auditLogs.value.length, activeUsers: 0, today: 0, risky: 0 });
const contentResourceMap = {
  posts: "posts",
  moments: "moments",
  projects: "projects",
  interviews: "interviews",
  interviewQuestions: "interview-questions",
  interviewReviews: "interview-reviews",
  comments: "comments"
};
const permissionGroups = computed(() => {
  const groups = new Map();
  for (const permission of accessConsole.permissions) {
    const group = permission.group || "其他权限";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(permission);
  }
  return [...groups.entries()].map(([name, items]) => ({ name, items }));
});
const currentAccessUser = computed(() => accessConsole.users.find((item) => String(item.id) === String(accessConsole.selectedUserId)) || null);
const selectedTextKey = computed(() => {
  const target = selectedTarget.value?.target || "";
  return target.startsWith("text:") ? target.slice(5) : "";
});
const selectedContent = computed(() => {
  const target = selectedTarget.value?.target || "";
  const [, type, id] = target.split(":");
  if (type === "post") return { title: "文章内容", desc: selectedTarget.value.text, path: `/posts/${id}` };
  if (type === "project") return { title: "项目内容", desc: selectedTarget.value.text, path: "/projects" };
  if (type === "interview") return { title: "面试内容", desc: selectedTarget.value.text, path: "/interviews" };
  if (type === "moment") return { title: "瞬间内容", desc: selectedTarget.value.text, path: "/moments" };
  if (type === "comment") return { title: "留言内容", desc: selectedTarget.value.text, path: "/comments" };
  return null;
});
const selectedUiEditor = computed(() => {
  const target = selectedTarget.value?.target || "";
  if (!editorPayload.value || !target.startsWith("ui:")) return null;
  const [, type, id] = target.split(":");
  if (type === "archive-category") {
    const item = editorPayload.value.ui.archiveCategories?.find((entry) => entry.id === id);
    return item ? { type, title: `分类入口：${item.label || id}`, item } : null;
  }
  if (type === "about-stack-list") {
    return { type, title: "关于页 Stack 技术项", item: editorPayload.value.ui.aboutStackItems };
  }
  if (type === "about-stack") {
    const item = editorPayload.value.ui.aboutStackItems?.find((entry) => entry.id === id);
    return item ? { type, title: `技术栈：${item.label || id}`, item } : null;
  }
  if (type === "about-gallery") {
    const item = editorPayload.value.ui.aboutGalleryImages?.find((entry) => entry.id === id);
    return item ? { type, title: "About 图库图片", item } : null;
  }
  if (type === "profile") {
    return { type, title: "头像", item: editorPayload.value.ui.profile };
  }
  return null;
});
const selectedUiInfo = computed(() => {
  const target = selectedTarget.value?.target || "";
  if (!editorPayload.value || !target.startsWith("ui:")) return null;
  if (target === "ui:footer:brandBody") return { title: "页脚说明", model: fieldRef(editorPayload.value.ui.footer, "brandBody") };
  if (target.startsWith("ui:sectionTitles:")) {
    const key = target.split(":")[2];
    return { title: `区块标题：${key}`, model: fieldRef(editorPayload.value.ui.sectionTitles, key) };
  }
  return { title: "分类/标签项", model: fieldRef({ value: "请在“分类/标签”标签里编辑完整列表" }, "value") };
});
const filteredDefinitions = computed(() => {
  const items = editorData.value?.definitions || [];
  const q = textSearch.value.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => `${item.group} ${item.label} ${item.key}`.toLowerCase().includes(q));
});
const layoutSwitches = computed(() => {
  if (!editorPayload.value) return [];
  const layout = editorPayload.value.layout;
  return [
    { label: "首页状态卡", path: "home.showStatusStrip", model: fieldRef(layout.home, "showStatusStrip") },
    { label: "首页项目预览", path: "home.showProjectPreview", model: fieldRef(layout.home, "showProjectPreview") },
    { label: "首页瞬间预览", path: "home.showMomentPreview", model: fieldRef(layout.home, "showMomentPreview") },
    { label: "头像卡", path: "home.showProfileCard", model: fieldRef(layout.home, "showProfileCard") },
    { label: "统计卡", path: "home.showStatsCard", model: fieldRef(layout.home, "showStatsCard") },
    { label: "分类卡", path: "home.showCategoryCard", model: fieldRef(layout.home, "showCategoryCard") },
    { label: "小记搜索区", path: "archive.showSearchPanel", model: fieldRef(layout.archive, "showSearchPanel") },
    { label: "GitHub 面板", path: "archive.showGithubPanel", model: fieldRef(layout.archive, "showGithubPanel") },
    { label: "瞬间草稿卡", path: "moments.showDraftPanel", model: fieldRef(layout.moments, "showDraftPanel") },
    { label: "项目下一步", path: "projects.showRoadmap", model: fieldRef(layout.projects, "showRoadmap") },
    { label: "项目维护规则", path: "projects.showMaintain", model: fieldRef(layout.projects, "showMaintain") }
  ];
});

function fieldRef(object, key) {
  return computed({
    get: () => object[key],
    set: (value) => { object[key] = value; }
  });
}

function normalizeRoute(path) {
  const routePath = path.replace(/^\/admin/, "") || "/";
  return routePath === "/frontend-layout" ? "/frontend" : routePath;
}

function isActive(path) {
  if (path === "/") return route.value === "/";
  return route.value.startsWith(path);
}

function go(path) {
  route.value = path;
  history.pushState(null, "", `/admin${path === "/" ? "" : path}`);
  loadRoute();
}

window.addEventListener("popstate", () => {
  route.value = normalizeRoute(location.pathname);
  loadRoute();
});

window.addEventListener("message", (event) => {
  if (event.origin !== location.origin) return;
  const data = event.data || {};
  if (data.source !== "jlemonz-frontend-editor") return;
  selectedTarget.value = data;
  editorTab.value = "selected";
});

async function login() {
  busy.value = true;
  try {
    const data = await adminApi.login(loginForm);
    user.value = data.user;
    await loadRoute();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    busy.value = false;
  }
}

async function logout() {
  await adminApi.logout();
  user.value = null;
}

async function boot() {
  try {
    const data = await adminApi.me();
    user.value = data.user;
  } catch {
    user.value = null;
    return;
  }
  try {
    await loadRoute();
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function loadRoute() {
  if (!user.value) return;
  if (view.value === "dashboard") return refreshDashboard();
  if (view.value === "posts") return loadPosts();
  if (view.value === "post-editor") return loadPostEditor();
  if (view.value === "moments") return loadMoments();
  if (view.value === "hz") return loadHzQuotes();
  if (view.value === "projects") return loadProjects();
  if (view.value === "interviews") return loadInterviews();
  if (view.value === "comments") return loadComments();
  if (view.value === "frontend") return loadFrontendEditor();
  if (view.value === "about-gallery") return loadAboutGallery();
  if (view.value === "texts") return loadSiteTexts();
  if (view.value === "nav-footer") return loadNavFooter();
  if (view.value === "media") return loadMediaConsole();
  if (view.value === "cms") return loadCmsConsole();
  if (view.value === "settings") return loadSettings();
  if (view.value === "system") return loadSystemConsole();
  if (view.value === "access") return loadAccessConsole();
  if (view.value === "audit") return loadAuditConsole();
}

async function refreshDashboard() {
  overview.value = await adminApi.overview();
  await loadSystemStatus({ silent: true });
  await loadTaskCenter({ silent: true });
  await loadInteractionInsights({ silent: true });
  await loadIntegrationStatus({ silent: true });
}

async function loadSystemStatus(options = {}) {
  try {
    systemStatus.value = await adminApi.systemStatus();
  } catch (error) {
    if (!options.silent) ElMessage.error(error.message);
  }
}

async function loadTaskCenter(options = {}) {
  try {
    taskCenter.value = await adminApi.taskCenter();
  } catch (error) {
    if (!options.silent) ElMessage.error(error.message);
  }
}

async function loadInteractionInsights(options = {}) {
  try {
    interactionInsights.value = await adminApi.interactionInsights("?days=7");
  } catch (error) {
    if (!options.silent) ElMessage.error(error.message);
  }
}

async function loadIntegrationStatus(options = {}) {
  try {
    integrationStatus.value = await adminApi.integrations();
  } catch (error) {
    if (!options.silent) ElMessage.error(error.message);
  }
}

async function loadSystemConsole() {
  await Promise.all([
    loadSystemStatus(),
    loadTaskCenter(),
    loadInteractionInsights(),
    loadIntegrationStatus()
  ]);
}

async function loadAuditLogs() {
  try {
    auditLogs.value = (await adminApi.auditLogs()).items || [];
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function loadAuditConsole() {
  try {
    const [logs, insights] = await Promise.all([
      adminApi.auditLogs("?limit=120"),
      adminApi.auditInsights("?days=7")
    ]);
    auditLogs.value = logs.items || [];
    auditInsights.value = insights;
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function loadCmsConsole() {
  try {
    const [pageBlocks, navigationItems, themeSettings, settingVersions, contentVersions, mediaAssets, orphanMediaAssets, searchSyncJobs, backupJobs] = await Promise.all([
      adminApi.listPageBlocks(),
      adminApi.listNavigationItems(),
      adminApi.listThemeSettings(),
      adminApi.settingVersions(),
      adminApi.contentVersions(),
      adminApi.mediaAssets(),
      adminApi.mediaAssets("?orphan=1"),
      adminApi.searchSyncJobs(),
      adminApi.backupJobs()
    ]);
    cmsConsole.pageBlocks = pageBlocks.items || [];
    cmsConsole.navigationItems = navigationItems.items || [];
    cmsConsole.themeSettings = themeSettings.items || [];
    cmsConsole.settingVersions = settingVersions.items || [];
    cmsConsole.contentVersions = contentVersions.items || [];
    cmsConsole.mediaAssets = mediaAssets.items || [];
    cmsConsole.orphanMediaAssets = orphanMediaAssets.items || [];
    cmsConsole.searchSyncJobs = searchSyncJobs.items || [];
    cmsConsole.backupJobs = backupJobs.items || [];
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function rescanMediaAssets() {
  try {
    const result = await adminApi.rescanMediaAssets();
    await loadCmsConsole();
    ElMessage.success(`媒体引用已重扫：${result.refs || 0} 条引用`);
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function cleanupMediaAsset(id) {
  try {
    await confirmDanger("清理后该媒体会从资源台账下架；仅允许清理引用数为 0 的文件。继续？");
    await adminApi.deleteMediaAsset(id);
    await loadCmsConsole();
    ElMessage.success("孤儿媒体已清理");
  } catch (error) {
    if (error !== "cancel") ElMessage.error(error.message);
  }
}

async function restoreSettingVersion(id) {
  try {
    await confirmDanger("将配置恢复到这个历史快照？当前配置会被新快照记录后再覆盖。");
    await adminApi.restoreSettingVersion(id);
    await loadCmsConsole();
    if (view.value === "frontend") await loadFrontendEditor();
    ElMessage.success("配置版本已恢复");
  } catch (error) {
    if (error !== "cancel") ElMessage.error(error.message);
  }
}

async function restoreContentVersion(id) {
  try {
    await confirmDanger("将内容恢复到这个历史快照？系统会保留本次恢复记录。");
    const result = await adminApi.restoreContentVersion(id);
    await loadCmsConsole();
    await refreshDashboard();
    const type = result.resourceType || result.resource_type;
    if (type === "post") await loadPosts();
    if (type === "moment") await loadMoments();
    if (type === "project") await loadProjects();
    if (type === "interview") await loadInterviews();
    ElMessage.success("内容版本已恢复");
  } catch (error) {
    if (error !== "cancel") ElMessage.error(error.message);
  }
}

async function createBackupSnapshot() {
  try {
    await adminApi.createBackupJob({ scope: "database", message: "后台手动创建 JSON 备份" });
    await loadCmsConsole();
    ElMessage.success("备份快照已创建");
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function restoreBackupSnapshot(id) {
  try {
    await confirmDanger("将从这个 JSON 快照恢复内容、CMS、媒体引用与权限配置之外的数据；当前数据会先被覆盖，请确认已经下载备份。继续？");
    const result = await adminApi.restoreBackupJob(id);
    await loadCmsConsole();
    await refreshDashboard();
    ElMessage.success(`备份已恢复：${Object.keys(result.restored || {}).length} 张表`);
  } catch (error) {
    if (error !== "cancel") ElMessage.error(error.message);
  }
}

function emptyRoleForm() {
  return {
    id: null,
    name: "",
    label: "",
    description: "",
    permissions: []
  };
}

function resetRoleForm() {
  Object.assign(accessConsole.roleForm, emptyRoleForm());
}

function editRole(row = {}) {
  Object.assign(accessConsole.roleForm, {
    id: row.id || null,
    name: row.name || "",
    label: row.label || row.name || "",
    description: row.description || "",
    permissions: [...(row.permissions || [])]
  });
}

function selectAccessUser(row = {}) {
  accessConsole.selectedUserId = row.id ? String(row.id) : "";
  accessConsole.userRoles = [...(row.roles || [])];
}

async function loadAccessConsole() {
  try {
    const [rolesData, usersData] = await Promise.all([
      adminApi.roles(),
      adminApi.users()
    ]);
    accessConsole.roles = rolesData.roles || [];
    accessConsole.permissions = rolesData.permissions || [];
    accessConsole.users = usersData.items || [];
    const activeRole = accessConsole.roles.find((role) => String(role.id) === String(accessConsole.roleForm.id)) || accessConsole.roles[0];
    if (activeRole) editRole(activeRole);
    const activeUser = accessConsole.users.find((item) => String(item.id) === String(accessConsole.selectedUserId)) || accessConsole.users[0];
    if (activeUser) selectAccessUser(activeUser);
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function saveAccessRole() {
  try {
    if (!accessConsole.roleForm.name.trim()) {
      ElMessage.warning("请填写角色标识");
      return;
    }
    const saved = await adminApi.saveRole({
      id: accessConsole.roleForm.id,
      name: accessConsole.roleForm.name,
      label: accessConsole.roleForm.label,
      description: accessConsole.roleForm.description,
      permissions: accessConsole.roleForm.permissions
    });
    await loadAccessConsole();
    if (saved?.id) {
      const fresh = accessConsole.roles.find((role) => String(role.id) === String(saved.id));
      if (fresh) editRole(fresh);
    }
    await loadSystemStatus({ silent: true });
    ElMessage.success("角色已保存");
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function saveAccessUserRoles() {
  try {
    if (!currentAccessUser.value) {
      ElMessage.warning("请先选择用户");
      return;
    }
    if (!accessConsole.userRoles.length) {
      ElMessage.warning("至少保留一个角色");
      return;
    }
    await adminApi.updateUserRoles(currentAccessUser.value.id, accessConsole.userRoles);
    await loadAccessConsole();
    await loadSystemStatus({ silent: true });
    ElMessage.success("用户角色已保存");
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function syncSearch() {
  try {
    await ElMessageBox.confirm("开发阶段同步搜索会刷新索引，确认现在执行吗？", "同步搜索", { type: "warning", confirmButtonText: "同步", cancelButtonText: "取消" });
    const data = await adminApi.syncSearch();
    ElMessage.success(`搜索索引已同步 ${data.count ?? 0} 条`);
    await loadSystemStatus({ silent: true });
    await loadTaskCenter({ silent: true });
    if (view.value === "audit") await loadAuditConsole();
  } catch (error) {
    if (error !== "cancel") ElMessage.error(error.message);
  }
}

async function syncGithubRepositories() {
  integrationBusy.value = true;
  try {
    const data = await adminApi.syncGithubRepos({ username: githubIntegration.value.username || settings.githubUsername });
    ElMessage.success(`GitHub 仓库已同步 ${data.count ?? 0} 个`);
    await loadIntegrationStatus({ silent: true });
    await loadTaskCenter({ silent: true });
    await loadSystemStatus({ silent: true });
  } catch (error) {
    if (error !== "cancel") ElMessage.error(error.message);
  } finally {
    integrationBusy.value = false;
  }
}

async function refreshGithubContributions() {
  integrationBusy.value = true;
  try {
    const data = await adminApi.refreshGithubContributions({ username: githubIntegration.value.username || settings.githubUsername });
    ElMessage.success(`贡献日历已刷新：${data.total ?? 0} 次贡献`);
    await loadIntegrationStatus({ silent: true });
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    integrationBusy.value = false;
  }
}

function toneClass(item = {}) {
  return `tone-${item.tone || item.status || "neutral"}`;
}

function formatAuditTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatFileSize(value) {
  const size = Number(value) || 0;
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function actionLabel(action) {
  const labels = {
    create: "新建",
    update: "更新",
    hide: "隐藏/下架",
    delete: "删除",
    publish: "发布",
    restore: "恢复",
    save: "保存",
    "save-draft": "保存草稿",
    "delete-draft": "删除草稿",
    upload: "上传媒体",
    "sync-search": "同步搜索"
  };
  return labels[action] || action || "操作";
}

function contentStatusLabel(status) {
  const labels = {
    draft: "草稿",
    published: "已发布",
    active: "展示中",
    archived: "已归档",
    pending: "待审核",
    hidden: "已隐藏",
    deleted: "已删除"
  };
  return labels[status] || status || "未知";
}

function commentStatusLabel(status) {
  const labels = {
    pending: "待审核",
    published: "已发布",
    hidden: "已隐藏"
  };
  return labels[status] || status || "未知";
}

function commentStatusType(status) {
  return ({ pending: "warning", published: "success", hidden: "info" })[status] || "info";
}

function shortHash(value) {
  const text = String(value || "");
  return text ? `${text.slice(0, 8)}…` : "-";
}

function resourceLabel(type) {
  const labels = {
    post: "文章",
    moment: "瞬间",
    "hz-quote": "Hz",
    project: "项目",
    interview: "面试",
    comment: "留言",
    settings: "系统设置",
    "site-texts": "站点文案",
    "frontend-layout": "前台布局",
    "frontend-editor": "页面装修",
    "media-asset": "媒体资源",
    "search-index": "搜索索引",
    "backup-job": "备份任务",
    "setting-version": "配置版本",
    "content-version": "内容版本"
  };
  return labels[type] || type || "资源";
}

function targetLabel(target) {
  const text = String(target || "");
  if (text.startsWith("page:")) {
    return ({
      "page:home": "首页",
      "page:moments": "瞬间",
      "page:archive": "小记",
      "page:interview": "面试",
      "page:projects": "项目",
      "page:about": "关于"
    })[text] || text.replace(/^page:/, "页面：");
  }
  if (text.startsWith("post:")) return `小记：${text.slice(5)}`;
  if (text.startsWith("project:")) return `项目：${text.slice(8)}`;
  if (text.startsWith("comment:")) return `留言：${text.slice(8)}`;
  return text || "未知目标";
}

function backupStatusLabel(status) {
  const labels = {
    planned: "已计划",
    running: "执行中",
    success: "已完成",
    failed: "失败"
  };
  return labels[status] || status || "未知";
}

function backupStatusTone(status) {
  if (status === "success") return "success";
  if (status === "failed") return "danger";
  if (status === "running") return "warning";
  return "info";
}

function taskKindLabel(kind) {
  const labels = {
    "comment-review": "评论审核",
    "media-cleanup": "媒体治理",
    search: "搜索任务",
    backup: "备份任务",
    system: "系统任务"
  };
  return labels[kind] || kind || "任务";
}

function taskStatusLabel(status) {
  const labels = {
    pending: "待处理",
    attention: "需关注",
    running: "执行中",
    success: "已完成",
    failed: "失败",
    planned: "已计划",
    preview: "预览"
  };
  return labels[status] || status || "未知";
}

function taskTone(tone) {
  if (tone === "ok" || tone === "success") return "success";
  if (tone === "danger" || tone === "failed") return "danger";
  if (tone === "warn" || tone === "warning") return "warning";
  return "info";
}

function contentQuery(key) {
  const params = new URLSearchParams();
  if (trashMode[key]) params.set("trash", "1");
  const filters = contentFilters[key] || {};
  for (const [name, value] of Object.entries(filters)) {
    const text = String(value || "").trim();
    if (text) params.set(name, text);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function selectedContentIds(key) {
  return (contentSelection[key] || []).map((row) => row.id).filter(Boolean);
}

function setContentSelection(key, rows) {
  contentSelection[key] = Array.isArray(rows) ? rows : [];
}

function contentExportHref(key) {
  return adminApi.contentExportUrl(contentResourceMap[key] || key, contentQuery(key));
}

async function resetContentFilters(key) {
  const filters = contentFilters[key] || {};
  for (const name of Object.keys(filters)) filters[name] = "";
  await loadContentList(key);
}

async function setTrashMode(key, value) {
  trashMode[key] = value;
  contentSelection[key] = [];
  await loadContentList(key);
}

async function loadContentList(key) {
  if (key === "posts") return loadPosts();
  if (key === "moments") return loadMoments();
  if (key === "projects") return loadProjects();
  if (key === "interviews") return loadInterviews();
  if (key === "interviewQuestions") return loadInterviewQuestions();
  if (key === "interviewReviews") return loadInterviewReviews();
  if (key === "comments") return loadComments();
}

function batchContentActionLabel(key, action) {
  const labels = {
    publish: key === "projects" ? "展示" : "发布",
    hide: key === "projects" ? "归档" : key === "comments" ? "隐藏" : "转为草稿",
    restore: "恢复",
    delete: "移入回收站"
  };
  return labels[action] || action;
}

async function runBatchContent(key, action) {
  const ids = selectedContentIds(key);
  if (!ids.length) {
    ElMessage.warning("请先勾选要处理的记录");
    return;
  }
  const label = batchContentActionLabel(key, action);
  try {
    await confirmDanger(`确认将已选 ${ids.length} 条内容${label}？`);
    const result = await adminApi.batchContent(contentResourceMap[key] || key, action, ids);
    await loadContentList(key);
    await refreshDashboard();
    ElMessage.success(`批量${label}完成：${result.count || 0} 条`);
    if (result.ok === false) ElMessage.warning("部分记录处理失败，请刷新后复查列表。");
  } catch (error) {
    if (error !== "cancel") ElMessage.error(error.message || "批量操作失败");
  }
}

async function loadPosts() {
  posts.value = (await adminApi.listPosts(contentQuery("posts"))).items || [];
  contentSelection.posts = [];
}

async function loadPostEditor() {
  Object.assign(postForm, emptyPost());
  const id = route.value.match(/^\/posts\/(\d+)/)?.[1];
  if (id) Object.assign(postForm, await adminApi.getPost(id));
}

function editPost(id) {
  go(id ? `/posts/${id}` : "/posts/new");
}

async function savePost() {
  try {
    const saved = await adminApi.savePost(postForm);
    ElMessage.success("文章已保存");
    go(`/posts/${saved.id}`);
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function hidePost(id) {
  await adminApi.hidePost(id);
  await loadPosts();
}

async function restorePost(id) {
  await adminApi.restorePost(id);
  ElMessage.success("文章已恢复为草稿");
  await loadPosts();
  await refreshDashboard();
}

async function destroyPost(id) {
  await confirmDanger("将这篇文章移入回收站？");
  await adminApi.destroyPost(id);
  await loadPosts();
  await refreshDashboard();
}

async function loadMoments() {
  moments.value = (await adminApi.listMoments(contentQuery("moments"))).items || [];
  contentSelection.moments = [];
}

function resetMoment() {
  Object.assign(momentForm, emptyMoment());
}

function editMoment(row) {
  Object.assign(momentForm, { ...emptyMoment(), ...row, tagText: (row.tags || []).join(",") });
}

async function saveMoment() {
  try {
    await adminApi.saveMoment(momentForm);
    resetMoment();
    await loadMoments();
    ElMessage.success("瞬间已保存");
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function hideMoment(id) {
  await adminApi.hideMoment(id);
  await loadMoments();
}

async function restoreMoment(id) {
  await adminApi.restoreMoment(id);
  ElMessage.success("瞬间已恢复为草稿");
  await loadMoments();
  await refreshDashboard();
}

async function destroyMoment(id) {
  await confirmDanger("将这条瞬间移入回收站？");
  await adminApi.destroyMoment(id);
  await loadMoments();
  await refreshDashboard();
}

async function loadHzQuotes() {
  hzQuotes.value = (await adminApi.listHzQuotes(trashMode.hzQuotes ? "?trash=1" : "")).items || [];
}

function resetHzQuote() {
  Object.assign(hzQuoteForm, emptyHzQuote());
}

function editHzQuote(row = {}) {
  Object.assign(hzQuoteForm, {
    ...emptyHzQuote(),
    ...row,
    visible: row.visible !== false,
    sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0)
  });
}

async function saveHzQuote() {
  try {
    if (!String(hzQuoteForm.text || "").trim()) {
      ElMessage.warning("先写一句 Hz 内容");
      return;
    }
    await adminApi.saveHzQuote(hzQuoteForm);
    resetHzQuote();
    await loadHzQuotes();
    await refreshDashboard();
    ElMessage.success("Hz 已保存");
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function publishHzQuote(id) {
  await adminApi.publishHzQuote(id);
  await loadHzQuotes();
}

async function hideHzQuote(id) {
  await adminApi.hideHzQuote(id);
  await loadHzQuotes();
}

async function restoreHzQuote(id) {
  await adminApi.restoreHzQuote(id);
  await loadHzQuotes();
  await refreshDashboard();
  ElMessage.success("Hz 已恢复");
}

async function destroyHzQuote(id) {
  await confirmDanger("将这条 Hz 移入回收站？");
  await adminApi.destroyHzQuote(id);
  await loadHzQuotes();
  await refreshDashboard();
}

async function loadProjects() {
  projects.value = (await adminApi.listProjects(contentQuery("projects"))).items || [];
  contentSelection.projects = [];
}

function resetProject() {
  Object.assign(projectForm, emptyProject());
}

function editProject(row) {
  Object.assign(projectForm, { ...emptyProject(), ...row, content_md: row.content_md || "" });
}

async function saveProject() {
  try {
    await adminApi.saveProject(projectForm);
    resetProject();
    await loadProjects();
    ElMessage.success("项目已保存");
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function hideProject(id) {
  await adminApi.hideProject(id);
  await loadProjects();
}

async function restoreProject(id) {
  await adminApi.restoreProject(id);
  ElMessage.success("项目已恢复并设为展示");
  await loadProjects();
  await refreshDashboard();
}

async function destroyProject(id) {
  await confirmDanger("将这个项目移入回收站？");
  await adminApi.destroyProject(id);
  await loadProjects();
  await refreshDashboard();
}

function interviewQuestionQuery() {
  const params = new URLSearchParams();
  params.set("limit", "160");
  for (const [name, value] of Object.entries(interviewQuestionFilters)) {
    const text = String(value || "").trim();
    if (text) params.set(name, text);
  }
  return `?${params.toString()}`;
}

function interviewReviewQuery() {
  const params = new URLSearchParams();
  params.set("limit", "120");
  for (const [name, value] of Object.entries(interviewReviewFilters)) {
    const text = String(value || "").trim();
    if (text) params.set(name, text);
  }
  return `?${params.toString()}`;
}

async function loadInterviewWorkspace() {
  try {
    const [legacy, topics, questions, reviews, daily, goals, goalUpdates] = await Promise.all([
      adminApi.listInterviews(contentQuery("interviews")),
      adminApi.listInterviewTopics(),
      adminApi.listInterviewQuestions(interviewQuestionQuery()),
      adminApi.listInterviewReviews(interviewReviewQuery()),
      adminApi.interviewDailyStatus(),
      adminApi.listInterviewGoals(),
      adminApi.listInterviewGoalUpdates("?limit=120")
    ]);
    interviews.value = legacy.items || [];
    interviewTopics.value = topics.items || [];
    interviewQuestions.value = questions.items || [];
    interviewReviews.value = reviews.items || [];
    interviewGoals.value = goals.items || [];
    interviewGoalUpdates.value = goalUpdates.items || [];
    interviewDailyStatus.value = daily;
    if (!interviewQuestionForm.topicId && interviewTopicOptions.value[0]?.id) {
      interviewQuestionForm.topicId = interviewTopicOptions.value[0].id;
    }
    contentSelection.interviews = [];
    contentSelection.interviewQuestions = [];
    contentSelection.interviewReviews = [];
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function loadInterviews() {
  await loadInterviewWorkspace();
}

async function loadLegacyInterviews() {
  interviews.value = (await adminApi.listInterviews(contentQuery("interviews"))).items || [];
  contentSelection.interviews = [];
}

async function loadInterviewTopics() {
  interviewTopics.value = (await adminApi.listInterviewTopics()).items || [];
}

async function loadInterviewGoals() {
  interviewGoals.value = (await adminApi.listInterviewGoals()).items || [];
}

async function loadInterviewGoalUpdates() {
  interviewGoalUpdates.value = (await adminApi.listInterviewGoalUpdates("?limit=120")).items || [];
}

async function loadInterviewQuestions() {
  interviewQuestions.value = (await adminApi.listInterviewQuestions(interviewQuestionQuery())).items || [];
  contentSelection.interviewQuestions = [];
}

async function loadInterviewReviews() {
  interviewReviews.value = (await adminApi.listInterviewReviews(interviewReviewQuery())).items || [];
  contentSelection.interviewReviews = [];
}

async function loadInterviewDailyStatus() {
  try {
    interviewDailyStatus.value = await adminApi.interviewDailyStatus();
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function publishInterviewDailySet() {
  try {
    await ElMessageBox.confirm("将从已发布题库生成/更新今日 50 题，确认继续吗？", "发布今日题单", { type: "warning", confirmButtonText: "生成/更新", cancelButtonText: "取消" });
    interviewDailyBusy.value = true;
    const result = await adminApi.publishInterviewDaily({ force: true });
    interviewDailyStatus.value = await adminApi.interviewDailyStatus();
    ElMessage.success(`今日题单已更新：${result.total || 0} 题`);
  } catch (error) {
    if (error !== "cancel") ElMessage.error(error.message);
  } finally {
    interviewDailyBusy.value = false;
  }
}

async function resetInterviewQuestionFilters() {
  Object.assign(interviewQuestionFilters, { q: "", status: "", topic: "" });
  await loadInterviewQuestions();
}

async function resetInterviewReviewFilters() {
  Object.assign(interviewReviewFilters, { q: "", status: "" });
  await loadInterviewReviews();
}

function resetInterview() {
  Object.assign(interviewForm, emptyInterview());
}

function editInterview(row) {
  Object.assign(interviewForm, { ...emptyInterview(), ...row, tagText: (row.tags || []).join(","), content_md: row.content_md || "" });
}

async function saveInterview() {
  try {
    await adminApi.saveInterview(interviewForm);
    resetInterview();
    await loadInterviews();
    ElMessage.success("面试内容已保存");
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function hideInterview(id) {
  await adminApi.hideInterview(id);
  await loadInterviews();
}

async function restoreInterview(id) {
  await adminApi.restoreInterview(id);
  ElMessage.success("面试内容已恢复为草稿");
  await loadInterviews();
  await refreshDashboard();
}

async function destroyInterview(id) {
  await confirmDanger("将这条面试内容移入回收站？");
  await adminApi.destroyInterview(id);
  await loadInterviews();
  await refreshDashboard();
}

function topicLabelById(id) {
  return interviewTopics.value.find((topic) => String(topic.id) === String(id))?.title || "";
}

function goalLabelById(id) {
  return interviewGoals.value.find((goal) => String(goal.id) === String(id))?.title || "";
}

function goalStatusLabel(status) {
  return interviewGoalStatusOptions.find((option) => option.value === status)?.label || status || "计划中";
}

function goalUpdateTypeLabel(type) {
  return interviewGoalUpdateTypeOptions.find((option) => option.value === type)?.label || type || "笔记";
}

function normalizeFormIdList(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(raw.map((item) => String(item || "").trim()).filter(Boolean))];
}

function questionGoalTitles(row = {}) {
  const ids = normalizeFormIdList(row.goalIds || row.goal_ids || []);
  const titles = ids.map(goalLabelById).filter(Boolean);
  return titles.length ? titles.join("、") : "其他";
}

function resetInterviewTopic() {
  Object.assign(interviewTopicForm, emptyInterviewTopic());
  interviewAdminTab.value = "topics";
}

function editInterviewTopic(row = {}) {
  Object.assign(interviewTopicForm, {
    ...emptyInterviewTopic(),
    id: row.id || "",
    title: row.title || "",
    slug: row.slug || "",
    description: row.description || "",
    sortOrder: row.sortOrder ?? 0,
    visible: row.visible !== false
  });
  interviewAdminTab.value = "topics";
}

async function saveInterviewTopic() {
  try {
    await adminApi.saveInterviewTopic(interviewTopicForm);
    resetInterviewTopic();
    await Promise.all([loadInterviewTopics(), loadInterviewQuestions()]);
    ElMessage.success("面试专题已保存");
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function publishInterviewTopic(id) {
  await adminApi.publishInterviewTopic(id);
  await loadInterviewTopics();
}

async function hideInterviewTopic(id) {
  await adminApi.hideInterviewTopic(id);
  await loadInterviewTopics();
}

async function destroyInterviewTopic(id) {
  await confirmDanger("专题会进入隐藏回收状态，题目不会被删除。继续？");
  await adminApi.destroyInterviewTopic(id);
  await loadInterviewTopics();
}

function resetInterviewGoal() {
  Object.assign(interviewGoalForm, emptyInterviewGoal());
  interviewAdminTab.value = "goals";
}

function editInterviewGoal(row = {}) {
  Object.assign(interviewGoalForm, {
    ...emptyInterviewGoal(),
    id: row.id || "",
    parentId: row.parentId ? String(row.parentId) : "",
    title: row.title || "",
    slug: row.slug || "",
    summary: row.summary || "",
    status: row.status || "planned",
    targetCount: row.targetCount ?? 0,
    manualProgress: row.manualProgress ?? 0,
    sortOrder: row.sortOrder ?? 0,
    visible: row.slug === "other" ? true : row.visible !== false,
    accent: row.accent || "",
    icon: row.icon || ""
  });
  interviewAdminTab.value = "goals";
}

async function saveInterviewGoal() {
  try {
    const payload = { ...interviewGoalForm };
    if (payload.slug === "other") payload.visible = true;
    await adminApi.saveInterviewGoal(payload);
    resetInterviewGoal();
    await Promise.all([loadInterviewGoals(), loadInterviewQuestions(), loadInterviewGoalUpdates()]);
    ElMessage.success("目标计划已保存");
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function publishInterviewGoal(id) {
  await adminApi.publishInterviewGoal(id);
  await loadInterviewGoals();
}

async function hideInterviewGoal(id) {
  await adminApi.hideInterviewGoal(id);
  await loadInterviewGoals();
}

async function destroyInterviewGoal(id) {
  await confirmDanger("目标会进入隐藏回收状态，题目绑定不会被删除。继续？");
  await adminApi.destroyInterviewGoal(id);
  await loadInterviewGoals();
}

function resetInterviewGoalUpdate() {
  Object.assign(interviewGoalUpdateForm, emptyInterviewGoalUpdate());
  interviewAdminTab.value = "goals";
}

function editInterviewGoalUpdate(row = {}) {
  Object.assign(interviewGoalUpdateForm, {
    ...emptyInterviewGoalUpdate(),
    id: row.id || "",
    goalId: row.goalId ? String(row.goalId) : "",
    type: row.type || "note",
    title: row.title || "",
    body_md: row.body_md || "",
    relatedQuestionId: row.relatedQuestionId || "",
    status: row.status || "published",
    happenedAt: row.happenedAt || "",
    sortOrder: row.sortOrder ?? 0
  });
  interviewAdminTab.value = "goals";
}

async function saveInterviewGoalUpdate() {
  try {
    await adminApi.saveInterviewGoalUpdate(interviewGoalUpdateForm);
    resetInterviewGoalUpdate();
    await Promise.all([loadInterviewGoalUpdates(), loadInterviewGoals()]);
    ElMessage.success("目标记录已保存");
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function publishInterviewGoalUpdate(id) {
  await adminApi.publishInterviewGoalUpdate(id);
  await Promise.all([loadInterviewGoalUpdates(), loadInterviewGoals()]);
}

async function hideInterviewGoalUpdate(id) {
  await adminApi.hideInterviewGoalUpdate(id);
  await Promise.all([loadInterviewGoalUpdates(), loadInterviewGoals()]);
}

async function destroyInterviewGoalUpdate(id) {
  await confirmDanger("将这条目标记录移入回收状态？");
  await adminApi.destroyInterviewGoalUpdate(id);
  await Promise.all([loadInterviewGoalUpdates(), loadInterviewGoals()]);
}

function resetInterviewQuestion() {
  Object.assign(interviewQuestionForm, emptyInterviewQuestion());
  if (!interviewQuestionForm.topicId && interviewTopicOptions.value[0]?.id) interviewQuestionForm.topicId = interviewTopicOptions.value[0].id;
  interviewAdminTab.value = "questions";
}

function normalizeQuestionList(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/\r?\n|[；;]/u);
  return raw.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8);
}

function textFromList(value) {
  return normalizeQuestionList(value).join("\n");
}

function interviewQuestionPayload(form) {
  const payload = { ...form };
  payload.goalIds = normalizeFormIdList(form.goalIds);
  for (const field of interviewTrainingFieldDefs) payload[field.key] = normalizeQuestionList(form[field.textKey]);
  payload.answer_points = Object.fromEntries(interviewTrainingFieldDefs.map((field) => [field.key, payload[field.key]]));
  payload.answer_points.difficulty = payload.difficulty;
  return payload;
}

function interviewTrainingCompleteness(row = {}) {
  const missing = interviewTrainingFieldDefs.filter((field) => normalizeQuestionList(row[field.key]).length === 0).map((field) => field.label);
  return { total: interviewTrainingFieldDefs.length, complete: interviewTrainingFieldDefs.length - missing.length, missing };
}

function interviewTrainingMissingText(row = {}) {
  const missing = interviewTrainingCompleteness(row).missing;
  return missing.length ? `缺：${missing.slice(0, 2).join("、")}${missing.length > 2 ? "…" : ""}` : "训练字段完整";
}

function editInterviewQuestion(row = {}) {
  Object.assign(interviewQuestionForm, {
    ...emptyInterviewQuestion(),
    id: row.id || "",
    topicId: row.topicId || "",
    title: row.title || "",
    slug: row.slug || "",
    summary: row.summary || "",
    answer_md: row.answer_md || "",
    difficulty: row.difficulty || "基础",
    source: row.source || "",
    tagText: (row.tags || []).join(","),
    goalIds: normalizeFormIdList(row.goalIds || row.goal_ids || []),
    pointsText: textFromList(row.points),
    followUpsText: textFromList(row.followUps),
    interviewerFocusText: textFromList(row.interviewerFocus),
    speechTemplateText: textFromList(row.speechTemplate),
    commonMistakesText: textFromList(row.commonMistakes),
    projectPromptsText: textFromList(row.projectPrompts),
    status: row.status || "draft",
    sortOrder: row.sortOrder ?? 0,
    reviewedAt: row.reviewedAt || ""
  });
  interviewAdminTab.value = "questions";
}

async function saveInterviewQuestion() {
  try {
    await adminApi.saveInterviewQuestion(interviewQuestionPayload(interviewQuestionForm));
    resetInterviewQuestion();
    await Promise.all([loadInterviewQuestions(), loadInterviewTopics(), loadInterviewGoals()]);
    ElMessage.success("面试题已保存");
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function publishInterviewQuestion(id) {
  await adminApi.publishInterviewQuestion(id);
  await Promise.all([loadInterviewQuestions(), loadInterviewTopics(), loadInterviewGoals()]);
}

async function hideInterviewQuestion(id) {
  await adminApi.hideInterviewQuestion(id);
  await Promise.all([loadInterviewQuestions(), loadInterviewTopics(), loadInterviewGoals()]);
}

async function destroyInterviewQuestion(id) {
  await confirmDanger("将这道题移入回收状态？");
  await adminApi.destroyInterviewQuestion(id);
  await Promise.all([loadInterviewQuestions(), loadInterviewTopics(), loadInterviewGoals()]);
}

function resetInterviewReview() {
  Object.assign(interviewReviewForm, emptyInterviewReview());
  interviewAdminTab.value = "reviews";
}

function editInterviewReview(row = {}) {
  Object.assign(interviewReviewForm, {
    ...emptyInterviewReview(),
    id: row.id || "",
    companyAlias: row.companyAlias || "",
    positionName: row.positionName || "",
    interviewRound: row.interviewRound || "",
    happenedAt: row.happenedAt || "",
    resultStatus: row.resultStatus || "",
    summary_md: row.summary_md || "",
    improvement_md: row.improvement_md || "",
    status: row.status || "draft",
    sortOrder: row.sortOrder ?? 0
  });
  interviewAdminTab.value = "reviews";
}

async function saveInterviewReview() {
  try {
    await adminApi.saveInterviewReview(interviewReviewForm);
    resetInterviewReview();
    await loadInterviewReviews();
    ElMessage.success("面经已保存");
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function publishInterviewReview(id) {
  await adminApi.publishInterviewReview(id);
  await loadInterviewReviews();
}

async function hideInterviewReview(id) {
  await adminApi.hideInterviewReview(id);
  await loadInterviewReviews();
}

async function destroyInterviewReview(id) {
  await confirmDanger("将这篇面经移入回收状态？");
  await adminApi.destroyInterviewReview(id);
  await loadInterviewReviews();
}

async function loadComments() {
  comments.value = (await adminApi.listComments(contentQuery("comments"))).items || [];
  contentSelection.comments = [];
}

async function publishComment(id) {
  await adminApi.publishComment(id);
  await loadComments();
}

async function hideComment(id) {
  await adminApi.hideComment(id);
  await loadComments();
}

async function restoreComment(id) {
  await adminApi.restoreComment(id);
  ElMessage.success("留言已恢复为待审核");
  await loadComments();
  await refreshDashboard();
}

async function destroyComment(id) {
  await confirmDanger("将这条留言移入回收站？");
  await adminApi.destroyComment(id);
  await loadComments();
  await refreshDashboard();
}

async function loadSiteTexts() {
  siteTexts.value = await adminApi.getSiteTexts();
}

async function saveSiteTexts() {
  await adminApi.saveSiteTexts(siteTexts.value);
  ElMessage.success("文案已保存");
}

async function loadSettings() {
  Object.assign(settings, await adminApi.getSettings());
}

async function saveSettings() {
  await adminApi.saveSettings(settings);
  ElMessage.success("设置已保存");
}

function buildPublishedPayload(data) {
  return {
    texts: clone(data.texts),
    rules: data.rules || "",
    footerSections: clone(data.footerSections || []),
    layout: clone(data.layout),
    ui: clone(data.ui)
  };
}

function ensureEditorPayload(payload) {
  const next = payload || {};
  next.texts ||= {};
  next.footerSections ||= [];
  next.layout ||= {};
  next.ui ||= {};
  next.ui.profile = { avatarUrl: "/assets/sailei/avatar.jpg", ...(next.ui.profile || {}) };
  next.ui.archiveCategories ||= [];
  next.ui.aboutStackItems ||= [
    { id: "database", label: "PostgreSQL / MySQL 数据", visible: true, sortOrder: 10 },
    { id: "redis", label: "Redis 缓存", visible: true, sortOrder: 20 },
    { id: "meilisearch", label: "Meilisearch 搜索", visible: true, sortOrder: 30 },
    { id: "markdown", label: "Markdown 写作", visible: true, sortOrder: 40 },
    { id: "nginx", label: "Nginx 静态部署", visible: true, sortOrder: 50 },
    { id: "backup", label: "每日备份", visible: true, sortOrder: 60 }
  ];
  next.ui.aboutGalleryImages ||= [];
  next.ui.footer ||= { brandBody: "" };
  next.ui.momentKinds ||= [];
  next.ui.searchSuggestions ||= [];
  return next;
}

async function loadFrontendEditor() {
  editorLoading.value = true;
  try {
    const data = await adminApi.getFrontendEditor();
    editorData.value = data;
    editorPayload.value = ensureEditorPayload(clone(data.draft?.payload || buildPublishedPayload(data)));
    selectedTarget.value = null;
    await nextTick();
    sendPreviewPatch();
  } finally {
    editorLoading.value = false;
  }
}

async function loadAboutGallery() {
  editorLoading.value = true;
  try {
    const data = await adminApi.getAboutGallery();
    aboutGalleryImages.value = orderedAboutGalleryAdminItems(data.items || []);
    aboutGalleryLimit.value = Number(data.limit || 1000);
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    editorLoading.value = false;
  }
}

async function loadNavFooter() {
  editorPage.value = "/";
  await loadFrontendEditor();
}

async function loadMediaConsole() {
  await loadCmsConsole();
}

function reloadPreview() {
  previewTick.value += 1;
  nextTick(sendPreviewPatch);
}

function sendPreviewPatch() {
  const frame = previewFrame.value?.contentWindow;
  if (!frame || !editorPayload.value) return;
  frame.postMessage({ source: "jlemonz-admin-editor-preview", payload: clone(editorPayload.value) }, location.origin);
}

function updateEditorText(key, value) {
  if (!editorPayload.value?.texts || !key) return;
  editorPayload.value.texts[key] = value;
  nextTick(sendPreviewPatch);
}

function selectUiTarget(target, text = "") {
  selectedTarget.value = { source: "jlemonz-frontend-editor", target, text };
  editorTab.value = "ui";
}

function addArchiveCategory() {
  const list = editorPayload.value?.ui?.archiveCategories;
  if (!list) return;
  const next = list.length + 1;
  list.push({
    id: `category-${Date.now()}`,
    label: "新分类",
    slug: `category-${next}`,
    description: "",
    countText: "",
    href: `/archive?cat=category-${next}`,
    visibleInHome: true,
    visibleInArchive: true,
    sortOrder: next * 10
  });
  nextTick(sendPreviewPatch);
}

function removeArchiveCategory(index) {
  editorPayload.value?.ui?.archiveCategories?.splice(index, 1);
  nextTick(sendPreviewPatch);
}

function addStackItem() {
  const list = editorPayload.value?.ui?.aboutStackItems;
  if (!list) return;
  const next = list.length + 1;
  list.push({ id: `stack-${Date.now()}`, label: "新技术项", visible: true, sortOrder: next * 10 });
  nextTick(sendPreviewPatch);
}

function removeStackItem(index) {
  editorPayload.value?.ui?.aboutStackItems?.splice(index, 1);
  nextTick(sendPreviewPatch);
}

function currentAboutGalleryList() {
  if (view.value === "about-gallery") return aboutGalleryImages.value;
  return editorPayload.value?.ui?.aboutGalleryImages;
}

function aboutGalleryUrlKey(value = "") {
  return String(value || "").trim();
}

function orderedAboutGalleryAdminItems(items = []) {
  const seen = new Set();
  return clone(items)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
    .filter((item) => {
      const key = aboutGalleryUrlKey(item?.url);
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item, index) => ({ ...item, sortOrder: index + 1 }));
}

function normalizeAboutGalleryAdminOrder(list = currentAboutGalleryList()) {
  if (!Array.isArray(list)) return [];
  const before = list.length;
  const seen = new Set();
  const normalized = [...list].filter((item) => {
    const key = aboutGalleryUrlKey(item?.url);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  normalized.forEach((item, index) => {
    item.sortOrder = index + 1;
  });
  if (normalized.length !== list.length) list.splice(0, list.length, ...normalized);
  nextTick(sendPreviewPatch);
  if (before > normalized.length) ElMessage.success(`已自动去掉 ${before - normalized.length} 个重复链接`);
  return list;
}

async function removeDuplicateAboutGalleryImages() {
  if (aboutGalleryDuplicateCount.value === 0) {
    ElMessage.info("当前没有重复链接");
    return;
  }
  normalizeAboutGalleryAdminOrder(aboutGalleryImages.value);
  await saveAboutGallery();
}

function moveAboutGalleryImage(index, direction) {
  const list = currentAboutGalleryList();
  if (!Array.isArray(list)) return;
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= list.length) return;
  [list[index], list[nextIndex]] = [list[nextIndex], list[index]];
  list.forEach((item, itemIndex) => {
    item.sortOrder = itemIndex + 1;
  });
  nextTick(sendPreviewPatch);
}

function cleanAboutGalleryAdminUrl(value = "") {
  const text = String(value || "").trim();
  if (/^https?:\/\/\S{4,}$/i.test(text)) return text;
  if (/^\/(?:uploads|assets)\/\S+/i.test(text)) return text;
  return "";
}

function appendAboutGalleryBulkImages() {
  const list = currentAboutGalleryList();
  if (!Array.isArray(list)) return;
  const tokens = String(aboutGalleryBulkText.value || "")
    .split(/[\s,，]+/)
    .map(cleanAboutGalleryAdminUrl)
    .filter(Boolean);
  const existing = new Set(list.map((item) => aboutGalleryUrlKey(item.url)).filter(Boolean));
  const incoming = new Set();
  const unique = tokens.filter((url) => {
    const key = aboutGalleryUrlKey(url);
    if (!key || existing.has(key) || incoming.has(key)) return false;
    incoming.add(key);
    return true;
  });
  const canAdd = Math.max(0, aboutGalleryLimit.value - list.length);
  const accepted = unique.slice(0, canAdd);
  accepted.forEach((url, index) => {
    list.push({
      id: `about-gallery-${Date.now()}-${index}`,
      url,
      visible: true,
      sortOrder: list.length + 1
    });
  });
  list.forEach((item, index) => {
    item.sortOrder = index + 1;
  });
  aboutGalleryBulkText.value = "";
  nextTick(sendPreviewPatch);
  if (!accepted.length) {
    ElMessage.warning(tokens.length ? "没有新的有效图片链接" : "先粘贴图片链接");
    return;
  }
  const skipped = tokens.length - accepted.length;
  ElMessage.success(skipped > 0 ? `已加入 ${accepted.length} 张，跳过 ${skipped} 条重复、无效或超出容量的链接` : `已加入 ${accepted.length} 张图片`);
}

function addAboutGalleryImage() {
  const list = currentAboutGalleryList();
  if (!list) return;
  if (view.value === "about-gallery" && list.length >= aboutGalleryLimit.value) {
    ElMessage.warning(`About 图库容量是 ${aboutGalleryLimit.value} 张图片`);
    return;
  }
  const next = list.length + 1;
  list.push({ id: `about-gallery-${Date.now()}`, url: "", visible: true, sortOrder: next });
  nextTick(sendPreviewPatch);
}

function removeAboutGalleryImage(index) {
  currentAboutGalleryList()?.splice(index, 1);
  currentAboutGalleryList()?.forEach((item, itemIndex) => {
    item.sortOrder = itemIndex + 1;
  });
  nextTick(sendPreviewPatch);
}

function addMomentKind() {
  const list = editorPayload.value?.ui?.momentKinds;
  if (!list) return;
  list.push({ id: `moment-${Date.now()}`, label: "新筛选", kind: `kind-${list.length + 1}`, href: "", visible: true, sortOrder: list.length * 10 });
  nextTick(sendPreviewPatch);
}

function removeMomentKind(index) {
  editorPayload.value?.ui?.momentKinds?.splice(index, 1);
  nextTick(sendPreviewPatch);
}

function addSearchSuggestion() {
  const list = editorPayload.value?.ui?.searchSuggestions;
  if (!list) return;
  list.push({ id: `suggestion-${Date.now()}`, label: "新建议", slug: `suggestion-${list.length + 1}`, href: "/archive", visible: true, sortOrder: list.length * 10 });
  nextTick(sendPreviewPatch);
}

function removeSearchSuggestion(index) {
  editorPayload.value?.ui?.searchSuggestions?.splice(index, 1);
  nextTick(sendPreviewPatch);
}

async function saveFrontendDraft() {
  editorSaving.value = true;
  try {
    const data = await adminApi.saveFrontendDraft(editorPayload.value);
    if (editorData.value) editorData.value.draft = data.draft;
    ElMessage.success("草稿已保存，前台尚未发布");
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    editorSaving.value = false;
  }
}

async function publishCurrentFrontendPayload(successMessage = "已发布到前台", shouldReloadPreview = false) {
  editorSaving.value = true;
  try {
    if (!editorPayload.value) return;
    editorData.value = await adminApi.publishFrontendEditor(editorPayload.value);
    editorPayload.value = ensureEditorPayload(buildPublishedPayload(editorData.value));
    if (shouldReloadPreview) reloadPreview();
    ElMessage.success(successMessage);
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    editorSaving.value = false;
  }
}

async function publishFrontend() {
  await publishCurrentFrontendPayload("已发布到前台", true);
}

async function saveAboutGallery() {
  editorSaving.value = true;
  try {
    const data = await adminApi.saveAboutGallery({ items: normalizeAboutGalleryAdminOrder(aboutGalleryImages.value) });
    aboutGalleryImages.value = orderedAboutGalleryAdminItems(data.items || []);
    aboutGalleryLimit.value = Number(data.limit || 1000);
    ElMessage.success("About 图库已保存发布");
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    editorSaving.value = false;
  }
}

async function saveNavFooter() {
  await publishCurrentFrontendPayload("导航页脚已保存发布");
}

async function restoreFrontend() {
  await confirmDanger("恢复上一版会覆盖当前已发布配置和草稿，继续？");
  editorData.value = await adminApi.restoreFrontendEditor();
  editorPayload.value = ensureEditorPayload(buildPublishedPayload(editorData.value));
  reloadPreview();
  ElMessage.success("已恢复上一版");
}

function clampCropPosition() {
  if (!crop.image) return;
  const size = 720;
  const scale = Math.max(size / crop.image.naturalWidth, size / crop.image.naturalHeight) * crop.zoom;
  const width = crop.image.naturalWidth * scale;
  const height = crop.image.naturalHeight * scale;
  crop.x = width <= size ? (size - width) / 2 : Math.min(0, Math.max(size - width, crop.x));
  crop.y = height <= size ? (size - height) / 2 : Math.min(0, Math.max(size - height, crop.y));
}

function drawCropStage() {
  const canvas = cropCanvas.value;
  if (!canvas || !crop.image) return;
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  const scale = Math.max(size / crop.image.naturalWidth, size / crop.image.naturalHeight) * crop.zoom;
  clampCropPosition();
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  if (crop.mode === "avatar") {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
    ctx.clip();
  }
  ctx.drawImage(crop.image, crop.x, crop.y, crop.image.naturalWidth * scale, crop.image.naturalHeight * scale);
  ctx.restore();
  if (crop.mode === "avatar") {
    ctx.fillStyle = "rgba(27, 18, 31, 0.44)";
    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
  }
}

async function openCropUpload(event, target, key, mode = "square") {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  const supportedType = acceptedImageTypes.split(",").includes(file.type) || /\.(jpe?g|png|webp|gif)$/i.test(file.name || "");
  if (!supportedType) {
    ElMessage.error("请选择 JPG、PNG、WEBP 或 GIF 图片");
    return;
  }
  const image = new Image();
  const url = URL.createObjectURL(file);
  image.onload = async () => {
    if (crop.url) URL.revokeObjectURL(crop.url);
    Object.assign(crop, {
      visible: true,
      uploading: false,
      mode,
      url,
      fileName: file.name || "image",
      image,
      target,
      key,
      zoom: 1,
      x: 0,
      y: 0,
      dragging: false
    });
    await nextTick();
    clampCropPosition();
    drawCropStage();
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    ElMessage.error("图片无法读取，请换一张");
  };
  image.src = url;
}

function closeCrop() {
  if (crop.url) URL.revokeObjectURL(crop.url);
  Object.assign(crop, { visible: false, uploading: false, url: "", image: null, target: null, key: "", dragging: false });
}

function startCropDrag(event) {
  if (!crop.image) return;
  crop.dragging = true;
  crop.lastX = event.clientX;
  crop.lastY = event.clientY;
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function moveCropDrag(event) {
  if (!crop.dragging) return;
  const canvas = cropCanvas.value;
  const rect = canvas.getBoundingClientRect();
  const factor = canvas.width / rect.width;
  crop.x += (event.clientX - crop.lastX) * factor;
  crop.y += (event.clientY - crop.lastY) * factor;
  crop.lastX = event.clientX;
  crop.lastY = event.clientY;
  drawCropStage();
}

function stopCropDrag() {
  crop.dragging = false;
}

function zoomCropWheel(event) {
  const direction = event.deltaY > 0 ? -0.08 : 0.08;
  crop.zoom = Math.min(3, Math.max(1, Number(crop.zoom) + direction));
  drawCropStage();
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function confirmCropUpload() {
  if (!crop.target || !crop.key || !crop.image) return;
  crop.uploading = true;
  try {
    const size = crop.mode === "avatar" ? 512 : 1080;
    const output = document.createElement("canvas");
    output.width = size;
    output.height = size;
    const ctx = output.getContext("2d");
    const factor = size / 720;
    if (crop.mode === "avatar") {
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();
    }
    const scale = Math.max(720 / crop.image.naturalWidth, 720 / crop.image.naturalHeight) * crop.zoom;
    ctx.drawImage(crop.image, crop.x * factor, crop.y * factor, crop.image.naturalWidth * scale * factor, crop.image.naturalHeight * scale * factor);
    if (crop.mode === "avatar") ctx.restore();
    const type = crop.mode === "avatar" ? "image/png" : "image/webp";
    const ext = crop.mode === "avatar" ? "png" : "webp";
    const blob = await canvasToBlob(output, type, 0.9);
    if (!blob) throw new Error("裁剪失败");
    const base = crop.fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-") || "image";
    const result = await adminApi.uploadImage(new File([blob], `${base}-crop.${ext}`, { type }));
    if (crop.key.startsWith("__markdown:")) {
      const contentKey = crop.key.split(":")[1] || "content_md";
      const current = String(crop.target[contentKey] || "").trimEnd();
      crop.target[contentKey] = `${current}\n\n![${base}](${result.url})\n`;
    } else {
      crop.target[crop.key] = result.url;
    }
    sendPreviewPatch();
    ElMessage.success("图片已裁剪上传");
    closeCrop();
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    crop.uploading = false;
  }
}

function textLabel(key) {
  const item = editorData.value?.definitions?.find((definition) => definition.key === key);
  return item ? `${item.label} · ${item.key}` : key;
}

async function uploadInto(event, target, key) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const result = await adminApi.uploadImage(file);
    target[key] = result.url;
    sendPreviewPatch();
    if (["about-gallery", "media", "frontend"].includes(view.value)) {
      loadCmsConsole().catch(() => {});
    }
    ElMessage.success("图片已上传");
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    event.target.value = "";
  }
}

async function uploadStandaloneAsset(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const result = await adminApi.uploadImage(file);
    await loadMediaConsole();
    ElMessage.success(`图片已上传：${result.url || "已入库"}`);
  } catch (error) {
    ElMessage.error(error.message);
  }
}

function parseMarkdownDocument(markdown = "") {
  const source = String(markdown || "").replace(/^\uFEFF/, "");
  const result = { meta: {}, content: source };
  const normalized = source.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return result;
  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) return result;
  const metaBlock = normalized.slice(4, end).trim();
  result.content = normalized.slice(end + 5).replace(/^\n+/, "");
  metaBlock.split("\n").forEach((line) => {
    const match = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) return;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result.meta[match[1].trim()] = value;
  });
  return result;
}

function markdownTitle(markdown = "") {
  return String(markdown).match(/^#\s+(.+)$/m)?.[1]?.trim() || "";
}

function markdownSummary(markdown = "") {
  return String(markdown)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)(?:\{[^}]+})?/g, " ")
    .replace(/[#>*_`[\](){}=]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function slugify(value = "", fallback = "project") {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return slug || `${fallback}-${Date.now().toString(36)}`;
}

async function importProjectMarkdown(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!/\.(md|markdown)$/i.test(file.name || "") && !["text/markdown", "text/plain", ""].includes(file.type)) {
    ElMessage.error("请选择 .md 或 .markdown 文件");
    return;
  }
  try {
    const raw = await file.text();
    const parsed = parseMarkdownDocument(raw);
    const meta = parsed.meta || {};
    const content = parsed.content || raw;
    const title = meta.name || meta.title || markdownTitle(content) || file.name.replace(/\.(md|markdown)$/i, "");
    projectForm.content_md = content;
    projectForm.name = meta.name || meta.title || projectForm.name || title;
    projectForm.slug = meta.slug || projectForm.slug || slugify(title);
    projectForm.summary = meta.summary || projectForm.summary || markdownSummary(content);
    projectForm.status_text = meta.status_text || meta.statusText || projectForm.status_text || markdownSummary(content).slice(0, 120);
    projectForm.cover_url = meta.cover_url || meta.coverUrl || projectForm.cover_url || "";
    projectForm.progress = Number.parseInt(meta.progress ?? projectForm.progress ?? 0, 10) || 0;
    projectForm.sort_order = Number.parseInt(meta.sort_order ?? meta.sortOrder ?? projectForm.sort_order ?? 0, 10) || 0;
    if (["active", "archived"].includes(meta.status)) projectForm.status = meta.status;
    ElMessage.success("Markdown 已导入项目正文");
  } catch (error) {
    ElMessage.error(error.message || "Markdown 导入失败");
  }
}

function normalizeInterviewSectionInput(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (/\u516b\u80a1|bagu|base|basic|\u57fa\u7840/u.test(raw)) return "bagu";
  if (/\u9762\u7ecf|experience|story|\u590d\u76d8/u.test(raw)) return "experience";
  if (/daily|50|\u6bcf\u65e5|\u5237\u9898/u.test(raw)) return "daily50";
  return ["bagu", "experience", "daily50"].includes(raw) ? raw : "bagu";
}

function tagsFromMeta(value = "") {
  if (Array.isArray(value)) return value.join(",");
  return String(value || "").replace(/^\[|]$/g, "").split(/[,\uFF0C\u3001]/u).map((item) => item.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean).join(",");
}

function interviewTopicIdFromMeta(meta = {}, fallbackTopicId = "") {
  const raw = String(meta.topicId || meta.topic_id || meta.topic || meta.topic_slug || meta.section || meta.type || "").trim();
  if (!raw) return fallbackTopicId || interviewQuestionForm.topicId || interviewTopicOptions.value[0]?.id || "";
  const section = normalizeInterviewSectionInput(raw);
  const matched = interviewTopicOptions.value.find((topic) => (
    String(topic.id) === raw ||
    String(topic.slug || "").toLowerCase() === raw.toLowerCase() ||
    String(topic.slug || "").toLowerCase() === section ||
    String(topic.title || "").toLowerCase() === raw.toLowerCase()
  ));
  return matched?.id || fallbackTopicId || interviewQuestionForm.topicId || interviewTopicOptions.value[0]?.id || "";
}

async function importInterviewMarkdown(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!/\.(md|markdown)$/i.test(file.name || "") && !["text/markdown", "text/plain", ""].includes(file.type)) {
    ElMessage.error("请选择 .md 或 .markdown 文件");
    return;
  }
  try {
    const raw = await file.text();
    const parsed = parseMarkdownDocument(raw);
    const meta = parsed.meta || {};
    const content = parsed.content || raw;
    const title = meta.title || meta.name || markdownTitle(content) || file.name.replace(/\.(md|markdown)$/i, "");
    interviewForm.content_md = content;
    interviewForm.title = meta.title || meta.name || interviewForm.title || title;
    interviewForm.slug = meta.slug || interviewForm.slug || slugify(title, "interview");
    interviewForm.section = normalizeInterviewSectionInput(meta.section || meta.type || interviewForm.section);
    interviewForm.summary = meta.summary || interviewForm.summary || markdownSummary(content);
    interviewForm.difficulty = meta.difficulty || meta.level || interviewForm.difficulty || "";
    interviewForm.tagText = tagsFromMeta(meta.tags || meta.tagText || interviewForm.tagText);
    interviewForm.question_count = Number.parseInt(meta.question_count ?? meta.questionCount ?? interviewForm.question_count ?? (interviewForm.section === "daily50" ? 50 : 0), 10) || 0;
    interviewForm.finished_count = Number.parseInt(meta.finished_count ?? meta.finishedCount ?? interviewForm.finished_count ?? 0, 10) || 0;
    interviewForm.sort_order = Number.parseInt(meta.sort_order ?? meta.sortOrder ?? interviewForm.sort_order ?? 0, 10) || 0;
    if (["draft", "published"].includes(meta.status)) interviewForm.status = meta.status;
    ElMessage.success("Markdown 已导入面试内容");
  } catch (error) {
    ElMessage.error(error.message || "Markdown 导入失败");
  }
}

async function importInterviewQuestionMarkdown(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!/\.(md|markdown)$/i.test(file.name || "") && !["text/markdown", "text/plain", ""].includes(file.type)) {
    ElMessage.error("请选择 .md 或 .markdown 文件");
    return;
  }
  try {
    const raw = await file.text();
    const parsed = parseMarkdownDocument(raw);
    const meta = parsed.meta || {};
    const content = parsed.content || raw;
    const title = meta.title || meta.question || meta.name || markdownTitle(content) || file.name.replace(/\.(md|markdown)$/i, "");
    Object.assign(interviewQuestionForm, {
      ...interviewQuestionForm,
      title,
      slug: meta.slug || interviewQuestionForm.slug || slugify(title, "question"),
      topicId: interviewTopicIdFromMeta(meta),
      summary: meta.summary || interviewQuestionForm.summary || markdownSummary(content),
      difficulty: meta.difficulty || meta.level || interviewQuestionForm.difficulty || "高频",
      source: meta.source || meta.from || interviewQuestionForm.source || "",
      tagText: tagsFromMeta(meta.tags || meta.tagText || interviewQuestionForm.tagText),
      answer_md: content,
      sortOrder: Number.parseInt(meta.sort_order ?? meta.sortOrder ?? interviewQuestionForm.sortOrder ?? 0, 10) || 0,
      reviewedAt: meta.reviewed_at || meta.reviewedAt || interviewQuestionForm.reviewedAt || ""
    });
    if (["draft", "published"].includes(meta.status)) interviewQuestionForm.status = meta.status;
    interviewAdminTab.value = "questions";
    ElMessage.success("Markdown 已导入题库表单");
  } catch (error) {
    ElMessage.error(error.message || "Markdown 导入失败");
  }
}

async function importInterviewReviewMarkdown(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!/\.(md|markdown)$/i.test(file.name || "") && !["text/markdown", "text/plain", ""].includes(file.type)) {
    ElMessage.error("请选择 .md 或 .markdown 文件");
    return;
  }
  try {
    const raw = await file.text();
    const parsed = parseMarkdownDocument(raw);
    const meta = parsed.meta || {};
    const content = parsed.content || raw;
    const title = markdownTitle(content) || file.name.replace(/\.(md|markdown)$/i, "");
    Object.assign(interviewReviewForm, {
      ...interviewReviewForm,
      companyAlias: meta.company || meta.companyAlias || meta.company_alias || interviewReviewForm.companyAlias || title,
      positionName: meta.position || meta.positionName || meta.position_name || interviewReviewForm.positionName || "",
      interviewRound: meta.round || meta.interviewRound || meta.interview_round || interviewReviewForm.interviewRound || "",
      happenedAt: meta.date || meta.happenedAt || meta.happened_at || interviewReviewForm.happenedAt || "",
      resultStatus: meta.result || meta.resultStatus || meta.result_status || interviewReviewForm.resultStatus || "",
      summary_md: content,
      improvement_md: meta.improvement || meta.improvement_md || interviewReviewForm.improvement_md,
      sortOrder: Number.parseInt(meta.sort_order ?? meta.sortOrder ?? interviewReviewForm.sortOrder ?? 0, 10) || 0
    });
    if (["draft", "published"].includes(meta.status)) interviewReviewForm.status = meta.status;
    interviewAdminTab.value = "reviews";
    ElMessage.success("Markdown 已导入面经表单");
  } catch (error) {
    ElMessage.error(error.message || "Markdown 导入失败");
  }
}

function isMarkdownFile(file) {
  return Boolean(file) && (/\.(md|markdown)$/i.test(file.name || "") || ["text/markdown", "text/plain", ""].includes(file.type));
}

async function importInterviewQuestionMarkdownBatch(event) {
  const selectedFiles = Array.from(event.target.files || []);
  event.target.value = "";
  const files = selectedFiles.filter(isMarkdownFile).slice(0, 50);
  if (!files.length) {
    ElMessage.warning("请选择 .md 或 .markdown 文件");
    return;
  }
  if (selectedFiles.length > files.length) ElMessage.warning("一次最多导入 50 个 Markdown，其他文件已忽略");
  let imported = 0;
  const failures = [];
  const defaultTopicId = interviewQuestionForm.topicId || interviewTopicOptions.value[0]?.id || "";
  for (const [index, file] of files.entries()) {
    try {
      const raw = await file.text();
      const parsed = parseMarkdownDocument(raw);
      const meta = parsed.meta || {};
      const content = parsed.content || raw;
      const title = meta.title || meta.question || meta.name || markdownTitle(content) || file.name.replace(/\.(md|markdown)$/i, "");
      await adminApi.saveInterviewQuestion({
        topicId: interviewTopicIdFromMeta(meta, defaultTopicId),
        title,
        slug: meta.slug || slugify(title, `question-${index + 1}`),
        summary: meta.summary || markdownSummary(content),
        answer_md: content,
        difficulty: meta.difficulty || meta.level || "高频",
        source: meta.source || meta.from || "Markdown 批量导入",
        tagText: tagsFromMeta(meta.tags || meta.tagText || ""),
        status: ["draft", "published"].includes(meta.status) ? meta.status : "draft",
        sortOrder: Number.parseInt(meta.sort_order ?? meta.sortOrder ?? index * 10, 10) || 0,
        reviewedAt: meta.reviewed_at || meta.reviewedAt || "",
        points: normalizeQuestionList(meta.points),
        followUps: normalizeQuestionList(meta.followUps),
        interviewerFocus: normalizeQuestionList(meta.interviewerFocus),
        speechTemplate: normalizeQuestionList(meta.speechTemplate),
        commonMistakes: normalizeQuestionList(meta.commonMistakes),
        projectPrompts: normalizeQuestionList(meta.projectPrompts)
      });
      imported += 1;
    } catch (error) {
      failures.push(`${file.name}：${error.message || "导入失败"}`);
    }
  }
  await Promise.all([loadInterviewQuestions(), loadInterviewTopics()]);
  if (imported) ElMessage.success(`已导入 ${imported} 道题，未声明状态的内容默认保存为草稿`);
  if (failures.length) ElMessage.warning(`有 ${failures.length} 个文件未导入：${failures.slice(0, 3).join("；")}`);
}

async function importInterviewReviewMarkdownBatch(event) {
  const selectedFiles = Array.from(event.target.files || []);
  event.target.value = "";
  const files = selectedFiles.filter(isMarkdownFile).slice(0, 50);
  if (!files.length) {
    ElMessage.warning("请选择 .md 或 .markdown 文件");
    return;
  }
  if (selectedFiles.length > files.length) ElMessage.warning("一次最多导入 50 个 Markdown，其他文件已忽略");
  let imported = 0;
  const failures = [];
  for (const [index, file] of files.entries()) {
    try {
      const raw = await file.text();
      const parsed = parseMarkdownDocument(raw);
      const meta = parsed.meta || {};
      const content = parsed.content || raw;
      const title = markdownTitle(content) || file.name.replace(/\.(md|markdown)$/i, "");
      await adminApi.saveInterviewReview({
        companyAlias: meta.company || meta.companyAlias || meta.company_alias || title,
        positionName: meta.position || meta.positionName || meta.position_name || "",
        interviewRound: meta.round || meta.interviewRound || meta.interview_round || "",
        happenedAt: meta.date || meta.happenedAt || meta.happened_at || "",
        resultStatus: meta.result || meta.resultStatus || meta.result_status || "",
        summary_md: content,
        improvement_md: meta.improvement || meta.improvement_md || "## 下次改进\n\n- ",
        status: ["draft", "published"].includes(meta.status) ? meta.status : "draft",
        sortOrder: Number.parseInt(meta.sort_order ?? meta.sortOrder ?? index * 10, 10) || 0
      });
      imported += 1;
    } catch (error) {
      failures.push(`${file.name}：${error.message || "导入失败"}`);
    }
  }
  await loadInterviewReviews();
  if (imported) ElMessage.success(`已导入 ${imported} 篇面经，未声明状态的内容默认保存为草稿`);
  if (failures.length) ElMessage.warning(`有 ${failures.length} 个文件未导入：${failures.slice(0, 3).join("；")}`);
}

function readImageRatio(file) {
  return new Promise((resolve) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const ratio = image.naturalWidth && image.naturalHeight ? image.naturalWidth / image.naturalHeight : 1.333;
      URL.revokeObjectURL(url);
      resolve(Math.min(4, Math.max(0.25, ratio)));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(1.333);
    };
    image.src = url;
  });
}

async function uploadMarkdownImage(payload, target, key) {
  const file = payload?.file || payload;
  if (!file) return;
  const supportedType = acceptedImageTypes.split(",").includes(file.type) || /\.(jpe?g|png|webp|gif)$/i.test(file.name || "");
  if (!supportedType) {
    ElMessage.error("请选择 JPG、PNG、WEBP 或 GIF 图片");
    return;
  }
  try {
    const ratio = await readImageRatio(file);
    const result = await adminApi.uploadImage(file);
    const base = (file.name || "image").replace(/\.[^.]+$/, "").replace(/[\[\]()]/g, "").trim() || "image";
    const y = Math.min(3600, Math.max(0, Math.round(Number(payload?.insertY ?? 0) || 0)));
    const x = Math.min(58, Math.max(0, Math.round(Number(payload?.insertX ?? 29) || 29)));
    const current = String(target[key] || "").trimEnd();
    target[key] = `${current}\n\n![${base}](${result.url}){width=42 wrap=square align=center x=${x} y=${y} ratio=${ratio.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}}\n`;
    ElMessage.success("图片已插入正文");
  } catch (error) {
    ElMessage.error(error.message);
  }
}

async function confirmDanger(message) {
  await ElMessageBox.confirm(message, "确认操作", { type: "warning", confirmButtonText: "确认", cancelButtonText: "取消" });
}

function emptyPost() {
  return { id: "", title: "", slug: "", summary: "", content_md: "", cover_url: "", status: "draft" };
}

function emptyMoment() {
  return { id: "", content: "", kind: "life", tagText: "", image_url: "", status: "published" };
}

function emptyHzQuote() {
  return { id: "", text: "", status: "published", visible: true, sortOrder: 0 };
}

function emptyProject() {
  return { id: "", name: "", slug: "", summary: "", status_text: "", progress: 0, sort_order: 0, content_md: "# 新项目\n\n## 当前状态\n\n## 下一步\n\n- ", cover_url: "", status: "active" };
}

function emptyInterview() {
  return { id: "", title: "", slug: "", section: "bagu", summary: "", difficulty: "", tagText: "", tags: [], question_count: 0, finished_count: 0, sort_order: 0, content_md: "# 新面试内容\n\n## 核心问题\n\n## 回答框架\n\n- ", status: "draft" };
}

function emptyInterviewTopic() {
  return { id: "", title: "", slug: "", description: "", sortOrder: 0, visible: true };
}

function emptyInterviewGoal() {
  return {
    id: "",
    parentId: "",
    title: "",
    slug: "",
    summary: "",
    status: "planned",
    targetCount: 0,
    manualProgress: 0,
    sortOrder: 0,
    visible: true,
    accent: "#e95f98",
    icon: ""
  };
}

function emptyInterviewGoalUpdate() {
  return {
    id: "",
    goalId: "",
    type: "note",
    title: "",
    body_md: "# 目标复盘\n\n## 进展\n\n- ",
    relatedQuestionId: "",
    status: "published",
    happenedAt: "",
    sortOrder: 0
  };
}

function emptyInterviewQuestion() {
  return {
    id: "",
    topicId: "",
    title: "",
    slug: "",
    summary: "",
    answer_md: "# 新面试题\n\n## 结论\n\n## 展开回答\n\n- ",
    difficulty: "基础",
    source: "",
    tagText: "",
    goalIds: [],
    pointsText: "",
    followUpsText: "",
    interviewerFocusText: "",
    speechTemplateText: "",
    commonMistakesText: "",
    projectPromptsText: "",
    status: "draft",
    sortOrder: 0,
    reviewedAt: ""
  };
}

function emptyInterviewReview() {
  return {
    id: "",
    companyAlias: "",
    positionName: "",
    interviewRound: "",
    happenedAt: "",
    resultStatus: "",
    summary_md: "# 面经复盘\n\n## 面试流程\n\n## 高频问题\n\n- ",
    improvement_md: "## 下次改进\n\n- ",
    status: "draft",
    sortOrder: 0
  };
}

watch(editorPayload, () => {
  if (view.value === "frontend") sendPreviewPatch();
}, { deep: true });

onMounted(boot);
</script>

<script>
export default {
  components: {
    ArchiveCategoryEditor: {
      props: {
        modelValue: { type: Array, default: () => [] },
        activeTarget: { type: String, default: "" }
      },
      emits: ["update:modelValue", "change", "select"],
      methods: {
        update() {
          this.$emit("update:modelValue", this.modelValue);
          this.$emit("change");
        },
        add() {
          const next = this.modelValue.length + 1;
          this.modelValue.push({
            id: `category-${Date.now()}`,
            label: "新分类",
            slug: `category-${next}`,
            description: "",
            countText: "",
            href: `/archive?cat=category-${next}`,
            visibleInHome: true,
            visibleInArchive: true,
            sortOrder: next * 10
          });
          this.update();
        },
        remove(index) {
          this.modelValue.splice(index, 1);
          this.update();
        },
        selected(item) {
          return this.activeTarget === `ui:archive-category:${item.id}`;
        },
        select(item) {
          this.$emit("select", `ui:archive-category:${item.id}`, item.label || item.id);
        }
      },
      template: `
        <div class="ui-editor-list">
          <article v-for="(item, index) in modelValue" :key="item.id || index" class="ui-edit-card" :class="{ selected: selected(item) }" @click="select(item)">
            <header>
              <strong>{{ item.label || '未命名分类' }}</strong>
              <button type="button" @click.stop="remove(index)">删除</button>
            </header>
            <div class="ui-field-grid">
              <label>名称<input v-model="item.label" @input="update" /></label>
              <label>slug<input v-model="item.slug" @input="update" /></label>
              <label>说明<input v-model="item.description" @input="update" /></label>
              <label>数量文本<input v-model="item.countText" @input="update" /></label>
              <label class="wide">链接<input v-model="item.href" @input="update" /></label>
              <label>排序<input v-model.number="item.sortOrder" type="number" @input="update" /></label>
            </div>
            <div class="check-row">
              <label><input v-model="item.visibleInHome" type="checkbox" @change="update" /> 首页显示</label>
              <label><input v-model="item.visibleInArchive" type="checkbox" @change="update" /> 小记页显示</label>
            </div>
          </article>
          <button type="button" class="plain-button" @click="add">添加分类</button>
        </div>
      `
    },
    StackItemEditor: {
      props: {
        modelValue: { type: Array, default: () => [] },
        activeTarget: { type: String, default: "" }
      },
      emits: ["update:modelValue", "change", "select"],
      methods: {
        update() {
          this.$emit("update:modelValue", this.modelValue);
          this.$emit("change");
        },
        add() {
          const next = this.modelValue.length + 1;
          this.modelValue.push({ id: `stack-${Date.now()}`, label: "新技术项", visible: true, sortOrder: next * 10 });
          this.update();
        },
        remove(index) {
          this.modelValue.splice(index, 1);
          this.update();
        },
        selected(item) {
          return this.activeTarget === `ui:about-stack:${item.id}`;
        },
        select(item) {
          this.$emit("select", `ui:about-stack:${item.id}`, item.label || item.id);
        }
      },
      template: `
        <div class="ui-editor-list compact">
          <article v-for="(item, index) in modelValue" :key="item.id || index" class="ui-edit-card" :class="{ selected: selected(item) }" @click="select(item)">
            <div class="ui-field-grid stack-fields">
              <label>标识<input v-model="item.id" @input="update" /></label>
              <label>文字<input v-model="item.label" @input="update" /></label>
              <label>排序<input v-model.number="item.sortOrder" type="number" @input="update" /></label>
              <label><input v-model="item.visible" type="checkbox" @change="update" /> 显示</label>
              <button type="button" @click.stop="remove(index)">删除</button>
            </div>
          </article>
          <button type="button" class="plain-button" @click="add">添加技术项</button>
        </div>
      `
    },
    EditableList: {
      props: {
        modelValue: { type: Array, default: () => [] },
        kindKey: { type: String, default: "slug" }
      },
      emits: ["update:modelValue", "change"],
      methods: {
        update() {
          this.$emit("update:modelValue", this.modelValue);
          this.$emit("change");
        },
        add() {
          this.modelValue.push({ id: `item-${Date.now()}`, label: "", [this.kindKey]: "", href: "", visible: true, sortOrder: this.modelValue.length * 10 });
          this.update();
        },
        remove(index) {
          this.modelValue.splice(index, 1);
          this.update();
        }
      },
      template: `
        <div class="editable-list">
          <div v-for="(item, index) in modelValue" :key="item.id || index" class="editable-row">
            <input v-model="item.label" placeholder="名称" @input="update" />
            <input v-model="item[kindKey]" :placeholder="kindKey" @input="update" />
            <input v-model="item.href" placeholder="链接" @input="update" />
            <label><input v-model="item.visible" type="checkbox" @change="update" /> 显示</label>
            <button type="button" @click="remove(index)">删除</button>
          </div>
          <button type="button" class="plain-button" @click="add">添加</button>
        </div>
      `
    }
  }
};
</script>

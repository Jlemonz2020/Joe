<template>
  <main v-if="!user" class="login-page">
    <form class="login-card" @submit.prevent="login">
      <div class="brand-mark">J</div>
      <h1>Jlemonz Admin</h1>
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
        <span class="brand-copy"><strong>Jlemonz</strong><small>admin workspace</small></span>
      </button>
      <nav class="menu-scroll">
        <section v-for="group in menu" :key="group.title" class="menu-group">
          <p>{{ group.title }}</p>
          <button v-for="item in group.items" :key="item.path" type="button" :class="{ active: isActive(item.path) }" @click="go(item.path)">
            <span>{{ item.icon }}</span>{{ item.label }}
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
          <el-button @click="go('/posts/new')">新文章</el-button>
          <el-button @click="logout">退出</el-button>
        </div>
      </header>

      <section v-if="view === 'dashboard'" class="page-stack">
        <div class="metric-grid">
          <article v-for="metric in dashboardMetrics" :key="metric.label" class="metric-card">
            <span>{{ metric.label }}</span>
            <strong>{{ metric.value }}</strong>
          </article>
        </div>
        <div class="panel">
          <div class="panel-head">
            <div><h2>最近内容</h2><p>文章、瞬间和项目的最新状态。</p></div>
            <el-button @click="refreshDashboard">刷新</el-button>
          </div>
          <div class="panel-body three-grid">
            <div><h3>文章</h3><p v-for="item in overview.recentPosts" :key="item.id">{{ item.title }}</p><p v-if="!overview.recentPosts?.length" class="muted">暂无文章</p></div>
            <div><h3>瞬间</h3><p v-for="item in overview.recentMoments" :key="item.id">{{ item.content }}</p><p v-if="!overview.recentMoments?.length" class="muted">暂无瞬间</p></div>
            <div><h3>项目</h3><p v-for="item in overview.recentProjects" :key="item.id">{{ item.name }}</p><p v-if="!overview.recentProjects?.length" class="muted">暂无项目</p></div>
          </div>
        </div>
      </section>

      <section v-else-if="view === 'posts'" class="page-stack">
        <div class="panel">
          <div class="panel-head">
            <div><h2>文章</h2><p>管理公开札记和草稿。</p></div>
            <el-button type="primary" @click="editPost()">新文章</el-button>
          </div>
          <el-table :data="posts" stripe>
            <el-table-column prop="title" label="标题" min-width="220" />
            <el-table-column prop="slug" label="Slug" width="180" />
            <el-table-column prop="status" label="状态" width="110" />
            <el-table-column label="操作" width="210">
              <template #default="{ row }">
                <el-button size="small" @click="editPost(row.id)">编辑</el-button>
                <el-button size="small" @click="hidePost(row.id)">隐藏</el-button>
                <el-button size="small" type="danger" @click="destroyPost(row.id)">删除</el-button>
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
            <el-button type="primary" @click="resetMoment">新瞬间</el-button>
          </div>
          <div class="panel-body compact-form">
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
          <el-table :data="moments" stripe>
            <el-table-column prop="content" label="内容" min-width="260" />
            <el-table-column prop="kind" label="类型" width="110" />
            <el-table-column prop="status" label="状态" width="110" />
            <el-table-column label="操作" width="220">
              <template #default="{ row }">
                <el-button size="small" @click="editMoment(row)">编辑</el-button>
                <el-button size="small" @click="hideMoment(row.id)">隐藏</el-button>
                <el-button size="small" type="danger" @click="destroyMoment(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </section>

      <section v-else-if="view === 'projects'" class="page-stack">
        <div class="panel">
          <div class="panel-head">
            <div><h2>项目</h2><p>维护项目页和项目详情。</p></div>
            <el-button type="primary" @click="resetProject">新项目</el-button>
          </div>
          <div class="panel-body compact-form">
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
          <el-table :data="projects" stripe>
            <el-table-column prop="name" label="名称" min-width="180" />
            <el-table-column prop="status_text" label="状态" min-width="220" />
            <el-table-column prop="progress" label="进度" width="90" />
            <el-table-column label="操作" width="220">
              <template #default="{ row }">
                <el-button size="small" @click="editProject(row)">编辑</el-button>
                <el-button size="small" @click="hideProject(row.id)">归档</el-button>
                <el-button size="small" type="danger" @click="destroyProject(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </section>

      <section v-else-if="view === 'comments'" class="page-stack">
        <div class="panel">
          <div class="panel-head"><div><h2>留言</h2><p>审核、隐藏和删除前台留言。</p></div><el-button @click="loadComments">刷新</el-button></div>
          <el-table :data="comments" stripe>
            <el-table-column prop="author_name" label="昵称" width="140" />
            <el-table-column prop="target" label="位置" width="160" />
            <el-table-column prop="content" label="内容" min-width="260" />
            <el-table-column prop="status" label="状态" width="110" />
            <el-table-column label="操作" width="240">
              <template #default="{ row }">
                <el-button size="small" @click="publishComment(row.id)">发布</el-button>
                <el-button size="small" @click="hideComment(row.id)">隐藏</el-button>
                <el-button size="small" type="danger" @click="destroyComment(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </section>

      <section v-else-if="view === 'frontend'" class="frontend-editor">
        <div class="panel frontend-toolbar">
          <div class="panel-body toolbar-line">
            <div>
              <h2>前台编辑</h2>
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
                  <template v-else-if="selectedUiEditor.type === 'about-stack'">
                    <label>文字<el-input v-model="selectedUiEditor.item.label" @input="sendPreviewPatch" /></label>
                    <label>标识<el-input v-model="selectedUiEditor.item.id" @input="sendPreviewPatch" /></label>
                    <label>排序<el-input-number v-model="selectedUiEditor.item.sortOrder" :min="0" :max="9999" @change="sendPreviewPatch" /></label>
                    <div class="switch-row"><span>显示</span><el-switch v-model="selectedUiEditor.item.visible" @change="sendPreviewPatch" /></div>
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
                <ArchiveCategoryEditor v-model="editorPayload.ui.archiveCategories" :active-target="selectedUiTarget" @select="selectUiTarget" @change="sendPreviewPatch" />
                <h3>关于页技术栈</h3>
                <StackItemEditor v-model="editorPayload.ui.aboutStackItems" :active-target="selectedUiTarget" @select="selectUiTarget" @change="sendPreviewPatch" />
                <h3>瞬间筛选</h3>
                <EditableList v-model="editorPayload.ui.momentKinds" kind-key="kind" @change="sendPreviewPatch" />
                <h3>搜索建议</h3>
                <EditableList v-model="editorPayload.ui.searchSuggestions" @change="sendPreviewPatch" />
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
          <div class="panel-body empty-note">正在加载前台编辑配置...</div>
        </div>
      </section>

      <section v-else-if="view === 'texts'" class="page-stack">
        <div class="panel">
          <div class="panel-head"><div><h2>批量文案/友链</h2><p>适合一次性扫全站文案。点哪改哪优先用“前台编辑”。</p></div><el-button type="primary" @click="saveSiteTexts">保存</el-button></div>
          <div class="panel-body text-bulk" v-if="siteTexts">
            <label v-for="item in siteTexts.definitions" :key="item.key"><span>{{ item.label }} · {{ item.key }}</span><el-input v-model="siteTexts.texts[item.key]" type="textarea" :rows="2" /></label>
            <label class="full-field">高级规则<el-input v-model="siteTexts.rules" type="textarea" :rows="8" /></label>
          </div>
        </div>
      </section>

      <section v-else-if="view === 'settings'" class="page-stack">
        <div class="panel">
          <div class="panel-head"><div><h2>系统设置</h2><p>站点级系统配置。</p></div><el-button type="primary" @click="saveSettings">保存</el-button></div>
          <div class="panel-body compact-form"><el-input v-model="settings.githubUsername" placeholder="GitHub 用户名" /></div>
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

const overview = ref({});
const posts = ref([]);
const moments = ref([]);
const projects = ref([]);
const comments = ref([]);
const settings = reactive({ githubUsername: "" });
const siteTexts = ref(null);

const postForm = reactive(emptyPost());
const momentForm = reactive(emptyMoment());
const projectForm = reactive(emptyProject());

const editorLoading = ref(false);
const editorSaving = ref(false);
const editorData = ref(null);
const editorPayload = ref(null);
const selectedTarget = ref(null);
const editorTab = ref("selected");
const editorPage = ref("/index.html");
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
  { label: "首页", path: "/index.html" },
  { label: "瞬间", path: "/moments.html" },
  { label: "札记", path: "/archive.html" },
  { label: "项目", path: "/projects.html" },
  { label: "关于", path: "/about.html" }
];

const menu = [
  { title: "内容", items: [
    { label: "概览", path: "/", icon: "⌂" },
    { label: "文章", path: "/posts", icon: "□" },
    { label: "瞬间", path: "/moments", icon: "○" },
    { label: "项目", path: "/projects", icon: "▣" },
    { label: "留言", path: "/comments", icon: "◇" }
  ] },
  { title: "站点", items: [
    { label: "前台编辑", path: "/frontend", icon: "◎" },
    { label: "批量文案", path: "/texts", icon: "✎" }
  ] },
  { title: "系统", items: [
    { label: "设置", path: "/settings", icon: "⚙" }
  ] }
];

const view = computed(() => {
  if (route.value === "/" || route.value === "") return "dashboard";
  if (route.value === "/posts") return "posts";
  if (route.value === "/posts/new" || /^\/posts\/\d+/.test(route.value)) return "post-editor";
  if (route.value === "/moments") return "moments";
  if (route.value === "/projects") return "projects";
  if (route.value === "/comments") return "comments";
  if (route.value === "/frontend" || route.value === "/frontend-layout") return "frontend";
  if (route.value === "/texts") return "texts";
  if (route.value === "/settings") return "settings";
  return "dashboard";
});

const currentTitle = computed(() => ({
  dashboard: "概览",
  posts: "文章",
  "post-editor": postForm.id ? "编辑文章" : "新文章",
  moments: "瞬间",
  projects: "项目",
  comments: "留言",
  frontend: "前台编辑",
  texts: "批量文案",
  settings: "设置"
}[view.value] || "后台"));

const dashboardMetrics = computed(() => {
  const stats = overview.value.stats || {};
  return [
    { label: "文章", value: stats.posts ?? 0 },
    { label: "已发布", value: stats.publishedPosts ?? 0 },
    { label: "瞬间", value: stats.moments ?? 0 },
    { label: "项目", value: stats.projects ?? 0 },
    { label: "留言", value: stats.comments ?? 0 }
  ];
});

const previewSrc = computed(() => `${editorPage.value}?editor=1&t=${previewTick.value}`);
const editorDraftLabel = computed(() => editorData.value?.draft?.savedAt || "未保存草稿");
const selectedLabel = computed(() => selectedTarget.value?.target || "尚未选择元素");
const selectedUiTarget = computed(() => selectedTarget.value?.target?.startsWith("ui:") ? selectedTarget.value.target : "");
const selectedTextKey = computed(() => {
  const target = selectedTarget.value?.target || "";
  return target.startsWith("text:") ? target.slice(5) : "";
});
const selectedContent = computed(() => {
  const target = selectedTarget.value?.target || "";
  const [, type, id] = target.split(":");
  if (type === "post") return { title: "文章内容", desc: selectedTarget.value.text, path: `/posts/${id}` };
  if (type === "project") return { title: "项目内容", desc: selectedTarget.value.text, path: "/projects" };
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
  if (type === "about-stack") {
    const item = editorPayload.value.ui.aboutStackItems?.find((entry) => entry.id === id);
    return item ? { type, title: `技术栈：${item.label || id}`, item } : null;
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
    { label: "札记搜索区", path: "archive.showSearchPanel", model: fieldRef(layout.archive, "showSearchPanel") },
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
  if (view.value === "projects") return loadProjects();
  if (view.value === "comments") return loadComments();
  if (view.value === "frontend") return loadFrontendEditor();
  if (view.value === "texts") return loadSiteTexts();
  if (view.value === "settings") return loadSettings();
}

async function refreshDashboard() {
  overview.value = await adminApi.overview();
}

async function loadPosts() {
  posts.value = (await adminApi.listPosts()).items || [];
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

async function destroyPost(id) {
  await confirmDanger("删除这篇文章？");
  await adminApi.destroyPost(id);
  await loadPosts();
}

async function loadMoments() {
  moments.value = (await adminApi.listMoments()).items || [];
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

async function destroyMoment(id) {
  await confirmDanger("删除这条瞬间？");
  await adminApi.destroyMoment(id);
  await loadMoments();
}

async function loadProjects() {
  projects.value = (await adminApi.listProjects()).items || [];
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

async function destroyProject(id) {
  await confirmDanger("删除这个项目？");
  await adminApi.destroyProject(id);
  await loadProjects();
}

async function loadComments() {
  comments.value = (await adminApi.listComments()).items || [];
}

async function publishComment(id) {
  await adminApi.publishComment(id);
  await loadComments();
}

async function hideComment(id) {
  await adminApi.hideComment(id);
  await loadComments();
}

async function destroyComment(id) {
  await confirmDanger("删除这条留言？");
  await adminApi.destroyComment(id);
  await loadComments();
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

async function publishFrontend() {
  editorSaving.value = true;
  try {
    editorData.value = await adminApi.publishFrontendEditor(editorPayload.value);
    editorPayload.value = ensureEditorPayload(buildPublishedPayload(editorData.value));
    reloadPreview();
    ElMessage.success("已发布到前台");
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    editorSaving.value = false;
  }
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
    ElMessage.success("图片已上传");
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    event.target.value = "";
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

function emptyProject() {
  return { id: "", name: "", slug: "", summary: "", status_text: "", progress: 0, sort_order: 0, content_md: "# 新项目\n\n## 当前状态\n\n## 下一步\n\n- ", cover_url: "", status: "active" };
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
            href: `/archive.html?cat=category-${next}`,
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

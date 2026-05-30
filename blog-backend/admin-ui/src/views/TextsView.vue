<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { Delete, Plus } from "@element-plus/icons-vue";
import { adminApi, messageFromError } from "@/api";
import type { FooterSection, SiteTextsPayload, TextDefinition } from "@/types";

const loading = ref(false);
const saving = ref(false);
const definitions = ref<TextDefinition[]>([]);
const texts = ref<Record<string, string>>({});
const rules = ref("");
const footerSections = ref<FooterSection[]>([]);

const groups = computed(() => {
  const map = new Map<string, TextDefinition[]>();
  for (const item of definitions.value) {
    if (!map.has(item.group)) map.set(item.group, []);
    map.get(item.group)!.push(item);
  }
  return [...map.entries()].map(([label, items]) => ({ label, items }));
});

function fill(payload: SiteTextsPayload) {
  definitions.value = payload.definitions;
  texts.value = { ...payload.texts };
  rules.value = payload.rules || "";
  footerSections.value = payload.footerSections.length
    ? payload.footerSections
    : [{ title: "友链", links: [{ label: "", href: "", desc: "" }] }];
}

async function load() {
  loading.value = true;
  try {
    fill(await adminApi.getSiteTexts());
  } catch (error) {
    ElMessage.error(messageFromError(error));
  } finally {
    loading.value = false;
  }
}

function addSection() {
  if (footerSections.value.length >= 4) {
    ElMessage.warning("最多 4 个页脚栏目");
    return;
  }
  footerSections.value.push({ title: "", links: [{ label: "", href: "", desc: "" }] });
}

function addLink(section: FooterSection) {
  if (section.links.length >= 6) {
    ElMessage.warning("每个栏目最多 6 个链接");
    return;
  }
  section.links.push({ label: "", href: "", desc: "" });
}

async function save() {
  saving.value = true;
  try {
    fill(await adminApi.saveSiteTexts({ texts: texts.value, rules: rules.value, footerSections: footerSections.value }));
    ElMessage.success("已保存");
  } catch (error) {
    ElMessage.error(messageFromError(error));
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section v-loading="loading" class="page-stack">
    <div class="panel">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">站点文案</h2>
          <p class="panel-desc">前台静态文字、页脚栏目和临时替换规则。</p>
        </div>
        <el-button type="primary" :loading="saving" @click="save">保存文案</el-button>
      </div>
      <div class="panel-body">
        <el-tabs tab-position="left">
          <el-tab-pane v-for="group in groups" :key="group.label" :label="group.label">
            <el-form label-position="top">
              <el-form-item v-for="item in group.items" :key="item.key" :label="item.label">
                <el-input v-model="texts[item.key]" type="textarea" :rows="2" maxlength="1200" :placeholder="item.defaultValue" />
              </el-form-item>
            </el-form>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">页脚栏目</h2>
          <p class="panel-desc">这里只叫友链、站内、图库这类栏目，不再做显眼入口。</p>
        </div>
        <el-button :icon="Plus" @click="addSection">加栏目</el-button>
      </div>
      <div class="panel-body page-stack">
        <section v-for="(section, sectionIndex) in footerSections" :key="sectionIndex" class="footer-section-card">
          <div class="toolbar-line">
            <el-input v-model="section.title" placeholder="栏目名，例如：友链 / 站内 / 图库" style="max-width: 340px" />
            <div>
              <el-button :icon="Plus" @click="addLink(section)">加链接</el-button>
              <el-button :icon="Delete" @click="footerSections.splice(sectionIndex, 1)">删除栏目</el-button>
            </div>
          </div>
          <div v-for="(link, linkIndex) in section.links" :key="linkIndex" class="footer-link-grid">
            <el-input v-model="link.label" placeholder="链接名" />
            <el-input v-model="link.href" placeholder="/archive.html 或 https://example.com" />
            <el-input v-model="link.desc" placeholder="说明，可留空" />
            <el-button :icon="Delete" @click="section.links.splice(linkIndex, 1)" />
          </div>
        </section>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">高级规则</h2>
          <p class="panel-desc">每行一条：CSS选择器 | 新文字，或 CSS选择器 | 属性名 | 新值。</p>
        </div>
      </div>
      <div class="panel-body">
        <el-input v-model="rules" type="textarea" :rows="8" spellcheck="false" />
      </div>
    </div>
  </section>
</template>

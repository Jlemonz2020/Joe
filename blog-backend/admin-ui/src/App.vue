<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ChatLineRound,
  Collection,
  Document,
  EditPen,
  Fold,
  HomeFilled,
  Link,
  Setting,
  SwitchButton
} from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { useSessionStore } from "@/stores/session";

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const collapsed = ref(false);

const isLogin = computed(() => route.name === "login");
const title = computed(() => String(route.meta.title || "后台"));
const menuGroups = [
  {
    label: "内容",
    items: [
      { label: "概览", to: "/", icon: HomeFilled },
      { label: "文章", to: "/posts", icon: Document },
      { label: "瞬间", to: "/moments", icon: ChatLineRound },
      { label: "项目", to: "/projects", icon: Collection }
    ]
  },
  {
    label: "站点",
    items: [
      { label: "文案友链", to: "/texts", icon: Link },
      { label: "设置", to: "/settings", icon: Setting }
    ]
  }
];

async function logout() {
  try {
    await session.logout();
    await router.push("/login");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "退出失败");
  }
}
</script>

<template>
  <RouterView v-if="isLogin" />
  <div v-else class="admin-shell" :class="{ collapsed }">
    <aside class="sidebar">
      <RouterLink class="brand" to="/">
        <span class="brand-mark">J</span>
        <span class="brand-copy">
          <strong>Jlemonz</strong>
          <small>admin workspace</small>
        </span>
      </RouterLink>

      <div class="menu-scroll">
        <section v-for="group in menuGroups" :key="group.label" class="menu-group">
          <p class="menu-title">{{ group.label }}</p>
          <RouterLink
            v-for="item in group.items"
            :key="item.to"
            class="menu-item"
            :to="item.to"
            :title="item.label"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </RouterLink>
        </section>
      </div>
    </aside>

    <main class="workspace">
      <header class="topbar">
        <div class="top-left">
          <el-button circle :icon="Fold" @click="collapsed = !collapsed" />
          <div>
            <el-breadcrumb separator="/">
              <el-breadcrumb-item>后台</el-breadcrumb-item>
              <el-breadcrumb-item>{{ title }}</el-breadcrumb-item>
            </el-breadcrumb>
            <h1>{{ title }}</h1>
          </div>
        </div>
        <div class="top-actions">
          <el-button :icon="EditPen" @click="router.push('/posts/new')">新文章</el-button>
          <el-button :icon="SwitchButton" @click="logout">退出</el-button>
        </div>
      </header>

      <RouterView />
    </main>
  </div>
</template>

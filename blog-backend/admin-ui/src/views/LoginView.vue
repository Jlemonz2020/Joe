<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { Lock, User } from "@element-plus/icons-vue";
import { messageFromError } from "@/api";
import { useSessionStore } from "@/stores/session";

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const loading = ref(false);
const form = reactive({
  username: "",
  password: ""
});

async function submit() {
  if (!form.username || !form.password) {
    ElMessage.warning("请输入用户名和密码");
    return;
  }
  loading.value = true;
  try {
    await session.login(form.username, form.password);
    await router.replace(String(route.query.redirect || "/"));
  } catch (error) {
    ElMessage.error(messageFromError(error));
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="login-page">
    <form class="login-card" @submit.prevent="submit">
      <span class="brand-mark">J</span>
      <h1>Jlemonz</h1>
      <p>内容维护、Markdown 写作和站点配置。</p>

      <el-form label-position="top">
        <el-form-item label="用户名">
          <el-input v-model="form.username" :prefix-icon="User" autocomplete="username" autofocus />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="form.password"
            :prefix-icon="Lock"
            autocomplete="current-password"
            show-password
            type="password"
          />
        </el-form-item>
        <el-button native-type="submit" type="primary" :loading="loading" style="width: 100%">
          登录
        </el-button>
      </el-form>
    </form>
  </main>
</template>

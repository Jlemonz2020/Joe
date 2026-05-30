<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { adminApi, messageFromError } from "@/api";

const loading = ref(false);
const saving = ref(false);
const form = reactive({
  githubUsername: ""
});

async function load() {
  loading.value = true;
  try {
    Object.assign(form, await adminApi.getSettings());
  } catch (error) {
    ElMessage.error(messageFromError(error));
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    Object.assign(form, await adminApi.saveSettings(form));
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
  <section v-loading="loading" class="panel">
    <div class="panel-head">
      <div>
        <h2 class="panel-title">系统设置</h2>
        <p class="panel-desc">后端保存，前台只读取结果。</p>
      </div>
      <el-button type="primary" :loading="saving" @click="save">保存设置</el-button>
    </div>
    <div class="panel-body">
      <el-form label-position="top" style="max-width: 520px">
        <el-form-item label="GitHub 用户名">
          <el-input v-model="form.githubUsername" autocomplete="username" />
        </el-form-item>
      </el-form>
    </div>
  </section>
</template>

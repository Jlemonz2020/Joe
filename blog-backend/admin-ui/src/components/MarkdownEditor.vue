<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { markdown } from "@codemirror/lang-markdown";
import { indentWithTab } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { ElMessage } from "element-plus";
import { Picture } from "@element-plus/icons-vue";
import { adminApi, messageFromError } from "@/api";

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  save: [];
}>();

const host = ref<HTMLDivElement | null>(null);
const imageInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
let view: EditorView | null = null;
let applyingExternal = false;

function insertMarkdown(markdownText: string) {
  if (!view) {
    emit("update:modelValue", `${props.modelValue || ""}\n\n${markdownText}`);
    return;
  }
  const selection = view.state.selection.main;
  const current = view.state.doc.toString();
  const needsBefore = selection.from > 0 && !current.slice(0, selection.from).endsWith("\n");
  const needsAfter = selection.to < current.length && !current.slice(selection.to).startsWith("\n");
  const insert = `${needsBefore ? "\n\n" : ""}${markdownText}${needsAfter ? "\n\n" : ""}`;
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert },
    selection: { anchor: selection.from + insert.length },
    scrollIntoView: true
  });
  view.focus();
}

function pickImage() {
  imageInput.value?.click();
}

async function uploadMarkdownImage(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    ElMessage.warning("请选择图片文件");
    input.value = "";
    return;
  }

  uploading.value = true;
  try {
    const uploaded = await adminApi.uploadImage(file);
    const alt = file.name.replace(/\.[^.]+$/, "") || "image";
    insertMarkdown(`![${alt}](${uploaded.url})`);
    ElMessage.success("图片已插入正文");
  } catch (error) {
    ElMessage.error(messageFromError(error));
  } finally {
    uploading.value = false;
    input.value = "";
  }
}

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "#ffffff",
    color: "#202124",
    fontSize: "14px"
  },
  ".cm-scroller": {
    fontFamily: "'JetBrains Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
    lineHeight: "1.72"
  },
  ".cm-content": {
    padding: "18px 0",
    caretColor: "#1f6feb"
  },
  ".cm-gutters": {
    backgroundColor: "#fafafa",
    color: "#8a8f98",
    borderRight: "1px solid #e5e7eb"
  },
  ".cm-activeLine": {
    backgroundColor: "#f6f8fa"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "#eef2ff"
  },
  ".cm-selectionBackground": {
    backgroundColor: "#dbeafe !important"
  }
});

onMounted(() => {
  if (!host.value) return;
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.modelValue || "",
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        editorTheme,
        keymap.of([
          {
            key: "Mod-s",
            run() {
              emit("save");
              return true;
            }
          },
          indentWithTab
        ]),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || applyingExternal) return;
          emit("update:modelValue", update.state.doc.toString());
        })
      ]
    })
  });
});

watch(
  () => props.modelValue,
  (value) => {
    if (!view) return;
    const current = view.state.doc.toString();
    if (value === current) return;
    applyingExternal = true;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value || "" }
    });
    applyingExternal = false;
  }
);

onBeforeUnmount(() => {
  view?.destroy();
  view = null;
});
</script>

<template>
  <div class="markdown-editor-shell">
    <div class="markdown-editor-tools">
      <el-button size="small" :icon="Picture" :loading="uploading" @click="pickImage">正文图片</el-button>
      <span>图片会上传到 /uploads，并插入 Markdown 图片语法。</span>
      <input ref="imageInput" class="hidden-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="uploadMarkdownImage">
    </div>
    <div ref="host" class="markdown-editor" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { markdown } from "@codemirror/lang-markdown";
import { indentWithTab } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  save: [];
}>();

const host = ref<HTMLDivElement | null>(null);
let view: EditorView | null = null;
let applyingExternal = false;

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
  <div ref="host" class="markdown-editor" />
</template>

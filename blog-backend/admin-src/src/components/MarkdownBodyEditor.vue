<template>
  <section class="markdown-body-editor full">
    <div class="markdown-editor-head">
      <div>
        <strong>{{ title }}</strong>
        <span>正文图片会写入 Markdown，并同步在下方以图片块显示。</span>
      </div>
      <label class="image-upload-button">
        上传正文图片
        <input type="file" :accept="acceptedImageTypes" @change="uploadImage" />
      </label>
    </div>

    <textarea
      :value="modelValue"
      rows="14"
      spellcheck="false"
      placeholder="在这里在线编辑 Markdown 正文。可以直接输入，也可以导入 .md 文档后继续调整。"
      @input="updateValue($event.target.value)"
    />

    <div class="markdown-preview-shell">
      <div class="markdown-preview-head">
        <strong>实际效果预览</strong>
        <span>这里按正文真实排版渲染，环绕和上下分栏会直接显示出来。</span>
      </div>
      <div class="markdown-live-preview" v-html="previewHtml"></div>
    </div>

    <div v-if="images.length" class="md-image-list">
      <article
        v-for="(image, index) in images"
        :key="image.start + image.url"
        class="md-image-card"
        draggable="true"
        @dragstart="dragStart(index)"
        @dragover.prevent
        @drop="dropImage(index)"
      >
        <div class="md-image-preview" :class="previewClass(image)">
          <div class="md-image-frame" :class="frameClass(image)" :style="imageFrameStyle(image)" @pointerdown="startFreeMove($event, index)">
            <img :src="image.url" :alt="image.alt" />
            <span class="md-image-resize" title="拖动等比缩放" @pointerdown.stop="startResize($event, index)"></span>
          </div>
        </div>

        <div class="md-image-controls">
          <label>说明<input :value="image.alt" @input="updateImage(index, { alt: $event.target.value })" /></label>
          <label>
            布局
            <select :value="image.layout" @change="updateImage(index, { layout: $event.target.value })">
              <option value="block">上下分栏</option>
              <option value="wrap-left">四周环绕-左</option>
              <option value="wrap-right">四周环绕-右</option>
              <option value="free">自由固定</option>
            </select>
          </label>
          <label>宽度 {{ image.width }}%<input type="range" min="20" max="100" :value="image.width" @input="updateImage(index, { width: $event.target.value })" /></label>
          <label>
            对齐
            <select :value="image.align" @change="updateImage(index, { align: $event.target.value })">
              <option value="left">左</option>
              <option value="center">中</option>
              <option value="right">右</option>
              <option value="full">满宽</option>
            </select>
          </label>
          <div v-if="image.layout === 'free'" class="position-grid">
            <label>X<input type="number" :value="image.x" @input="updateImage(index, { x: $event.target.value })" /></label>
            <label>Y<input type="number" :value="image.y" @input="updateImage(index, { y: $event.target.value })" /></label>
          </div>
          <div class="button-row">
            <button type="button" @click="moveImage(index, index - 1)">上移</button>
            <button type="button" @click="moveImage(index, index + 1)">下移</button>
            <button type="button" @click="removeImage(index)">删除</button>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from "vue";

const props = defineProps({
  modelValue: { type: String, default: "" },
  title: { type: String, default: "Markdown 正文" },
  acceptedImageTypes: { type: String, default: "image/jpeg,image/png,image/webp,image/gif" }
});

const emit = defineEmits(["update:modelValue", "upload-image"]);
const dragIndex = ref(-1);
const activePointer = ref(null);

const images = computed(readImages);
const previewHtml = computed(() => markdownToPreviewHtml(props.modelValue));

function updateValue(value) {
  emit("update:modelValue", value);
}

function readImages() {
  const text = String(props.modelValue || "");
  const regex = /!\[([^\]]*)\]\(([^)]+)\)(?:\{([^}]+)\})?/g;
  const next = [];
  let match;
  while ((match = regex.exec(text))) {
    const attrs = parseAttrs(match[3] || "");
    next.push({
      index: next.length,
      start: match.index,
      end: match.index + match[0].length,
      raw: match[0],
      alt: match[1] || "",
      url: match[2] || "",
      width: attrs.width,
      align: attrs.align,
      layout: attrs.layout,
      x: attrs.x,
      y: attrs.y
    });
  }
  return next;
}

function parseAttrs(attrs = "") {
  const width = Number.parseInt(attrs.match(/(?:^|\s)width\s*=\s*["']?(\d{1,3})%?["']?/i)?.[1] || "80", 10);
  const align = attrs.match(/(?:^|\s)align\s*=\s*["']?(left|center|right|full)["']?/i)?.[1] || "center";
  const layout = attrs.match(/(?:^|\s)layout\s*=\s*["']?(block|wrap-left|wrap-right|free)["']?/i)?.[1] || "block";
  const x = Number.parseInt(attrs.match(/(?:^|\s)x\s*=\s*["']?(-?\d{1,3})%?["']?/i)?.[1] || "0", 10);
  const y = Number.parseInt(attrs.match(/(?:^|\s)y\s*=\s*["']?(-?\d{1,4})["']?/i)?.[1] || "0", 10);
  return {
    width: Math.min(100, Math.max(20, Number.isFinite(width) ? width : 80)),
    align: ["left", "center", "right", "full"].includes(align) ? align : "center",
    layout: ["block", "wrap-left", "wrap-right", "free"].includes(layout) ? layout : "block",
    x: Number.isFinite(x) ? Math.min(100, Math.max(-50, x)) : 0,
    y: Number.isFinite(y) ? Math.min(1200, Math.max(-200, y)) : 0
  };
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeImageUrl(value = "") {
  const url = String(value || "").trim();
  if (/^(https?:)?\/\//i.test(url) || url.startsWith("/") || /^data:image\//i.test(url)) return url;
  return "";
}

function imageStyleFromAttrs(attrs) {
  const style = [`width:${attrs.width}%`, "max-width:100%", "height:auto"];
  if (attrs.layout === "wrap-left") style.push("float:left", "margin:4px 18px 10px 0");
  if (attrs.layout === "wrap-right") style.push("float:right", "margin:4px 0 10px 18px");
  if (attrs.layout === "free") style.push("position:relative", `left:${attrs.x}%`, `top:${attrs.y}px`, "display:block", "margin:12px 0");
  if (attrs.layout === "block" && attrs.align === "center") style.push("display:block", "margin-left:auto", "margin-right:auto");
  if (attrs.layout === "block" && attrs.align === "right") style.push("display:block", "margin-left:auto", "margin-right:0");
  if (attrs.layout === "block" && attrs.align === "left") style.push("display:block", "margin-left:0", "margin-right:auto");
  if (attrs.layout === "block" && attrs.align === "full") style.push("display:block", "width:100%");
  return style.join(";");
}

function imageHtml(alt, url, attrsText = "") {
  const safeUrl = safeImageUrl(url);
  if (!safeUrl) return escapeHtml(alt || "");
  const attrs = parseAttrs(attrsText);
  return `<img src="${escapeHtml(safeUrl)}" alt="${escapeHtml(alt || "")}" class="md-preview-image md-preview-image--${attrs.layout}" style="${escapeHtml(imageStyleFromAttrs(attrs))}">`;
}

function inlineMarkdownToHtml(value = "") {
  const text = String(value || "");
  const regex = /!\[([^\]]*)\]\(([^)]+)\)(?:\{([^}]+)\})?/g;
  let html = "";
  let cursor = 0;
  let match;
  while ((match = regex.exec(text))) {
    html += escapeHtml(text.slice(cursor, match.index));
    html += imageHtml(match[1], match[2], match[3] || "");
    cursor = match.index + match[0].length;
  }
  html += escapeHtml(text.slice(cursor));
  return html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
}

function markdownToPreviewHtml(markdown = "") {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const output = [];
  let paragraph = [];
  let listOpen = false;

  const closeParagraph = () => {
    if (!paragraph.length) return;
    output.push(`<p>${inlineMarkdownToHtml(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (!listOpen) return;
    output.push("</ul>");
    listOpen = false;
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      closeParagraph();
      closeList();
      return;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeParagraph();
      closeList();
      const level = Math.min(4, heading[1].length);
      output.push(`<h${level}>${inlineMarkdownToHtml(heading[2])}</h${level}>`);
      return;
    }

    const listItem = line.match(/^[-*]\s+(.+)$/);
    if (listItem) {
      closeParagraph();
      if (!listOpen) {
        output.push("<ul>");
        listOpen = true;
      }
      output.push(`<li>${inlineMarkdownToHtml(listItem[1])}</li>`);
      return;
    }

    paragraph.push(line);
  });

  closeParagraph();
  closeList();
  return output.join("");
}

function imageMarkdown(image, patch = {}) {
  const next = { ...image, ...patch };
  const alt = String(next.alt || "image").replace(/[\[\]\r\n]/g, " ").trim() || "image";
  const width = Math.min(100, Math.max(20, Number.parseInt(next.width, 10) || 80));
  const align = ["left", "center", "right", "full"].includes(next.align) ? next.align : "center";
  const layout = ["block", "wrap-left", "wrap-right", "free"].includes(next.layout) ? next.layout : "block";
  const x = Math.min(100, Math.max(-50, Number.parseInt(next.x, 10) || 0));
  const y = Math.min(1200, Math.max(-200, Number.parseInt(next.y, 10) || 0));
  const position = layout === "free" ? ` x=${x} y=${y}` : "";
  return `![${alt}](${next.url}){width=${width} layout=${layout} align=${align}${position}}`;
}

function replaceImage(index, raw) {
  const image = readImages()[index];
  if (!image) return;
  const text = String(props.modelValue || "");
  updateValue(`${text.slice(0, image.start)}${raw}${text.slice(image.end)}`);
}

function updateImage(index, patch) {
  const image = readImages()[index];
  if (!image) return;
  replaceImage(index, imageMarkdown(image, patch));
}

function removeImage(index) {
  const image = readImages()[index];
  if (!image) return;
  const text = String(props.modelValue || "");
  const prefix = text.slice(0, image.start).replace(/\n{0,2}$/, "\n");
  const suffix = text.slice(image.end).replace(/^\n{0,2}/, "\n");
  updateValue(`${prefix}${suffix}`.replace(/\n{4,}/g, "\n\n\n"));
}

function moveImage(from, to) {
  const current = readImages();
  if (from === to || from < 0 || to < 0 || from >= current.length || to >= current.length) return;
  const raws = current.map((image) => image.raw);
  const [moved] = raws.splice(from, 1);
  raws.splice(to, 0, moved);
  const text = String(props.modelValue || "");
  let cursor = 0;
  let output = "";
  current.forEach((image, index) => {
    output += text.slice(cursor, image.start) + raws[index];
    cursor = image.end;
  });
  output += text.slice(cursor);
  updateValue(output);
}

function dragStart(index) {
  dragIndex.value = index;
}

function dropImage(index) {
  moveImage(dragIndex.value, index);
  dragIndex.value = -1;
}

function uploadImage(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (file) emit("upload-image", file);
}

function previewClass(image) {
  return {
    "is-free-layout": image.layout === "free",
    "is-wrap-layout": image.layout === "wrap-left" || image.layout === "wrap-right"
  };
}

function frameClass(image) {
  return {
    "is-free": image.layout === "free",
    "is-wrap-left": image.layout === "wrap-left",
    "is-wrap-right": image.layout === "wrap-right",
    "is-block": image.layout === "block"
  };
}

function imageFrameStyle(image) {
  const width = image.align === "full" && image.layout === "block" ? 100 : image.width;
  const base = { width: `${width}%` };
  if (image.layout === "free") return { ...base, left: `${image.x}%`, top: `${image.y}px` };
  if (image.layout === "wrap-left") return { ...base, marginRight: "auto" };
  if (image.layout === "wrap-right") return { ...base, marginLeft: "auto" };
  if (image.align === "center") return { ...base, marginLeft: "auto", marginRight: "auto" };
  if (image.align === "right") return { ...base, marginLeft: "auto", marginRight: "0" };
  if (image.align === "left") return { ...base, marginLeft: "0", marginRight: "auto" };
  return { width: "100%" };
}

function startResize(event, index) {
  const image = readImages()[index];
  if (!image) return;
  event.preventDefault();
  const preview = event.currentTarget.closest(".md-image-preview");
  activePointer.value = {
    type: "resize",
    index,
    startX: event.clientX,
    startWidth: image.width,
    previewWidth: preview?.getBoundingClientRect().width || 1
  };
  bindPointerEvents();
}

function startFreeMove(event, index) {
  const image = readImages()[index];
  if (!image || image.layout !== "free" || event.target.closest(".md-image-resize")) return;
  event.preventDefault();
  const preview = event.currentTarget.closest(".md-image-preview");
  activePointer.value = {
    type: "move",
    index,
    startX: event.clientX,
    startY: event.clientY,
    startImageX: image.x,
    startImageY: image.y,
    previewWidth: preview?.getBoundingClientRect().width || 1
  };
  bindPointerEvents();
}

function onPointerMove(event) {
  const action = activePointer.value;
  if (!action) return;
  if (action.type === "resize") {
    const delta = ((event.clientX - action.startX) / action.previewWidth) * 100;
    updateImage(action.index, { width: Math.round(Math.min(100, Math.max(20, action.startWidth + delta))) });
  }
  if (action.type === "move") {
    const deltaX = ((event.clientX - action.startX) / action.previewWidth) * 100;
    const deltaY = event.clientY - action.startY;
    updateImage(action.index, {
      x: Math.round(Math.min(100, Math.max(-50, action.startImageX + deltaX))),
      y: Math.round(Math.min(1200, Math.max(-200, action.startImageY + deltaY)))
    });
  }
}

function stopPointerAction() {
  activePointer.value = null;
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", stopPointerAction);
  window.removeEventListener("pointercancel", stopPointerAction);
}

function bindPointerEvents() {
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", stopPointerAction);
  window.addEventListener("pointercancel", stopPointerAction);
}

onBeforeUnmount(stopPointerAction);
</script>

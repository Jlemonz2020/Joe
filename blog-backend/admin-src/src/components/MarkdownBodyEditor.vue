<template>
  <section class="markdown-body-editor full">
    <div class="markdown-editor-head">
      <div>
        <strong>{{ title }}</strong>
        <span>在实际效果里点击图片，直接拖动、缩放和改排版。</span>
      </div>
      <label class="image-upload-button">
        上传正文图片
        <input type="file" :accept="acceptedImageTypes" @change="uploadImage" />
      </label>
    </div>

    <div class="markdown-preview-shell">
      <div class="markdown-preview-head">
        <strong>实际效果编辑</strong>
        <span>拖图片本体会切到自由固定，拖右下角手柄等比缩放。</span>
      </div>
      <div class="markdown-live-preview is-visual-editor" @click="activeImageIndex = -1">
        <template v-if="previewBlocks.length">
          <template v-for="block in previewBlocks" :key="block.key">
            <div v-if="block.type === 'html'" class="md-preview-text" v-html="block.html"></div>
            <figure
              v-else
              class="md-preview-figure"
              :class="imageFigureClass(block.image, block.imageIndex)"
              :style="imageFigureStyle(block.image)"
              @click.stop="activeImageIndex = block.imageIndex"
              @pointerdown="startPreviewMove($event, block.imageIndex)"
            >
              <img :src="block.image.url" :alt="block.image.alt" />
              <span class="md-image-resize" title="拖动等比缩放" @pointerdown.stop="startResize($event, block.imageIndex)"></span>

              <div
                v-if="activeImageIndex === block.imageIndex"
                class="md-image-inline-panel"
                @click.stop
                @pointerdown.stop
              >
                <label>说明<input :value="block.image.alt" @input="updateImage(block.imageIndex, { alt: $event.target.value })" /></label>
                <label>
                  布局
                  <select :value="block.image.layout" @change="updateImage(block.imageIndex, { layout: $event.target.value })">
                    <option value="block">上下分栏</option>
                    <option value="wrap-left">四周环绕-左</option>
                    <option value="wrap-right">四周环绕-右</option>
                    <option value="free">自由固定</option>
                  </select>
                </label>
                <label>宽度 {{ block.image.width }}%<input type="range" min="20" max="100" :value="block.image.width" @input="updateImage(block.imageIndex, { width: $event.target.value })" /></label>
                <label>
                  对齐
                  <select :value="block.image.align" @change="updateImage(block.imageIndex, { align: $event.target.value })">
                    <option value="left">左</option>
                    <option value="center">中</option>
                    <option value="right">右</option>
                    <option value="full">满宽</option>
                  </select>
                </label>
                <div v-if="block.image.layout === 'free'" class="position-grid">
                  <label>X<input type="number" :value="block.image.x" @input="updateImage(block.imageIndex, { x: $event.target.value })" /></label>
                  <label>Y<input type="number" :value="block.image.y" @input="updateImage(block.imageIndex, { y: $event.target.value })" /></label>
                </div>
                <div class="button-row">
                  <button type="button" @click="moveImage(block.imageIndex, block.imageIndex - 1)">上移</button>
                  <button type="button" @click="moveImage(block.imageIndex, block.imageIndex + 1)">下移</button>
                  <button type="button" @click="removeImage(block.imageIndex)">删除</button>
                </div>
              </div>
            </figure>
          </template>
        </template>
        <p v-else class="empty-note">正文内容会在这里以真实排版显示。</p>
      </div>
    </div>

    <details class="markdown-source-drawer">
      <summary>Markdown 源文</summary>
      <textarea
        :value="modelValue"
        rows="12"
        spellcheck="false"
        placeholder="这里保留 Markdown 源文，导入 .md 后可在这里微调。"
        @input="updateValue($event.target.value)"
      />
    </details>
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
const activeImageIndex = ref(-1);
const activePointer = ref(null);

const images = computed(readImages);
const previewBlocks = computed(buildPreviewBlocks);

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

function buildPreviewBlocks() {
  const text = String(props.modelValue || "");
  const blocks = [];
  let cursor = 0;
  images.value.forEach((image, imageIndex) => {
    const before = text.slice(cursor, image.start);
    if (before.trim()) {
      blocks.push({ type: "html", key: `text-${cursor}`, html: markdownToPreviewHtml(before) });
    }
    blocks.push({ type: "image", key: `image-${image.start}-${image.url}`, image, imageIndex });
    cursor = image.end;
  });
  const tail = text.slice(cursor);
  if (tail.trim()) {
    blocks.push({ type: "html", key: `text-${cursor}`, html: markdownToPreviewHtml(tail) });
  }
  return blocks;
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

function inlineMarkdownToHtml(value = "") {
  const text = String(value || "");
  const regex = /!\[([^\]]*)\]\(([^)]+)\)(?:\{([^}]+)\})?/g;
  let html = "";
  let cursor = 0;
  let match;
  while ((match = regex.exec(text))) {
    html += escapeHtml(text.slice(cursor, match.index));
    html += safeImageUrl(match[2]) ? `[图片：${escapeHtml(match[1] || "image")}]` : escapeHtml(match[1] || "");
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
  activeImageIndex.value = -1;
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
  activeImageIndex.value = to;
}

function uploadImage(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (file) emit("upload-image", file);
}

function imageFigureClass(image, index) {
  return {
    "is-active": activeImageIndex.value === index,
    "is-free": image.layout === "free",
    "is-wrap-left": image.layout === "wrap-left",
    "is-wrap-right": image.layout === "wrap-right",
    "is-block": image.layout === "block"
  };
}

function imageFigureStyle(image) {
  const width = image.align === "full" && image.layout === "block" ? 100 : image.width;
  const base = { width: `${width}%` };
  if (image.layout === "free") {
    return { ...base, left: `${image.x}%`, top: `${image.y}px` };
  }
  if (image.layout === "wrap-left") {
    return { ...base, float: "left", margin: "4px 18px 12px 0" };
  }
  if (image.layout === "wrap-right") {
    return { ...base, float: "right", margin: "4px 0 12px 18px" };
  }
  if (image.align === "right") return { ...base, marginLeft: "auto", marginRight: "0" };
  if (image.align === "left") return { ...base, marginLeft: "0", marginRight: "auto" };
  if (image.align === "full") return { width: "100%" };
  return { ...base, marginLeft: "auto", marginRight: "auto" };
}

function startResize(event, index) {
  const image = readImages()[index];
  if (!image) return;
  event.preventDefault();
  activeImageIndex.value = index;
  const preview = event.currentTarget.closest(".markdown-live-preview");
  activePointer.value = {
    type: "resize",
    index,
    startX: event.clientX,
    startWidth: image.width,
    previewWidth: preview?.getBoundingClientRect().width || 1
  };
  bindPointerEvents();
}

function startPreviewMove(event, index) {
  const image = readImages()[index];
  if (!image || event.target.closest(".md-image-resize") || event.target.closest(".md-image-inline-panel")) return;
  event.preventDefault();
  activeImageIndex.value = index;
  if (image.layout !== "free") {
    updateImage(index, { layout: "free", x: image.x || 0, y: image.y || 0 });
  }
  const preview = event.currentTarget.closest(".markdown-live-preview");
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
      layout: "free",
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

<template>
  <section class="markdown-body-editor full">
    <div class="markdown-editor-head">
      <div>
        <strong>{{ title }}</strong>
        <span>正文就是编辑区：文字可直接修改，图片可直接拖动和缩放。</span>
      </div>
      <label class="image-upload-button">
        上传图片
        <input type="file" :accept="acceptedImageTypes" @change="uploadImage" />
      </label>
    </div>

    <div class="md-document-editor" @click="activeImageIndex = -1">
      <template v-if="editorBlocks.length">
        <template v-for="block in editorBlocks" :key="block.key">
          <div
            v-if="block.type === 'text'"
            class="md-editable-text"
            contenteditable="true"
            spellcheck="false"
            :data-placeholder="block.placeholder"
            v-html="block.html"
            @click.stop
            @blur="updateTextBlock(block, $event)"
          ></div>

          <div v-else-if="block.type === 'wrap-image'" class="md-wps-flow" :style="wrapFlowStyle(block)">
            <div class="md-wps-flow-lines" :style="wrapTextLayerStyle(block)" @click.stop>
              <div v-for="line in wrapFlowLines(block)" :key="line.key" class="md-wps-flow-line">
                <span
                  v-for="segment in line.segments"
                  :key="segment.key"
                  class="md-wps-flow-segment"
                  :style="segment.style"
                >{{ segment.text }}</span>
              </div>
            </div>
            <figure
              class="md-editable-image md-wps-flow-image"
              :class="imageClass(block.image, block.imageIndex)"
              :style="wrapFlowImageStyle(block.image, block.imageIndex)"
              @click.stop="activeImageIndex = block.imageIndex"
              @pointerdown="startImageMove($event, block.imageIndex)"
            >
              <img :src="block.image.url" :alt="block.image.alt" draggable="false" @load="syncImageRatio($event, block.imageIndex)" />
              <span class="md-image-resize" title="拖动缩放" @pointerdown.stop="startResize($event, block.imageIndex)"></span>
              <div v-if="activeImageIndex === block.imageIndex" class="md-image-mini-toolbar" @click.stop @pointerdown.stop>
                <select :value="block.image.wrap" title="文字环绕" @change="updateImage(block.imageIndex, { wrap: $event.target.value })">
                  <option value="square">四周型</option>
                  <option value="top-bottom">上下型</option>
                  <option value="inline">嵌入型</option>
                </select>
                <select :value="block.image.align" title="对齐" @change="updateImage(block.imageIndex, { align: $event.target.value })">
                  <option value="left">左</option>
                  <option value="center">中</option>
                  <option value="right">右</option>
                  <option value="full">满</option>
                </select>
                <input type="range" min="20" max="100" :value="block.image.width" title="宽度" @input="updateImage(block.imageIndex, { width: $event.target.value })" />
                <button type="button" title="上移" @click="moveImage(block.imageIndex, block.imageIndex - 1)">↑</button>
                <button type="button" title="下移" @click="moveImage(block.imageIndex, block.imageIndex + 1)">↓</button>
                <button type="button" title="删除" @click="removeImage(block.imageIndex)">×</button>
              </div>
            </figure>
            <textarea
              class="md-wps-flow-source"
              :value="block.text"
              spellcheck="false"
              @input="updateWrappedFlowBlock(block, $event)"
            ></textarea>
          </div>

          <template v-else>
            <div v-if="block.image.wrap !== 'inline'" class="md-image-anchor">
              <span class="md-image-exclusion" :class="imageClass(block.image, block.imageIndex)" :style="imageExclusionStyle(block.image, block.imageIndex)" aria-hidden="true"></span>
              <figure
                class="md-editable-image"
                :class="imageClass(block.image, block.imageIndex)"
                :style="imageStyle(block.image, block.imageIndex)"
                @click.stop="activeImageIndex = block.imageIndex"
                @pointerdown="startImageMove($event, block.imageIndex)"
              >
                <img :src="block.image.url" :alt="block.image.alt" draggable="false" @load="syncImageRatio($event, block.imageIndex)" />
                <span class="md-image-resize" title="拖动缩放" @pointerdown.stop="startResize($event, block.imageIndex)"></span>
                <div v-if="activeImageIndex === block.imageIndex" class="md-image-mini-toolbar" @click.stop @pointerdown.stop>
                  <select :value="block.image.wrap" title="文字环绕" @change="updateImage(block.imageIndex, { wrap: $event.target.value })">
                    <option value="square">四周型</option>
                    <option value="top-bottom">上下型</option>
                    <option value="inline">嵌入型</option>
                  </select>
                  <select :value="block.image.align" title="对齐" @change="updateImage(block.imageIndex, { align: $event.target.value })">
                    <option value="left">左</option>
                    <option value="center">中</option>
                    <option value="right">右</option>
                    <option value="full">满</option>
                  </select>
                  <input type="range" min="20" max="100" :value="block.image.width" title="宽度" @input="updateImage(block.imageIndex, { width: $event.target.value })" />
                  <button type="button" title="上移" @click="moveImage(block.imageIndex, block.imageIndex - 1)">↑</button>
                  <button type="button" title="下移" @click="moveImage(block.imageIndex, block.imageIndex + 1)">↓</button>
                  <button type="button" title="删除" @click="removeImage(block.imageIndex)">×</button>
                </div>
              </figure>
            </div>
            <figure
              v-else
              class="md-editable-image"
              :class="imageClass(block.image, block.imageIndex)"
              :style="imageStyle(block.image, block.imageIndex)"
              @click.stop="activeImageIndex = block.imageIndex"
              @pointerdown="startImageMove($event, block.imageIndex)"
            >
              <img :src="block.image.url" :alt="block.image.alt" draggable="false" @load="syncImageRatio($event, block.imageIndex)" />
              <span class="md-image-resize" title="拖动缩放" @pointerdown.stop="startResize($event, block.imageIndex)"></span>
              <div v-if="activeImageIndex === block.imageIndex" class="md-image-mini-toolbar" @click.stop @pointerdown.stop>
                <select :value="block.image.wrap" title="文字环绕" @change="updateImage(block.imageIndex, { wrap: $event.target.value })">
                  <option value="square">四周型</option>
                  <option value="top-bottom">上下型</option>
                  <option value="inline">嵌入型</option>
                </select>
                <select :value="block.image.align" title="对齐" @change="updateImage(block.imageIndex, { align: $event.target.value })">
                  <option value="left">左</option>
                  <option value="center">中</option>
                  <option value="right">右</option>
                  <option value="full">满</option>
                </select>
                <input type="range" min="20" max="100" :value="block.image.width" title="宽度" @input="updateImage(block.imageIndex, { width: $event.target.value })" />
                <button type="button" title="上移" @click="moveImage(block.imageIndex, block.imageIndex - 1)">↑</button>
                <button type="button" title="下移" @click="moveImage(block.imageIndex, block.imageIndex + 1)">↓</button>
                <button type="button" title="删除" @click="removeImage(block.imageIndex)">×</button>
              </div>
            </figure>
          </template>
        </template>
      </template>
      <div
        v-else
        class="md-editable-text is-empty"
        contenteditable="true"
        spellcheck="false"
        data-placeholder="从这里开始写正文..."
        @input="updateValue($event.currentTarget.innerText)"
      ></div>
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
const activeImageIndex = ref(-1);
const activePointer = ref(null);
const draftImagePatch = ref(null);

const images = computed(readImages);
const editorBlocks = computed(buildEditorBlocks);

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
      wrap: attrs.wrap,
      ratio: attrs.ratio,
      x: attrs.x,
      y: attrs.y
    });
  }
  return next;
}

function buildEditorBlocks() {
  const text = String(props.modelValue || "");
  const blocks = [];
  let cursor = 0;
  images.value.forEach((image, imageIndex) => {
    if (cursor > image.start) return;
    const before = text.slice(cursor, image.start);
    if (before.trim()) {
      blocks.push({
        type: "text",
        key: `text-${cursor}-${before.length}`,
        start: cursor,
        end: image.start,
        html: markdownToHtml(before),
        placeholder: "输入正文..."
      });
    }
    const nextImageStart = images.value[imageIndex + 1]?.start ?? text.length;
    const after = text.slice(image.end, nextImageStart);
    if (image.wrap === "square" && after.trim()) {
      const layout = layoutWrappedText(after, image);
      blocks.push({
        type: "wrap-image",
        key: `wrap-image-${image.start}-${image.url}`,
        image,
        imageIndex,
        textStart: image.end,
        textEnd: nextImageStart,
        text: after.trim(),
        lines: layout.lines,
        lineCount: layout.lineCount,
        imageHeightLines: layout.imageHeightLines,
        placeholder: "输入正文..."
      });
      cursor = nextImageStart;
      return;
    }
    blocks.push({ type: "image", key: `image-${image.start}-${image.url}`, image, imageIndex });
    cursor = image.end;
  });

  const tail = text.slice(cursor);
  if (tail.trim()) {
    blocks.push({
      type: "text",
      key: `text-${cursor}-${tail.length}`,
      start: cursor,
      end: text.length,
      html: markdownToHtml(tail),
      placeholder: "输入正文..."
    });
  }
  return blocks;
}

function layoutWrappedText(markdown = "", image) {
  const source = plainTextForWrap(markdown);
  const width = image.align === "full" ? 100 : clampWidth(image.width);
  const x = clampX(image.x, width);
  const y = clampY(image.y);
  const ratio = Number.parseFloat(image.ratio) || 1.333;
  const fullLineChars = 58;
  const lineHeight = 32;
  const wrapGap = 1.6;
  const imageTop = y;
  const imageHeightLines = Math.max(5, Math.min(18, Math.round((width / ratio) / 3.1)));
  const imageBottom = imageTop + imageHeightLines * lineHeight;
  const lines = [];
  let cursor = 0;
  let lineIndex = 0;
  while (cursor < source.length && lineIndex < 160) {
    const lineTop = lineIndex * lineHeight;
    const lineBottom = lineTop + lineHeight;
    const inImageRows = lineBottom > imageTop && lineTop < imageBottom;
    const line = { key: `line-${lineIndex}`, segments: [] };
    if (inImageRows) {
      const leftWidth = Math.max(0, x - wrapGap);
      const rightLeft = Math.min(100, x + width + wrapGap);
      const rightWidth = Math.max(0, 100 - rightLeft);
      if (leftWidth >= 8) {
        const taken = takeWrapText(source, cursor, Math.max(1, Math.floor(fullLineChars * leftWidth / 100)));
        cursor = taken.end;
        const text = taken.text;
        if (text.trim()) {
          line.segments.push({
            key: `line-${lineIndex}-left`,
            text,
            style: { left: "0%", width: `${leftWidth}%` }
          });
        }
      }
      if (rightWidth >= 8) {
        const taken = takeWrapText(source, cursor, Math.max(1, Math.floor(fullLineChars * rightWidth / 100)));
        cursor = taken.end;
        const text = taken.text;
        if (text.trim()) {
          line.segments.push({
            key: `line-${lineIndex}-right`,
            text,
            style: { left: `${rightLeft}%`, width: `${rightWidth}%` }
          });
        }
      }
    } else {
      const taken = takeWrapText(source, cursor, fullLineChars);
      cursor = taken.end;
      const text = taken.text;
      if (text.trim()) {
        line.segments.push({
          key: `line-${lineIndex}-full`,
          text,
          style: { left: "0%", width: "100%" }
        });
      }
    }
    lines.push(line);
    lineIndex += 1;
  }
  return { lines, lineCount: Math.max(lines.length, Math.ceil(imageBottom / lineHeight)), imageHeightLines };
}

function plainTextForWrap(markdown = "") {
  return String(markdown || "")
    .replace(/!\[[^\]]*\]\([^)]+\)(?:\{[^}]+\})?/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function takeWrapText(source, start, maxChars) {
  const cleanStart = skipLeadingSpaces(source, start);
  const end = Math.min(source.length, cleanStart + maxChars);
  if (end >= source.length) return { text: source.slice(cleanStart), end: source.length };
  const nextSpace = source.lastIndexOf(" ", end);
  if (nextSpace > cleanStart + Math.floor(maxChars * 0.45)) {
    return { text: source.slice(cleanStart, nextSpace + 1), end: nextSpace + 1 };
  }
  return { text: source.slice(cleanStart, end), end };
}

function skipLeadingSpaces(source, start) {
  let index = start;
  while (index < source.length && /\s/.test(source[index])) index += 1;
  return index;
}

function parseAttrs(attrs = "") {
  const rawWidth = Number.parseInt(attrs.match(/(?:^|\s)width\s*=\s*["']?(\d{1,3})%?["']?/i)?.[1] || "80", 10);
  const align = attrs.match(/(?:^|\s)align\s*=\s*["']?(left|center|right|full)["']?/i)?.[1] || "center";
  const layout = attrs.match(/(?:^|\s)layout\s*=\s*["']?(block|wrap-left|wrap-right|free)["']?/i)?.[1] || "block";
  const rawWrap = attrs.match(/(?:^|\s)wrap\s*=\s*["']?(none|left|right|square|top-bottom|inline)["']?/i)?.[1] || "";
  const inferredWrap = layout === "wrap-left" ? "left" : layout === "wrap-right" ? "right" : "none";
  const wrap = normalizeWrap(rawWrap || inferredWrap);
  const xMatch = attrs.match(/(?:^|\s)x\s*=\s*["']?(-?\d{1,3})%?["']?/i);
  const x = Number.parseInt(xMatch?.[1] || "0", 10);
  const y = Number.parseInt(attrs.match(/(?:^|\s)y\s*=\s*["']?(-?\d{1,4})["']?/i)?.[1] || "0", 10);
  const ratio = Number.parseFloat(attrs.match(/(?:^|\s)ratio\s*=\s*["']?(\d+(?:\.\d+)?)["']?/i)?.[1] || "1.333");
  const width = clampWidth(rawWidth);
  const defaultX = align === "center" ? Math.round((100 - width) / 2) : align === "right" ? 100 - width : 0;
  return {
    width,
    align: ["left", "center", "right", "full"].includes(align) ? align : "center",
    layout: ["block", "wrap-left", "wrap-right", "free"].includes(layout) ? layout : "block",
    wrap,
    ratio: Number.isFinite(ratio) ? Math.min(4, Math.max(0.25, ratio)) : 1.333,
    x: Number.isFinite(x) && xMatch ? clampX(x, width) : clampX(defaultX, width),
    y: clampY(y)
  };
}

function clampWidth(value) {
  const width = Number.parseInt(value, 10);
  return Math.min(100, Math.max(20, Number.isFinite(width) ? width : 80));
}

function clampX(value, width) {
  const max = Math.max(0, 100 - clampWidth(width));
  const x = Number.parseInt(value, 10);
  return Math.min(max, Math.max(0, Number.isFinite(x) ? x : 0));
}

function clampY(value) {
  const y = Number.parseInt(value, 10);
  return Math.min(2400, Math.max(-1200, Number.isFinite(y) ? y : 0));
}

function normalizeWrap(value) {
  if (value === "left" || value === "right" || value === "square") return "square";
  if (value === "inline") return "inline";
  return "top-bottom";
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inlineMarkdown(value = "") {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function markdownToHtml(markdown = "") {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const output = [];
  let paragraph = [];
  let listOpen = false;

  const closeParagraph = () => {
    if (!paragraph.length) return;
    output.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
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
      output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      return;
    }
    const listItem = line.match(/^[-*]\s+(.+)$/);
    if (listItem) {
      closeParagraph();
      if (!listOpen) {
        output.push("<ul>");
        listOpen = true;
      }
      output.push(`<li>${inlineMarkdown(listItem[1])}</li>`);
      return;
    }
    paragraph.push(line);
  });
  closeParagraph();
  closeList();
  return output.join("");
}

function textFromEditable(element) {
  return String(element.innerText || "").replace(/\n{3,}/g, "\n\n").trim();
}

function updateTextBlock(block, event) {
  const value = textFromEditable(event.currentTarget);
  const text = String(props.modelValue || "");
  updateValue(`${text.slice(0, block.start)}${value}${text.slice(block.end)}`);
}

function updateWrappedFlowBlock(block, event) {
  const combined = String(event.currentTarget.value || "").trim();
  const text = String(props.modelValue || "");
  updateValue(`${text.slice(0, block.textStart)}${combined}${text.slice(block.textEnd)}`);
}

function imageMarkdown(image, patch = {}) {
  const next = { ...image, ...patch };
  const alt = String(next.alt || "image").replace(/[\[\]\r\n]/g, " ").trim() || "image";
  const width = clampWidth(next.width);
  const align = ["left", "center", "right", "full"].includes(next.align) ? next.align : "center";
  const wrap = normalizeWrap(next.wrap);
  const x = clampX(next.x, width);
  const y = clampY(next.y);
  const ratio = Math.min(4, Math.max(0.25, Number.parseFloat(next.ratio) || 1.333)).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return `![${alt}](${next.url}){width=${width} wrap=${wrap} align=${align} x=${x} y=${y} ratio=${ratio}}`;
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
  updateValue(`${text.slice(0, image.start)}${text.slice(image.end)}`.replace(/\n{4,}/g, "\n\n\n"));
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

function imageClass(image, index) {
  return {
    "is-active": activeImageIndex.value === index,
    "is-floating": image.wrap !== "inline",
    "is-square": image.wrap === "square",
    "is-top-bottom": image.wrap === "top-bottom",
    "is-inline": image.wrap === "inline"
  };
}

function imageMetrics(image, index) {
  const draft = draftImagePatch.value?.index === index ? draftImagePatch.value : null;
  const next = draft ? { ...image, ...draft } : image;
  const width = next.align === "full" ? 100 : clampWidth(next.width);
  return {
    ...next,
    width,
    x: clampX(next.x, width),
    y: clampY(next.y),
    ratio: Number.parseFloat(next.ratio) || 1.333
  };
}

function imageStyle(image, index) {
  const next = imageMetrics(image, index);
  const base = {
    width: `${next.width}%`,
    "--image-ratio": next.ratio
  };
  if (next.wrap !== "inline") {
    return {
      ...base,
      left: `${next.x}%`,
      top: `${next.y}px`
    };
  }
  return {
    ...base,
    display: "inline-block",
    verticalAlign: "middle",
    marginTop: `${next.y}px`,
    marginLeft: `${next.x}%`,
    marginRight: "12px",
    marginBottom: "8px"
  };
}

function wrapFlowStyle(block) {
  const image = imageMetrics(block.image, block.imageIndex);
  const layout = layoutWrappedText(block.text, image);
  const imageEndLine = Math.max(0, Math.round(image.y / 32)) + layout.imageHeightLines;
  const lineCount = Math.max(layout.lineCount || 0, imageEndLine);
  return {
    minHeight: `${lineCount * 32}px`,
    "--wrap-line-height": "32px",
    "--image-ratio": image.ratio
  };
}

function wrapTextLayerStyle(block) {
  const layout = layoutWrappedText(block.text, imageMetrics(block.image, block.imageIndex));
  return {
    minHeight: `${Math.max(layout.lineCount || 1, 1) * 32}px`
  };
}

function wrapFlowLines(block) {
  return layoutWrappedText(block.text, imageMetrics(block.image, block.imageIndex)).lines;
}

function wrapFlowImageStyle(image, index) {
  const next = imageMetrics(image, index);
  return {
    left: `${next.x}%`,
    top: `${next.y}px`,
    width: `${next.width}%`,
    "--image-ratio": next.ratio
  };
}

function imageExclusionStyle(image, index) {
  const next = imageMetrics(image, index);
  const base = {
    width: `${next.width}%`,
    aspectRatio: `${next.ratio}`
  };
  if (next.wrap === "square") {
    const floatSide = next.x + next.width / 2 <= 50 ? "left" : "right";
    const rightGap = Math.max(0, 100 - next.x - next.width);
    return {
      ...base,
      float: floatSide,
      clear: floatSide,
      marginTop: `${next.y}px`,
      marginRight: floatSide === "left" ? "18px" : `${rightGap}%`,
      marginBottom: "14px",
      marginLeft: floatSide === "left" ? `${next.x}%` : "18px"
    };
  }
  return {
    ...base,
    display: "block",
    clear: "both",
    marginTop: `${next.y}px`,
    marginLeft: `${next.x}%`,
    marginRight: "0",
    marginBottom: "16px"
  };
}

function syncImageRatio(event, index) {
  const image = readImages()[index];
  const target = event.currentTarget;
  if (!image || !target?.naturalWidth || !target?.naturalHeight) return;
  const ratio = Math.min(4, Math.max(0.25, target.naturalWidth / target.naturalHeight));
  if (Math.abs(ratio - (Number.parseFloat(image.ratio) || 1.333)) < 0.01) return;
  updateImage(index, { ratio });
}

function startResize(event, index) {
  const image = readImages()[index];
  if (!image) return;
  event.preventDefault();
  event.currentTarget.setPointerCapture?.(event.pointerId);
  activeImageIndex.value = index;
  const editor = event.currentTarget.closest(".md-document-editor");
  activePointer.value = {
    type: "resize",
    index,
    startX: event.clientX,
    startWidth: image.width,
    editorWidth: editor?.getBoundingClientRect().width || 1
  };
  bindPointerEvents();
}

function startImageMove(event, index) {
  const image = readImages()[index];
  if (!image || event.target.closest(".md-image-resize") || event.target.closest(".md-image-mini-toolbar")) return;
  event.preventDefault();
  event.currentTarget.setPointerCapture?.(event.pointerId);
  activeImageIndex.value = index;
  const editor = event.currentTarget.closest(".md-document-editor");
  const anchor = event.currentTarget.closest(".md-wps-flow") || event.currentTarget.closest(".md-wps-wrap") || event.currentTarget.closest(".md-image-anchor") || editor;
  const anchorRect = anchor?.getBoundingClientRect();
  const imageRect = event.currentTarget.getBoundingClientRect();
  activePointer.value = {
    type: "move",
    index,
    grabX: event.clientX - imageRect.left,
    grabY: event.clientY - imageRect.top,
    anchorLeft: anchorRect?.left || 0,
    anchorTop: anchorRect?.top || 0,
    editorWidth: editor?.getBoundingClientRect().width || anchorRect?.width || imageRect.width || 1
  };
  draftImagePatch.value = { index, x: image.x, y: image.y };
  bindPointerEvents();
}

function onPointerMove(event) {
  const action = activePointer.value;
  if (!action) return;
  if (action.type === "resize") {
    const delta = ((event.clientX - action.startX) / action.editorWidth) * 100;
    updateImage(action.index, { width: Math.round(Math.min(100, Math.max(20, action.startWidth + delta))) });
    return;
  }
  const image = readImages()[action.index];
  const width = image?.align === "full" ? 100 : image?.width;
  const nextX = ((event.clientX - action.anchorLeft - action.grabX) / action.editorWidth) * 100;
  const nextY = event.clientY - action.anchorTop - action.grabY;
  draftImagePatch.value = {
    index: action.index,
    x: Math.round(clampX(nextX, width)),
    y: Math.round(clampY(nextY))
  };
}

function stopPointerAction() {
  const action = activePointer.value;
  const draft = draftImagePatch.value;
  if (action?.type === "move" && draft?.index === action.index) {
    updateImage(action.index, { x: draft.x, y: draft.y });
  }
  activePointer.value = null;
  draftImagePatch.value = null;
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

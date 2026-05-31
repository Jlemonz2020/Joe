<template>
  <section class="markdown-body-editor full">
    <div class="markdown-editor-head">
      <div>
        <strong>{{ title }}</strong>
        <span>在同一个画布里编辑正文和图片；图片可自由拖动，右下角可等比例缩放。</span>
      </div>
      <div class="md-head-actions">
        <button type="button" class="md-tool-button" @click="focusFirstText">编辑文字</button>
        <label class="image-upload-button">
          上传图片
          <input type="file" :accept="acceptedImageTypes" @change="uploadImage" />
        </label>
      </div>
    </div>

    <div class="md-document-editor" @click="clearSelection">
      <div
        ref="stageEl"
        class="md-visual-canvas"
        :style="{ minHeight: `${canvasHeight}px` }"
        @pointerdown.capture="rememberInsertPoint"
      >
        <div
          v-if="!layoutLines.length"
          class="md-canvas-placeholder"
          contenteditable="true"
          spellcheck="false"
          data-placeholder="从这里开始写正文..."
          @click.stop
          @focus="activeImageIndex = -1"
          @blur="updateEmptyText"
          @paste="pastePlainText"
        ></div>

        <div class="md-canvas-text-layer" :style="{ minHeight: `${canvasHeight}px` }">
          <div
            v-for="line in layoutLines"
            :key="line.key"
            class="md-canvas-line"
            :class="{ 'is-reserved': line.reserved }"
            :style="{ top: `${line.top}px`, height: `${line.height}px` }"
          >
            <span
              v-for="segment in line.segments"
              :key="segment.key"
              class="md-canvas-segment"
              contenteditable="true"
              spellcheck="false"
              :data-line-index="line.index"
              :data-segment-order="segment.order"
              :style="segment.style"
              @click.stop
              @focus="activeImageIndex = -1"
              @blur="updateTextFromCanvas"
              @paste="pastePlainText"
            >{{ segment.text }}</span>
          </div>
        </div>

        <figure
          v-for="(image, index) in laidImages"
          :key="image.key"
          class="md-editable-image md-canvas-image"
          :class="imageClass(index)"
          :style="imageStyle(image)"
          @click.stop="selectImage(index)"
          @pointerdown="startImageMove($event, index)"
        >
          <img :src="image.url" :alt="image.alt" draggable="false" @load="syncImageRatio($event, index)" />
          <span class="md-image-resize" title="拖动缩放" @pointerdown.stop="startResize($event, index)"></span>
          <div v-if="activeImageIndex === index" class="md-image-mini-toolbar" @click.stop @pointerdown.stop>
            <select :value="image.wrap" title="文字环绕" @change="updateImage(index, { wrap: $event.target.value })">
              <option value="square">四周</option>
              <option value="top-bottom">上下</option>
              <option value="inline">不环绕</option>
            </select>
            <select :value="image.align" title="默认位置" @change="updateImage(index, { align: $event.target.value })">
              <option value="left">左</option>
              <option value="center">中</option>
              <option value="right">右</option>
              <option value="full">满</option>
            </select>
            <input type="range" min="20" max="100" :value="image.width" title="宽度" @input="updateImage(index, { width: $event.target.value })" />
            <button type="button" title="删除图片" @click="removeImage(index)">删除</button>
          </div>
        </figure>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps({
  modelValue: { type: String, default: "" },
  title: { type: String, default: "Markdown 正文" },
  acceptedImageTypes: { type: String, default: "image/jpeg,image/png,image/webp,image/gif" }
});

const emit = defineEmits(["update:modelValue", "upload-image"]);

const activeImageIndex = ref(-1);
const activePointer = ref(null);
const draftImagePatch = ref(null);
const stageEl = ref(null);
const stageWidth = ref(760);
const textFont = ref('400 17px "Inter", "Microsoft YaHei", sans-serif');
const lastInsertY = ref(0);
let resizeObserver = null;
let measureContext = null;

const lineHeight = 32;
const wrapGap = 18;

const images = computed(readImages);
const plainText = computed(() => stripImageMarkdown(String(props.modelValue || "")));
const laidImages = computed(() => images.value.map((image, index) => imageMetrics(image, index)));
const layoutLines = computed(() => layoutCanvasText(plainText.value, laidImages.value));
const canvasHeight = computed(() => {
  const textBottom = layoutLines.value.reduce((max, line) => Math.max(max, line.top + line.height), 0);
  const imageBottom = laidImages.value.reduce((max, image) => Math.max(max, image.y + image.height), 0);
  return Math.max(620, Math.ceil(textBottom + 88), Math.ceil(imageBottom + 88));
});

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
      wrap: attrs.wrap,
      ratio: attrs.ratio,
      x: attrs.x,
      y: attrs.y
    });
  }
  return next;
}

function stripImageMarkdown(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/!\[[^\]]*\]\([^)]+\)(?:\{[^}]+\})?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function parseAttrs(attrs = "") {
  const rawWidth = Number.parseInt(attrs.match(/(?:^|\s)width\s*=\s*["']?(\d{1,3})%?["']?/i)?.[1] || "42", 10);
  const align = attrs.match(/(?:^|\s)align\s*=\s*["']?(left|center|right|full)["']?/i)?.[1] || "center";
  const layout = attrs.match(/(?:^|\s)layout\s*=\s*["']?(block|wrap-left|wrap-right|free)["']?/i)?.[1] || "block";
  const rawWrap = attrs.match(/(?:^|\s)wrap\s*=\s*["']?(none|left|right|square|top-bottom|inline)["']?/i)?.[1] || "";
  const inferredWrap = layout === "wrap-left" ? "left" : layout === "wrap-right" ? "right" : "square";
  const width = clampWidth(rawWidth);
  const defaultX = align === "center" ? Math.round((100 - width) / 2) : align === "right" ? 100 - width : 0;
  const xMatch = attrs.match(/(?:^|\s)x\s*=\s*["']?(-?\d{1,3})%?["']?/i);
  const yMatch = attrs.match(/(?:^|\s)y\s*=\s*["']?(-?\d{1,4})["']?/i);
  const ratio = Number.parseFloat(attrs.match(/(?:^|\s)ratio\s*=\s*["']?(\d+(?:\.\d+)?)["']?/i)?.[1] || "1.333");
  return {
    width,
    align: ["left", "center", "right", "full"].includes(align) ? align : "center",
    wrap: normalizeWrap(rawWrap || inferredWrap),
    ratio: Number.isFinite(ratio) ? Math.min(4, Math.max(0.25, ratio)) : 1.333,
    x: xMatch ? clampX(Number.parseInt(xMatch[1], 10), width) : clampX(defaultX, width),
    y: yMatch ? clampY(Number.parseInt(yMatch[1], 10)) : 0
  };
}

function normalizeWrap(value) {
  if (value === "left" || value === "right" || value === "square") return "square";
  if (value === "inline") return "inline";
  return "top-bottom";
}

function clampWidth(value) {
  const width = Number.parseInt(value, 10);
  return Math.min(100, Math.max(20, Number.isFinite(width) ? width : 42));
}

function clampX(value, width) {
  const max = Math.max(0, 100 - clampWidth(width));
  const x = Number.parseFloat(value);
  return Math.min(max, Math.max(0, Number.isFinite(x) ? x : 0));
}

function clampY(value) {
  const y = Number.parseInt(value, 10);
  return Math.min(3600, Math.max(0, Number.isFinite(y) ? y : 0));
}

function imageMetrics(image, index) {
  const draft = draftImagePatch.value?.index === index ? draftImagePatch.value : null;
  const next = draft ? { ...image, ...draft } : image;
  const width = next.align === "full" ? 100 : clampWidth(next.width);
  const ratio = Number.parseFloat(next.ratio) || 1.333;
  const pixelWidth = Math.max(72, (stageWidth.value * width) / 100);
  return {
    ...next,
    key: `${image.start}-${image.url}-${index}`,
    width,
    x: clampX(next.x, width),
    y: clampY(next.y),
    ratio,
    height: Math.max(54, pixelWidth / ratio)
  };
}

function layoutCanvasText(source, imageList) {
  const tokens = tokenizeText(source);
  const lines = [];
  let cursor = 0;
  let top = 0;
  let order = 0;
  let lineIndex = 0;
  let guard = 0;

  while (cursor < tokens.length && guard < 1400) {
    guard += 1;
    const line = {
      key: `line-${lineIndex}-${cursor}`,
      index: lineIndex,
      top,
      height: lineHeight,
      hardBreak: false,
      reserved: false,
      segments: []
    };

    if (tokens[cursor] === "\n") {
      line.hardBreak = true;
      line.reserved = true;
      lines.push(line);
      cursor += 1;
      top += lineHeight;
      lineIndex += 1;
      continue;
    }

    const ranges = allowedTextRanges(top, imageList);
    if (!ranges.length) {
      line.reserved = true;
      lines.push(line);
      top += lineHeight;
      lineIndex += 1;
      continue;
    }

    for (const range of ranges) {
      if (cursor >= tokens.length || tokens[cursor] === "\n") break;
      const taken = takeTokens(tokens, cursor, range.width);
      cursor = taken.end;
      if (!taken.text.trim()) continue;
      line.segments.push({
        key: `segment-${lineIndex}-${order}`,
        order,
        text: taken.text,
        style: {
          left: `${range.left}px`,
          width: `${range.width}px`
        }
      });
      order += 1;
    }

    if (tokens[cursor] === "\n") {
      cursor += 1;
      line.hardBreak = true;
    }

    lines.push(line);
    top += lineHeight;
    lineIndex += 1;
  }

  return lines;
}

function tokenizeText(source = "") {
  const text = String(source || "").replace(/\r\n/g, "\n");
  const tokens = [];
  const matcher = /\n|[\u3400-\u9fff]|[^\s\u3400-\u9fff]+|[ \t]+/g;
  let match;
  while ((match = matcher.exec(text))) {
    const token = match[0];
    tokens.push(/[ \t]+/.test(token) ? " " : token);
  }
  return tokens;
}

function allowedTextRanges(lineTop, imageList) {
  const width = Math.max(320, stageWidth.value || 760);
  let ranges = [{ left: 0, right: width }];
  const lineBottom = lineTop + lineHeight;

  imageList.forEach((image) => {
    if (image.wrap === "inline") return;
    const imageTop = image.y;
    const imageBottom = image.y + image.height;
    if (lineBottom <= imageTop || lineTop >= imageBottom) return;

    if (image.wrap === "top-bottom") {
      ranges = [];
      return;
    }

    const imageLeft = (width * image.x) / 100;
    const imageRight = imageLeft + (width * image.width) / 100;
    ranges = subtractRange(ranges, {
      left: Math.max(0, imageLeft - wrapGap),
      right: Math.min(width, imageRight + wrapGap)
    });
  });

  return ranges
    .map((range) => ({ left: Math.round(range.left), width: Math.round(range.right - range.left) }))
    .filter((range) => range.width >= 48);
}

function subtractRange(ranges, cut) {
  const next = [];
  ranges.forEach((range) => {
    if (cut.right <= range.left || cut.left >= range.right) {
      next.push(range);
      return;
    }
    if (cut.left > range.left) next.push({ left: range.left, right: cut.left });
    if (cut.right < range.right) next.push({ left: cut.right, right: range.right });
  });
  return next;
}

function takeTokens(tokens, start, maxWidth) {
  let index = skipLeadingSpace(tokens, start);
  let text = "";
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === "\n") break;
    const candidate = text + token;
    if (measureText(candidate) <= maxWidth || !text) {
      text = candidate;
      index += 1;
      continue;
    }
    break;
  }
  if (!text && index < tokens.length && tokens[index] !== "\n") {
    text = tokens[index];
    index += 1;
  }
  return { text: text.trimEnd(), end: Math.max(index, start + 1) };
}

function skipLeadingSpace(tokens, start) {
  let index = start;
  while (index < tokens.length && tokens[index] !== "\n" && !tokens[index].trim()) index += 1;
  return index;
}

function measureText(value = "") {
  const ctx = getMeasureContext();
  if (!ctx) return String(value).length * 9;
  ctx.font = textFont.value;
  return ctx.measureText(String(value)).width;
}

function getMeasureContext() {
  if (measureContext) return measureContext;
  if (typeof document === "undefined") return null;
  measureContext = document.createElement("canvas").getContext("2d");
  return measureContext;
}

function imageClass(index) {
  return {
    "is-active": activeImageIndex.value === index
  };
}

function imageStyle(image) {
  return {
    left: `${image.x}%`,
    top: `${image.y}px`,
    width: `${image.width}%`,
    "--image-ratio": image.ratio
  };
}

function clearSelection(event) {
  if (event.target.closest(".md-canvas-image") || event.target.closest(".md-canvas-segment")) return;
  activeImageIndex.value = -1;
}

function selectImage(index) {
  activeImageIndex.value = index;
}

function rememberInsertPoint(event) {
  if (event.target.closest(".md-canvas-image") || event.target.closest(".md-image-mini-toolbar")) return;
  const rect = stageEl.value?.getBoundingClientRect();
  if (!rect) return;
  lastInsertY.value = Math.round(clampY(event.clientY - rect.top));
  stageEl.value.dataset.insertY = String(lastInsertY.value);
}

function focusFirstText() {
  const target = stageEl.value?.querySelector(".md-canvas-segment, .md-canvas-placeholder");
  target?.focus();
}

function updateEmptyText(event) {
  const value = cleanEditableText(event.currentTarget.innerText || "");
  if (value) updateDocumentText(value);
}

function updateTextFromCanvas() {
  const nodes = Array.from(stageEl.value?.querySelectorAll(".md-canvas-segment") || []);
  if (!nodes.length) return;
  const byLine = new Map();
  nodes.forEach((node) => {
    const line = Number.parseInt(node.dataset.lineIndex || "0", 10);
    const text = cleanEditableText(node.innerText || "");
    if (!text.trim()) return;
    if (!byLine.has(line)) byLine.set(line, []);
    byLine.get(line).push(text);
  });

  let output = "";
  layoutLines.value.forEach((line) => {
    const text = mergeVisibleTextParts(byLine.get(line.index) || []);
    if (text) {
      output = joinText(output, text);
    }
    if (line.hardBreak) output = `${output.trimEnd()}\n`;
  });
  updateDocumentText(output.trim());
}

function updateDocumentText(nextText) {
  const imageBlock = readImages().map((image) => imageMarkdown(image)).join("\n\n");
  const text = String(nextText || "").trim();
  if (!imageBlock) {
    updateValue(text);
    return;
  }
  updateValue(`${imageBlock}${text ? `\n\n${text}` : ""}`);
}

function mergeVisibleTextParts(parts) {
  return parts.reduce((output, part) => joinText(output, part), "");
}

function joinText(left, right) {
  const current = String(left || "");
  const next = String(right || "");
  if (!current) return next;
  if (!next) return current;
  return `${current}${needsJoinSpace(current, next) ? " " : ""}${next}`;
}

function needsJoinSpace(left, right) {
  const end = left.trimEnd().slice(-1);
  const start = right.trimStart().slice(0, 1);
  if (!end || !start) return false;
  if (/[\s([{'"“‘《（]$/.test(end) || /^[\s,.;:!?，。；：、）】》]/.test(start)) return false;
  if (/[\u3400-\u9fff]/.test(end) || /[\u3400-\u9fff]/.test(start)) return false;
  return true;
}

function cleanEditableText(text) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pastePlainText(event) {
  event.preventDefault();
  const text = event.clipboardData?.getData("text/plain") || "";
  document.execCommand("insertText", false, text);
}

function imageMarkdown(image, patch = {}) {
  const next = { ...image, ...patch };
  const width = next.align === "full" ? 100 : clampWidth(next.width);
  const align = ["left", "center", "right", "full"].includes(next.align) ? next.align : "center";
  const wrap = normalizeWrap(next.wrap);
  const x = Math.round(clampX(next.x, width));
  const y = Math.round(clampY(next.y));
  const ratio = Math.min(4, Math.max(0.25, Number.parseFloat(next.ratio) || 1.333)).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  const alt = String(next.alt || "image").replace(/[\[\]\r\n]/g, " ").trim() || "image";
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
  updateValue(`${text.slice(0, image.start)}${text.slice(image.end)}`.replace(/\n{4,}/g, "\n\n\n").trim());
  activeImageIndex.value = -1;
}

function uploadImage(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  emit("upload-image", {
    file,
    insertY: resolveUploadY(),
    insertX: 29
  });
}

function resolveUploadY() {
  if (lastInsertY.value > 0) return lastInsertY.value;
  const activeImage = laidImages.value[activeImageIndex.value];
  if (activeImage) return Math.round(clampY(activeImage.y + activeImage.height + 24));
  const imageBottom = laidImages.value.reduce((max, image) => Math.max(max, image.y + image.height + 24), 0);
  return Math.round(clampY(imageBottom || 0));
}

function syncImageRatio(event, index) {
  const image = readImages()[index];
  const target = event.currentTarget;
  if (!image || !target?.naturalWidth || !target?.naturalHeight) return;
  const ratio = Math.min(4, Math.max(0.25, target.naturalWidth / target.naturalHeight));
  if (Math.abs(ratio - (Number.parseFloat(image.ratio) || 1.333)) < 0.01) return;
  updateImage(index, { ratio });
}

function startImageMove(event, index) {
  const image = readImages()[index];
  if (!image || event.target.closest(".md-image-resize") || event.target.closest(".md-image-mini-toolbar")) return;
  event.preventDefault();
  event.currentTarget.setPointerCapture?.(event.pointerId);
  const rect = stageEl.value?.getBoundingClientRect();
  const imageRect = event.currentTarget.getBoundingClientRect();
  activeImageIndex.value = index;
  activePointer.value = {
    type: "move",
    index,
    grabX: event.clientX - imageRect.left,
    grabY: event.clientY - imageRect.top,
    stageLeft: rect?.left || 0,
    stageTop: rect?.top || 0,
    stageWidth: rect?.width || 1
  };
  draftImagePatch.value = { index, x: image.x, y: image.y };
  bindPointerEvents();
}

function startResize(event, index) {
  const image = readImages()[index];
  if (!image) return;
  event.preventDefault();
  event.currentTarget.setPointerCapture?.(event.pointerId);
  const rect = stageEl.value?.getBoundingClientRect();
  activeImageIndex.value = index;
  activePointer.value = {
    type: "resize",
    index,
    startX: event.clientX,
    startWidth: image.width,
    stageWidth: rect?.width || 1
  };
  draftImagePatch.value = { index, width: image.width };
  bindPointerEvents();
}

function onPointerMove(event) {
  const action = activePointer.value;
  if (!action) return;
  event.preventDefault();
  const image = readImages()[action.index];
  if (!image) return;

  if (action.type === "resize") {
    const delta = ((event.clientX - action.startX) / action.stageWidth) * 100;
    const width = Math.round(clampWidth(action.startWidth + delta));
    draftImagePatch.value = { index: action.index, width };
    return;
  }

  const currentWidth = draftImagePatch.value?.width ?? image.width;
  const x = ((event.clientX - action.stageLeft - action.grabX) / action.stageWidth) * 100;
  const y = event.clientY - action.stageTop - action.grabY;
  draftImagePatch.value = {
    index: action.index,
    x: Math.round(clampX(x, currentWidth)),
    y: Math.round(clampY(y))
  };
}

function stopPointerAction() {
  const action = activePointer.value;
  const draft = draftImagePatch.value;
  if (action && draft?.index === action.index) {
    const patch = {};
    if (Object.hasOwn(draft, "x")) patch.x = draft.x;
    if (Object.hasOwn(draft, "y")) patch.y = draft.y;
    if (Object.hasOwn(draft, "width")) patch.width = draft.width;
    updateImage(action.index, patch);
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

function syncStageMetrics() {
  const stage = stageEl.value;
  if (!stage || typeof window === "undefined") return;
  stageWidth.value = Math.max(320, stage.clientWidth);
  const styles = window.getComputedStyle(stage);
  textFont.value = `${styles.fontStyle} ${styles.fontVariant} ${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`;
}

onMounted(() => {
  syncStageMetrics();
  if (typeof ResizeObserver !== "undefined" && stageEl.value) {
    resizeObserver = new ResizeObserver(syncStageMetrics);
    resizeObserver.observe(stageEl.value);
  }
});

onBeforeUnmount(() => {
  stopPointerAction();
  resizeObserver?.disconnect();
});
</script>

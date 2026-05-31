function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeMarkdownUrl(value = "") {
  const url = String(value || "").trim();
  if (/^(https?:\/\/|\/(?!\/))/i.test(url)) return escapeHtml(url);
  return "";
}

function normalizeImageWrap(value = "") {
  if (value === "left" || value === "right" || value === "square") return "square";
  if (value === "inline") return "inline";
  return "top-bottom";
}

function clampImageY(value) {
  const y = Number.parseInt(value, 10);
  return Math.min(3600, Math.max(0, Number.isFinite(y) ? y : 0));
}

function parseImageAttrs(value = "") {
  const attrs = String(value || "");
  const widthMatch = attrs.match(/(?:^|\s)width\s*=\s*["']?(\d{1,3})%?["']?/i);
  const alignMatch = attrs.match(/(?:^|\s)align\s*=\s*["']?(left|center|right|full)["']?/i);
  const layoutMatch = attrs.match(/(?:^|\s)layout\s*=\s*["']?(block|wrap-left|wrap-right|free)["']?/i);
  const wrapMatch = attrs.match(/(?:^|\s)wrap\s*=\s*["']?(none|left|right|square|top-bottom|inline)["']?/i);
  const xMatch = attrs.match(/(?:^|\s)x\s*=\s*["']?(-?\d{1,3})%?["']?/i);
  const yMatch = attrs.match(/(?:^|\s)y\s*=\s*["']?(-?\d{1,4})["']?/i);
  const width = widthMatch ? Math.min(100, Math.max(20, Number.parseInt(widthMatch[1], 10))) : 100;
  const align = alignMatch?.[1]?.toLowerCase() || "full";
  const layout = layoutMatch?.[1]?.toLowerCase() || "block";
  const legacyWrap = layout === "wrap-left" ? "left" : layout === "wrap-right" ? "right" : "none";
  const wrap = normalizeImageWrap(wrapMatch?.[1]?.toLowerCase() || legacyWrap);
  const maxX = Math.max(0, 100 - width);
  const defaultX = align === "center" ? Math.round(maxX / 2) : align === "right" ? maxX : 0;
  const x = xMatch ? Math.min(maxX, Math.max(0, Number.parseInt(xMatch[1], 10))) : defaultX;
  const y = yMatch ? clampImageY(yMatch[1]) : 0;
  const ratioMatch = attrs.match(/(?:^|\s)ratio\s*=\s*["']?(\d+(?:\.\d+)?)["']?/i);
  const ratio = ratioMatch ? Math.min(4, Math.max(0.25, Number.parseFloat(ratioMatch[1]))) : 1.333;
  return { width, align, wrap, x, y, ratio };
}

function imageInlineStyle(meta) {
  const style = [`width:${meta.width}%`, "height:auto"];
  if (meta.wrap === "inline") {
    style.push("display:inline-block", "vertical-align:middle", `margin:${meta.y}px 12px 8px ${meta.x}%`);
    return style;
  }
  if (meta.wrap === "top-bottom") {
    style.push("display:block", `margin:${meta.y}px 0 16px ${meta.x}%`);
    if (meta.align === "full") style.push("width:100%");
    return style;
  }
  const floatSide = meta.x + meta.width / 2 <= 50 ? "left" : "right";
  const rightGap = Math.max(0, 100 - meta.x - meta.width);
  style.push(
    `float:${floatSide}`,
    `clear:${floatSide}`,
    "shape-outside:inset(0 round 10px)",
    `margin-top:${meta.y}px`,
    `margin-right:${floatSide === "left" ? "18px" : `${rightGap}%`}`,
    "margin-bottom:14px",
    `margin-left:${floatSide === "left" ? `${meta.x}%` : "18px"}`
  );
  return style;
}

function renderMarkdownImage(alt = "", url = "", attrs = "", block = false) {
  const safeUrl = safeMarkdownUrl(url);
  if (!safeUrl) return escapeHtml(alt);
  const meta = parseImageAttrs(attrs);
  if (!block) {
    return `<img class="md-content-inline-image" src="${safeUrl}" alt="${escapeHtml(alt)}" loading="lazy" style="${escapeHtml(imageInlineStyle(meta).join(";"))}">`;
  }
  const floatSide = meta.x + meta.width / 2 <= 50 ? "left" : "right";
  const rightGap = Math.max(0, 100 - meta.x - meta.width);
  const figureStyle = [
    `width:${meta.width}%`,
    `--md-image-ratio:${meta.ratio}`,
    meta.wrap === "square" ? `margin-top:${meta.y}px` : "",
    meta.wrap === "square" ? `margin-right:${floatSide === "left" ? "18px" : `${rightGap}%`}` : "",
    meta.wrap === "square" ? "margin-bottom:18px" : "",
    meta.wrap === "square" ? `margin-left:${floatSide === "left" ? `${meta.x}%` : "18px"}` : "",
    meta.wrap === "top-bottom" ? `margin:${meta.y}px 0 20px ${meta.x}%` : "",
    meta.wrap === "inline" ? `margin:${meta.y}px 12px 12px ${meta.x}%` : ""
  ].filter(Boolean);
  const className = [
    "md-content-image",
    `md-content-image--${meta.wrap}`,
    `md-content-image--${floatSide}`,
    `md-content-image-align-${meta.align}`
  ].join(" ");
  return `<figure class="${className}" style="${escapeHtml(figureStyle.join(";"))}"><img src="${safeUrl}" alt="${escapeHtml(alt)}" loading="lazy"></figure>`;
}

function inline(value) {
  return escapeHtml(value)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)(?:\{([^}]+)\})?/g, (_, alt, url, attrs) => {
      return renderMarkdownImage(alt, url, attrs, false);
    })
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
      const safeUrl = safeMarkdownUrl(url);
      if (!safeUrl) return label;
      const externalAttrs = /^https?:\/\//i.test(String(url).trim()) ? ' rel="nofollow noopener" target="_blank"' : "";
      return `<a href="${safeUrl}"${externalAttrs}>${label}</a>`;
    });
}

function isVisualDocument(markdown = "") {
  return /!\[[^\]]*]\([^)]+\)\{[^}]*\b(?:width|wrap|align|x|y|ratio)\s*=/i.test(String(markdown || ""));
}

const visualCanvasWidth = 776;
const visualLineHeight = 30;
const visualWrapGap = 18;

function readVisualImages(markdown = "") {
  const images = [];
  const regex = /!\[([^\]]*)\]\(([^)]+)\)(?:\{([^}]+)\})?/g;
  let match;
  while ((match = regex.exec(String(markdown || "")))) {
    const meta = parseImageAttrs(match[3] || "");
    images.push({
      alt: match[1] || "",
      url: match[2] || "",
      ...meta,
      height: Math.max(54, ((visualCanvasWidth * meta.width) / 100) / meta.ratio)
    });
  }
  return images;
}

function stripVisualImages(markdown = "") {
  return String(markdown || "")
    .replace(/\r\n/g, "\n")
    .replace(/!\[[^\]]*]\([^)]+\)(?:\{[^}]+\})?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function visualTokens(source = "") {
  const tokens = [];
  const matcher = /\n|[\u3400-\u9fff]|[^\s\u3400-\u9fff]+|[ \t]+/g;
  let match;
  while ((match = matcher.exec(String(source || "")))) {
    const token = match[0];
    tokens.push(/[ \t]+/.test(token) ? " " : token);
  }
  return tokens;
}

function visualTextWidth(value = "") {
  let width = 0;
  for (const char of String(value || "")) {
    if (char === " ") width += 5;
    else if (/[\u3400-\u9fff]/.test(char)) width += 16;
    else if (/[A-Z]/.test(char)) width += 9.2;
    else if (/[a-z0-9_]/.test(char)) width += 8.5;
    else if (/[\u3000-\u303f\uff00-\uffef]/.test(char)) width += 16;
    else width += 7.5;
  }
  return width;
}

function visualAllowedRanges(lineTop, images) {
  let ranges = [{ left: 0, right: visualCanvasWidth }];
  const lineBottom = lineTop + visualLineHeight;

  images.forEach((image) => {
    if (image.wrap === "inline") return;
    if (lineBottom <= image.y || lineTop >= image.y + image.height) return;
    if (image.wrap === "top-bottom") {
      ranges = [];
      return;
    }
    const imageLeft = (visualCanvasWidth * image.x) / 100;
    const imageRight = imageLeft + (visualCanvasWidth * image.width) / 100;
    ranges = subtractVisualRange(ranges, {
      left: Math.max(0, imageLeft - visualWrapGap),
      right: Math.min(visualCanvasWidth, imageRight + visualWrapGap)
    });
  });

  return ranges
    .map((range) => ({ left: Math.round(range.left), width: Math.round(range.right - range.left) }))
    .filter((range) => range.width >= 48);
}

function subtractVisualRange(ranges, cut) {
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

function takeVisualTokens(tokens, start, maxWidth) {
  let index = start;
  while (index < tokens.length && tokens[index] !== "\n" && !tokens[index].trim()) index += 1;
  let text = "";
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === "\n") break;
    const candidate = text + token;
    if (visualTextWidth(candidate) <= maxWidth || !text) {
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

function layoutVisualLines(source, images) {
  const tokens = visualTokens(source);
  const lines = [];
  let cursor = 0;
  let top = 0;
  let guard = 0;

  while (cursor < tokens.length && guard < 1800) {
    guard += 1;
    const line = { top, segments: [], reserved: false };

    if (tokens[cursor] === "\n") {
      line.reserved = true;
      lines.push(line);
      cursor += 1;
      top += visualLineHeight;
      continue;
    }

    const ranges = visualAllowedRanges(top, images);
    if (!ranges.length) {
      line.reserved = true;
      lines.push(line);
      top += visualLineHeight;
      continue;
    }

    for (const range of ranges) {
      if (cursor >= tokens.length || tokens[cursor] === "\n") break;
      const taken = takeVisualTokens(tokens, cursor, range.width);
      cursor = taken.end;
      if (!taken.text.trim()) continue;
      line.segments.push({ ...range, text: taken.text });
    }

    if (tokens[cursor] === "\n") cursor += 1;
    lines.push(line);
    top += visualLineHeight;
  }

  return lines;
}

function renderVisualCanvasImage(image) {
  const safeUrl = safeMarkdownUrl(image.url);
  if (!safeUrl) return "";
  const style = [
    "position:absolute",
    `left:${image.x}%`,
    `top:${image.y}px`,
    `width:${image.width}%`,
    `--md-image-ratio:${image.ratio}`,
    "margin:0",
    "z-index:2"
  ].join(";");
  return `<figure class="md-content-image md-content-image--visual" style="${escapeHtml(style)}"><img src="${safeUrl}" alt="${escapeHtml(image.alt)}" loading="lazy"></figure>`;
}

function visualMarkdownToHtml(markdown = "") {
  const images = readVisualImages(markdown);
  const text = stripVisualImages(markdown);
  const lines = layoutVisualLines(text, images);
  const textBottom = lines.reduce((max, line) => Math.max(max, line.top + visualLineHeight), 0);
  const imageBottom = images.reduce((max, image) => Math.max(max, image.y + image.height), 0);
  const height = Math.max(120, Math.ceil(Math.max(textBottom, imageBottom) + 40));
  const lineHtml = lines.flatMap((line, lineIndex) => {
    return line.segments.map((segment, segmentIndex) => {
      const style = [
        "position:absolute",
        `left:${((segment.left / visualCanvasWidth) * 100).toFixed(4)}%`,
        `top:${line.top}px`,
        `width:${((segment.width / visualCanvasWidth) * 100).toFixed(4)}%`,
        `line-height:${visualLineHeight}px`,
        "white-space:pre",
        "overflow:visible",
        "z-index:1"
      ].join(";");
      return `<span class="md-visual-segment" data-line="${lineIndex}" data-segment="${segmentIndex}" style="${escapeHtml(style)}">${escapeHtml(segment.text)}</span>`;
    });
  }).join("");
  return `<div class="md-visual-text" style="position:relative;min-height:${height}px;width:100%;max-width:${visualCanvasWidth}px;font-size:16px;line-height:${visualLineHeight}px">${lineHtml}${images.map(renderVisualCanvasImage).join("")}</div>`;
}

export function markdownToHtml(markdown = "") {
  if (isVisualDocument(markdown)) return visualMarkdownToHtml(markdown);

  const lines = String(markdown).replace(/\r\n/g, "\n").split("\n");
  const html = [];
  const positionedImages = [];
  let paragraph = [];
  let code = [];
  let list = null;
  let inCode = false;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!list?.items.length) return;
    html.push(`<${list.type}>${list.items.map((item) => `<li>${item}</li>`).join("")}</${list.type}>`);
    list = null;
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code = [];
        inCode = false;
      } else {
        flushParagraph();
        flushList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const imageOnly = line.match(/^!\[([^\]]*)\]\(([^)]+)\)(?:\{([^}]+)\})?$/);
    if (imageOnly) {
      flushParagraph();
      flushList();
      const attrs = imageOnly[3] || "";
      positionedImages.push({
        y: parseImageAttrs(attrs).y,
        html: renderMarkdownImage(imageOnly[1], imageOnly[2], attrs, true)
      });
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      html.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
      continue;
    }
    const unordered = line.match(/^\s*[-*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const type = unordered ? "ul" : "ol";
      if (list && list.type !== type) flushList();
      if (!list) list = { type, items: [] };
      list.items.push(inline((unordered || ordered)[1].trim()));
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  if (inCode) html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
  flushList();
  flushParagraph();
  return [
    ...positionedImages.sort((left, right) => left.y - right.y).map((image) => image.html),
    ...html
  ].join("\n");
}

export function stripMarkdown(markdown = "") {
  return String(markdown)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)(?:\{[^}]+})?/g, " ")
    .replace(/[#>*_`[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

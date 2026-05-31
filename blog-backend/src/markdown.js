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

export function markdownToHtml(markdown = "") {
  const lines = String(markdown).replace(/\r\n/g, "\n").split("\n");
  const html = [];
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
      html.push(renderMarkdownImage(imageOnly[1], imageOnly[2], imageOnly[3] || "", true));
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
  return html.join("\n");
}

export function stripMarkdown(markdown = "") {
  return String(markdown)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)(?:\{[^}]+})?/g, " ")
    .replace(/[#>*_`[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

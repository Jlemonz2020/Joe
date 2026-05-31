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

function imageAttributeHtml(value = "") {
  const attrs = String(value || "");
  const widthMatch = attrs.match(/(?:^|\s)width\s*=\s*["']?(\d{1,3})%?["']?/i);
  const alignMatch = attrs.match(/(?:^|\s)align\s*=\s*["']?(left|center|right|full)["']?/i);
  const style = [];
  const width = widthMatch ? Math.min(100, Math.max(20, Number.parseInt(widthMatch[1], 10))) : 100;
  const align = alignMatch?.[1]?.toLowerCase() || "full";
  style.push(`width:${width}%`, "height:auto");
  if (align === "center") style.push("display:block", "margin-left:auto", "margin-right:auto");
  if (align === "right") style.push("display:block", "margin-left:auto", "margin-right:0");
  if (align === "left") style.push("display:block", "margin-left:0", "margin-right:auto");
  return ` style="${escapeHtml(style.join(";"))}"`;
}

function inline(value) {
  return escapeHtml(value)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)(?:\{([^}]+)\})?/g, (_, alt, url, attrs) => {
      const safeUrl = safeMarkdownUrl(url);
      return safeUrl ? `<img src="${safeUrl}" alt="${escapeHtml(alt)}" loading="lazy"${imageAttributeHtml(attrs)}>` : escapeHtml(alt);
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

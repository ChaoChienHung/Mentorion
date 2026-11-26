import katex from "katex";
import "katex/dist/katex.min.css";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatWikiLink(rawInner: string): string {
  // Supports Nexus [[concept.foo_bar]] / [[doc.foo_bar]] and Obsidian [[Target|Alias]]
  if (rawInner.includes("|")) {
    const alias = rawInner.split("|")[1].trim();
    return `<span class="inline-block px-1.5 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-800 text-[0.9em] font-medium">${escapeHtml(alias)}</span>`;
  }
  const cleaned = rawInner
    .replace(/^(concept|doc)\./, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return `<span class="inline-block px-1.5 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-800 text-[0.9em] font-medium">${escapeHtml(cleaned)}</span>`;
}

function renderInline(text: string): string {
  const placeholders: string[] = [];

  let working = text.replace(/`([^`]+)`/g, (_m, code: string) => {
    const idx = placeholders.push(`<code>${escapeHtml(code)}</code>`) - 1;
    return `@@PH_${idx}@@`;
  });

  working = working.replace(/(?<!\\)\$([^\n$]+?)(?<!\\)\$/g, (full, expr: string) => {
    if (!expr.trim()) return full;
    const rendered = katex.renderToString(expr.trim(), {
      displayMode: false,
      throwOnError: false,
    });
    const idx = placeholders.push(rendered) - 1;
    return `@@PH_${idx}@@`;
  });

  working = working.replace(/\[\[([^\]]+)\]\]/g, (_m, inner: string) => {
    const idx = placeholders.push(formatWikiLink(inner)) - 1;
    return `@@PH_${idx}@@`;
  });

  let html = escapeHtml(working)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer" class="underline text-zinc-900">$1</a>',
    );

  html = html.replace(/@@PH_(\d+)@@/g, (_m, i) => placeholders[Number(i)] ?? "");
  return html;
}

/**
 * Unified Mentorion Markdown + KaTeX + [[wikilink]] renderer shared by Library
 * Reading Mode and the Calendar Revision Card so both views render identically.
 */
export function renderMentorionMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inCode = false;
  let codeLines: string[] = [];
  let inMath = false;
  let mathLines: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  const parseTableCells = (rowLine: string): string[] => {
    const stripped = rowLine.trim().replace(/^\|/, "").replace(/\|$/, "");
    return stripped.split("|").map((c) => c.trim());
  };

  const isTableSeparator = (rowLine: string): boolean => {
    const trimmedRow = rowLine.trim();
    if (!trimmedRow.includes("|")) return false;
    const cells = parseTableCells(trimmedRow);
    return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      closeList();
      if (inCode) {
        out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (trimmed.startsWith("$$") && trimmed.endsWith("$$") && trimmed.length > 4) {
      closeList();
      const expr = trimmed.slice(2, -2).trim();
      out.push(
        `<div class="my-4 overflow-x-auto">${katex.renderToString(expr, { displayMode: true, throwOnError: false })}</div>`,
      );
      continue;
    }
    if (trimmed === "$$") {
      closeList();
      if (inMath) {
        out.push(
          `<div class="my-4 overflow-x-auto">${katex.renderToString(mathLines.join("\n"), { displayMode: true, throwOnError: false })}</div>`,
        );
        mathLines = [];
        inMath = false;
      } else {
        inMath = true;
      }
      continue;
    }
    if (inMath) {
      mathLines.push(line);
      continue;
    }

    if (!trimmed) {
      closeList();
      continue;
    }

    // GFM Pipe Table (header row + separator row + body rows) wrapped in Lark-style scroll window
    if (
      trimmed.includes("|") &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      closeList();
      const headers = parseTableCells(trimmed);
      const sepCells = parseTableCells(lines[i + 1]);
      const aligns = sepCells.map((c) => {
        if (c.startsWith(":") && c.endsWith(":")) return "center";
        if (c.endsWith(":")) return "right";
        return "left";
      });
      i += 2;
      const bodyRows: string[][] = [];
      while (i < lines.length) {
        const r = lines[i].trim();
        if (!r || !r.includes("|")) {
          i -= 1;
          break;
        }
        bodyRows.push(parseTableCells(r));
        i += 1;
      }
      const theadHtml =
        "<thead><tr>" +
        headers
          .map(
            (h, idx) =>
              `<th style="text-align:${aligns[idx] || "left"}">${renderInline(h)}</th>`,
          )
          .join("") +
        "</tr></thead>";
      const tbodyHtml =
        "<tbody>" +
        bodyRows
          .map(
            (row) =>
              "<tr>" +
              headers
                .map(
                  (_h, idx) =>
                    `<td style="text-align:${aligns[idx] || "left"}">${renderInline(row[idx] ?? "")}</td>`,
                )
                .join("") +
              "</tr>",
          )
          .join("") +
        "</tbody>";
      out.push(`<div class="md-table-wrap"><table>${theadHtml}${tbodyHtml}</table></div>`);
      continue;
    }

    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      closeList();
      const level = hMatch[1].length;
      out.push(`<h${level}>${renderInline(hMatch[2])}</h${level}>`);
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      closeList();
      out.push("<hr />");
      continue;
    }

    if (trimmed.startsWith("> ")) {
      closeList();
      out.push(`<blockquote>${renderInline(trimmed.slice(2))}</blockquote>`);
      continue;
    }

    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (listType !== "ul") {
        closeList();
        out.push("<ul>");
        listType = "ul";
      }
      const indentLevel = Math.min(3, Math.floor(ulMatch[1].length / 2));
      const styleAttr = indentLevel > 0 ? ` style="margin-left:${indentLevel * 20}px;list-style-type:circle"` : "";
      out.push(`<li${styleAttr}>${renderInline(ulMatch[2])}</li>`);
      continue;
    }

    const olMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (olMatch) {
      const startNum = Number(olMatch[2]);
      if (listType !== "ol") {
        closeList();
        out.push(startNum !== 1 ? `<ol start="${startNum}">` : "<ol>");
        listType = "ol";
      }
      const indentLevel = Math.min(3, Math.floor(olMatch[1].length / 2));
      const styleAttr = indentLevel > 0 ? ` style="margin-left:${indentLevel * 20}px"` : "";
      out.push(`<li${styleAttr}>${renderInline(olMatch[3])}</li>`);
      continue;
    }

    // Indented continuation line inside an active list item (e.g., FAQ answer line under "1. Question")
    if (listType && /^\s{2,}/.test(line) && out.length > 0 && out[out.length - 1].endsWith("</li>")) {
      const prev = out.pop()!;
      out.push(prev.slice(0, -5) + `<div class="mt-1.5 font-normal text-zinc-600">${renderInline(trimmed)}</div></li>`);
      continue;
    }

    closeList();
    out.push(`<p>${renderInline(trimmed)}</p>`);
  }

  closeList();
  if (inCode && codeLines.length > 0) {
    out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }
  if (inMath && mathLines.length > 0) {
    out.push(
      `<div class="my-4 overflow-x-auto">${katex.renderToString(mathLines.join("\n"), { displayMode: true, throwOnError: false })}</div>`,
    );
  }
  return out.join("\n");
}

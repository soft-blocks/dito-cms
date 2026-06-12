import { z } from "zod";

// TipTap / ProseMirror rich-text handling. ISOMORPHIC — no React, no Hono, no DOM.
//
// The stored value of a rich_text field is `{ json, html }`. `json` is the TipTap
// document the editor produces; `html` is ALWAYS regenerated server-side from `json`
// by renderRichTextHtml() against the fixed allowlist below. Client HTML is never
// trusted → no stored XSS. We deliberately hand-roll the serializer instead of using
// `@tiptap/html` so it has zero DOM dependency and runs unchanged in workerd.
//
// Allowlist: paragraph, h2–h4, bullet/ordered lists, list items, blockquote,
// horizontal rule, hard break, plus the bold / italic / link marks. Anything else is
// dropped (its text content is preserved). Link protocols: http(s), mailto, tel, and
// relative (/path, #anchor); everything else (javascript:, data:, …) is stripped.

// --- doc shape (loose; structure validated, contents tolerated) --------------

export interface RichTextMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface RichTextNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
  marks?: RichTextMark[];
  text?: string;
}

export interface RichTextDoc {
  type: "doc";
  content?: RichTextNode[];
}

const markSchema: z.ZodType<RichTextMark> = z.object({
  type: z.string(),
  attrs: z.record(z.string(), z.unknown()).optional(),
});

const nodeSchema: z.ZodType<RichTextNode> = z.lazy(() =>
  z.object({
    type: z.string(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(nodeSchema).optional(),
    marks: z.array(markSchema).optional(),
    text: z.string().optional(),
  }),
);

export const richTextDocSchema: z.ZodType<RichTextDoc> = z.object({
  type: z.literal("doc"),
  content: z.array(nodeSchema).optional(),
});

/** An empty TipTap document — a single empty paragraph. */
export function emptyRichTextDoc(): RichTextDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/**
 * Build a TipTap document from plain text. Blank lines split paragraphs; single
 * newlines become hard breaks within a paragraph. Lets non-UI clients (the MCP
 * server) author rich_text fields by passing a string instead of a full doc.
 */
export function plainTextToDoc(text: string): RichTextDoc {
  const trimmed = text.replace(/\r\n/g, "\n").trim();
  if (trimmed === "") return emptyRichTextDoc();

  const paragraphs = trimmed.split(/\n{2,}/);
  const content: RichTextNode[] = paragraphs.map((para) => {
    const lines = para.split("\n");
    const inline: RichTextNode[] = [];
    lines.forEach((line, i) => {
      if (i > 0) inline.push({ type: "hardBreak" });
      if (line !== "") inline.push({ type: "text", text: line });
    });
    return { type: "paragraph", content: inline };
  });
  return { type: "doc", content };
}

// --- HTML serialization ------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** True for hrefs we are willing to emit. Relative links (/, #) are always allowed. */
export function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  if (trimmed === "") return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^mailto:/i.test(trimmed)) return true;
  if (/^tel:/i.test(trimmed)) return true;
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return true;
  return false;
}

function wrapMark(inner: string, mark: RichTextMark): string {
  switch (mark.type) {
    case "bold":
    case "strong":
      return `<strong>${inner}</strong>`;
    case "italic":
    case "em":
      return `<em>${inner}</em>`;
    case "link": {
      const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
      if (!isSafeHref(href)) return inner;
      const newTab = mark.attrs?.target === "_blank";
      const rel = newTab ? ' rel="noopener noreferrer nofollow"' : "";
      const target = newTab ? ' target="_blank"' : "";
      return `<a href="${escapeHtml(href.trim())}"${target}${rel}>${inner}</a>`;
    }
    default:
      // Unknown / disallowed mark (code, strike, …): keep text, drop the mark.
      return inner;
  }
}

function renderText(node: RichTextNode): string {
  let html = escapeHtml(node.text ?? "");
  const marks = node.marks ?? [];
  // Apply in reverse so the first mark in the array ends up outermost.
  for (let i = marks.length - 1; i >= 0; i--) {
    html = wrapMark(html, marks[i]);
  }
  return html;
}

function renderChildren(node: RichTextNode): string {
  return (node.content ?? []).map(renderNode).join("");
}

function renderNode(node: RichTextNode): string {
  switch (node.type) {
    case "text":
      return renderText(node);
    case "paragraph":
      return `<p>${renderChildren(node)}</p>`;
    case "heading": {
      const raw = typeof node.attrs?.level === "number" ? node.attrs.level : 2;
      const level = Math.min(Math.max(Math.round(raw), 2), 4);
      return `<h${level}>${renderChildren(node)}</h${level}>`;
    }
    case "bulletList":
      return `<ul>${renderChildren(node)}</ul>`;
    case "orderedList":
      return `<ol>${renderChildren(node)}</ol>`;
    case "listItem":
      return `<li>${renderChildren(node)}</li>`;
    case "blockquote":
      return `<blockquote>${renderChildren(node)}</blockquote>`;
    case "horizontalRule":
      return "<hr>";
    case "hardBreak":
      return "<br>";
    default:
      // Unknown node: drop the wrapper but keep any child content.
      return renderChildren(node);
  }
}

/**
 * Render a TipTap document to sanitized HTML. Throws a ZodError if the doc shape is
 * invalid. The output only ever contains tags from the allowlist; all text and
 * attribute values are escaped.
 */
export function renderRichTextHtml(doc: unknown): string {
  const parsed = richTextDocSchema.parse(doc);
  return (parsed.content ?? []).map(renderNode).join("");
}

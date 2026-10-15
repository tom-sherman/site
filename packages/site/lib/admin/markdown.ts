import "server-only";
import { type Node, parse } from "@markdoc/markdoc";

/** Blocks, which are separated by a blank line in the text. */
const BLOCKS = new Set([
  "paragraph",
  "heading",
  "fence",
  "item",
  "blockquote",
  "hr",
  "table",
  "tr",
]);

/**
 * A post's Markdown as plain text, for its document's `textContent`: the
 * words, without formatting. Code is kept; image alt text and Markdoc tags'
 * attributes aren't.
 */
export function plainText(markdown: string): string {
  return textOf(parse(markdown))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function textOf(node: Node): string {
  switch (node.type) {
    case "text":
    case "code":
      return String(node.attributes.content ?? "");
    case "fence":
      return `${String(node.attributes.content ?? "").trimEnd()}\n\n`;
    case "softbreak":
      return " ";
    case "hardbreak":
      return "\n";
    case "image":
      return "";
    case "td":
    case "th":
      return `${node.children.map(textOf).join("").trim()} `;
  }
  const text = node.children.map(textOf).join("");
  return BLOCKS.has(node.type) ? `${text.trimEnd()}\n\n` : text;
}

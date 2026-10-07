import { findAndReplace, type ReplaceFunction } from "mdast-util-find-and-replace";
import type { Blockquote, Emphasis, Image, Link, Nodes, Paragraph, PhrasingContent, Root, Text } from "mdast";
import { parseWikiTarget } from "./links";

export interface ObsidianOptions {
  /** Returns the vault path of a note, or null when the link is unresolved. */
  resolveNote: (target: string) => string | null;
  /** Builds the URL used to load an attachment referenced by the current note. */
  assetUrl: (target: string) => string;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg|ico)$/i;
const EXTERNAL_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;
const TAG = /(?<=^|[\s(,;])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;
const CALLOUT = /^\[!([\w-]+)\]([+-]?)[ \t]*(.*)$/;

/**
 * Adds Obsidian syntax on top of GFM: [[wiki links]], ![[embeds]], #tags,
 * ==highlights==, > [!callouts], vault-relative images and frontmatter.
 * It also tags top-level blocks with their source line (scroll sync) and
 * task items with their line (checkbox toggling from the preview).
 */
export function remarkObsidian(options: ObsidianOptions) {
  return (tree: Root) => {
    transformFrontmatter(tree);
    transformCallouts(tree);

    const wikiLink: ReplaceFunction = (_match: string, inner: string) => {
      const target = parseWikiTarget(inner);
      const resolved = target.note ? options.resolveNote(target.note) : null;
      const label = target.alias ?? (target.heading ? `${target.note || ""}${target.note ? " › " : ""}${target.heading}` : target.note);
      const link: Link = {
        type: "link",
        url: "",
        children: [{ type: "text", value: label }],
        data: {
          hProperties: {
            className: resolved || !target.note ? ["wikilink"] : ["wikilink", "is-unresolved"],
            dataWikiTarget: resolved ?? target.note,
            dataWikiHeading: target.heading ?? undefined,
          },
        },
      };
      return link;
    };

    const embed: ReplaceFunction = (match: string, inner: string) => {
      const target = parseWikiTarget(inner);
      if (!IMAGE_EXT.test(target.note)) {
        // Note embeds (transclusion) are rendered as a link to the note.
        const node = wikiLink(match, inner, { index: 0, input: match, stack: [] });
        if (node && typeof node === "object" && !Array.isArray(node) && node.type === "link") {
          (node.data!.hProperties as Record<string, unknown>).className = ["wikilink", "is-embed"];
        }
        return node;
      }
      const size = target.alias && /^\d+(x\d+)?$/.test(target.alias) ? target.alias.split("x") : null;
      const image: Image = {
        type: "image",
        url: options.assetUrl(target.note),
        alt: size ? target.note : (target.alias ?? target.note),
        data: { hProperties: { width: size?.[0], height: size?.[1] } },
      };
      return image;
    };

    // Not plain "text" nodes: find-and-replace merges adjacent text nodes and
    // would drop their `data`. Emphasis nodes are renamed through hName.
    const highlight: ReplaceFunction = (_match: string, inner: string): Emphasis => ({
      type: "emphasis",
      children: [{ type: "text", value: inner }],
      data: { hName: "mark" },
    });

    const tag: ReplaceFunction = (match: string, name: string): Emphasis => ({
      type: "emphasis",
      children: [{ type: "text", value: match }],
      data: { hName: "span", hProperties: { className: ["tag"], dataTag: name } },
    });

    findAndReplace(
      tree,
      [
        [/!\[\[([^\]\n]+?)\]\]/g, embed],
        [/\[\[([^\]\n]+?)\]\]/g, wikiLink],
        [/==([^=\n]+?)==/g, highlight],
        [TAG, tag],
      ],
      { ignore: ["link", "linkReference", "inlineCode", "code", "definition"] },
    );

    walk(tree, (node) => {
      if (node.type === "image" && !EXTERNAL_URL.test(node.url) && !node.url.startsWith("/")) {
        node.url = options.assetUrl(safeDecode(node.url));
      }
      if (node.type === "listItem" && typeof node.checked === "boolean" && node.position) {
        node.data = { ...node.data, hProperties: { ...node.data?.hProperties, dataTaskLine: node.position.start.line } };
      }
    });

    for (const child of tree.children) {
      if (!child.position) continue;
      child.data = { ...child.data, hProperties: { ...child.data?.hProperties, dataLine: child.position.start.line } };
    }
  };
}

function walk(node: Nodes, visit: (node: Nodes) => void): void {
  visit(node);
  if ("children" in node) {
    for (const child of node.children) walk(child as Nodes, visit);
  }
}

function safeDecode(url: string): string {
  try {
    return decodeURI(url);
  } catch {
    return url;
  }
}

function transformFrontmatter(tree: Root): void {
  const first = tree.children[0] as Nodes | undefined;
  if (first?.type !== "yaml") return;
  tree.children[0] = {
    type: "code",
    lang: "yaml",
    value: first.value,
    position: first.position,
    data: { hProperties: { className: ["frontmatter"] } },
  };
}

function transformCallouts(tree: Root): void {
  walk(tree, (node) => {
    if (node.type !== "blockquote") return;
    const quote = node as Blockquote;
    const paragraph = quote.children[0];
    if (paragraph?.type !== "paragraph") return;
    const text = paragraph.children[0];
    if (text?.type !== "text") return;

    const newline = text.value.indexOf("\n");
    const firstLine = newline === -1 ? text.value : text.value.slice(0, newline);
    const match = CALLOUT.exec(firstLine);
    if (!match) return;

    const kind = (match[1] ?? "note").toLowerCase();
    const titleText = match[3]?.trim() || kind.charAt(0).toUpperCase() + kind.slice(1);
    text.value = newline === -1 ? "" : text.value.slice(newline + 1);

    // Inline content after the marker on the same line (e.g. **bold** title) stays in the body.
    const titleChildren: PhrasingContent[] = [{ type: "text", value: titleText } as Text];
    const title: Paragraph = {
      type: "paragraph",
      children: titleChildren,
      data: { hProperties: { className: ["callout-title"] } },
    };
    if (text.value === "" && newline === -1) {
      paragraph.children.shift();
      // Drop the leading line break left after the marker.
      const next = paragraph.children[0];
      if (next?.type === "break") paragraph.children.shift();
    }
    if (paragraph.children.length === 0) quote.children.shift();
    quote.children.unshift(title);
    quote.data = {
      ...quote.data,
      hProperties: { ...quote.data?.hProperties, className: ["callout"], dataCallout: kind },
    };
  });
}

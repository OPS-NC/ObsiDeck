"use client";

import { forwardRef, memo, useDeferredValue, useMemo, type MouseEvent } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";
import { remarkObsidian } from "@/lib/markdown/remark-obsidian";
import { sanitizeSchema } from "@/lib/markdown/sanitize";
import { resolveWikiLink, type NoteIndex } from "@/lib/markdown/links";
import { assetUrl } from "@/lib/client/api";
import { resolveRelativePath } from "@/lib/client/paths";

export interface PreviewHandlers {
  onOpenNote: (path: string, heading?: string) => void;
  onMissingNote: (name: string) => void;
  onHeading: (heading: string) => void;
  onTag: (tag: string) => void;
  onToggleTask: (line: number) => void;
}

interface Props extends PreviewHandlers {
  content: string;
  path: string;
  noteIndex: NoteIndex;
  onScroll?: () => void;
}

const EXTERNAL = /^(?:https?:|mailto:|tel:)/i;

/**
 * Rendered Markdown (GFM + Obsidian syntax). Rendering is deferred so typing
 * in split mode stays responsive on long notes.
 */
export const MarkdownPreview = forwardRef<HTMLDivElement, Props>(function MarkdownPreview(
  { content, path, noteIndex, onScroll, ...handlers },
  ref,
) {
  const deferred = useDeferredValue(content);

  // Event delegation keeps the rendered tree free of per-node closures.
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const tag = target.closest<HTMLElement>("[data-tag]");
    if (tag?.dataset.tag) {
      event.preventDefault();
      handlers.onTag(tag.dataset.tag);
      return;
    }
    const anchor = target.closest<HTMLAnchorElement>("a");
    if (!anchor) return;

    if (anchor.dataset.wikiTarget !== undefined) {
      event.preventDefault();
      const heading = anchor.dataset.wikiHeading;
      const note = anchor.dataset.wikiTarget;
      if (!note) {
        if (heading) handlers.onHeading(heading);
      } else if (anchor.classList.contains("is-unresolved")) {
        handlers.onMissingNote(note);
      } else {
        handlers.onOpenNote(note, heading);
      }
      return;
    }

    const href = anchor.getAttribute("href") ?? "";
    if (href.startsWith("#")) {
      event.preventDefault();
      const id = decodeURIComponent(href.slice(1));
      const el = (event.currentTarget as HTMLElement).querySelector(`[id="${CSS.escape(id)}"]`);
      el?.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    if (!EXTERNAL.test(href) && href !== "") {
      // Relative Markdown link to another note: [text](Folder/Other%20note.md#Heading)
      event.preventDefault();
      const [rawPath, rawHeading] = href.split("#");
      const decoded = safeDecode(rawPath ?? "");
      const relative = resolveRelativePath(path, decoded);
      const resolved = resolveWikiLink(noteIndex, relative ?? decoded, path) ?? resolveWikiLink(noteIndex, decoded, path);
      if (resolved) handlers.onOpenNote(resolved, rawHeading ? safeDecode(rawHeading) : undefined);
      else handlers.onMissingNote(decoded.replace(/\.md$/i, ""));
    }
  };

  const onChange = (event: React.ChangeEvent<HTMLDivElement>) => {
    const input = event.target as unknown as HTMLInputElement;
    if (input.type !== "checkbox") return;
    const line = Number(input.closest<HTMLElement>("[data-task-line]")?.dataset.taskLine);
    if (line > 0) handlers.onToggleTask(line);
  };

  return (
    <div ref={ref} onScroll={onScroll} className="scroll-thin h-full overflow-y-auto" onClick={onClick} onChange={onChange}>
      <RenderedMarkdown content={deferred} path={path} noteIndex={noteIndex} />
    </div>
  );
});

const components: Components = {
  a: ({ node: _node, href, children, ...rest }) => {
    const external = href ? EXTERNAL.test(href) : false;
    return (
      <a href={href} {...rest} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {children}
      </a>
    );
  },
  input: ({ node: _node, ...rest }) =>
    rest.type === "checkbox" ? <input type="checkbox" checked={Boolean(rest.checked)} onChange={() => {}} /> : null,
  img: ({ node: _node, alt, ...rest }) => <img alt={alt ?? ""} loading="lazy" decoding="async" {...rest} />,
};

const RenderedMarkdown = memo(function RenderedMarkdown({
  content,
  path,
  noteIndex,
}: {
  content: string;
  path: string;
  noteIndex: NoteIndex;
}) {
  const remarkPlugins = useMemo<Options["remarkPlugins"]>(
    () => [
      remarkFrontmatter,
      remarkGfm,
      [
        remarkObsidian,
        {
          resolveNote: (target: string) => resolveWikiLink(noteIndex, target, path),
          assetUrl: (target: string) => assetUrl(target, path),
        },
      ],
    ],
    [noteIndex, path],
  );

  return (
    <article className="markdown">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
        urlTransform={defaultUrlTransform}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
});

const rehypePlugins: Options["rehypePlugins"] = [
  rehypeRaw,
  [rehypeSanitize, sanitizeSchema],
  rehypeSlug,
  [rehypeHighlight, { detect: false, plainText: ["txt", "text", "plain"] }],
];

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

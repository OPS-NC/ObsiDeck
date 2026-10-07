import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { remarkObsidian } from "@/lib/markdown/remark-obsidian";
import { sanitizeSchema } from "@/lib/markdown/sanitize";
import { buildNoteIndex, parseWikiTarget, resolveWikiLink } from "@/lib/markdown/links";

const index = buildNoteIndex(["Welcome.md", "Projects/Infra/Kubernetes.md", "Projects/Notes.md", "Archive/Notes.md"]);

function render(md: string, from = "Welcome.md") {
  const opts = {
    resolveNote: (t: string) => resolveWikiLink(index, t, from),
    assetUrl: (t: string) => `/obsideck/api/asset?path=${encodeURIComponent(t)}`,
  };
  return renderToStaticMarkup(
    <ReactMarkdown
      remarkPlugins={[remarkFrontmatter, remarkGfm, [remarkObsidian, opts]]}
      rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
    >
      {md}
    </ReactMarkdown>,
  );
}

describe("wiki links", () => {
  it("parses targets, headings and aliases", () => {
    expect(parseWikiTarget("Note#Title|Alias")).toEqual({ note: "Note", heading: "Title", alias: "Alias" });
    expect(parseWikiTarget("#Only heading")).toEqual({ note: "", heading: "Only heading", alias: null });
  });

  it("resolves by path, by name and prefers the same folder", () => {
    expect(resolveWikiLink(index, "Kubernetes", null)).toBe("Projects/Infra/Kubernetes.md");
    expect(resolveWikiLink(index, "projects/infra/kubernetes.md", null)).toBe("Projects/Infra/Kubernetes.md");
    expect(resolveWikiLink(index, "Notes", "Archive/Other.md")).toBe("Archive/Notes.md");
    expect(resolveWikiLink(index, "Missing", null)).toBeNull();
  });

  it("renders resolved, aliased and unresolved links", () => {
    const html = render("[[Kubernetes]] [[Kubernetes#Cluster|K8s]] [[Nope]]");
    expect(html).toContain('data-wiki-target="Projects/Infra/Kubernetes.md"');
    expect(html).toContain('data-wiki-heading="Cluster"');
    expect(html).toContain(">K8s</a>");
    expect(html).toContain('class="wikilink is-unresolved"');
  });
});

describe("obsidian syntax", () => {
  it("renders tags, highlights and image embeds", () => {
    const html = render("#devops ==important== ![[diagram.png|300]] issue #123");
    expect(html).toContain('<span class="tag" data-tag="devops">#devops</span>');
    expect(html).toContain("<mark>important</mark>");
    expect(html).toContain('src="/obsideck/api/asset?path=diagram.png"');
    expect(html).toContain('width="300"');
    expect(html).not.toContain('data-tag="123"');
  });

  it("renders callouts", () => {
    const html = render("> [!warning] Careful\n> Body text");
    expect(html).toContain('class="callout" data-callout="warning"');
    expect(html).toContain('<p class="callout-title">Careful</p>');
    expect(html).toContain("Body text");
  });

  it("keeps task line numbers and frontmatter", () => {
    const html = render("---\ntags: [a]\n---\n\n- [ ] one\n- [x] two");
    expect(html).toContain('data-task-line="5"');
    expect(html).toContain('class="frontmatter"');
  });

  it("does not transform syntax inside code", () => {
    const html = render("`[[Kubernetes]] #tag`");
    expect(html).not.toContain("wikilink");
    expect(html).not.toContain('class="tag"');
  });
});

describe("sanitization", () => {
  it("strips scripts, event handlers and javascript: URLs", () => {
    const html = render('<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">x</a>');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
  });
});

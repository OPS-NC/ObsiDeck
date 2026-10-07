import { EditorSelection, type Extension, type StateCommand } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";

/** Colors come from CSS variables so light/dark switching needs no reconfiguration. */
export const markdownHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.heading1, fontWeight: "700", fontSize: "1.3em", color: "var(--fg)" },
    { tag: t.heading2, fontWeight: "680", fontSize: "1.18em", color: "var(--fg)" },
    { tag: t.heading3, fontWeight: "650", fontSize: "1.08em", color: "var(--fg)" },
    { tag: [t.heading4, t.heading5, t.heading6], fontWeight: "640", color: "var(--fg)" },
    { tag: t.strong, fontWeight: "700" },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: t.strikethrough, textDecoration: "line-through", color: "var(--fg-muted)" },
    { tag: t.link, color: "var(--accent-text)" },
    { tag: t.url, color: "var(--fg-subtle)", textDecoration: "underline" },
    { tag: t.quote, color: "var(--fg-muted)", fontStyle: "italic" },
    { tag: t.monospace, color: "var(--syn-variable)" },
    { tag: [t.processingInstruction, t.meta], color: "var(--fg-subtle)" },
    { tag: t.list, color: "var(--accent-text)" },
    { tag: t.contentSeparator, color: "var(--fg-subtle)" },
    { tag: [t.keyword, t.operatorKeyword, t.modifier], color: "var(--syn-keyword)" },
    { tag: [t.string, t.special(t.string), t.regexp], color: "var(--syn-string)" },
    { tag: [t.number, t.bool, t.null, t.atom], color: "var(--syn-number)" },
    { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--syn-comment)", fontStyle: "italic" },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--syn-function)" },
    { tag: [t.typeName, t.className, t.namespace], color: "var(--syn-type)" },
    { tag: [t.propertyName, t.attributeName], color: "var(--syn-variable)" },
    { tag: [t.tagName, t.angleBracket], color: "var(--syn-keyword)" },
    { tag: t.invalid, color: "var(--danger)" },
  ]),
);

export const editorTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "14.5px", backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.7",
    overflow: "auto",
    scrollbarWidth: "thin",
    scrollbarColor: "var(--border-strong) transparent",
  },
  ".cm-content": {
    caretColor: "var(--accent)",
    padding: "28px 0 40vh",
    maxWidth: "820px",
    margin: "0 auto",
    width: "100%",
  },
  ".cm-line": { padding: "0 32px" },
  "@media (max-width: 767px)": {
    "&": { fontSize: "15px" },
    ".cm-content": { paddingTop: "18px" },
    ".cm-line": { padding: "0 18px" },
  },
  ".cm-wikilink": {
    color: "var(--accent-text)",
    backgroundColor: "var(--accent-soft)",
    borderRadius: "3px",
  },
  ".cm-tag-token": { color: "var(--accent-text)" },
  ".cm-highlight-token": { backgroundColor: "var(--mark)", borderRadius: "2px" },
  "&.cm-mod-down .cm-wikilink": { cursor: "pointer", textDecoration: "underline" },
});

function decorator(regexp: RegExp, className: string) {
  return new MatchDecorator({ regexp, decoration: Decoration.mark({ class: className }) });
}

const obsidianDecorators = [
  decorator(/!?\[\[[^\]\n]+\]\]/g, "cm-wikilink"),
  decorator(/(?<=^|[\s(])#[\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*/gu, "cm-tag-token"),
  decorator(/==[^=\n]+==/g, "cm-highlight-token"),
];

/** Highlights [[wiki links]], #tags and ==highlights== which lezer-markdown does not know about. */
export const obsidianSyntax: Extension = obsidianDecorators.map((d) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = d.createDeco(view);
      }
      update(update: ViewUpdate) {
        this.decorations = d.updateDeco(update, this.decorations);
      }
    },
    { decorations: (v) => v.decorations },
  ),
);

/** Adds a class while Cmd/Ctrl is held so wiki links look clickable. */
export const modifierClass: Extension = ViewPlugin.fromClass(
  class {
    private readonly onKey: (e: KeyboardEvent) => void;
    private readonly onBlur: () => void;
    constructor(private readonly view: EditorView) {
      this.onKey = (e) => view.dom.classList.toggle("cm-mod-down", e.metaKey || e.ctrlKey);
      this.onBlur = () => view.dom.classList.remove("cm-mod-down");
      window.addEventListener("keydown", this.onKey);
      window.addEventListener("keyup", this.onKey);
      window.addEventListener("blur", this.onBlur);
    }
    destroy() {
      window.removeEventListener("keydown", this.onKey);
      window.removeEventListener("keyup", this.onKey);
      window.removeEventListener("blur", this.onBlur);
    }
  },
);

/** Cmd/Ctrl+click on [[link]] follows it. */
export function followWikiLinks(onFollow: (target: string) => void): Extension {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      if (!(event.metaKey || event.ctrlKey) || event.button !== 0) return false;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;
      const line = view.state.doc.lineAt(pos);
      const re = /\[\[([^\]\n]+)\]\]/g;
      for (let m = re.exec(line.text); m; m = re.exec(line.text)) {
        const from = line.from + m.index;
        if (pos >= from && pos <= from + m[0].length) {
          event.preventDefault();
          onFollow(m[1] ?? "");
          return true;
        }
      }
      return false;
    },
  });
}

/** Wraps the selection(s) with a marker, or removes it when already wrapped. */
export function toggleWrap(marker: string): StateCommand {
  return ({ state, dispatch }) => {
    const len = marker.length;
    const tr = state.changeByRange((range) => {
      const before = state.sliceDoc(range.from - len, range.from);
      const after = state.sliceDoc(range.to, range.to + len);
      if (before === marker && after === marker) {
        return {
          changes: [
            { from: range.from - len, to: range.from, insert: "" },
            { from: range.to, to: range.to + len, insert: "" },
          ],
          range: EditorSelection.range(range.from - len, range.to - len),
        };
      }
      return {
        changes: [
          { from: range.from, insert: marker },
          { from: range.to, insert: marker },
        ],
        range: EditorSelection.range(range.from + len, range.to + len),
      };
    });
    dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input" }));
    return true;
  };
}

/** Autocompletes note names after "[[". */
export function wikiLinkCompletion(getNotes: () => string[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/\[\[[^\]\n|#]*/);
    if (!match) return null;
    const notes = getNotes();
    return {
      from: match.from + 2,
      validFor: /^[^\]\n|#]*$/,
      options: notes.map((path) => {
        const name = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, "");
        const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
        return {
          label: name,
          detail: folder,
          apply: (view: EditorView, _c: unknown, from: number, to: number) => {
            const hasClosing = view.state.sliceDoc(to, to + 2) === "]]";
            const insert = hasClosing ? name : `${name}]]`;
            view.dispatch({
              changes: { from, to, insert },
              selection: { anchor: from + name.length + 2 },
            });
          },
        };
      }),
    };
  };
}

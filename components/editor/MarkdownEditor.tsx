"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Annotation, Compartment, EditorSelection, EditorState } from "@codemirror/state";
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentOnInput, indentUnit } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap } from "@codemirror/search";
import {
  editorTheme,
  followWikiLinks,
  markdownHighlight,
  modifierClass,
  obsidianSyntax,
  toggleWrap,
  wikiLinkCompletion,
} from "./extensions";

const externalUpdate = Annotation.define<boolean>();

export interface EditorHandle {
  focus: () => void;
  openSearch: () => void;
  scrollToLine: (line: number, select?: boolean) => void;
  /** First visible source line (1-based) and the fraction of it scrolled past. */
  topLine: () => { line: number; fraction: number } | null;
  /** Scrolls so that `line` (1-based, fractional) is at the top of the viewport. */
  setTopLine: (line: number) => void;
  /** Finds the 1-based line of a Markdown heading by its text. */
  findHeading: (heading: string) => number | null;
}

interface Props {
  initialContent: string;
  /** When it changes, the editor content is replaced with `content`. */
  epoch: number;
  content: string;
  lineNumbers: boolean;
  onChange: (text: string) => void;
  onSave: () => void;
  onFollowLink: (target: string) => void;
  getNotes: () => string[];
  onScroll?: () => void;
}

/**
 * CodeMirror 6 Markdown editor. Uncontrolled for performance: the document
 * lives in CodeMirror and is reported through onChange; external
 * replacements (reload from disk, task toggles) are pushed via `epoch`.
 */
export const MarkdownEditor = forwardRef<EditorHandle, Props>(function MarkdownEditor(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const gutter = useRef(new Compartment());
  const callbacks = useRef(props);
  callbacks.current = props;

  useEffect(() => {
    if (!host.current) return;
    const cb = () => callbacks.current;
    const state = EditorState.create({
      doc: props.initialContent,
      extensions: [
        gutter.current.of(props.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        indentUnit.of("    "),
        EditorState.tabSize.of(4),
        bracketMatching(),
        closeBrackets(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search({ top: true }),
        autocompletion({ override: [wikiLinkCompletion(() => cb().getNotes())], icons: false }),
        markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true }),
        markdownHighlight,
        obsidianSyntax,
        editorTheme,
        modifierClass,
        followWikiLinks((target) => cb().onFollowLink(target)),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ spellcheck: "true", autocapitalize: "sentences", "aria-label": "Note editor" }),
        keymap.of([
          { key: "Mod-s", preventDefault: true, run: () => (cb().onSave(), true) },
          { key: "Mod-b", run: toggleWrap("**") },
          { key: "Mod-i", run: toggleWrap("*") },
          { key: "Mod-Shift-x", run: toggleWrap("~~") },
          { key: "Mod-e", run: toggleWrap("`") },
          ...closeBracketsKeymap,
          ...completionKeymap,
          ...searchKeymap,
          ...historyKeymap,
          indentWithTab,
          ...defaultKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !update.transactions.some((tr) => tr.annotation(externalUpdate))) {
            cb().onChange(update.state.doc.toString());
          }
        }),
        EditorView.domEventHandlers({
          scroll: () => cb().onScroll?.(),
        }),
      ],
    });
    const v = new EditorView({ state, parent: host.current });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // Created once per note: the parent keys this component by path.
  }, []);

  useEffect(() => {
    view.current?.dispatch({
      effects: gutter.current.reconfigure(props.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
    });
  }, [props.lineNumbers]);

  // Apply external content replacements as a minimal diff, preserving cursor and undo history.
  useEffect(() => {
    const v = view.current;
    if (!v || props.epoch === 0) return;
    const current = v.state.doc.toString();
    const next = props.content;
    if (current === next) return;
    let start = 0;
    while (start < current.length && start < next.length && current[start] === next[start]) start++;
    let endA = current.length;
    let endB = next.length;
    while (endA > start && endB > start && current[endA - 1] === next[endB - 1]) {
      endA--;
      endB--;
    }
    v.dispatch({
      changes: { from: start, to: endA, insert: next.slice(start, endB) },
      annotations: externalUpdate.of(true),
    });
  }, [props.epoch]);

  useImperativeHandle(ref, () => ({
    focus: () => view.current?.focus(),
    openSearch: () => {
      if (!view.current) return;
      view.current.focus();
      openSearchPanel(view.current);
    },
    scrollToLine: (line, select = true) => {
      const v = view.current;
      if (!v) return;
      const target = v.state.doc.line(Math.max(1, Math.min(line, v.state.doc.lines)));
      v.dispatch({
        selection: select ? EditorSelection.cursor(target.from) : undefined,
        effects: EditorView.scrollIntoView(target.from, { y: "start", yMargin: 24 }),
      });
    },
    topLine: () => {
      const v = view.current;
      if (!v) return null;
      const height = v.scrollDOM.getBoundingClientRect().top - v.documentTop;
      const block = v.lineBlockAtHeight(Math.max(0, height));
      const fraction = block.height > 0 ? Math.min(1, Math.max(0, (height - block.top) / block.height)) : 0;
      return { line: v.state.doc.lineAt(block.from).number, fraction };
    },
    setTopLine: (lineFloat) => {
      const v = view.current;
      if (!v) return;
      const n = Math.max(1, Math.min(Math.floor(lineFloat), v.state.doc.lines));
      const block = v.lineBlockAt(v.state.doc.line(n).from);
      const offset = v.documentTop - v.scrollDOM.getBoundingClientRect().top + v.scrollDOM.scrollTop;
      v.scrollDOM.scrollTop = offset + block.top + block.height * (lineFloat - Math.floor(lineFloat));
    },
    findHeading: (heading) => {
      const v = view.current;
      if (!v) return null;
      const wanted = heading.trim().toLowerCase();
      for (let i = 1; i <= v.state.doc.lines; i++) {
        const m = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(v.state.doc.line(i).text);
        if (m && m[1]?.toLowerCase() === wanted) return i;
      }
      return null;
    },
  }));

  return <div ref={host} className="h-full min-h-0" />;
});

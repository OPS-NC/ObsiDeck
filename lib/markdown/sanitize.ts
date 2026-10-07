import { defaultSchema } from "rehype-sanitize";
import type { Options as SanitizeSchema } from "rehype-sanitize";

const base = defaultSchema.attributes ?? {};

/**
 * GitHub-like sanitization (raw HTML in notes is allowed but scripts, event
 * handlers and javascript: URLs are stripped), extended with the attributes
 * produced by remarkObsidian.
 */
export const sanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "mark", "u", "abbr", "kbd", "sub", "sup", "details", "summary"],
  attributes: {
    ...base,
    "*": [...(base["*"] ?? []), "className", "dataLine"],
    a: [...(base.a ?? []).filter((a) => !(Array.isArray(a) && a[0] === "className")), "className", "dataWikiTarget", "dataWikiHeading", "title"],
    img: [...(base.img ?? []), "alt", "title", "width", "height"],
    span: ["className", "dataTag"],
    blockquote: [...(base.blockquote ?? []), "className", "dataCallout"],
    li: ["className", "dataTaskLine", "dataLine"],
    input: [["type", "checkbox"], "checked", "disabled"],
    code: [["className", /^language-./, "frontmatter"]],
    pre: ["className", "dataLine"],
    details: ["open"],
  },
};

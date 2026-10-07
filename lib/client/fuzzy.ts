/**
 * Small fuzzy matcher for quick open: subsequence match, rewarding
 * consecutive characters, word starts and matches in the file name.
 * Returns null when `query` is not a subsequence of `target`.
 */
export function fuzzyScore(query: string, target: string): { score: number; positions: number[] } | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (q.length === 0) return { score: 0, positions: [] };

  const nameStart = target.lastIndexOf("/") + 1;
  const positions: number[] = [];
  let score = 0;
  let ti = 0;
  let prev = -2;

  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    if (ch === " ") continue;
    const found = t.indexOf(ch!, ti);
    if (found === -1) return null;
    positions.push(found);

    let bonus = 1;
    if (found === prev + 1) bonus += 4;
    const before = target[found - 1];
    if (found === 0 || before === "/" || before === " " || before === "-" || before === "_" || before === ".") bonus += 3;
    if (found >= nameStart) bonus += 2;
    score += bonus;
    prev = found;
    ti = found + 1;
  }

  // Prefer exact substring matches in the name and shorter paths.
  const name = t.slice(nameStart);
  if (name.includes(q)) score += 10;
  if (name.startsWith(q)) score += 6;
  score -= target.length * 0.02;
  return { score, positions };
}

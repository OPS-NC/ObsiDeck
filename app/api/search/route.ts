import { NextResponse } from "next/server";
import { getContext } from "@/lib/server/context";
import { noStore, withErrors } from "@/lib/server/http";
import { searchQuerySchema } from "@/lib/server/schemas";

export const dynamic = "force-dynamic";

/** GET /api/search?q=…&limit=… — full-text search over note names and contents. */
export const GET = withErrors(async (req) => {
  const { q, limit } = searchQuerySchema.parse({
    q: req.nextUrl.searchParams.get("q") ?? "",
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
  });
  const ctx = await getContext();
  const snapshot = await ctx.snapshot();
  const result = await ctx.search.search(snapshot.notes, q, limit);
  return NextResponse.json(result, { headers: noStore });
});

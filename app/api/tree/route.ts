import { NextResponse } from "next/server";
import { getContext } from "@/lib/server/context";
import { noStore, withErrors } from "@/lib/server/http";
import type { TreeResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const ctx = await getContext();
  const snapshot = await ctx.snapshot();
  const body: TreeResponse = { vaultName: ctx.displayName, root: snapshot.root };
  return NextResponse.json(body, { headers: noStore });
});

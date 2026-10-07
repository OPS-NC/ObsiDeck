import { BASE_PATH } from "@/lib/client/api";

/** Home page, shown when no note is open. */
export function EmptyState() {
  return (
    <div className="animate-fade-in flex h-full select-none flex-col items-center justify-center gap-2 pb-[8vh] text-center">
      <img
        src={`${BASE_PATH}/logo.webp`}
        alt=""
        width={88}
        height={88}
        className="mb-3 size-[88px] rounded-[22px] shadow-pop"
        draggable={false}
      />
      <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-fg/90">ObsiDeck</h1>
      <p className="text-[13.5px] text-subtle">A web interface for Obsidian</p>
    </div>
  );
}

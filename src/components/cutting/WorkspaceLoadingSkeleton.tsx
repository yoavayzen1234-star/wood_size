/** שלדי טעינה — אותם צבעי stone כמו הממשק, בלי שינוי מבנה כללי */
export function ProjectsStripSkeleton() {
  return (
    <div
      className="flex w-full min-w-0 flex-col rounded-xl border border-stone-300/90 bg-gradient-to-b from-stone-200 to-stone-300/95 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
      aria-hidden
    >
      <div className="flex min-h-[2.5rem] items-center gap-2 px-2" dir="rtl">
        <div className="h-9 w-28 shrink-0 animate-pulse rounded-lg bg-stone-400/40" />
        <div className="h-9 w-24 shrink-0 animate-pulse rounded-lg bg-stone-400/30" />
        <div className="size-8 shrink-0 animate-pulse rounded-lg bg-stone-400/35" />
      </div>
    </div>
  )
}

export function EditorColumnSkeleton() {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="mb-3 h-5 w-36 animate-pulse rounded bg-stone-200" />
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 w-full animate-pulse rounded-lg bg-stone-100" />
        ))}
      </div>
    </div>
  )
}

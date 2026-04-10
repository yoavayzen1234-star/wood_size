import { memo } from 'react'

export const AppHeader = memo(function AppHeader({
  welcomeName,
  onSignOut,
  offline,
}: {
  welcomeName: string
  onSignOut: () => void
  offline?: boolean
}) {
  return (
    <header className="no-print border-b border-stone-200 bg-white/90 backdrop-blur">
      {offline ? (
        <div
          className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950"
          role="status"
        >
          אין חיבור לאינטרנט — העבודה נשמרת במכשיר ותיסנכרן עם השרת כשהחיבור יחזור.
        </div>
      ) : null}
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-start justify-between gap-3 px-4 py-3 sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
          <img
            src="/logo.png"
            alt=""
            width={44}
            height={44}
            className="h-11 w-11 shrink-0 rounded-xl border border-stone-200 bg-white object-contain p-0.5 shadow-sm"
          />
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-stone-900 md:text-2xl">
              מחשבון חיתוך ורשימת קניות
            </h1>
            <p className="mt-0.5 text-xs text-stone-600">ברוכים הבאים {welcomeName}</p>
          </div>
        </div>
        <div className="no-print">
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 shadow-sm hover:bg-stone-50"
          >
            התנתקות
          </button>
        </div>
      </div>
    </header>
  )
})

import { memo } from 'react'

export const AppHeader = memo(function AppHeader({
  welcomeName,
  onSignOut,
}: {
  welcomeName: string
  onSignOut: () => void
}) {
  return (
    <header className="no-print border-b border-stone-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-start justify-between gap-3 px-4 py-3 sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight text-stone-900 md:text-2xl">
            מחשבון חיתוך ורשימת קניות
          </h1>
          <p className="mt-0.5 text-xs text-stone-600">ברוכים הבאים {welcomeName}</p>
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

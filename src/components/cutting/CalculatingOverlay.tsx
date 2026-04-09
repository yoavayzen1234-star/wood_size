import { memo } from 'react'
import { Loader2 } from 'lucide-react'

export const CalculatingOverlay = memo(function CalculatingOverlay({ open }: { open: boolean }) {
  if (!open) return null
  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-stone-900/25 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-4 rounded-2xl border border-stone-200 bg-white px-8 py-6 shadow-xl">
        <Loader2 className="size-10 animate-spin text-stone-600" aria-hidden />
        <div>
          <p className="font-semibold text-stone-900">מחשב פתרון אופטימלי</p>
          <p className="text-sm text-stone-600">ניתוח תבניות חיתוך — החישוב רץ ברקע כדי שלא ייקפא המסך.</p>
        </div>
      </div>
    </div>
  )
})

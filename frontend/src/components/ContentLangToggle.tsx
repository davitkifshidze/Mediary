import { cn } from '@/lib/utils'

export type ContentLang = 'ka' | 'en'

/** კონტენტის ენის ლოკალური გადამრთველი (ქა/EN) — თარგმანად ქარდზე */
export function ContentLangToggle({
  value,
  onChange,
}: {
  value: ContentLang
  onChange: (v: ContentLang) => void
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-border">
      {(['ka', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          className={cn(
            'cursor-pointer px-2.5 py-1 text-xs font-semibold uppercase transition-colors',
            value === l ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted',
          )}
        >
          {l === 'ka' ? 'ქა' : 'EN'}
        </button>
      ))}
    </div>
  )
}

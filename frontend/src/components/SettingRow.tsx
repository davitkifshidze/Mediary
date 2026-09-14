import { type ReactNode } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/* ============================================================
   პარამეტრის ერთი რიგი — ლეიბლი + აღწერა მარცხნივ, კონტროლი მარჯვნივ.
   იყო `SettingsPage`-ის ლოკალური; L2-ის შემდეგ „პაუზა ჩანაწერებს შორის"
   `/sync`-ზე გადავიდა, ე.ი. ორივე გვერდს სჭირდება.
   ============================================================ */

export function SettingRow({
  label,
  hint,
  dirty,
  children,
}: {
  label: string
  hint?: string
  /** შეცვლილია და ჯერ არ შენახულა (Tasks 3) */
  dirty?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          {label}
          {dirty && <span className="size-1.5 shrink-0 rounded-md bg-primary" title={label} />}
        </div>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="w-40 shrink-0">{children}</div>
    </div>
  )
}

export function NumberSelect({
  value,
  options,
  onChange,
  labelOf,
}: {
  value: number
  options: number[]
  onChange: (v: number) => void
  labelOf?: (v: number) => string
}) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={String(o)}>
            {labelOf ? labelOf(o) : String(o)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

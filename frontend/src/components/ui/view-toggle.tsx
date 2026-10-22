import { LayoutGrid, LayoutPanelTop, Rows3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { RecordLayout } from '@/lib/recordLayout'
import { cn } from '@/lib/utils'

/* ============================================================
   **ხედის გადამრთველი — ბარათები · ბადე · სტრიქონები**.

   შენი სიტყვები: „უნდა იყოს გადამრთველი სხვადასხვა მოდულში … რომ დალაგდეს
   კვადრატებად, გრიდებად, როუებად — როგორც გინდა".

   ⚠️ **გალერეის `LayoutToggle`-ის ფორმით** (სეგმენტები, აიქონი + ტექსტი),
   ოღონდ `h-10` — `PageHeader`-ის ზოლის სხვა კონტროლების (ძებნა, დალაგება,
   ფილტრი, ღილაკები) სიმაღლე; `h-9` მხოლოდ ჩანაწერის მოქმედებების რიგისაა.
   ტექსტი არ იმალება: მარტო აიქონი „სამი კვადრატი თუ ოთხი?"-ს გამოსაცნობს ტოვებდა.

   ⚠️ **`transition-transform` აქ განზრახ არაა** — `index.css`-ის გლობალური
   წესი ხატულებს hover-ზე ამოძრავებს და ამ კლასს ოპტ-აუტად კითხულობს.
   ============================================================ */

const MODES: { key: RecordLayout; icon: typeof Rows3 }[] = [
  { key: 'cards', icon: LayoutPanelTop },
  { key: 'grid', icon: LayoutGrid },
  { key: 'rows', icon: Rows3 },
]

export function ViewToggle({
  value,
  onChange,
  className,
}: {
  value: RecordLayout
  onChange: (next: RecordLayout) => void
  className?: string
}) {
  const { t } = useTranslation()

  return (
    <div
      role="group"
      aria-label={t('view.label')}
      className={cn('flex h-10 items-center gap-0.5 rounded-md border border-border p-0.5', className)}
      data-testid="view-toggle"
    >
      {MODES.map(({ key, icon: Icon }) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={cn(
            'flex h-full cursor-pointer items-center gap-1.5 rounded-[3px] px-2.5 text-xs transition-colors',
            value === key ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="size-3.5" />
          {t(`view.${key}`)}
        </button>
      ))}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { ICON_GROUPS, ICON_NAMES, ModuleIcon, iconId } from '@/components/ModuleIcon'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/* ============================================================
   **ხატულის ამრჩევი — ერთი კომპონენტი შვიდივე ლექსიკონისთვის (Tasks §1.6).**

   აქამდე ზუსტად ეს ბადე **შვიდჯერ** ეწერა ხელით (`StatusDialog`,
   `VideoTypeDialog` და ხუთი ჟანრის/კატეგორიის დიალოგი) — სიმბოლო-სიმბოლოზე
   ერთნაირად. შედეგად „ამრჩევს დაემატოს ჯგუფები" შვიდ ფაილში შესატანი
   ცვლილება იყო და ერთი დავიწყებული ასლი იმას ნიშნავდა, რომ ერთ ლექსიკონში
   ხატულების სია მეორისგან განსხვავებული იქნებოდა.

   ორი დონე ჩანს და ორივე საჭიროა:

   · **ჯგუფები** — ~90 ხელით შერჩეული, აზრიანად დაჯგუფებული ხატულა
     (`ICON_GROUPS`). ეს ნაგულისხმევი ხედია: ნაყარი 90 ცალი ისეთივე
     უსარგებლოა, როგორც ნაყარი 2000.
   · **ძებნა → მთელი lucide** (≈2000). ჩამონათვალი ზარმაცად იტვირთება —
     პირველივე აკრეფილ სიმბოლოზე, და არა დიალოგის გახსნაზე.

   ⚠️ **ორმაგი ჩანაწერი ვერ გაჩნდება.** საძიებო შედეგი, რომლის lucide-ის
   id უკვე ჯგუფებშია, **ჯგუფის სახელით** ინახება (`Film`, არა `film`) —
   თორემ ერთი და იგივე ხატულა ბაზაში ორი სხვადასხვა მნიშვნელობით
   დაიწერებოდა და „რომელია არჩეული" ორ ადგილას აინთებოდა.

   ⚠️ **შედეგები შეზღუდულია** (`MAX_RESULTS`): თითო ზარმაცი ხატულა თავისი
   ჩანქია, ე.ი. 2000 შედეგის დახატვა 2000 მოთხოვნა იქნებოდა.
   ============================================================ */

const MAX_RESULTS = 96

/** ჯგუფებში მყოფი ხატულების lucide-id → ჩვენი (შესანახი) სახელი */
const BY_ID: Record<string, string> = Object.fromEntries(ICON_NAMES.map((n) => [iconId(n), n]))

function matches(id: string, query: string): boolean {
  return id.replace(/-/g, ' ').includes(query) || id.includes(query)
}

export function IconPicker({
  value,
  onChange,
  className,
}: {
  value?: string | null
  onChange: (name: string) => void
  className?: string
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [allIds, setAllIds] = useState<string[] | null>(null)

  const q = query.trim().toLowerCase()

  /* ⚠️ ≈2000 სახელი (და მათი იმპორტების რუკა) მხოლოდ მაშინ ჩამოდის,
     როცა მართლა ეძებენ — გახსნისთანავე ჩატვირთვა ყოველ რედაქტირებას
     ზედმეტ ჩანქს დაამატებდა. */
  useEffect(() => {
    if (!q || allIds) return
    let alive = true
    void import('lucide-react/dynamic').then((m) => {
      if (alive) setAllIds([...m.iconNames])
    })
    return () => {
      alive = false
    }
  }, [q, allIds])

  const results = useMemo(() => {
    if (!q) return []
    const seen = new Set<string>()
    const out: string[] = []

    /* ჯერ ჩვენი ჯგუფები — ისინი სინქრონულად იხატება */
    for (const id of Object.keys(BY_ID)) {
      if (matches(id, q) && !seen.has(id)) {
        seen.add(id)
        out.push(BY_ID[id])
      }
    }
    for (const id of allIds ?? []) {
      if (out.length >= MAX_RESULTS) break
      if (matches(id, q) && !seen.has(id)) {
        seen.add(id)
        out.push(BY_ID[id] ?? id)
      }
    }

    return out.slice(0, MAX_RESULTS)
  }, [q, allIds])

  const cell = (name: string) => (
    <button
      key={name}
      type="button"
      onClick={() => onChange(name)}
      aria-label={name}
      title={name}
      aria-pressed={value === name}
      className={cn(
        'grid size-9 cursor-pointer place-items-center rounded-md border transition-colors',
        value === name
          ? 'border-primary bg-secondary text-foreground'
          : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <ModuleIcon name={name} className="size-4" />
    </button>
  )

  return (
    <div className={cn('space-y-3', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('icons.search')}
          className="pl-8"
        />
      </div>

      {q ? (
        results.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {allIds ? t('icons.noResults') : t('common.loading')}
          </p>
        ) : (
          <div className="fb-scroll max-h-56 overflow-y-auto pr-1">
            <div className="flex flex-wrap gap-1.5">{results.map(cell)}</div>
          </div>
        )
      ) : (
        <div className="fb-scroll max-h-56 space-y-3 overflow-y-auto pr-1">
          {ICON_GROUPS.map((group) => (
            <div key={group.key}>
              <p className="mb-1 text-[11px] text-muted-foreground">{t(`icons.group.${group.key}`)}</p>
              <div className="flex flex-wrap gap-1.5">{group.names.map(cell)}</div>
            </div>
          ))}
        </div>
      )}

      {/* არჩეული ხატულა შეიძლება ვერც ერთ ხედში არ ჩანდეს (მოძებნილია, მერე
          ძებნა გასუფთავდა) — ამიტომ მიმდინარე არჩევანი ყოველთვის იწერება */}
      {value && (
        <p className="text-[11px] text-muted-foreground">
          {t('icons.selected')}: <span className="text-foreground">{value}</span>
        </p>
      )}
    </div>
  )
}

import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fetchDashboard } from '@/api/dashboard'
import type { MediaType } from '@/lib/media'
import { moduleName, useModules } from '@/lib/modules'
import { ModuleIcon } from '@/components/ModuleIcon'
import { ScopeCard, ScopeGroup } from '@/components/ui/scope-card'

/* ============================================================
   **„რომელ ბიბლიოთეკაში" — მედია-დომენები ბარათებად** (Tasks §20.1).

   შენი სიტყვები: „ფილმები და სერიალები რომ არის მოსანიშნი, ბარათის
   სტილით გააკეთე, როგორც სხვაგან, შესაბამისი ფერებით".

   ⚠️ **ერთი კომპონენტი სამი ფანჯრისთვის** — სინქრონიზაცია, თარგმნა და
   გალერეის ჩამოტვირთვა ერთსა და იმავე კითხვას სვამს. ორ მათგანში
   ჩვეულებრივი ჩეკბოქსები იდგა, მესამეში — პილულები, ე.ი. ერთ არჩევანს
   სამი სახე ჰქონდა (`LayoutToggle`-ის წესი: ერთი კითხვა — ერთი სახე).

   ⚠️ **ეს მრავლობითი არჩევანია და არა ჭრილი**: ბარათი ჩამრთველივით
   ირთვება/ითიშება (`aria-pressed`), ე.ი. „ფილმები + ანიმე" ერთი
   გაშვებაა. `CutTabs` აქ არ გამოდგება — ის ერთ მნიშვნელობას ირჩევს.

   ⚠️ **ფერი, ხატულა და სახელი მოდულისაა** (`modules.color`/`icon`/
   `name_*`) — იგივე, რასაც საიდბარი და გვერდის ჰედერი ხატავს. i18n-ის
   `MEDIA_NAV_KEY` აქ განზრახ არ იკითხება: გადარქმეული მოდული ერთ ადგილას
   ძველი სახელით დარჩებოდა.

   ⚠️ **რიცხვი ბიბლიოთეკის ზომაა** (`GET /dashboard`, `StatusBulkPage`-ის
   წყარო) და არა „რამდენს შეეხება" — ეს გეგმის პასუხია და ფანჯრის ქვედა
   ზოლში ზის. ბარათზე მეორე, განსხვავებული რიცხვი ორ წყაროს შექმნიდა.
   ============================================================ */

export function MediaDomainCards({
  value,
  onToggle,
  enabled = true,
}: {
  value: MediaType[]
  onToggle: (type: MediaType) => void
  /** დახურულ ფანჯარას დეშბორდის მოთხოვნა არ სჭირდება */
  enabled?: boolean
}) {
  const { t, i18n } = useTranslation()
  const { mediaModules } = useModules()

  const { data: cards } = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard, enabled })
  const countOf = (key: string) => cards?.find((c) => c.key === key)?.count ?? undefined

  return (
    <div>
      <ScopeGroup layout="inline">
        {mediaModules.map((m) => (
          <ScopeCard
            key={m.key}
            active={value.includes(m.type)}
            color={m.color}
            icon={<ModuleIcon name={m.icon} className="size-4 text-[var(--mod)]" />}
            label={moduleName(m, i18n.language)}
            count={countOf(m.key)}
            onClick={() => onToggle(m.type)}
          />
        ))}
      </ScopeGroup>
      {/* ⚠️ ცარიელი არჩევანი ცხადად ითქვას — თორემ ქვედა ზოლი უბრალოდ
          ცარიელდება და „რატომ არ ეშვება" პასუხს ვერ იპოვი */}
      {!value.length && <p className="mt-1.5 text-xs text-destructive">{t('mediaDomains.pickOne')}</p>}
    </div>
  )
}

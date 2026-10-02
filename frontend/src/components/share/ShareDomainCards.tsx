import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fetchDashboard } from '@/api/dashboard'
import type { ShareDomainKey } from '@/api/shareLinks'
import { useShareDomains } from '@/hooks/useShareDomains'
import { moduleName } from '@/lib/modules'
import { ModuleIcon } from '@/components/ModuleIcon'
import { ScopeCard, ScopeGroup } from '@/components/ui/scope-card'

/* ============================================================
   **„რომელი სექციები" — გაზიარების ბმულის პირველი ნაბიჯი** (Tasks §40.10).

   `MediaDomainCards`-ის ტყუპია, ოღონდ თერთმეტ დომენზე: სამ მედია-ფანჯარას
   (სინქრონიზაცია · თარგმნა · გალერეა) მხოლოდ მედია სჭირდება, ბმულს კი
   თამაშიც, წიგნიც, ადგილიც… ⚠️ ერთ კომპონენტში ორი დომენის სია `type`-ის
   პირობად დაიწერებოდა და სამივე ფანჯარა ამას თავისთავს გადაიხდიდა.

   ⚠️ **„რომელი შემიძლია" სერვერის წესის სარკეა** — `useShareDomains()`.
   ============================================================ */

export function ShareDomainCards({
  value,
  onToggle,
}: {
  value: ShareDomainKey[]
  onToggle: (domain: ShareDomainKey) => void
}) {
  const { t, i18n } = useTranslation()
  const { available, moduleOf } = useShareDomains()

  // ⚠️ რიცხვი ბიბლიოთეკის ზომაა (`MediaDomainCards`-ის წყარო); ბმულის რიცხვი ქვემოთაა
  const { data: cards } = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard })
  const countOf = (key: string) => cards?.find((c) => c.key === key)?.count ?? undefined

  return (
    <div>
      <ScopeGroup layout="inline">
        {available.map((domain) => {
          const m = moduleOf(domain)
          if (!m) return null

          return (
            <ScopeCard
              key={domain}
              active={value.includes(domain)}
              color={m.color}
              icon={<ModuleIcon name={m.icon} className="size-4 text-[var(--mod)]" />}
              label={moduleName(m, i18n.language)}
              count={countOf(m.key)}
              onClick={() => onToggle(domain)}
            />
          )
        })}
      </ScopeGroup>
      {!value.length && <p className="mt-1.5 text-xs text-destructive">{t('share.noSections')}</p>}
    </div>
  )
}

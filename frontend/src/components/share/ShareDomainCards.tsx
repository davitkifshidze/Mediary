import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fetchDashboard } from '@/api/dashboard'
import type { ShareDomainKey } from '@/api/shareLinks'
import { useShareDomains } from '@/hooks/useShareDomains'
import { shareMeta } from '@/lib/shareLinks'
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
  const { t } = useTranslation()
  const { available, look } = useShareDomains()

  /* ⚠️ რიცხვი ბიბლიოთეკის ზომაა (`MediaDomainCards`-ის წყარო); ბმულის რიცხვი ქვემოთაა.
     პლეილისტს თავისი მთვლელი დეშბორდზე არ აქვს (`song`-ისა სიმღერებს ითვლის) — რიცხვის გარეშეა */
  const { data: cards } = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard })
  const countOf = (domain: ShareDomainKey) =>
    shareMeta(domain).module === domain ? (cards?.find((c) => c.key === domain)?.count ?? undefined) : undefined

  return (
    <div>
      <ScopeGroup layout="inline">
        {available.map((domain) => {
          const { label, icon, color } = look(domain)

          return (
            <ScopeCard
              key={domain}
              active={value.includes(domain)}
              color={color}
              icon={<ModuleIcon name={icon} className="size-4 text-[var(--mod)]" />}
              label={label}
              count={countOf(domain)}
              onClick={() => onToggle(domain)}
            />
          )
        })}
      </ScopeGroup>
      {!value.length && <p className="mt-1.5 text-xs text-destructive">{t('share.noSections')}</p>}
    </div>
  )
}

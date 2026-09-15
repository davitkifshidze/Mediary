import {
  CircleSlash,
  LayoutGrid,
  MessagesSquare,
  ShieldCheck,
  Tags,
  UserCog,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AuditFilters, AuditMeta, AuditSummary } from '@/api/audit'
import { actionStyle } from '@/lib/actionStyle'
import { moduleName, useModules } from '@/lib/modules'
import { ModuleIcon } from '@/components/ModuleIcon'
import { ScopeCard, ScopeGroup } from '@/components/ui/scope-card'

/* ============================================================
   **აუდიტ-ლოგის ჭრილები — ორი რიგი ფერადი ბარათი (ეტაპი 10 · ფერები 2026-09-15).**

   შენი სიტყვები: „მოქმედება/მოდულებიც ცუდი ვიზუალია — ეგეთი არა, ან
   ტაბები ან ქარდები, მაგრამ იყოს ყველას ნახვაც, ასევე ფილტრაცია ყველაში
   ან კონკრეტულშიც". აქამდე ორივე ჭრილი პატარა ჩიპების კედელი იყო: 8
   მოქმედება + 16 მოდული ერთნაირი, უფერო, უთვლელი პილულა — ვერც ის
   იკითხებოდა, სად დევს ლოგის მასა, და ვერც ის, „ყველა" ჩართულია თუ არა
   (ცარიელი მონიშვნა უბრალოდ არაფერს ნიშნავდა).

   ⚠️ **თვითონ ბარათი აქ აღარ იწერება** (2026-09-15): `ui/scope-card.tsx`-ია
   და მას მოთხოვნები, სტატუსის მასობრივი შეცვლა და მასობრივი წაშლაც
   კითხულობენ — ოთხივე ერთსა და იმავე კითხვას სვამს. ხატულებისა და ფერების
   რუკაც გავიდა (`lib/actionStyle.ts`), რადგან როლების მატრიცა იმავე ოთხ
   მოქმედებას ხატავს.

   ⚠️ **„ყველა" ცალკე ელემენტია და არა „არაფერი მონიშნული"** — ორივე რიგის
   პირველი ბარათი, თავისი რიცხვით. სწორედ ეს იყო თხოვნის ნაწილი:
   „იყოს ყველას ნახვაც".

   ⚠️ **არჩევანი ერთია და არა მრავლობითი** (ტაბის სემანტიკა): „ყველაში
   **ან** კონკრეტულში". `AuditFilters.modules`/`actions` სიად რჩება (API
   უცვლელია), უბრალოდ ერთელემენტიანი მიდის — ე.ი. მრავლობითი ფილტრი
   backend-ს ისევ შეუძლია, UI კი ორაზროვნებას არ ბადებს.

   ⚠️ **რიცხვები faceted-ია: ჭრილი საკუთარ თავს არ ითვლის**
   (`GET /admin/audit/summary`). მოდულის არჩევის შემდეგაც დანარჩენი
   ბარათები თავის რიცხვს ინარჩუნებს — თორემ არჩევისთანავე ყველა სხვა
   ნულზე ჩამოვიდოდა და „სხვაგან რა დევს" კითხვას ვეღარავინ უპასუხებდა.
   ============================================================ */

/** ფსევდო-მოდულებს `modules` რიგი არ აქვთ, ე.ი. არც ხატულა და არც ფერი */
const PSEUDO_ICONS: Record<string, typeof LayoutGrid> = {
  account: UserCog,
  admin: ShieldCheck,
  chat: MessagesSquare,
  genre: Tags,
  cast: Users,
  none: CircleSlash,
}

/** „ყველა" — არჩევანის გასუფთავება */
const ALL = '__all__'

export function AuditScope({
  meta,
  summary,
  filters,
  onChange,
}: {
  meta?: AuditMeta
  summary?: AuditSummary
  filters: AuditFilters
  onChange: (next: Partial<AuditFilters>) => void
}) {
  const { t, i18n } = useTranslation()
  const { all: modules } = useModules()

  const total = summary?.total ?? 0
  const moduleCounts = new Map((summary?.modules ?? []).map((f) => [f.key, f.total]))
  const actionCounts = new Map((summary?.actions ?? []).map((f) => [f.key, f.total]))

  const activeModule = filters.modules?.[0] ?? null
  const activeAction = filters.actions?.[0] ?? ALL

  /** მოდულის სახელი — ჯერ `modules` ცხრილიდან, მერე i18n (ფსევდო-მოდულები) */
  const nameOf = (key: string) => {
    const found = modules.find((m) => m.key === key)
    return found ? moduleName(found, i18n.language) : t(`audit.modules.${key}`, key)
  }

  return (
    <div className="mb-5 space-y-4">
      {/* ---------- მოქმედება ---------- */}
      <ScopeGroup label={t('audit.filters.actions')}>
        <ScopeCard
          active={activeAction === ALL}
          color="var(--primary)"
          icon={<LayoutGrid className="size-4 text-[var(--mod)]" />}
          label={t('audit.filters.allActions')}
          count={total}
          onClick={() => onChange({ actions: [] })}
        />
        {(meta?.actions ?? []).map((action) => {
          const style = actionStyle(action)
          return (
            <ScopeCard
              key={action}
              active={activeAction === action}
              color={style.color}
              icon={<style.icon className="size-4 text-[var(--mod)]" />}
              label={t(`audit.actions.${action}`, action)}
              count={actionCounts.get(action) ?? 0}
              // ხელახალი დაჭერა „ყველაზე" აბრუნებს — ჭრილს გასვლის გზა უნდა ჰქონდეს
              onClick={() => onChange({ actions: activeAction === action ? [] : [action] })}
            />
          )
        })}
      </ScopeGroup>

      {/* ---------- მოდული ---------- */}
      <ScopeGroup label={t('audit.filters.modules')}>
        <ScopeCard
          active={activeModule === null}
          icon={<LayoutGrid className="size-4 text-[var(--mod)]" />}
          label={t('audit.filters.allModules')}
          count={total}
          onClick={() => onChange({ modules: [] })}
        />
        {(meta?.modules ?? []).map((m) => {
          const found = modules.find((x) => x.key === m.key)
          const Pseudo = PSEUDO_ICONS[m.key]
          return (
            <ScopeCard
              key={m.key}
              active={activeModule === m.key}
              color={found?.color ?? null}
              icon={
                Pseudo ? (
                  <Pseudo className="size-4 text-[var(--mod)]" />
                ) : (
                  <ModuleIcon name={found?.icon} className="size-4 text-[var(--mod)]" />
                )
              }
              label={nameOf(m.key)}
              count={moduleCounts.get(m.key) ?? 0}
              onClick={() =>
                // ხელახალი დაჭერა „ყველაზე" აბრუნებს — ჭრილს გასვლის გზა უნდა ჰქონდეს
                onChange({ modules: activeModule === m.key ? [] : [m.key] })
              }
            />
          )
        })}
      </ScopeGroup>
    </div>
  )
}

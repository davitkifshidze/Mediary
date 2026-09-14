import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CircleSlash,
  LayoutGrid,
  MessagesSquare,
  ShieldCheck,
  Tags,
  UserCog,
  Users,
} from 'lucide-react'
import type { AuditFilters, AuditMeta, AuditSummary } from '@/api/audit'
import { MODULE_ACCENT_FALLBACK, modAccent, moduleName, useModules } from '@/lib/modules'
import { cn } from '@/lib/utils'
import { ModuleIcon } from '@/components/ModuleIcon'
import { Tabs } from '@/components/ui/tabs'

/* ============================================================
   **აუდიტ-ლოგის ჭრილები — ბარათები და ტაბები (ეტაპი 10).**

   შენი სიტყვები: „მოქმედება/მოდულებიც ცუდი ვიზუალია — ეგეთი არა, ან
   ტაბები ან ქარდები, მაგრამ იყოს ყველას ნახვაც, ასევე ფილტრაცია ყველაში
   ან კონკრეტულშიც". აქამდე ორივე ჭრილი პატარა ჩიპების კედელი იყო: 8
   მოქმედება + 16 მოდული ერთნაირი, უფერო, უთვლელი პილულა — ვერც ის
   იკითხებოდა, სად დევს ლოგის მასა, და ვერც ის, „ყველა" ჩართულია თუ არა
   (ცარიელი მონიშვნა უბრალოდ არაფერს ნიშნავდა).

   ⚠️ **„ყველა" ცალკე ელემენტია და არა „არაფერი მონიშნული"** — ორივე რიგის
   პირველი ბარათი/ტაბი, თავისი რიცხვით. სწორედ ეს იყო თხოვნის ნაწილი:
   „იყოს ყველას ნახვაც".

   ⚠️ **არჩევანი ერთია და არა მრავლობითი** (ტაბის სემანტიკა): „ყველაში
   **ან** კონკრეტულში". `AuditFilters.modules`/`actions` სიად რჩება (API
   უცვლელია), უბრალოდ ერთელემენტიანი მიდის — ე.ი. მრავლობითი ფილტრი
   backend-ს ისევ შეუძლია, UI კი ორაზროვნებას არ ბადებს.

   ⚠️ **რიცხვები faceted-ია: ჭრილი საკუთარ თავს არ ითვლის**
   (`GET /admin/audit/summary`). მოდულის არჩევის შემდეგაც დანარჩენი
   ბარათები თავის რიცხვს ინარჩუნებს — თორემ არჩევისთანავე ყველა სხვა
   ნულზე ჩამოვიდოდა და „სხვაგან რა დევს" კითხვას ვეღარავინ უპასუხებდა.

   ⚠️ **ფერი inline `style`-ით ჩამოდის** (`modAccent()` — საიდბარის იგივე
   ცვლადები): Tailwind კლასს hex-იდან ვერ დაბადებს, ე.ი. `border-[#6366f1]`
   კომპილაციისას არ არსებობს. კლასები სტატიკურია, მნიშვნელობა — ცვლადში.

   ⚠️ **ნულიანი ბარათი რჩება და კლიკადია** — მხოლოდ ფერს კარგავს.
   „აქ არაფერი მომხდარა" პასუხია და არა დასამალი ფაქტი.
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

/** „ყველა" — არჩევანის გასუფთავება; ტაბის `value`-ს ცარიელი არ შეიძლება */
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
      {/* ---------- მოქმედება: ტაბები ---------- */}
      {/* ⚠️ სათაურზე `uppercase` არ დგას — CSS-ის `text-transform` მხედრულს
          მთავრულად აქცევს (იგივე წესი, რაც `FilterPanel`-ს აქვს) */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          {t('audit.filters.actions')}
        </p>
        <Tabs
          value={activeAction}
          onChange={(v) => onChange({ actions: v === ALL ? [] : [v] })}
          items={[
            { value: ALL, label: t('audit.filters.allActions'), badge: total },
            ...(meta?.actions ?? []).map((action) => ({
              value: action,
              label: t(`audit.actions.${action}`, action),
              badge: actionCounts.get(action) ?? 0,
            })),
          ]}
        />
      </div>

      {/* ---------- მოდული: ბარათები ---------- */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          {t('audit.filters.modules')}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
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
        </div>
      </div>
    </div>
  )
}

/**
 * ერთი ბარათი — ხატულა მოდულის ფერში, სახელი, რიცხვი.
 *
 * ⚠️ ფერი ორ CSS-ცვლადად ჩამოდის; ფერის გარეშე მოდული ოქროსფერ
 * ნაგულისხმევს იმემკვიდრებს (`MODULE_ACCENT_FALLBACK`).
 */
function ScopeCard({
  active,
  color,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean
  color?: string | null
  icon: ReactNode
  label: string
  count: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={modAccent(color) ?? MODULE_ACCENT_FALLBACK}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-md border p-2.5 text-left transition-colors',
        active
          ? 'border-[var(--mod)] bg-[var(--mod-soft)] text-foreground'
          : 'border-border hover:border-[var(--mod)]',
        !active && count === 0 && 'opacity-60',
      )}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[var(--mod-soft)]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm', active ? 'font-semibold' : 'font-medium')}>
          {label}
        </span>
        <span className="block text-xs tabular-nums text-muted-foreground">
          {count}
        </span>
      </span>
    </button>
  )
}

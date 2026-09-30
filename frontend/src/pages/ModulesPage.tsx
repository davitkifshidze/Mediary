import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Ban, Check, ChevronLeft, ChevronRight, Clock, Lock, Plus, RotateCcw, UserRound, UsersRound } from 'lucide-react'
import {
  fetchAdminModules,
  fetchMyRequests,
  resetModuleOrder,
  saveDefaultModuleOrder,
  saveModuleOrder,
  type ModuleInfo,
} from '@/api/account'
import {
  MODULE_ACCENT_FALLBACK,
  modAccent,
  moduleDescription,
  moduleName,
  useModules,
} from '@/lib/modules'
import { useAuth } from '@/lib/auth'
import { dragRowClass, useDragReorder } from '@/lib/dragReorder'
import { errorMessage } from '@/lib/errors'
import { arrangeByKeys, isCustomOrder } from '@/lib/moduleOrder'
import { isCustomModule, isCustomModuleKey } from '@/lib/customModules'
import { CustomModuleDialog } from '@/components/CustomModuleDialog'
import { ModuleIcon } from '@/components/ModuleIcon'
import { Button } from '@/components/ui/button'
import { DragHandle } from '@/components/ui/drag-handle'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { InfoHint } from '@/components/ui/info-hint'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { cn } from '@/lib/utils'

/* ============================================================
   მოდულების სექცია (Tasks 1.4) — **ერთი** გვერდი ორის ნაცვლად.

   ადრე ორი იყო: `/modules` (მომხმარებლის სია) და ადმინის „მოდულები" ტაბი
   (ქარდები + მოდალი). ახლა ერთია, ქარდებით, და ქარდზე დაჭერით იხსნება
   **შიდა გვერდი** `/modules/{key}` — მოდალი აღარაა.

   **ფერი და ანიმაცია (2026-09-15, შენი მითითებით).**

   ⚠️ **ფერი `modules.color`-იდან მოდის და აქ ახალი პალიტრა არ იბადება** —
   იგივე სვეტი, რასაც საიდბარი, გვერდის ჰედერი და აუდიტ-ლოგის ბარათები
   კითხულობენ. სწორედ ეს არის ამ სექციის სიმწვავე: **მოდულების გვერდი
   ერთადერთი იყო, სადაც მოდული უფერო რჩებოდა** — თერთმეტი ერთნაირად
   ნაცრისფერი ბარათი, თუმცა მენიუში თითოეულს თავისი ტონი აქვს.

   ⚠️ **ფერი inline `style`-ით ჩამოდის** (`modAccent()`): Tailwind კლასს
   hex-იდან ვერ დაბადებს, ე.ი. `border-[#7073ff]` კომპილაციისას არ არსებობს.

   ⚠️ **დაყოვნება ინდექსიდან იწერება და კლასი — არა** (იმავე მიზეზით), და
   **შეზღუდულია**: 40ms × 11 ბარათი თითქმის ნახევარი წამია, ე.ი. ბოლო
   ბარათი დაგვიანებულად „ჩამორჩებოდა"; ჭერი 240ms-ია.

   **რიგი — drag & drop-ით, თითო მომხმარებელზე (Tasks §36, Q27).**

   ⚠️ **ბარათი თვითონ ითრევა და ბმული `draggable={false}`-ია** — ბმული
   თავისით გადაითრევა და ბრაუზერი ბარათის ნაცვლად URL-ს „წაიღებდა"
   (`RecordCast`-ის იგივე წესი). გადათრევა ბმულზე დაწყებულიც ბარათს
   იღებს: `draggable=false` ელემენტიდან ბრაუზერი უახლოეს `draggable`
   წინაპარს ეძებს.

   ⚠️ **ისრები ბმულს გარეთაა, ბარათის ქვედა ზოლში** — ღილაკი `<a>`-ს შიგნით
   არასწორი HTML-ია და ერთი დაჭერა ორივეს გაუშვებდა. ისრები აუცილებელია:
   native drag & drop კლავიატურით და სენსორულ ეკრანზე არ მუშაობს
   (`lib/dragReorder.ts`).

   ⚠️ **რიგს სერვერი ალაგებს** (`GET /modules`, `/admin/modules` და
   `/dashboard` უკვე დალაგებული მოდის) — აქ მხოლოდ ოპტიმისტური ქეშია, რომ
   ჩამოგდებული ბარათი პასუხამდე უკან არ ხტებოდეს და საიდბარიც იმავე წამს
   შეიცვალოს.
   ============================================================ */

/** ბარათის შემოსვლის საფეხური და ჭერი (იხ. `index.css`-ის `fb-card`) */
const STAGGER_MS = 40
const STAGGER_MAX_MS = 240

/** ერთდროული გადალაგებების მთვლელის გასაღები (იხ. `onSettled`) */
const ORDER_MUTATION = ['module-order'] as const

export function ModulesPage() {
  const { t, i18n } = useTranslation()
  const { all, loading } = useModules()
  const { isAdmin } = useAuth()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()

  const { data: requests = [] } = useQuery({ queryKey: ['my-requests'], queryFn: fetchMyRequests })
  // Tasks §37.2 — ახალი მოდულის ოსტატი
  const [creating, setCreating] = useState(false)

  /**
   * `GET /modules` მხოლოდ **აქტიურ** მოდულებს აბრუნებს და `users_count`-ს არ იცის.
   * ადმინს ორივე სჭირდება, ამიტომ ადმინის სია ბაზისია და ჩემი მდგომარეობა
   * (`enabled`/`granted`) მასზე ედება.
   *
   * ⚠️ ადმინის სიაც **მისი პირადი რიგითაა** (§36) — ე.ი. გამორთული მოდულიც
   * თავის ადგილას დგას და გადაითრევა.
   */
  const { data: adminModules } = useQuery({
    queryKey: ['admin-modules'],
    queryFn: fetchAdminModules,
    enabled: isAdmin,
  })

  const list = useMemo<ModuleInfo[]>(() => {
    if (!isAdmin || !adminModules) return all
    const mine = new Map(all.map((m) => [m.key, m]))
    return adminModules.map((m) => ({ ...m, ...(mine.get(m.key) ?? {}), ...{ users_count: m.users_count } }))
  }, [isAdmin, adminModules, all])

  const keys = useMemo(() => list.map((m) => m.key), [list])
  // ჩემი რიგი საერთოსგან განსხვავდება — მაშინ ჩანს „ნაგულისხმევი რიგი"
  const custom = useMemo(() => isCustomOrder(list), [list])

  /** სამივე სია — `/modules`-იც, საიდბარიც და მთავარის ბარათებიც — ერთ რიგზეა */
  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['modules'] })
    qc.invalidateQueries({ queryKey: ['admin-modules'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }, [qc])

  const order = useMutation({
    mutationKey: ORDER_MUTATION,
    mutationFn: saveModuleOrder,
    // ⚠️ მაშინვე — თორემ ჩამოგდებული ბარათი პასუხის მოსვლამდე უკან ხტება
    onMutate: async (next: string[]) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: ['modules'] }),
        qc.cancelQueries({ queryKey: ['admin-modules'] }),
      ])
      qc.setQueryData<ModuleInfo[]>(['modules'], (old) => old && arrangeByKeys(old, next))
      qc.setQueryData<ModuleInfo[]>(['admin-modules'], (old) => old && arrangeByKeys(old, next))
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
    /* ⚠️ **მხოლოდ ბოლო გადალაგების შემდეგ** — ორ სწრაფ გადათრევაზე პირველის
       პასუხზე გაშვებული refetch მეორის ოპტიმისტურ რიგს ძველით გადაწერდა და
       ბარათი ერთი წამით უკან „ხტებოდა". მიმდინარე მუტაცია აქ ჯერ ითვლება. */
    onSettled: () => {
      if (qc.isMutating({ mutationKey: ORDER_MUTATION }) === 1) refresh()
    },
  })

  const reset = useMutation({
    mutationFn: resetModuleOrder,
    onSuccess: () => toast({ title: t('modules.resetOrderDone'), variant: 'success' }),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
    onSettled: refresh,
  })

  const makeDefault = useMutation({
    mutationFn: saveDefaultModuleOrder,
    onSuccess: () => toast({ title: t('modules.setDefaultOrderDone'), variant: 'success' }),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
    onSettled: refresh,
  })

  const drag = useDragReorder<string>(keys, (next) => order.mutate(next))

  const askReset = async () => {
    const ok = await confirm({
      title: t('modules.resetOrderTitle'),
      description: t('modules.resetOrderHint'),
      confirmText: t('modules.resetOrderConfirm'),
    })
    if (ok) reset.mutate()
  }

  const askMakeDefault = async () => {
    const ok = await confirm({
      title: t('modules.setDefaultOrderTitle'),
      description: t('modules.setDefaultOrderHint'),
      confirmText: t('modules.setDefaultOrder'),
    })
    /* ⚠️ §37 — საერთო რიგი **საბაზისო** მოდულებისაა: პირადი მოდული სხვას არ
       უჩანს, და backend მის გასაღებს უცნობად (422) წაიკითხავდა */
    if (ok) makeDefault.mutate(keys.filter((k) => !isCustomModuleKey(k)))
  }

  const pendingFor = (m: ModuleInfo) =>
    requests.some((r) => r.type === 'module_access' && r.module?.id === m.id && r.status === 'pending')

  /** ჩემი მდგომარეობა ამ მოდულზე — ქარდის მთავარი ინფორმაცია */
  const state = (m: ModuleInfo) => {
    // §37.8 — ადმინმა გამორთო: მფლობელი თვითონ ვეღარ ჩართავს, მონაცემები რჩება
    if (m.disabled_by_admin) return { label: t('customModules.disabledByAdmin'), icon: Ban, tone: 'text-destructive' }
    if (m.enabled) return { label: t('modules.enabled'), icon: Check, tone: 'text-gold' }
    if (m.granted) return { label: t('modules.disabledByMe'), icon: Lock, tone: 'text-muted-foreground' }
    if (pendingFor(m)) return { label: t('modules.pending'), icon: Clock, tone: 'text-muted-foreground' }
    return { label: t('modules.noAccess'), icon: Lock, tone: 'text-muted-foreground' }
  }

  const hint = isAdmin
    ? `${t('modules.subtitleAdmin')} ${t('modules.orderHint')} ${t('modules.orderHintAdmin')}`
    : `${t('modules.subtitle')} ${t('modules.orderHint')}`

  return (
    <PageContainer>
      <PageHeader
        tool="modules"
        title={t('modules.title')}
        hint={<InfoHint info={hint} />}
        actions={
          <>
            {custom && (
              <>
                <Button variant="outline" onClick={askReset} disabled={reset.isPending || order.isPending}>
                  <RotateCcw className="size-4" />
                  {t('modules.resetOrder')}
                </Button>
                {/* ⚠️ მხოლოდ super_admin — საერთო რიგი ყველა ანგარიშს ეხება */}
                {isAdmin && (
                  <Button variant="outline" onClick={askMakeDefault} disabled={makeDefault.isPending || order.isPending}>
                    <UsersRound className="size-4" />
                    {t('modules.setDefaultOrder')}
                  </Button>
                )}
              </>
            )}
            {/* Tasks §37 — ყოველი მომხმარებელი თავისთვის ქმნის (Q28) */}
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              {t('customModules.new')}
            </Button>
          </>
        }
      />

      {loading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((m, i) => {
          const s = state(m)
          const name = moduleName(m, i18n.language)
          return (
            <div
              key={m.id}
              {...drag.handlers(m.key)}
              style={{
                // ⚠️ ფერის უქონელი მოდული ოქროსფერ ნაგულისხმევს იღებს — აქ
                // საიდბარის `<nav>`-ის მსგავსი მშობელი არ არსებობს, ე.ი.
                // `--mod`-ის გარეშე ფილა და ხატულა უფერული დარჩებოდა
                ...(modAccent(m.color) ?? MODULE_ACCENT_FALLBACK),
                animationDelay: `${Math.min(i * STAGGER_MS, STAGGER_MAX_MS)}ms`,
              }}
              className={cn(
                'fb-card group flex flex-col rounded-2xl border bg-card hover:-translate-y-0.5',
                dragRowClass(
                  drag,
                  m.key,
                  'border-border hover:border-[var(--mod)]',
                  'transition-[border-color,translate,opacity]',
                ),
              )}
            >
              <Link to={`/modules/${m.key}`} draggable={false} className="block flex-1 cursor-pointer p-5 pb-0">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[var(--mod-soft)]">
                    <ModuleIcon name={m.icon} className="size-5 text-[var(--mod)]" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
                  {/* §37 — პირადი მოდული: სხვას არ უჩანს */}
                  {isCustomModule(m) && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                      <UserRound className="size-3" />
                      {t('customModules.personal')}
                    </span>
                  )}
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>

                <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
                  {moduleDescription(m, i18n.language)}
                </p>
              </Link>

              <div className="mx-5 mt-4 flex flex-wrap items-center gap-2 border-t border-border py-2 text-[11px]">
                <span className={cn('inline-flex items-center gap-1.5', s.tone)}>
                  <s.icon className="size-3.5" />
                  {s.label}
                </span>

                {/* ადმინის ინფო — გლობალური მდგომარეობა (პირად მოდულზე უაზროა — ერთი მფლობელია) */}
                {isAdmin && !isCustomModule(m) && (
                  <span className="flex flex-wrap items-center gap-1.5">
                    {!m.is_active && (
                      <span className="rounded-md border border-destructive/40 px-2 py-0.5 leading-relaxed text-destructive">
                        {t('admin.moduleOff')}
                      </span>
                    )}
                    {m.enabled_by_default && (
                      <span className="rounded-md bg-secondary px-2 py-0.5 leading-relaxed">
                        {t('admin.byDefault')}
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      {m.users_count
                        ? t('admin.usersCount', { count: m.users_count })
                        : t('admin.noUsers')}
                    </span>
                  </span>
                )}

                {/* ⚠️ ფიქსირებული ელემენტი — ყოველთვის მარჯვნივ, რომ ზოლები სიმეტრიული იყოს */}
                <span className="ml-auto flex shrink-0 items-center">
                  <DragHandle className="mr-1" />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={i === 0}
                    onClick={() => drag.moveBy(m.key, -1)}
                    aria-label={t('modules.moveEarlier', { name })}
                    title={t('modules.moveEarlier', { name })}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={i === list.length - 1}
                    onClick={() => drag.moveBy(m.key, 1)}
                    aria-label={t('modules.moveLater', { name })}
                    title={t('modules.moveLater', { name })}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {creating && <CustomModuleDialog onClose={() => setCreating(false)} />}
    </PageContainer>
  )
}

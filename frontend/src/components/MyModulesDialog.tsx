import { useQueries } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Ban, ExternalLink, LayoutGrid, Plus, SquarePen, Trash2 } from 'lucide-react'
import { fetchCustomModuleCounts, type ModuleInfo } from '@/api/account'
import { MODULE_ACCENT_FALLBACK, modAccent, moduleName } from '@/lib/modules'
import { formatBytes } from '@/lib/utils'
import { ModuleIcon } from '@/components/ModuleIcon'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ModalShell } from '@/components/ui/modal-shell'
import { Sortable, SortableHandle, SortableItem } from '@/components/ui/sortable'

/* ============================================================
   **„ჩემი მოდულები" — პირადი მოდულები ცალკე ფანჯარაში** (Tasks §58.3, Q15).

   შენი სიტყვები: „მომხმარებლის მოდულები ცალკე ღილაკად რომ იყოს და მოდალი
   იხსნებოდეს". გადაწყვეტილება (Q15): `/modules`-ის ბადეში **მხოლოდ
   ჩაშენებული** მოდულებია; პირადები აქაა — აიქონი, ფერი, სახელი, ჩანაწერების
   რიცხვი და ზომა; „გახსნა" · „რედაქტირება" · „მოდულის წაშლა (ურნაში)", ზემოთ
   „ახალი მოდული", და **გადათრევით საკუთარი რიგი** (ნელი, რბილი — §58.1).

   ⚠️ **რიგი ერთია** (`saveModuleOrder` — ყველა მოდული ერთ სიად): პირადი
   მოდულები ჩაშენებულების შემდეგ დგანან, ამიტომ გვერდი აგზავნის
   `[...ჩაშენებულები, ...პირადები]`-ს — გვერდითა მენიუც ასე ალაგებს (ცალკე
   ჯგუფად, ქვემოთ).
   ⚠️ რიცხვი და ზომა `GET /modules/{key}/details`-იდანაა — იგივე ქეში
   (`custom-module-counts`), რასაც მოდულის გვერდი კითხულობს.
   ============================================================ */

export function MyModulesDialog({
  modules,
  onClose,
  onReorder,
  onCreate,
  onEdit,
  onDelete,
}: {
  /** პირადი მოდულები, ჩემი რიგით */
  modules: ModuleInfo[]
  onClose: () => void
  /** მხოლოდ პირადების ახალი რიგი — მთელ რიგს გვერდი აწყობს */
  onReorder: (keys: string[]) => void
  onCreate: () => void
  onEdit: (module: ModuleInfo) => void
  onDelete: (module: ModuleInfo) => void
}) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()

  const counts = useQueries({
    queries: modules.map((m) => ({
      queryKey: ['custom-module-counts', m.key],
      queryFn: () => fetchCustomModuleCounts(m.key),
      staleTime: 60_000,
    })),
  })

  return (
    <ModalShell title={t('customModules.mineTitle')} hint={t('customModules.mineHint')} onClose={onClose} wide>
      <div className="mt-4 flex justify-end">
        <Button onClick={onCreate}>
          <Plus className="size-4" />
          {t('customModules.new')}
        </Button>
      </div>

      {modules.length === 0 ? (
        <EmptyState
          className="mt-3"
          icon={<LayoutGrid className="size-6" />}
          title={t('customModules.mineEmpty')}
          hint={t('customModules.mineEmptyHint')}
        />
      ) : (
        <Sortable ids={modules.map((m) => m.key)} onReorder={onReorder} motion="slow">
          <ul className="mt-3 space-y-2" data-testid="my-modules">
            {modules.map((m, i) => {
              const c = counts[i]?.data
              return (
                <SortableItem
                  key={m.key}
                  id={m.key}
                  handle
                  style={modAccent(m.color) ?? MODULE_ACCENT_FALLBACK}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
                >
                  <SortableHandle />
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[var(--mod-soft)]">
                    <ModuleIcon name={m.icon} className="size-4 text-[var(--mod)]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{moduleName(m, i18n.language)}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground" data-testid="my-module-facts">
                      {c ? (
                        <>
                          <span>{t('customModules.count', { count: c.records })}</span>
                          <span>{formatBytes(c.bytes)}</span>
                        </>
                      ) : (
                        <span>{t('common.loading')}</span>
                      )}
                      {m.disabled_by_admin && (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <Ban className="size-3" />
                          {t('customModules.disabledByAdmin')}
                        </span>
                      )}
                    </span>
                  </span>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!!m.disabled_by_admin}
                      onClick={() => {
                        onClose()
                        navigate(m.route_base)
                      }}
                    >
                      <ExternalLink className="size-3.5" />
                      {t('customModules.open')}
                    </Button>
                    <Button variant="edit" size="sm" onClick={() => onEdit(m)}>
                      <SquarePen className="size-3.5" />
                      {t('actions.edit')}
                    </Button>
                    <Button variant="destructiveOutline" size="sm" onClick={() => onDelete(m)}>
                      <Trash2 className="size-3.5" />
                      {t('customModules.deleteToTrash')}
                    </Button>
                  </div>
                </SortableItem>
              )
            })}
          </ul>
        </Sortable>
      )}
    </ModalShell>
  )
}

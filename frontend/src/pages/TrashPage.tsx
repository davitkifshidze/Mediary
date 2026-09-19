import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArchiveRestore, Trash2 } from 'lucide-react'
import {
  deleteFromTrash,
  emptyTrash,
  fetchTrash,
  restoreFromTrash,
  type TrashGroup,
  type TrashItem,
} from '@/api/trash'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { MODULE_ACCENT_FALLBACK, modAccent } from '@/lib/modules'
import { ModuleIcon } from '@/components/ModuleIcon'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'

/* ============================================================
   კალათა (FEAT-11).

   ⚠️ **ეს `/purge`-ის შემცვლელი არ არის და არც მისი მსუბუქი ვერსია.**
   `/purge` **სხვისი** ბიბლიოთეკიდან შლის მასობრივად და შეუქცევადად
   (`super_admin`), ეს კი **ჩემი** წაშლილების სიაა, საიდანაც უკან დაბრუნება
   ხდება. ორივე საჭიროა და ერთმანეთს არ ცვლის.

   ⚠️ **დაცლას აკრეფილი `DELETE` სჭირდება, ერთი ჩანაწერის წაშლას — არა.**
   იგივე ზღვარი, რაც `/purge`-ს აქვს: ტიპიზებული სიტყვა იქ დგას, სადაც
   ერთი დაჭერა ბევრ ჩანაწერს ანადგურებს; ერთი ჩანაწერის წაშლა კი იგივე
   მოქმედებაა, რაც სექციაში — ჩვეულებრივი დადასტურება.
   ============================================================ */

const CONFIRM_WORD = 'DELETE'

export function TrashPage() {
  const { t, i18n } = useTranslation()
  const { toast } = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()

  const [word, setWord] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['trash'],
    queryFn: fetchTrash,
  })

  const groups = data?.data ?? []
  const total = groups.reduce((sum, g) => sum + g.total, 0)

  /**
   * ⚠️ **ყველა query უქმდება და არა მხოლოდ `['trash']`.** აღდგენილი
   * ჩანაწერი თავის სექციაშიც უნდა გამოჩნდეს, დეშბორდის რიცხვიც შეიცვალა
   * და საცავის ჯამიც — წერტილოვანი invalidate ერთ-ერთს აუცილებლად
   * გამორჩებოდა და გვერდი „არაფერი შეიცვალა"-ს აჩვენებდა.
   */
  const refresh = () => queryClient.invalidateQueries()

  const restore = useMutation({
    mutationFn: ({ domain, id }: { domain: string; id: number }) => restoreFromTrash(domain, id),
    onSuccess: () => {
      toast({ title: t('trash.restored'), variant: 'success' })
      refresh()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const remove = useMutation({
    mutationFn: ({ domain, id }: { domain: string; id: number }) => deleteFromTrash(domain, id),
    onSuccess: () => {
      toast({ title: t('trash.deleted'), variant: 'success' })
      refresh()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const clear = useMutation({
    mutationFn: () => emptyTrash(CONFIRM_WORD),
    onSuccess: (res) => {
      toast({ title: t('trash.emptied', { count: res.deleted }), variant: 'success' })
      setWord('')
      refresh()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const removeOne = async (group: TrashGroup, item: TrashItem) => {
    const ok = await confirm({
      title: t('trash.deleteTitle'),
      description: t('trash.deleteHint', { name: item.title }),
      confirmText: t('confirm.delete'),
      variant: 'destructive',
    })

    if (ok) remove.mutate({ domain: group.domain, id: item.id })
  }

  return (
    <PageContainer>
      <PageHeader
        tool="trash"
        title={t('trash.title')}
        subtitle={total > 0 ? t('trash.count', { count: total }) : undefined}
        hint={<InfoHint info={t('trash.hint', { days: data?.keep_days ?? 30 })} />}
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<ArchiveRestore className="size-6" />}
          title={t('trash.empty')}
          hint={t('trash.emptyHint')}
        />
      ) : (
        <>
          <div className="grid gap-4">
            {groups.map((group) => (
              <section
                key={group.domain}
                className="rounded-xl border border-border bg-card p-5"
                style={modAccent(group.color) ?? MODULE_ACCENT_FALLBACK}
              >
                <header className="mb-3 flex flex-wrap items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-md bg-[var(--mod-soft)] [&>svg]:size-5 [&>svg]:text-[var(--mod)]">
                    <ModuleIcon name={group.icon} />
                  </span>
                  <h2 className="font-display text-lg font-semibold">
                    {i18n.language === 'ka' ? group.name_ka : group.name_en}
                  </h2>
                  <span className="text-sm text-muted-foreground">
                    {t('trash.count', { count: group.total })}
                  </span>
                </header>

                <ul className="grid gap-2">
                  {group.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-background p-3"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.title}</span>
                        <Expiry item={item} />
                      </span>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={restore.isPending}
                        onClick={() => restore.mutate({ domain: group.domain, id: item.id })}
                      >
                        <ArchiveRestore className="size-4" />
                        {t('trash.restore')}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={remove.isPending}
                        onClick={() => removeOne(group, item)}
                      >
                        <Trash2 className="size-4" />
                        {t('trash.deleteNow')}
                      </Button>
                    </li>
                  ))}
                </ul>

                {/* ⚠️ სერვერი თითო დომენზე 50 რიგს აბრუნებს — თუ მეტია,
                    ეს ითქმება, თორემ „სულ 120" და თხუთმეტი ხილული რიგი
                    ერთმანეთს ეწინააღმდეგება. */}
                {group.total > group.items.length && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('trash.more', { count: group.total - group.items.length })}
                  </p>
                )}
              </section>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
            <div className="min-w-48">
              <Label htmlFor="trash-confirm">{t('trash.confirmLabel', { word: CONFIRM_WORD })}</Label>
              <Input
                id="trash-confirm"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder={CONFIRM_WORD}
                autoComplete="off"
              />
            </div>
            <Button
              variant="destructive"
              disabled={word.trim() !== CONFIRM_WORD || clear.isPending}
              onClick={() => clear.mutate()}
            >
              <Trash2 className="size-4" />
              {t('trash.emptyAction')}
            </Button>
          </div>
        </>
      )}
    </PageContainer>
  )
}

/**
 * „როდის წაიშლება" — თარიღიც და დარჩენილი დღეებიც.
 *
 * ⚠️ **დღეების რიცხვი სერვერიდან მოდის** (`expires_in_days`): ვადა
 * `TrashDomain::KEEP_DAYS`-შია და მისი ასლი კლიენტში პირველივე შეცვლაზე
 * დაშორდებოდა — გვერდი „7 დღე რჩება"-ს დაწერდა, სერვერი კი 30-ზე შლიდა.
 */
function Expiry({ item }: { item: TrashItem }) {
  const { t } = useTranslation()
  const { date } = useDateFormat()

  return (
    <span className="block text-xs text-muted-foreground">
      {item.trashed_at ? date(item.trashed_at) : '—'}
      {' · '}
      {item.expires_in_days > 0
        ? t('trash.expiresIn', { count: item.expires_in_days })
        : t('trash.expiresToday')}
    </span>
  )
}

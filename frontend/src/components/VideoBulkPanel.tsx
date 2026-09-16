import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  VIDEO_BULK_SCOPES,
  bulkUpdateVideos,
  fetchVideoTypes,
  fetchVideos,
  previewVideoBulk,
  type VideoBulkAction,
  type VideoBulkScope,
  type VideoBulkScopeInput,
} from '@/api/videos'
import { videoTypeName } from '@/lib/display'
import { errorMessage } from '@/lib/errors'
import { useContentLang } from '@/lib/settings'
import { useMergedStatuses, statusName } from '@/lib/statuses'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { CutTabs } from '@/components/ui/cut-tabs'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { IdMultiSelect } from '@/components/MovieMultiSelect'
import { TagSelect } from '@/components/TagSelect'
import { useConfirm, useToast } from '@/components/ui/feedback'

/* ============================================================
   **ვიდეოების მასობრივი ოპერაცია (Tasks 4 → §9).**

   შენი სიტყვები: „ტეგების დამატებაზე უნდა ირჩევდე, რომელი ტეგის მქონეს
   დაუმატო ახალი ტეგი, ან რომელი ტიპის მქონეს დაუმატო ახალი ტეგი, ან
   კონკრეტულს, ან ყველას; ტეგების მოხსნაზეც ანალოგიური შესაძლებლობები".

   ⚠️ **წყაროს არჩევა ორვარიანტიანი იყო** (`ids` **ან** ერთი `from_type_id`),
   ახლა კი ხუთი სკოუპია — `PurgeService::TARGET_MODES`-ის იგივე ლექსიკით.
   ისინი **ბარათებია** (§2-ის `CutTabs`), რადგან ურთიერთგამომრიცხავი ჭრილია.

   ⚠️ **„რამდენს შეეხება" სერვერიდან მოდის და აღარ ითვლება კლიენტზე.**
   კლიენტის რიცხვი მეორე განმარტება იყო: ტეგის სკოუპი (ქართული ტეგი JSON-ში
   escape-ულად ზის) იქ საერთოდ ვერ დაითვლებოდა სწორად. ახლა პრევიუც და
   ჩაწერაც **ერთი** `records()`-იდან იკვებება.

   ⚠️ **სტატუსიც აქაა** (§6.4-ის შემდეგ ვიდეოს სტატუსი აქვს). ის
   `POST /videos/bulk`-ზე მიდის და არა `/videos/bulk-status`-ზე: ეს
   უკანასკნელი მხოლოდ `ids`/`from_status`-ს იცნობს, ე.ი. სკოუპის მეორე
   განმარტება დაიბადებოდა.

   ⚠️ **აკრეფილი დადასტურება აქ არ არის** (შენი პასუხი): ტიპის ან ტეგის
   შეცვლა შექცევადია — აკრეფილი სიტყვა `/purge`-ს რჩება, თორემ მას ძალას
   დააკარგვინებდა.
   ============================================================ */

/** მოქმედება — რა იცვლება */
const ACTIONS: VideoBulkAction[] = ['type', 'tags_add', 'tags_remove', 'status']

/** ⚠️ მუდმივი მასივი — ჰუკს `readonly string[]` სჭირდება და ყოველ რენდერზე ახალი იქნებოდა */
const VIDEO_STATUS_DOMAIN = ['video'] as const

export function VideoBulkPanel() {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()

  // ⚠️ `all` — სია მხოლოდ ამრჩევებისთვისაა (ტეგების აუზი, ჩანაწერების პიკერი)
  const videosQ = useQuery({
    queryKey: ['videos', 'bulk'],
    queryFn: () => fetchVideos({ all: true }).then((p) => p.items),
  })
  const typesQ = useQuery({ queryKey: ['video-types'], queryFn: fetchVideoTypes })
  const statuses = useMergedStatuses(VIDEO_STATUS_DOMAIN)

  const videos = useMemo(() => videosQ.data ?? [], [videosQ.data])
  const types = useMemo(() => typesQ.data ?? [], [typesQ.data])

  // ბიბლიოთეკაში არსებული ტეგები — `TagSelect`-ისა და ტეგის სკოუპის შემოთავაზება
  const knownTags = useMemo(
    () => [...new Set(videos.flatMap((v) => v.tags ?? []))].sort((a, b) => a.localeCompare(b)),
    [videos],
  )

  const [action, setAction] = useState<VideoBulkAction>('type')
  const [scope, setScope] = useState<VideoBulkScope>('type')
  const [scopeIds, setScopeIds] = useState<number[]>([])
  const [scopeType, setScopeType] = useState<string>('')
  const [scopeTag, setScopeTag] = useState<string>('')
  const [scopeStatus, setScopeStatus] = useState<string>('')

  const [targetType, setTargetType] = useState<string>('')
  const [targetStatus, setTargetStatus] = useState<string>('')
  const [tags, setTags] = useState<string[]>([])

  /** სკოუპი დასრულებულია? — უამისოდ პრევიუ 422-ს მიიღებდა */
  const scopeReady =
    (scope === 'all') ||
    (scope === 'ids' && scopeIds.length > 0) ||
    (scope === 'type' && scopeType !== '') ||
    (scope === 'tag' && scopeTag !== '') ||
    (scope === 'status' && scopeStatus !== '')

  const scopeInput = (): VideoBulkScopeInput => ({
    scope,
    ...(scope === 'ids' ? { scope_ids: scopeIds } : {}),
    ...(scope === 'type' ? { scope_type_id: Number(scopeType) } : {}),
    ...(scope === 'tag' ? { scope_tag: scopeTag } : {}),
    ...(scope === 'status' ? { scope_status: scopeStatus } : {}),
  })

  const previewQ = useQuery({
    queryKey: ['video-bulk-preview', scope, scopeIds, scopeType, scopeTag, scopeStatus],
    queryFn: () => previewVideoBulk(scopeInput()),
    enabled: scopeReady,
  })

  const affected = previewQ.data?.count ?? 0

  const targetReady =
    action === 'type'
      ? targetType !== ''
      : action === 'status'
        ? targetStatus !== ''
        : tags.length > 0

  const canApply = scopeReady && targetReady && affected > 0

  const mut = useMutation({
    mutationFn: () =>
      bulkUpdateVideos({
        action,
        ...scopeInput(),
        ...(action === 'type' ? { type_id: Number(targetType) } : {}),
        ...(action === 'status' ? { status: targetStatus } : {}),
        ...(action === 'tags_add' || action === 'tags_remove' ? { tags } : {}),
      }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['videos'] })
      qc.invalidateQueries({ queryKey: ['video-types'] })
      qc.invalidateQueries({ queryKey: ['video-bulk-preview'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast({ title: t('bulkVideo.done', { count: updated }), variant: 'success' })
      setScopeIds([])
      setTargetType('')
      setTargetStatus('')
      setTags([])
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const targetLabel = () => {
    if (action === 'type') {
      const type = types.find((ty) => String(ty.id) === targetType)
      return type ? videoTypeName(type, lang) : '—'
    }
    if (action === 'status') {
      const status = statuses.find((s) => s.key === targetStatus)
      return status ? statusName(status, lang) : '—'
    }
    return tags.join(', ')
  }

  const apply = async () => {
    if (!canApply) return
    const ok = await confirm({
      title: t(`bulkVideo.action_${action}`),
      description: t(`bulkVideo.confirm_${action}`, { count: affected, target: targetLabel() }),
      confirmText: t('confirm.confirm'),
      cancelText: t('confirm.cancel'),
    })
    if (ok) mut.mutate()
  }

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-5">
      {/* ---------- რა მოქმედება ---------- */}
      <div>
        <Label className="mb-2 block">{t('bulkVideo.actionLabel')}</Label>
        <div className="flex flex-wrap gap-2">
          {ACTIONS.map((a) => (
            <button
              key={a}
              onClick={() => {
                setAction(a)
                setTargetType('')
                setTargetStatus('')
                setTags([])
              }}
              className={cn(
                'inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm transition-colors',
                action === a
                  ? 'border-primary bg-secondary font-medium'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {t(`bulkVideo.action_${a}`)}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- რომელ ვიდეოებზე (§9.4) ---------- */}
      <div>
        <Label className="mb-2 block">{t('bulkVideo.whichLabel')}</Label>
        <CutTabs
          options={VIDEO_BULK_SCOPES.map((key) => ({
            key,
            label: t(`bulkVideo.scope_${key}`),
          }))}
          value={scope}
          onChange={(key) => setScope(key as VideoBulkScope)}
          size="sm"
          layout="inline"
        />

        <div className="mt-3">
          {scope === 'ids' && (
            <IdMultiSelect
              items={videos.map((v) => ({ id: v.id, label: v.title }))}
              value={scopeIds}
              onChange={setScopeIds}
              placeholder={videosQ.isLoading ? t('api.loading') : t('bulkVideo.videosPick')}
            />
          )}

          {scope === 'type' && (
            <Select value={scopeType} onValueChange={setScopeType}>
              <SelectTrigger>
                <SelectValue placeholder={t('bulkVideo.fromTypePick')} />
              </SelectTrigger>
              <SelectContent>
                {types.map((ty) => (
                  <SelectItem key={ty.id} value={String(ty.id)}>
                    {videoTypeName(ty, lang)}
                  </SelectItem>
                ))}
                {/* ⚠️ „ტიპის გარეშე" ისევ არსებობს, რადგან ძველ ჩანაწერს
                    შეიძლება ტიპი არ ჰქონდეს — რიცხვს კი სერვერის პრევიუ
                    ამბობს და აღარ ვითვლით აქ (§9.4). */}
                <SelectItem value="0">{t('bulkVideo.typeNone')}</SelectItem>
              </SelectContent>
            </Select>
          )}

          {scope === 'tag' && (
            <Select value={scopeTag} onValueChange={setScopeTag}>
              <SelectTrigger>
                <SelectValue placeholder={t('bulkVideo.fromTagPick')} />
              </SelectTrigger>
              <SelectContent>
                {knownTags.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {scope === 'status' && (
            <Select value={scopeStatus} onValueChange={setScopeStatus}>
              <SelectTrigger>
                <SelectValue placeholder={t('bulkVideo.fromStatusPick')} />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {statusName(s, lang)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {scope === 'all' && (
            <p className="text-xs text-muted-foreground">{t('bulkVideo.scopeAllHint')}</p>
          )}
        </div>
      </div>

      {/* ---------- რაზე შევცვალოთ ---------- */}
      {action === 'type' && (
        <div>
          <Label className="mb-2 block">{t('bulkVideo.targetTypeLabel')}</Label>
          <Select value={targetType} onValueChange={setTargetType}>
            <SelectTrigger>
              <SelectValue placeholder={t('bulkVideo.targetTypePick')} />
            </SelectTrigger>
            <SelectContent>
              {/* ⚠️ „ტიპის მოხსნა" აღარ არის — ტიპი სავალდებულია, ე.ი.
                  ეს ვარიანტი იმას აკეთებდა, რასაც წესი კრძალავს. */}
              {types.map((ty) => (
                <SelectItem key={ty.id} value={String(ty.id)}>
                  {videoTypeName(ty, lang)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {action === 'status' && (
        <div>
          <Label className="mb-2 block">{t('bulkVideo.targetStatusLabel')}</Label>
          <Select value={targetStatus} onValueChange={setTargetStatus}>
            <SelectTrigger>
              <SelectValue placeholder={t('bulkVideo.targetStatusPick')} />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {statusName(s, lang)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {(action === 'tags_add' || action === 'tags_remove') && (
        <div>
          <Label className="mb-2 block" htmlFor="bulk-tags">
            {t(action === 'tags_add' ? 'bulkVideo.tagsAddLabel' : 'bulkVideo.tagsRemoveLabel')}
          </Label>
          <TagSelect inputId="bulk-tags" options={knownTags} value={tags} onChange={setTags} />
          <p className="mt-2 text-xs text-muted-foreground">
            {t(action === 'tags_add' ? 'bulkVideo.tagsAddHint' : 'bulkVideo.tagsRemoveHint')}
          </p>
        </div>
      )}

      {/* ---------- პრევიუ + გაშვება ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <span className="min-w-0 text-sm text-muted-foreground">
          {!scopeReady
            ? t('bulkVideo.scopeMissing')
            : previewQ.isLoading
              ? t('common.loading')
              : t('bulkVideo.affected', { count: affected })}
          {!!previewQ.data?.sample.length && (
            <span className="block truncate text-xs">
              {previewQ.data.sample.map((v) => v.title).join(' · ')}
              {affected > previewQ.data.sample.length && ' …'}
            </span>
          )}
        </span>
        <Button onClick={apply} disabled={!canApply || mut.isPending}>
          {mut.isPending ? t('actions.saving') : t('bulkStatus.apply')}
        </Button>
      </div>
    </div>
  )
}

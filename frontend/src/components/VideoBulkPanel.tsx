import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  bulkUpdateVideos,
  fetchVideoTypes,
  fetchVideos,
  type VideoBulkAction,
} from '@/api/videos'
import { videoTypeName } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { IdMultiSelect } from '@/components/MovieMultiSelect'
import { TagSelect } from '@/components/TagSelect'
import { useConfirm, useToast } from '@/components/ui/feedback'

/* ============================================================
   ვიდეოების მასობრივი ოპერაცია (Tasks 4).
   ვიდეოს **სტატუსი არ აქვს** (19.9-ის გადაწყვეტილება), ამიტომ აქ
   ტიპი და ტეგები იცვლება. რჩეული განზრახ არ არის — ის ბადეზე
   ერთი დაჭერითაა.
   ============================================================ */

type Mode = 'by_type' | 'specific'
/** „ტიპის გარეშე" — select-ის value სტრინგია, null ვერ გადმოიცემა */
const NO_TYPE = '0'

export function VideoBulkPanel() {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()

  // ⚠️ `all` — მასობრივი ცვლილება მთელ სიაზე მოქმედებს
  const videosQ = useQuery({
    queryKey: ['videos', 'bulk'],
    queryFn: () => fetchVideos({ all: true }).then((p) => p.items),
  })
  const typesQ = useQuery({ queryKey: ['video-types'], queryFn: fetchVideoTypes })
  const videos = useMemo(() => videosQ.data ?? [], [videosQ.data])
  const types = useMemo(() => typesQ.data ?? [], [typesQ.data])

  // ბიბლიოთეკაში არსებული ტეგები — `TagSelect`-ის შემოთავაზება
  const knownTags = useMemo(
    () => [...new Set(videos.flatMap((v) => v.tags ?? []))].sort((a, b) => a.localeCompare(b)),
    [videos],
  )

  const [action, setAction] = useState<VideoBulkAction>('type')
  const [mode, setMode] = useState<Mode>('by_type')
  const [fromType, setFromType] = useState<string>('')
  const [ids, setIds] = useState<number[]>([])
  const [targetType, setTargetType] = useState<string>('')
  const [tags, setTags] = useState<string[]>([])

  const countOfType = (typeId: string) =>
    videos.filter((v) => String(v.type_id ?? 0) === typeId).length

  const affectedCount =
    mode === 'by_type' ? (fromType ? countOfType(fromType) : 0) : ids.length

  const targetReady = action === 'type' ? targetType !== '' : tags.length > 0
  const canApply =
    targetReady &&
    ((mode === 'by_type' && !!fromType && affectedCount > 0) ||
      (mode === 'specific' && ids.length > 0))

  const mut = useMutation({
    mutationFn: () =>
      bulkUpdateVideos({
        action,
        ...(mode === 'specific' ? { ids } : { from_type_id: Number(fromType) }),
        ...(action === 'type'
          ? { type_id: targetType === NO_TYPE ? null : Number(targetType) }
          : { tags }),
      }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['videos'] })
      qc.invalidateQueries({ queryKey: ['video-types'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast({ title: t('bulkVideo.done', { count: updated }), variant: 'success' })
      setIds([])
      setFromType('')
      setTargetType('')
      setTags([])
    },
    onError: () => toast({ title: t('toast.error'), variant: 'error' }),
  })

  const targetLabel = () => {
    if (action === 'type') {
      const type = types.find((ty) => String(ty.id) === targetType)
      return type ? videoTypeName(type, lang) : t('bulkVideo.typeNone')
    }
    return tags.join(', ')
  }

  const apply = async () => {
    if (!canApply) return
    const ok = await confirm({
      title: t(`bulkVideo.action_${action}`),
      description: t(`bulkVideo.confirm_${action}`, {
        count: affectedCount,
        target: targetLabel(),
      }),
      confirmText: t('confirm.confirm'),
      cancelText: t('confirm.cancel'),
    })
    if (ok) mut.mutate()
  }

  const actions: VideoBulkAction[] = ['type', 'tags_add', 'tags_remove']

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-5">
      {/* რა მოქმედება */}
      <div>
        <Label className="mb-2 block">{t('bulkVideo.actionLabel')}</Label>
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <button
              key={a}
              onClick={() => {
                setAction(a)
                setTargetType('')
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

      {/* რომელ ვიდეოებზე */}
      <div>
        <Label className="mb-2 block">{t('bulkVideo.whichLabel')}</Label>
        <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="gap-3">
          <div
            className={cn(
              'rounded-lg border p-3 transition-colors',
              mode === 'by_type' ? 'border-primary bg-secondary/50' : 'border-border',
            )}
          >
            <label className="flex cursor-pointer items-center gap-3">
              <RadioGroupItem value="by_type" />
              <span className="text-sm font-medium">{t('bulkVideo.modeByType')}</span>
            </label>
            {mode === 'by_type' && (
              <div className="mt-3 pl-8">
                <Select value={fromType} onValueChange={setFromType}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('bulkVideo.fromTypePick')} />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((ty) => (
                      <SelectItem key={ty.id} value={String(ty.id)}>
                        {videoTypeName(ty, lang)} ({countOfType(String(ty.id))})
                      </SelectItem>
                    ))}
                    <SelectItem value={NO_TYPE}>
                      {t('bulkVideo.typeNone')} ({countOfType(NO_TYPE)})
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div
            className={cn(
              'rounded-lg border p-3 transition-colors',
              mode === 'specific' ? 'border-primary bg-secondary/50' : 'border-border',
            )}
          >
            <label className="flex cursor-pointer items-center gap-3">
              <RadioGroupItem value="specific" />
              <span className="text-sm font-medium">{t('bulkVideo.modeSpecific')}</span>
            </label>
            {mode === 'specific' && (
              <div className="mt-3 pl-8">
                <IdMultiSelect
                  items={videos.map((v) => ({ id: v.id, label: v.title }))}
                  value={ids}
                  onChange={setIds}
                  placeholder={videosQ.isLoading ? t('api.loading') : t('bulkVideo.videosPick')}
                />
              </div>
            )}
          </div>
        </RadioGroup>
      </div>

      {/* რაზე შევცვალოთ */}
      {action === 'type' ? (
        <div>
          <Label className="mb-2 block">{t('bulkVideo.targetTypeLabel')}</Label>
          <Select value={targetType} onValueChange={setTargetType}>
            <SelectTrigger>
              <SelectValue placeholder={t('bulkVideo.targetTypePick')} />
            </SelectTrigger>
            <SelectContent>
              {types.map((ty) => (
                <SelectItem key={ty.id} value={String(ty.id)}>
                  {videoTypeName(ty, lang)}
                </SelectItem>
              ))}
              <SelectItem value={NO_TYPE}>{t('bulkVideo.typeNone')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : (
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

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-sm text-muted-foreground">
          {t('bulkVideo.affected', { count: affectedCount })}
        </span>
        <Button onClick={apply} disabled={!canApply || mut.isPending}>
          {mut.isPending ? t('actions.saving') : t('bulkStatus.apply')}
        </Button>
      </div>
    </div>
  )
}

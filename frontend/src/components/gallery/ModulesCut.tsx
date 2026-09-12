import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Boxes, Lock } from 'lucide-react'
import { fetchGalleryGroups, fetchModulePhotos, type GalleryGroup } from '@/api/gallery'
import { moduleName, useModules } from '@/lib/modules'
import { formatBytes } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PhotoGrid, PHOTO_PAGE_DEFAULT } from '@/components/ui/photo-grid'
import { PhotoStack } from '@/components/ui/photo-stack'
import { GalleryStackSkeleton, GallerySkeletonGrid } from '@/components/gallery/GalleryPhotoGrid'
import { Pager } from '@/components/gallery/GroupPhotos'

/* ============================================================
   **სხვა მოდულების ფოტოები** (§8.3/§8.5).

   მოთხოვნა: „სხვა რამეებზეც, სადაც ნებისმიერი ფოტო დაემატება … ყველაფერი
   გალერეაში დაყავი ჯგუფებად, გვერდებად, სექციებად".

   ⚠️ **მხოლოდ კითხვადია.** ეს ყდები, თამბნეილები და მიმაგრებული სურათებია —
   ე.ი. **ჩანაწერის ნაწილი** და არა გალერეის ერთეული. მათი წაშლა ჩანაწერის
   რედაქტირებაა, ამიტომ აქ წაშლის ღილაკი განზრახ არ არის.

   ⚠️ **ჩანაწერების მოდული პრივატულ დისკზეა** — ესკიზი `/storage/*`-ით არ
   იხსნება და `PhotoGrid`-ს `privateDisk` სჭირდება. `private` ნიშანი
   **backend-იდან** მოდის: ფრონტში პრივატული ფესვების ასლი ერთ დღეს
   გაშორდებოდა და პრივატულ ფაილს საჯარო URL-ით აჩვენებდა.
   ============================================================ */

export function ModulesCut() {
  const { t, i18n } = useTranslation()
  const { all } = useModules()
  const [open, setOpen] = useState<GalleryGroup | null>(null)

  const groupsQ = useQuery({
    queryKey: ['gallery-groups', 'module'],
    queryFn: () => fetchGalleryGroups('module', { previews: 5 }),
  })

  const nameOf = (key?: string) => {
    const found = all.find((m) => m.key === key)
    return found ? moduleName(found, i18n.language) : (key ?? '—')
  }

  if (open) return <ModulePhotos group={open} title={nameOf(open.module)} onBack={() => setOpen(null)} />

  const groups = groupsQ.data?.groups ?? []

  if (groupsQ.isLoading) return <GalleryStackSkeleton count={5} />

  if (!groups.length) {
    return (
      <EmptyState
        icon={<Boxes className="size-6" />}
        title={t('gallery.noModulePhotos')}
        hint={t('gallery.noModulePhotosHint')}
      />
    )
  }

  return (
    <section>
      <p className="mb-3 text-xs text-muted-foreground">{t('gallery.byModuleHint')}</p>

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {groups.map((group) => (
          <li key={group.module}>
            <PhotoStack
              title={nameOf(group.module)}
              label={`${t('gallery.photos', { count: group.photos })} · ${formatBytes(group.bytes)}`}
              count={group.photos}
              // ⚠️ პრივატულ მოდულზე ესკიზი API-ს გავლით იკითხება, ე.ი. `<img>`
              // პირდაპირ ვერ ნახავს — დასტა მაშინ ხატულით იხატება
              images={group.private ? [] : (group.previews ?? [])}
              badge={group.private ? <Lock className="size-3" /> : undefined}
              aspect="wide"
              onClick={() => setOpen(group)}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** ერთი მოდულის ფოტოები — გვერდებით */
function ModulePhotos({
  group,
  title,
  onBack,
}: {
  group: GalleryGroup
  title: string
  onBack: () => void
}) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(PHOTO_PAGE_DEFAULT)

  const query = useQuery({
    queryKey: ['gallery-module-photos', group.module, page, perPage],
    queryFn: () => fetchModulePhotos(group.module!, { page, per_page: perPage || 100 }),
  })

  const rows = query.data?.data ?? []
  const meta = query.data?.meta

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
          {t('actions.back')}
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-lg font-semibold">{title}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {t('gallery.photos', { count: meta?.total ?? 0 })}
            {meta?.truncated ? ` · ${t('gallery.moduleTruncated')}` : ''}
          </p>
        </div>
      </div>

      {query.isLoading ? (
        <GallerySkeletonGrid />
      ) : (
        <PhotoGrid
          emptyText={t('gallery.noModulePhotos')}
          privateDisk={!!group.private}
          items={rows.map((row) => ({
            // ⚠️ `PhotoGrid` რიცხვით id-ს ელის; ჩვენი id სტრიქონია (ორი ცხრილი),
            // ამიტომ ინდექსი გამოგვაქვს — წაშლა აქ ისედაც არ არის
            id: index(row.id),
            src: row.url,
            title: row.original_name ?? row.owner.title,
            subtitle: row.owner.title ?? undefined,
            portrait: row.kind === 'cover',
            size: row.size,
          }))}
          pageSize={perPage}
          onPageSizeChange={(size) => {
            setPerPage(size)
            setPage(1)
          }}
          total={meta?.total}
        />
      )}

      {meta && meta.last_page > 1 && (
        <Pager page={meta.page} lastPage={meta.last_page} total={meta.total} onChange={setPage} />
      )}
    </section>
  )
}

/**
 * სტრიქონული id → სტაბილური რიცხვი.
 *
 * ⚠️ `PhotoGrid`-ის კონტრაქტი რიცხვია (მონიშვნა და წაშლა id-ზე დგას), აქ კი
 * ერთეული ორი სხვადასხვა ცხრილიდან მოდის და რიცხვითი id-ები ერთმანეთს
 * დაეჯახებოდა. ჰეში მხოლოდ **ამ ბადეში** გამოიყენება — სერვერზე არსად იგზავნება.
 */
function index(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return Math.abs(hash)
}

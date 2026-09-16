import { useMemo, useState } from 'react'
import { GALLERY_CUTS, type GalleryCut } from '@/lib/galleryCuts'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DownloadCloud } from 'lucide-react'
import { updateModuleSettings } from '@/api/account'
import {
  fetchGallerySummary,
  readGalleryDefaults,
  type GalleryDefaults,
  type GalleryGroup,
} from '@/api/gallery'
import { isMediaKey, useModules } from '@/lib/modules'
import { cn, formatBytes } from '@/lib/utils'
import { GalleryDownloadDialog, type GalleryDownloadPin } from '@/components/GalleryDownloadDialog'
import { StorageBar } from '@/components/StorageBar'
import { Button } from '@/components/ui/button'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { AllPhotosCut } from '@/components/gallery/AllPhotosCut'
import { GroupsCut } from '@/components/gallery/GroupsCut'
import { RecordsCut } from '@/components/gallery/RecordsCut'
import { ModulesCut } from '@/components/gallery/ModulesCut'
import { VideosCut } from '@/components/gallery/VideosCut'
import { AlbumsCut } from '@/components/gallery/AlbumsCut'
import { GalleryScope } from '@/components/gallery/GalleryScope'

/* ============================================================
   გალერეა — `/gallery` და მისი ქვე-გვერდები (Tasks 10 → **§8**).

   ⚠️ **ხაზით გაყოფილი „მასობრივი ჩამოტვირთვა" წაშლილია** (შენი პირდაპირი
   მითითება). ის ორი სხვადასხვა საქმეს — დათვალიერებასა და ჩამოტვირთვას —
   ერთ სქროლზე აჯდომებდა და ჩამოტვირთვას კონტექსტს აცლიდა. ახლა
   ჩამოტვირთვა ან სათაურის ღილაკია (სკოუპის არჩევით), ან ჯგუფის ბარათზეა
   (სკოუპი უკვე ცნობილია).

   ⚠️ **ქვე-მენიუ საიდბარშიცაა და გვერდზეც** (§8.5): საიდბარი განყოფილებებს
   ასახელებს, გვერდი კი იმავეს სეგმენტებად იმეორებს — მობილურზე საიდბარი
   უჯრაშია და ჭრილებს სხვაგვარად ვერ გადართავ.

   ⚠️ **მთვლელები ერთი გამოძახებაა** (`GET /api/gallery`) — სამი ცალკე
   `groups` მოთხოვნა იმავეს რომ ეკეთებინა, ქვე-მენიუს დახატვა სამ სრულ
   სიას ჩამოტვირთავდა.
   ============================================================ */

export function GalleryPage({ cut = 'all' }: { cut?: GalleryCut }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { all, mediaModules } = useModules()

  const domains = useMemo(
    () => mediaModules.map((m) => m.key).filter(isMediaKey),
    [mediaModules],
  )

  /* ⚠️ სახელი ერთი გასაღებიდან (§27) — იგივე, რასაც საიდბარი ხატავს.
     ადრე „ჩანაწერები" ჩართული მოდულების სახელებისგან იგებოდა, რაც
     ტაბისთვის გრძელი იყო და მაინც არასრული. */
  const cutLabel = (key: GalleryCut) => t(`gallery.cut.${key}`)

  const [open, setOpen] = useState(false)
  const [pin, setPin] = useState<GalleryDownloadPin | undefined>()
  const [sourceBy, setSourceBy] = useState<'provider' | 'source'>('provider')

  const summaryQ = useQuery({ queryKey: ['gallery-summary'], queryFn: fetchGallerySummary })
  const settings = readGalleryDefaults(all.find((m) => m.key === 'gallery')?.user_settings)

  // არჩევანი მოდულის პარამეტრებში ინახება — ბოლო გაშვება default-ად რჩება
  const saveDefaults = useMutation({
    mutationFn: (next: GalleryDefaults) => updateModuleSettings('gallery', { ...next }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modules'] }),
  })

  const openDownload = (next?: GalleryDownloadPin) => {
    setPin(next)
    setOpen(true)
  }

  /** ჯგუფის ბარათიდან — სკოუპი უკვე ცნობილია */
  const fromRecordGroup = (group: GalleryGroup) => {
    if (!isMediaKey(group.kind)) return
    openDownload({
      record: { type: group.kind, id: group.id, title: group.title_ka || group.title || undefined },
    })
  }

  const fromActorGroup = (group: GalleryGroup) =>
    openDownload({ actor: { id: group.id, name: group.title_ka || group.title || `#${group.id}` } })

  const summary = summaryQ.data

  return (
    <PageContainer>
      <PageHeader
        module="gallery"
        title={cutLabel(cut)}
        actions={
          domains.length > 0 ? (
            <Button onClick={() => openDownload(undefined)}>
              <DownloadCloud className="size-4" />
              {t('gallery.fetch')}
            </Button>
          ) : undefined
        }
      />

      {/* ---------- მთვლელები + ადგილი ---------- */}
      {summary && (
        <section className="mb-5 rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex flex-wrap gap-x-6 gap-y-2">
            <Stat label={t('gallery.statPhotos')} value={summary.photos} />
            <Stat label={t('gallery.statRecords')} value={summary.records} />
            <Stat label={t('gallery.statActors')} value={summary.actors} />
            {/* §26 — „უკატეგორიო" მთვლელი აქვე, რომ ჭრილის არსებობა ჩანდეს */}
            <Stat label={t('gallery.statUncategorized')} value={summary.uncategorized} />
            <Stat label={t('gallery.statVideos')} value={summary.videos} />
            <Stat label={t('gallery.statSize')} value={formatBytes(summary.bytes)} />
          </div>
          <StorageBar usage={summary.storage} />
        </section>
      )}

      {/* ---------- ქვე-ნავიგაცია ---------- */}
      <nav className="fb-scroll mb-5 flex gap-1 overflow-x-auto border-b border-border pb-px">
        {GALLERY_CUTS.map(({ key, path, icon: Icon }) => (
          <NavLink
            key={key}
            to={path}
            end={key === 'all'}
            className={({ isActive }) =>
              cn(
                '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )
            }
          >
            <Icon className="size-4" />
            {cutLabel(key)}
          </NavLink>
        ))}
      </nav>

      {/* ---------- ჭრილი ---------- */}
      {cut === 'all' && <AllPhotosCut />}

      {cut === 'records' && (
        <RecordsCut onDownloadRecord={fromRecordGroup} onDownloadActor={fromActorGroup} />
      )}

      {cut === 'actors' && (
        <GroupsCut by="actor" onDownloadRecord={fromRecordGroup} onDownloadActor={fromActorGroup} />
      )}

      {cut === 'albums' && <AlbumsCut />}

      {cut === 'videos' && <VideosCut />}

      {cut === 'sources' && (
        <div>
          {/* ⚠️ **ორი სხვადასხვა კითხვა და ორივეს პასუხი სჭირდება**: „რომელმა
              წყარომ მოიტანა" და „რომელი დომენიდან მოვიდა". §24.3-ის შემდეგ
              ისინი ბარათებია და არა ჩიპები — იგივე ვიზუალი, რაც აუდიტ-ლოგს. */}
          <div className="mb-4">
            <GalleryScope
              label={t('gallery.sourceScope')}
              options={(['provider', 'source'] as const).map((key) => ({
                key,
                label: t(`gallery.sourceBy.${key}`),
                hint: t(`gallery.sourceByHint.${key}`),
              }))}
              value={sourceBy}
              onChange={(key) => setSourceBy(key as 'provider' | 'source')}
            />
          </div>
          <GroupsCut by={sourceBy} />
        </div>
      )}

      {cut === 'modules' && <ModulesCut />}

      <GalleryDownloadDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setPin(undefined)
        }}
        defaults={settings}
        onRun={(next) => saveDefaults.mutate(next)}
        pin={pin}
        initialFlow={cut === 'actors' ? 'cast' : 'record'}
      />
    </PageContainer>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-0">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  )
}

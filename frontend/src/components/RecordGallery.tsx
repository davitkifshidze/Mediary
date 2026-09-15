import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DownloadCloud, Globe, Trash2, Video } from 'lucide-react'
import { updateModuleSettings } from '@/api/account'
import {
  deleteGalleryImage,
  fetchActorGallery,
  fetchGalleryDetail,
  readGalleryDefaults,
  setGalleryPrimary,
  type GalleryDefaults,
  type GalleryImage,
} from '@/api/gallery'
import { errorMessage } from '@/lib/errors'
import type { MediaType } from '@/lib/media'
import { useModules } from '@/lib/modules'
import { CastPhotoStacks } from '@/components/CastPhotoStacks'
import { GalleryDownloadDialog } from '@/components/GalleryDownloadDialog'
import { GalleryPanel } from '@/components/GalleryPanel'
import { GalleryVideoList } from '@/components/gallery/GalleryVideoList'
import { WebImageDialog } from '@/components/WebImageDialog'
import { WebVideoDialog } from '@/components/WebVideoDialog'
import { Button } from '@/components/ui/button'
import { useConfirm, useToast } from '@/components/ui/feedback'

/* ============================================================
   გალერეის სექცია ჩანაწერზე და მსახიობზე (Tasks 10 → **§8.5**).

   გალერეა **ჩანაწერშივეა** (ტრეილერის ქვემოთ) და მსახიობის გვერდზეც იგივე
   სექციაა.

   ## §8-ის ცვლილებები
   ⚠️ **ჩამოტვირთვა აღარ არის ბმული `/gallery`-ზე.** ადრე ჩანაწერის
   ერთადერთი „ჩამოტვირთვის" ღილაკი სხვა გვერდზე გადაგიყვანდა, სადაც სკოუპს
   თავიდან ალაგებდი — მიუხედავად იმისა, რომ ის უკვე ცნობილი იყო. ახლა
   დიალოგი **აქვე** იხსნება, ამ ჩანაწერზე მიბმული.
   ⚠️ **ვიდეო-ბმულებიც აქაა** (§8.1) — ჩანაწერს ისინი ისევე ჰკიდია,
   როგორც ფოტოები.
   ============================================================ */

/** გალერეის მოდულის default-ები + შენახვა (`module_user.settings`) */
function useGalleryDefaults() {
  const qc = useQueryClient()
  const { all } = useModules()
  const defaults = readGalleryDefaults(all.find((m) => m.key === 'gallery')?.user_settings)

  const save = useMutation({
    mutationFn: (next: GalleryDefaults) => updateModuleSettings('gallery', { ...next }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modules'] }),
  })

  return { defaults, save }
}

/** წაშლა/მთავარად — ერთი ლოგიკა ორივე სექციისთვის */
function useGalleryActions(invalidate: string[]) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()

  const done = () => {
    ;[...invalidate, 'gallery', 'gallery-summary', 'storage', 'me'].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    )
  }
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  /* ⚠️ **მასივი და არა ერთი ფოტო** (§2.9-ის მონიშვნები): „მონიშნულების
     წაშლა" ერთი ქმედებაა და დადასტურებაც ერთხელ უნდა იკითხოს. */
  const remove = useMutation({
    mutationFn: (images: GalleryImage[]) => Promise.all(images.map((i) => deleteGalleryImage(i.id))),
    onSuccess: () => {
      done()
      toast({ title: t('gallery.deleted'), variant: 'success' })
    },
    onError: fail,
  })

  const primary = useMutation({
    mutationFn: (image: GalleryImage) => setGalleryPrimary(image.id),
    onSuccess: () => {
      done()
      toast({ title: t('gallery.primarySet'), variant: 'success' })
    },
    onError: fail,
  })

  /**
   * ⚠️ **მთავარი ფოტოს წაშლა ცხადად ითქვას** (Tasks §1.2). გალერეაში წაშლა
   * მყისიერია (ეს ბიბლიოთეკაა და არა ფორმა), მაგრამ „მთავარად" დაყენებული
   * ფოტო **ჩანაწერის პოსტერიცაა** — მისი წაშლა ჩანაწერს მთავარ სურათს აცლის.
   */
  const askDelete = async (images: GalleryImage[], primaryPath?: string | null) => {
    if (!images.length) return
    const hitsPrimary = !!primaryPath && images.some((i) => i.url === primaryPath)
    const ok = await confirm({
      title: t('gallery.deleteTitle'),
      description: hitsPrimary
        ? `${t('gallery.deleteHint')} ${t('gallery.deletePrimaryWarn')}`
        : t('gallery.deleteHint'),
      confirmText: t('confirm.delete'),
      variant: 'destructive',
    })
    if (ok) remove.mutate(images)
  }

  return { askDelete, primary }
}

/**
 * ჩანაწერის გალერეა — ჩანაწერის საკუთარი კადრები/პოსტერები, **მსახიობების
 * ქვე-სექცია** (დაჯგუფებული/არეული) და ვიდეო-ბმულები.
 */
export function RecordGallery({
  type,
  id,
  /** ცალკე გვერდზე სექციას თავისი ჩარჩო აქვს — ორმაგი ბარათი ზედმეტია */
  bare,
}: {
  type: MediaType
  id: number
  bare?: boolean
}) {
  const { t } = useTranslation()
  const { has } = useModules()
  const qc = useQueryClient()
  const { defaults, save } = useGalleryDefaults()
  const { askDelete, primary } = useGalleryActions([type])

  const [webOpen, setWebOpen] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)
  const [downloadOpen, setDownloadOpen] = useState(false)

  const detailQ = useQuery({
    queryKey: ['gallery', type, id],
    queryFn: () => fetchGalleryDetail(type, id),
    enabled: has('gallery') && Number.isFinite(id),
  })

  if (!has('gallery')) return null

  const detail = detailQ.data
  const images = detail?.images ?? []
  const castImages = detail?.cast_images ?? []

  /* ⚠️ **შეკითხვა ინგლისური სათაურით იწყება და ეს განზრახაა** — ვებძებნა
     ქართულ სათაურზე პრაქტიკულად ვერაფერს პოულობს. წელი იმიტომ ერთვის, რომ
     ერთსახელიანი ფილმები არ აირიოს. ველი რედაქტირებადია. */
  const webQuery = [detail?.record.title_en || detail?.record.title_ka, detail?.record.year]
    .filter(Boolean)
    .join(' ')

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['gallery', type, id] })
    qc.invalidateQueries({ queryKey: ['gallery-summary'] })
  }

  const body = (
    <>
      <GalleryPanel
        images={images}
        bytes={images.reduce((sum, image) => sum + (image.size ?? 0), 0)}
        primaryPath={detail?.record.poster_path}
        onDelete={(list) => askDelete(list, detail?.record.poster_path)}
        onPrimary={(image) => primary.mutate(image)}
        emptyText={t('gallery.emptyRecord')}
        actions={
          /* ⚠️ **სამივე ერთ ზოლშია** (შენი მითითება, 2026-09-14):
             ჩარჩოსა და გამყოფები `GalleryPanel`-სია, აქ მხოლოდ `ghost`
             ღილაკებია — ორმაგვარი ჩარჩო (ზოლისა და თითო ღილაკის)
             დახრამულ საზღვრებს იძლევა. */
          <>
            {/* ⚠️ **ჩამოტვირთვა აქვეა** — სკოუპი ამ ჩანაწერზეა მიბმული */}
            <Button type="button" variant="ghost" size="sm" className="rounded-none" onClick={() => setDownloadOpen(true)}>
              <DownloadCloud className="size-4" />
              {t('gallery.fetch')}
            </Button>

            {/* ⚠️ **TMDB-ის გვერდით და არა მის ნაცვლად**: TMDB უფასოა და
                ლიმიტის გარეშე, ვებძებნა კი 250-იან ბიუჯეტს ხარჯავს. */}
            <Button type="button" variant="ghost" size="sm" className="rounded-none" onClick={() => setWebOpen(true)}>
              <Globe className="size-4" />
              {t('web.searchPhotos')}
            </Button>

            <Button type="button" variant="ghost" size="sm" className="rounded-none" onClick={() => setVideoOpen(true)}>
              <Video className="size-4" />
              {t('web.searchVideos')}
            </Button>

            {/* §25.4 — „ასევე თავად ფილმზეც": ამ ჩანაწერის მთელი გალერეის
                წაშლა ერთი მოქმედებით. ⚠️ **მსახიობების ფოტოებს არ ეხება** —
                ისინი მსახიობზეა მიბმული და სხვა ფილმებშიც ჩანს; მათ თავისი
                დასტის ღილაკი შლის. */}
            {images.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-none text-destructive"
                onClick={() => askDelete(images, detail?.record.poster_path)}
              >
                <Trash2 className="size-4" />
                {t('photos.deleteSelected', { count: images.length })}
              </Button>
            )}
          </>
        }
      />

      <CastPhotoStacks images={castImages} cast={detail?.cast ?? []} onDelete={askDelete} />

      {/* §8.1 — ამ ჩანაწერზე შენახული ვიდეო-ბმულები */}
      <GalleryVideoList videos={detail?.videos ?? []} onChanged={invalidate} />

      {webOpen && (
        <WebImageDialog
          target={type}
          id={id}
          initialQuery={webQuery}
          title={t('web.searchPhotosFor', { name: webQuery })}
          /* §8.4 — შეკითხვა ფილმის სახელით იწყება, მსახიობები კი ჩიპებია;
             მონიშნულ მსახიობებზე ფოტოები **ნაწილდება**. */
          context={{
            base: webQuery,
            people: (detail?.cast ?? []).map((member) => ({ id: member.id, name: member.name })),
            attachesTo: detail?.record.title_ka || detail?.record.title_en || undefined,
          }}
          onClose={() => setWebOpen(false)}
          onImported={invalidate}
        />
      )}

      {videoOpen && (
        <WebVideoDialog
          target={type}
          id={id}
          initialQuery={webQuery}
          title={t('web.searchVideosFor', { name: webQuery })}
          onClose={() => setVideoOpen(false)}
          onSaved={invalidate}
        />
      )}

      <GalleryDownloadDialog
        open={downloadOpen}
        onOpenChange={setDownloadOpen}
        defaults={defaults}
        onRun={(next) => save.mutate(next)}
        pin={{
          record: {
            type,
            id,
            title: detail?.record.title_ka || detail?.record.title_en || undefined,
          },
        }}
      />
    </>
  )

  if (bare) return <div>{body}</div>

  return <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">{body}</section>
}

/** მსახიობის გალერეა — მისივე გვერდზე, ფილმებისა და სერიალების გვერდით */
export function ActorGallery({
  castId,
  actorName,
  bare,
}: {
  castId: number
  actorName?: string
  bare?: boolean
}) {
  const { t } = useTranslation()
  const { has } = useModules()
  const qc = useQueryClient()
  const { defaults, save } = useGalleryDefaults()
  const { askDelete } = useGalleryActions(['actor'])
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)

  const galleryQ = useQuery({
    queryKey: ['gallery', 'cast', castId],
    queryFn: () => fetchActorGallery(castId),
    enabled: has('gallery') && Number.isFinite(castId),
  })

  /* ⚠️ **გამორთული მოდული ჩუმად არ ქრება** (ეტაპი 3). ადრე აქ `null`
     ბრუნდებოდა, ე.ი. „გალერეის" მოდულის გარეშე მსახიობის გვერდზე არც
     ფოტოები ჩანდა, არც ვიდეოს ძებნის ღილაკი — და მიზეზი არსად ეწერა.
     ვიდეო-ბმული `gallery_videos`-ში ჯდება, ე.ი. შენახვას ნამდვილად ეს
     მოდული სჭირდება; ერთი წინადადება ამას ამბობს. */
  if (!has('gallery')) {
    const note = <p className="text-sm text-muted-foreground">{t('gallery.moduleOff')}</p>

    return bare ? <div>{note}</div> : (
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">{note}</section>
    )
  }

  const detail = galleryQ.data
  const name = actorName ?? detail?.actor.name_ka ?? detail?.actor.name ?? ''

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['gallery', 'cast', castId] })
    qc.invalidateQueries({ queryKey: ['gallery-summary'] })
  }

  const body = (
    <>
      <GalleryPanel
        images={detail?.images ?? []}
        bytes={detail?.bytes}
        onDelete={askDelete}
        emptyText={t('gallery.emptyActor')}
        actions={
          <>
            <Button
              size="sm"
              variant="ghost"
              className="rounded-none"
              disabled={detail?.actor.has_tmdb === false}
              onClick={() => setDownloadOpen(true)}
            >
              <DownloadCloud className="size-4" />
              {t('gallery.fetch')}
            </Button>
            <Button size="sm" variant="ghost" className="rounded-none" onClick={() => setVideoOpen(true)}>
              <Video className="size-4" />
              {t('web.searchVideos')}
            </Button>
          </>
        }
      />

      {detail?.actor.has_tmdb === false && (
        <p className="mt-3 text-xs text-muted-foreground">{t('gallery.noTmdbId')}</p>
      )}

      <GalleryVideoList videos={detail?.videos ?? []} onChanged={invalidate} />

      <GalleryDownloadDialog
        open={downloadOpen}
        onOpenChange={setDownloadOpen}
        defaults={defaults}
        onRun={(next) => save.mutate(next)}
        pin={{ actor: { id: castId, name } }}
      />

      {videoOpen && (
        <WebVideoDialog
          target="cast_member"
          id={castId}
          initialQuery={detail?.actor.name ?? name}
          title={t('web.searchVideosFor', { name })}
          onClose={() => setVideoOpen(false)}
          onSaved={invalidate}
        />
      )}
    </>
  )

  if (bare) return <div>{body}</div>

  return <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">{body}</section>
}

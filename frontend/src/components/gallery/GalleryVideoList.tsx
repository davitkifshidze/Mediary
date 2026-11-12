import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Play, Save, SquarePen, Trash2, X } from 'lucide-react'
import { deleteGalleryVideo, updateGalleryVideo, type GalleryVideo } from '@/api/gallery'
import { isAllowedEmbed } from '@/lib/embed'
import { errorMessage } from '@/lib/errors'
import { usePlayer, type PlayerItem } from '@/lib/player'
import { formatDuration } from '@/lib/videoDuration'
import { CountBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { MENU_ICONS, RecordContextMenu, type MenuAction } from '@/components/ui/record-menu'
import { PlayerSpot } from '@/components/PlayerSpot'
import type { VideoPlatform } from '@/api/videos'

/* ============================================================
   ჩანაწერზე/მსახიობზე შენახული **ვიდეო-ბმულები**.

   ⚠️ **სექცია თვითონ ქრება, როცა ბმული არ არის** — ცარიელი „ვიდეოები"
   სათაური ყოველ ჩანაწერზე ზედმეტ ხმაურს ქმნიდა; ძებნის ღილაკი ისედაც
   ზემოთაა. გამონაკლისი — `standalone`: ცალკე სექციად მდგარი სია (ბუკმარკის
   ფანჯარა) ცარიელზეც ჩანს, ცარიელი მდგომარეობითა და ძებნის ღილაკით.

   ⚠️ **ერთი ვიდეო — ერთი პატარა ბარათი**, ორ სვეტად; თითოზე „ნახვა",
   „რედაქტირება" და „წაშლა". პირველი ვიდეო დიდ ფლეიერად აღარ იხატება:
   **დიდი ადგილი (`PlayerSpot`) მხოლოდ „ნახვაზე" ჩნდება** — სანამ არაფერი
   უკრავს, სია მოკლეა და ფანჯარას არ ავსებს.

   ⚠️ **დაკვრა საერთო დამკვრელშია** — გვერდის გადართვა დაკვრას არ
   წყვეტს. ჩაუშენებელი პლატფორმა ბმულით იხსნება და ამას ცხადად ამბობს.

   ⚠️ **ვიდეო ფანჯარაშივე უკრავს** — სიის ზემოთ 16:9 ადგილი (`PlayerSpot`),
   ვიდეოების ფანჯრის წესებით: „გატანა" ჩარჩოში ამაგრებს და ფანჯარას ხურავს,
   ფანჯრის დახურვა გაუტანელ ვიდეოს ხურავს. სია „მისას" რიგის `origin`-ით
   ცნობს (გალერეის id-ები სხვა `link`-ს ემთხვევა) — ეს სიის ეგზემპლარია.

   ⚠️ **რედაქტირება მხოლოდ სათაურსა და არხს ცვლის**: სხვა ბმული სხვა
   ვიდეოა (წაშლა + დამატება).
   ============================================================ */

export function GalleryVideoList({
  videos,
  onChanged,
  standalone,
  action,
}: {
  videos: GalleryVideo[]
  onChanged?: () => void
  /** ცალკე სექციად: ცარიელზეც იხატება და ზედა გამყოფი ხაზი არ აქვს */
  standalone?: boolean
  /** სათაურის მარჯვნივ და ცარიელ მდგომარეობაში — „ვიდეოს ძებნა" */
  action?: ReactNode
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { toast } = useToast()
  const player = usePlayer()
  const origin = `gallery-videos:${useId()}`
  const [editing, setEditing] = useState<GalleryVideo | null>(null)
  const spot = useRef<HTMLDivElement>(null)

  const changed = () => {
    qc.invalidateQueries({ queryKey: ['gallery-videos'] })
    onChanged?.()
  }

  const remove = useMutation({
    mutationFn: (id: number) => deleteGalleryVideo(id),
    onSuccess: () => {
      changed()
      toast({ title: t('gallery.videoDeleted'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const live = player.origin === origin
  useEffect(() => {
    // „ნახვა" ქვედა ბარათიდანაც იჭირება — ფლეიერი კი ზემოთ ჩნდება (jsdom-ს `scrollIntoView` არ აქვს)
    if (live) spot.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [live])

  if (!videos.length && !standalone) return null

  const toItem = (video: GalleryVideo): PlayerItem => ({
    // ⚠️ `link` — მრიცხველი არ არსებობს (ბმული `videos` ცხრილში არ დევს)
    kind: 'link',
    id: video.id,
    title: video.title ?? video.url,
    subtitle: video.channel,
    url: video.url,
    embedUrl: video.embed_url,
    platform: (video.platform ?? 'other') as VideoPlatform,
    thumbnail: video.thumbnail_url,
    duration: video.duration,
  })

  const openSource = (video: GalleryVideo) => window.open(video.url, '_blank', 'noreferrer')
  const watch = (index: number) =>
    isAllowedEmbed(videos[index].embed_url)
      ? player.play(videos.map(toItem), index, t('gallery.videosTitle'), origin)
      : openSource(videos[index])

  const askDelete = async (video: GalleryVideo) => {
    const ok = await confirm({
      title: t('gallery.videoDeleteTitle'),
      description: t('gallery.videoDeleteHint'),
      confirmText: t('confirm.delete'),
      variant: 'destructive',
    })
    if (ok) remove.mutate(video.id)
  }

  return (
    <section className={standalone ? undefined : 'mt-6 border-t border-border pt-5'} data-testid="gallery-videos">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3
          className={
            standalone
              ? 'flex items-center gap-1.5 text-sm font-semibold'
              : 'flex items-center gap-2 font-mono text-sm uppercase tracking-wider text-muted-foreground'
          }
        >
          {t('gallery.videosTitle')}
          <CountBadge count={videos.length} />
          <InfoHint info={t('gallery.videosHint')} />
        </h3>
        {videos.length > 0 && action}
      </div>

      {!videos.length && <EmptyState kind="video" className="py-6" title={t('gallery.noVideos')} actions={action} />}

      {live && (
        <div ref={spot} className="mb-3">
          <PlayerSpot thumbnail={player.current?.thumbnail} live onPlay={() => {}} />
        </div>
      )}

      {videos.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {videos.map((video, index) => {
            const playable = isAllowedEmbed(video.embed_url)
            /* მარჯვენა ღილაკი: ნახვა · წყარო · რედაქტირება · — · წაშლა */
            const actions: MenuAction[] = [
              { key: 'play', label: t('gallery.videoWatch'), icon: MENU_ICONS.play, run: () => watch(index) },
              { key: 'source', label: t('photos.infoOpen'), icon: MENU_ICONS.link, run: () => openSource(video) },
              { key: 'edit', label: t('actions.edit'), icon: MENU_ICONS.edit, run: () => setEditing(video) },
              {
                key: 'delete',
                label: t('actions.delete'),
                icon: MENU_ICONS.delete,
                danger: true,
                separator: true,
                run: () => askDelete(video),
              },
            ]

            return (
              <RecordContextMenu key={video.id} actions={actions}>
                <li className="flex flex-col gap-2.5 rounded-md border border-border bg-background p-2.5" data-testid="gallery-video">
                  <div className="flex gap-3">
                    <button
                      data-kind="tile"
                      type="button"
                      aria-label={video.title ?? video.url}
                      onClick={() => watch(index)}
                      className="relative h-16 w-28 shrink-0 cursor-pointer overflow-hidden rounded-md bg-muted"
                    >
                      {video.thumbnail_url && (
                        <img src={video.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />
                      )}
                      <span className="absolute inset-0 grid place-items-center bg-black/25 text-white opacity-0 transition-opacity hover:opacity-100">
                        <Play className="size-5" />
                      </span>
                      {video.duration != null && (
                        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 text-[10px] tabular-nums text-white">
                          {formatDuration(video.duration)}
                        </span>
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium">{video.title ?? video.url}</p>
                      {video.channel && <p className="truncate text-xs text-muted-foreground">{video.channel}</p>}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => watch(index)} data-testid="gallery-video-watch">
                      {playable ? <Play className="size-3.5" /> : <ExternalLink className="size-3.5" />}
                      {playable ? t('gallery.videoWatch') : t('actions.openLink')}
                    </Button>
                    <Button type="button" variant="edit" size="sm" onClick={() => setEditing(video)} data-testid="gallery-video-edit">
                      <SquarePen className="size-3.5" />
                      {t('actions.edit')}
                    </Button>
                    <Button type="button" variant="destructiveOutline" size="sm" className="ml-auto" onClick={() => askDelete(video)}>
                      <Trash2 className="size-3.5" />
                      {t('actions.delete')}
                    </Button>
                  </div>
                </li>
              </RecordContextMenu>
            )
          })}
        </ul>
      )}

      {editing && <VideoEditDialog video={editing} onClose={() => setEditing(null)} onSaved={changed} />}
    </section>
  )
}

/** შენახული ბმულის სათაური და არხი — ვებძებნის მოტანილი სათაური ხშირად გრძელი ან უცხო ენაზეა */
function VideoEditDialog({ video, onClose, onSaved }: { video: GalleryVideo; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [title, setTitle] = useState(video.title ?? '')
  const [channel, setChannel] = useState(video.channel ?? '')
  const ids = useId()

  const save = useMutation({
    mutationFn: () => updateGalleryVideo(video.id, { title: title.trim() || null, channel: channel.trim() || null }),
    onSuccess: () => {
      onSaved()
      toast({ title: t('gallery.videoSaved'), variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <ModalShell title={t('gallery.videoEdit')} hint={t('gallery.videoEditHint')} onClose={onClose}>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
        data-testid="gallery-video-form"
      >
        <div>
          <Label htmlFor={`${ids}-title`}>{t('gallery.videoTitle')}</Label>
          <Input id={`${ids}-title`} autoFocus maxLength={500} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label htmlFor={`${ids}-channel`}>{t('gallery.videoChannel')}</Label>
          <Input id={`${ids}-channel`} maxLength={255} value={channel} onChange={(e) => setChannel(e.target.value)} />
        </div>
        <p className="truncate text-xs text-muted-foreground" title={video.url}>
          {video.url}
        </p>

        <ModalFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            <X className="size-4" />
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            <Save className="size-4" />
            {save.isPending ? t('actions.saving') : t('actions.save')}
          </Button>
        </ModalFooter>
      </form>
    </ModalShell>
  )
}

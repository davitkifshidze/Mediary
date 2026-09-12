import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DownloadCloud, Globe, Images, Search, User, Video } from 'lucide-react'
import {
  fetchActorGalleryImages,
  fetchGalleryGroups,
  type GalleryGroup,
  type GalleryGroupBy,
} from '@/api/gallery'
import { errorMessage } from '@/lib/errors'
import { MEDIA_NAV_KEY } from '@/lib/media'
import { useContentLang } from '@/lib/settings'
import { cn, formatBytes } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { PhotoStack } from '@/components/ui/photo-stack'
import { useToast } from '@/components/ui/feedback'
import { GalleryStackSkeleton } from '@/components/gallery/GalleryPhotoGrid'
import { GroupPhotos } from '@/components/gallery/GroupPhotos'
import { WebImageDialog } from '@/components/WebImageDialog'
import { WebVideoDialog } from '@/components/WebVideoDialog'

/* ============================================================
   ჯგუფების ჭრილი — **ერთი კომპონენტი ოთხივესთვის** (§8.5).

   `record` · `actor` · `source` (რომელი დომენიდან) · `provider` (რომელმა
   წყარომ მოიტანა). ოთხივე ერთსა და იმავე endpoint-ს ეკითხება და ერთსა და
   იმავე დასტად იხატება — განსხვავება მხოლოდ ფილტრებსა და მოქმედებებშია.

   ⚠️ **ჩამოტვირთვა ჯგუფშივეა** (§8.5): „მასობრივი ჩამოტვირთვის" ბლოკი
   იმიტომ იყო ცუდი, რომ სკოუპს ხელახლა ალაგებინებდა იქ, სადაც ის უკვე
   ცნობილია — ჯგუფის ბარათზე კონტექსტი უკვე არსებობს.

   ⚠️ **ვებძებნა მხოლოდ იქ, სადაც მიბმის მისამართია** — „წყაროს" და
   „მომწოდებლის" ჯგუფი დომენია და არა ერთეული, ე.ი. ფოტოს მიბმა არსად აქვს.
   ============================================================ */

export function GroupsCut({
  by,
  onDownloadRecord,
  onDownloadActor,
}: {
  by: Extract<GalleryGroupBy, 'record' | 'actor' | 'source' | 'provider'>
  /** ჩანაწერზე ჩამოტვირთვა — დიალოგს გვერდი ხსნის (სკოუპი უკვე ცნობილია) */
  onDownloadRecord?: (group: GalleryGroup) => void
  /** მსახიობზე ჩამოტვირთვა პარამეტრებით */
  onDownloadActor?: (group: GalleryGroup) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { toast } = useToast()

  const [q, setQ] = useState('')
  const [gender, setGender] = useState<'all' | 'female' | 'male'>('all')
  const [open, setOpen] = useState<GalleryGroup | null>(null)
  const [webOn, setWebOn] = useState<GalleryGroup | null>(null)
  const [videoOn, setVideoOn] = useState<GalleryGroup | null>(null)

  const groupsQ = useQuery({
    queryKey: ['gallery-groups', by, q, gender],
    queryFn: () =>
      fetchGalleryGroups(by, {
        q: q.trim() || undefined,
        gender: by === 'actor' && gender !== 'all' ? gender : undefined,
        previews: 5,
      }),
  })

  /** მსახიობზე ჩამოტვირთვა პირდაპირ ერთი გამოძახებაა (ნაგულისხმევი პარამეტრებით) */
  const quickActor = useMutation({
    mutationFn: (id: number) => fetchActorGalleryImages(id),
    onSuccess: (result) => {
      ;['gallery-photos', 'gallery-groups', 'gallery-summary'].forEach((key) =>
        qc.invalidateQueries({ queryKey: [key] }),
      )
      toast({
        title: result.added ? t('gallery.fetchedCount', { count: result.added }) : t('gallery.actorNothingNew'),
        variant: result.added ? 'success' : 'info',
      })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const titleOf = (group: GalleryGroup) => {
    if (group.from) return t(MEDIA_NAV_KEY[group.from])
    if (group.provider) return t(`photos.source.${group.provider}`, group.provider)
    return (lang === 'ka' ? group.title_ka || group.title : group.title || group.title_ka) || `#${group.id}`
  }

  /** ჯგუფის შიგნით შესვლა — ორი მისამართი, ერთი ფორმა */
  const filtersFor = (group: GalleryGroup) => {
    if (group.from) return { from: group.from }
    if (group.provider) return { provider: group.provider }
    return { owner: `${group.kind === 'actor' ? 'actor' : group.kind}:${group.id}` }
  }

  const keyFor = (group: GalleryGroup) =>
    group.from ? `from:${group.from}` : group.provider ? `provider:${group.provider}` : `${group.kind}:${group.id}`

  if (open) {
    const isActor = open.kind === 'actor'
    const isRecord = !open.from && !open.provider && !isActor

    return (
      <GroupPhotos
        title={titleOf(open)}
        subtitle={t('gallery.photos', { count: open.photos })}
        filters={filtersFor(open)}
        cacheKey={keyFor(open)}
        onBack={() => setOpen(null)}
        showOwner={!!open.from || !!open.provider}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            {isActor && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/actors/${open.id}`)}>
                <User className="size-4" />
                {t('gallery.actorPage')}
              </Button>
            )}
            {/* ⚠️ სათაური **state-ით** მიჰყვება: არა-მედია მშობელს (სიმღერა ·
                წიგნი · თამაში) დეტალის endpoint არ აქვს, ე.ი. ის გვერდი მის
                სახელს სხვაგვარად ვერ გაიგებდა და ვებძებნა ცარიელი ველით
                გაიხსნებოდა. */}
            {isRecord && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate(`/gallery/records/${open.kind}/${open.id}`, {
                    state: { title: titleOf(open) },
                  })
                }
              >
                <Images className="size-4" />
                {t('gallery.openRecord')}
              </Button>
            )}
            {open.has_tmdb && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => (isActor ? onDownloadActor?.(open) : onDownloadRecord?.(open))}
              >
                <DownloadCloud className="size-4" />
                {t('gallery.fetchMore')}
              </Button>
            )}
            {(isActor || isRecord) && (
              <>
                <Button variant="outline" size="sm" onClick={() => setWebOn(open)}>
                  <Globe className="size-4" />
                  {t('web.searchPhotos')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setVideoOn(open)}>
                  <Video className="size-4" />
                  {t('web.searchVideos')}
                </Button>
              </>
            )}
          </div>
        }
      />
    )
  }

  const groups = groupsQ.data?.groups ?? []

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* ძებნა მხოლოდ იქ, სადაც ჯგუფს სახელი აქვს */}
        {(by === 'record' || by === 'actor') && (
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('gallery.searchPlaceholder')}
              className="pl-8"
            />
          </div>
        )}

        {/* §3.2 — „ქალი/კაცი" ჭრილი; სქესი TMDB-დან მოდის და ძველ ჩანაწერებზე ცარიელია */}
        {by === 'actor' && (
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'female', 'male'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setGender(key)}
                className={cn(
                  'cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors',
                  gender === key
                    ? 'border-primary bg-secondary text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {key === 'all' ? t('filter.all') : t(`gallery.cast.${key}`)}
              </button>
            ))}
          </div>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {t('gallery.groupCount', { count: groups.length })}
        </span>
      </div>

      {by === 'source' && <p className="mb-3 text-xs text-muted-foreground">{t('gallery.bySourceHint')}</p>}
      {by === 'provider' && <p className="mb-3 text-xs text-muted-foreground">{t('gallery.byProviderHint')}</p>}

      {groupsQ.isLoading ? (
        <GalleryStackSkeleton />
      ) : !groups.length ? (
        <EmptyState
          icon={<Images className="size-6" />}
          title={t('gallery.noPhotosYet')}
          hint={q ? t('gallery.emptyFiltered') : t('gallery.emptyHint')}
        />
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {groups.map((group) => (
            <li key={keyFor(group)}>
              <PhotoStack
                title={titleOf(group)}
                subtitle={
                  by === 'record' && lang === 'ka' && group.title && group.title_ka ? group.title : undefined
                }
                label={`${t('gallery.photos', { count: group.photos })} · ${formatBytes(group.bytes)}`}
                count={group.photos}
                images={groupsQ.data?.previews[keyFor(group)] ?? []}
                aspect={by === 'actor' ? 'portrait' : 'wide'}
                onClick={() => setOpen(group)}
                actions={
                  group.has_tmdb ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={quickActor.isPending}
                      onClick={() =>
                        group.kind === 'actor'
                          ? onDownloadActor
                            ? onDownloadActor(group)
                            : quickActor.mutate(group.id)
                          : onDownloadRecord?.(group)
                      }
                    >
                      <DownloadCloud className="size-3.5" />
                      {t('gallery.fetch')}
                    </Button>
                  ) : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}

      {webOn && (
        <WebImageDialog
          target={webOn.kind === 'actor' ? 'cast_member' : (webOn.kind as 'movie')}
          id={webOn.id}
          initialQuery={titleOf(webOn)}
          title={t('web.searchPhotosFor', { name: titleOf(webOn) })}
          context={{ base: titleOf(webOn), attachesTo: titleOf(webOn) }}
          onClose={() => setWebOn(null)}
          onImported={() => {
            ;['gallery-photos', 'gallery-groups', 'gallery-summary'].forEach((key) =>
              qc.invalidateQueries({ queryKey: [key] }),
            )
          }}
        />
      )}

      {videoOn && (
        <WebVideoDialog
          target={videoOn.kind === 'actor' ? 'cast_member' : (videoOn.kind as 'movie')}
          id={videoOn.id}
          initialQuery={titleOf(videoOn)}
          title={t('web.searchVideosFor', { name: titleOf(videoOn) })}
          onClose={() => setVideoOn(null)}
        />
      )}
    </section>
  )
}

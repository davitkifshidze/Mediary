import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Clapperboard, EyeOff, Info, Loader2, Play, Plus, Sparkles, Tags, Undo2 } from 'lucide-react'
import { mediaApi } from '@/api/media'
import { fetchSuggestionTrailer, type Suggestion, type SuggestionWhy } from '@/api/suggestions'
import type { Status } from '@/api/types'
import type { VideoPlatform } from '@/api/videos'
import { genreName } from '@/lib/display'
import { errorMessage } from '@/lib/errors'
import { mediaOf, type MediaType } from '@/lib/media'
import { usePlayer } from '@/lib/player'
import { useContentLang } from '@/lib/settings'
import { SOURCE_NAMES } from '@/lib/suggest'
import { ModuleIcon } from '@/components/ModuleIcon'
import { PosterImage } from '@/components/PosterImage'
import { RecordView } from '@/components/RecordView'
import { DictionaryStatusMenu } from '@/components/StatusMenu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/feedback'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { useQueue } from '@/components/ui/queue'
import { MENU_ICONS, statusActions, type MenuAction } from '@/components/ui/record-menu'

/* ============================================================
   **ერთი შემოთავაზება** — სამი სახე ერთ რენდერში (`RecordView`: ბარათი · ბადე · სტრიქონი):

   · **ახალი** — ჯერ არ მაქვს: „დამატება" (გვერდზე არჩეული სტატუსით, „აღმოჩენის"
     რიგით — `useQueue`), თრეილერი და „არ მაინტერესებს"; დაჭერა აღწერის ფანჯარას ხსნის;
   · **ჩემი სიიდან** — უკვე მაქვს და ჯერ არ მინახავს: სტატუსი იქვე იცვლება, დაჭერა
     ჩანაწერს ხსნის;
   · **დამალული** („დამალულების" სია) — მხოლოდ „დაბრუნება".

   ⚠️ **თრეილერი დაჭერისას იკითხება**: სიაში ასობით სათაურია და თითოზე ცალკე მოთხოვნა
   გვერდს დააგვიანებდა. აპის ფლეიერში იკვრება (`kind: 'link'` — `videos`-ის ჩანაწერი არ არის).
   ⚠️ „რატომ" ფაქტებია — რომელი ჩემი სათაურების გამო, რომელმა წყარომ მიუთითა და რა აქვთ
   საერთო; მოდელის დაწერილი ტექსტი აქ არ არის.
   ============================================================ */

export function SuggestionItem({
  item,
  type,
  statuses,
  addStatus,
  hiding,
  onHide,
}: {
  item: Suggestion
  type: MediaType
  statuses: readonly Status[]
  /** რა სტატუსით ემატება ახალი სათაური (გვერდის ამრჩევი) */
  addStatus: string | undefined
  hiding: boolean
  /** „არ მაინტერესებს" (`true`) ან დამალულის დაბრუნება (`false`) */
  onHide: (hidden: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const nav = useNavigate()
  const qc = useQueryClient()
  const player = usePlayer()
  const { toast } = useToast()
  const { enqueue, isQueued } = useQueue()
  const [details, setDetails] = useState(false)

  const title = (lang === 'ka' ? item.title_ka : null) || item.title || item.title_ka || ''
  const overview = (lang === 'ka' ? item.overview_ka : null) || item.overview || item.overview_ka
  const queued = !item.owned && isQueued(item.tmdb_id, type)
  const recordId = item.record?.id

  const add = () => enqueue([{ tmdbId: item.tmdb_id, title, status: addStatus }], type)
  const open = () => (recordId ? nav(`${mediaOf(type).detailBase}/${recordId}`) : setDetails(true))

  const trailer = useMutation({
    mutationFn: () => fetchSuggestionTrailer(type, item.tmdb_id),
    onSuccess: (found) => {
      if (!found) {
        toast({ title: t('suggest.trailerMissing'), variant: 'info' })
        return
      }

      player.play(
        [
          {
            kind: 'link',
            id: item.tmdb_id,
            title,
            subtitle: null,
            url: found.url,
            embedUrl: found.embed_url,
            platform: (found.platform ?? 'other') as VideoPlatform,
            thumbnail: item.poster,
            duration: null,
          },
        ],
        0,
        t('detail.trailer'),
      )
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const status = useMutation({
    mutationFn: (key: string) => mediaApi(type).setStatus(recordId!, key),
    // ⚠️ `[type]` — სია, მთვლელები და ეს გვერდიც: ნანახად მონიშნული შემოთავაზებიდან გადის
    onSuccess: () => qc.invalidateQueries({ queryKey: [type] }),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const actions: MenuAction[] = item.hidden
    ? [{ key: 'restore', label: t('suggest.restore'), icon: Undo2, run: () => onHide(false) }]
    : item.owned
      ? [
          { key: 'open', label: t('actions.open'), icon: MENU_ICONS.open, run: open },
          statusActions(t('form.status'), [...statuses], item.record?.status, lang, (key) => status.mutate(key)),
        ]
      : [
          { key: 'add', label: t('actor.add'), icon: Plus, disabled: queued, run: add },
          { key: 'trailer', label: t('detail.trailer'), icon: Play, run: () => trailer.mutate() },
          { key: 'hide', label: t('suggest.hide'), icon: EyeOff, separator: true, run: () => onHide(true) },
        ]

  const bar = (
    <div className="flex shrink-0 flex-wrap items-center gap-1" data-testid="suggestion-actions">
      {item.hidden ? (
        <Button type="button" variant="outline" size="sm" disabled={hiding} onClick={() => onHide(false)} data-testid="suggestion-restore">
          <Undo2 className="size-3.5" />
          {t('suggest.restore')}
        </Button>
      ) : item.owned ? (
        <>
          <DictionaryStatusMenu
            status={item.record?.status ?? null}
            statuses={statuses}
            label={t('form.status')}
            emptyLabel={t('library.noStatus')}
            onChange={(key) => status.mutate(key)}
          />
          <Button type="button" variant="outline" size="sm" onClick={open} data-testid="suggestion-open">
            <Info className="size-3.5" />
            {t('actions.open')}
          </Button>
        </>
      ) : (
        <>
          <Button type="button" size="sm" disabled={queued} onClick={add} data-testid="suggestion-add">
            {queued ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            {queued ? t('queue.queued') : t('actor.add')}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={trailer.isPending} onClick={() => trailer.mutate()} data-testid="suggestion-trailer">
            {trailer.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            {t('detail.trailer')}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={hiding} onClick={() => onHide(true)} data-testid="suggestion-hide">
            <EyeOff className="size-3.5" />
            {t('suggest.hide')}
          </Button>
        </>
      )}
    </div>
  )

  const meta = (
    <>
      {item.year ? <span>{item.year}</span> : null}
      {item.genres.slice(0, 2).map((g, i) => (
        <span key={i}>{genreName({ name_en: g.name_en ?? '', name_ka: g.name_ka }, lang)}</span>
      ))}
      {item.rating ? <span title={t('rating.tmdbAverage')}>TMDB {item.rating}</span> : null}
    </>
  )

  return (
    <>
      <RecordView
        title={title}
        onOpen={open}
        openLabel={title}
        staticTitle={item.hidden}
        photo={item.poster}
        shape="poster"
        placeholder={<ModuleIcon name="Film" className="size-5" />}
        titleAside={
          item.owned ? (
            <Badge className="bg-secondary" data-testid="suggestion-owned">
              {t('suggest.inLibrary')}
            </Badge>
          ) : null
        }
        meta={meta}
        extra={
          item.why ? (
            <>
              <Why why={item.why} lang={lang} />
              {overview && <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{overview}</p>}
            </>
          ) : null
        }
        bar={bar}
        actions={actions}
        testId="suggestion"
      />

      {details && (
        <ModalShell
          title={title}
          lead={
            <span className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
              <PosterImage src={item.poster} alt="" className="h-full w-full" />
            </span>
          }
          onClose={() => setDetails(false)}
        >
          <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">{meta}</p>
          {item.why && <Why why={item.why} lang={lang} className="mt-3" />}
          {overview && <p className="mt-3 whitespace-pre-line text-sm">{overview}</p>}
          <ModalFooter>{bar}</ModalFooter>
        </ModalShell>
      )}
    </>
  )
}

/** „რატომ" — ფაქტების ხაზები: ჩემი სათაურები (წყაროებით), სიუჟეტი, ჟანრები, საკვანძო სიტყვები */
function Why({ why, lang, className }: { why: SuggestionWhy; lang: 'ka' | 'en'; className?: string }) {
  const { t } = useTranslation()
  const name = (row: { title_ka: string | null; title_en: string | null }) =>
    (lang === 'ka' ? row.title_ka || row.title_en : row.title_en || row.title_ka) ?? ''

  const bases = why.bases.map((basis) => `${name(basis)} (${basis.sources.map((s) => SOURCE_NAMES[s]).join(', ')})`)
  const rest = why.bases_total - why.bases.length
  const genres = why.genres.map((g) => genreName({ name_en: g.name_en ?? '', name_ka: g.name_ka }, lang))

  const lines = [
    bases.length > 0 && {
      key: 'bases',
      icon: Clapperboard,
      text: t('suggest.why.bases', { titles: bases.join(', ') }) + (rest > 0 ? ` ${t('suggest.why.more', { count: rest })}` : ''),
    },
    why.plot && { key: 'plot', icon: Sparkles, text: t('suggest.why.plot', { title: name(why.plot), match: why.plot.match }) },
    genres.length > 0 && { key: 'genres', icon: Tags, text: t('suggest.why.genres', { genres: genres.join(', ') }) },
    why.keywords.length > 0 && { key: 'keywords', icon: Tags, text: t('suggest.why.keywords', { keywords: why.keywords.join(', ') }) },
  ].filter((line): line is { key: string; icon: typeof Tags; text: string } => Boolean(line))

  if (!lines.length) return null

  return (
    <ul className={className ?? 'mt-1.5'} data-testid="suggestion-why">
      {lines.map(({ key, icon: Icon, text }) => (
        <li key={key} className="flex items-start gap-1.5 text-xs text-muted-foreground" data-why={key}>
          <Icon className="mt-0.5 size-3.5 shrink-0 text-[var(--mod)]" />
          <span className="min-w-0">{text}</span>
        </li>
      ))}
    </ul>
  )
}

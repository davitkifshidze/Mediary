import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Dices, Download, FileText, Trash2, Upload, Users } from 'lucide-react'
import {
  createBoardGameNote,
  deleteBoardGameFile,
  deleteBoardGameNote,
  fetchBoardGameFiles,
  fetchBoardGameNotes,
  updateBoardGameNote,
  uploadBoardGameFiles,
  type BoardGame,
  type BoardGameFile,
  toggleBoardGameFavorite,
} from '@/api/boardGames'
import { storageUrl } from '@/lib/api'
import { useFileViewer } from '@/components/FileViewer'
import { RecordNotes } from '@/components/RecordNotes'
import { errorMessage } from '@/lib/errors'
import { DetailFacts, DetailHero, DetailPhotos, DetailSection } from '@/components/DetailHero'
import { ModuleIcon } from '@/components/ModuleIcon'
import { RatingStars } from '@/components/ui/star-rating'
import { FavoriteButton } from '@/components/ui/favorite-button'
import { Button } from '@/components/ui/button'
import { ModalShell } from '@/components/ui/modal-shell'
import { VisibilityBadge } from '@/components/VisibilityToggle'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { formatBytes } from '@/lib/utils'

/* ============================================================
   ბორდგეიმის დეტალები — წესები, გალერეა და ჩანიშვნები (Tasks §14).

   ⚠️ **გალერეა `board_game_files.kind = 'image'`-შია** და არა
   `gallery_images`-ში: ის ცხრილი TMDB-დან ჩამოტვირთულ ფოტოებს ინახავს,
   user-ის ატვირთული კი სექციის ცხრილშია (ვიდეოს იგივე წესი).

   ⚠️ **რიგი §26.4-ით (თამაშის §22.2-ის წესი)**: თავში მთავარი ფოტო,
   ჟანრი, ქულა და მოკლე ცნობები; მერე ფოტოები ვიტრინად — აქამდე ისინი
   მაღაზიების ბმულების **ქვემოთ** იყო და მთავარი ფოტო საერთოდ არ ჩანდა.
   ============================================================ */

export function BoardGameDetail({ game, onClose }: { game: BoardGame; onClose: () => void }) {
  // Tasks §8 — რჩეული დეტალის ფანჯარაშიც (აქამდე მხოლოდ სიის სტრიქონზე იყო)
  const favoriteQc = useQueryClient()
  const favorite = useMutation({
    mutationFn: () => toggleBoardGameFavorite(game.id),
    onSuccess: () => void favoriteQc.invalidateQueries({ queryKey: ['board-games'] }),
  })
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)

  const players = [game.players_min, game.players_max].filter(Boolean)
  const playtime = [game.playtime_min, game.playtime_max].filter(Boolean)

  return (
    <ModalShell title={game.title} onClose={onClose} wide>
      <div className="mt-4 space-y-6">
        {/* ---------- თავი: მთავარი ფოტო, ჟანრი, ქულა, მოკლე ცნობები (§26.4) ---------- */}
        <DetailHero
          image={storageUrl(game.image)}
          alt={game.title}
          shape="wide"
          fallback={<Dices className="size-8 text-muted-foreground" />}
          badges={
            <>
              {/* Tasks §9 — ვარსკვლავები და „4.6 / 10" დეტალის თავში */}
              <RatingStars value={game.rating} />
              {/* §6.1 — ხილვადობა პროფილზე იმართება; აქ მხოლოდ ბეჯი ჩანს */}
              <VisibilityBadge value={game.visibility} />
              <FavoriteButton size="xs" active={game.is_favorite} pending={favorite.isPending} onToggle={() => favorite.mutate()} />
            </>
          }
        >
          {game.genre && (
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs">
                <ModuleIcon name={game.genre.icon} className="size-3" />
                {dictionaryName(game.genre, lang)}
              </span>
            </div>
          )}

          <DetailFacts>
            {game.designer && <span className="text-foreground">{game.designer}</span>}
            {game.publisher && game.publisher !== game.designer && <span>{game.publisher}</span>}
            {game.year ? <span>{game.year}</span> : null}
            {players.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-4" />
                {[...new Set(players)].join('–')} {t('boardGames.playersShort')}
              </span>
            )}
            {playtime.length > 0 && (
              <span>
                {[...new Set(playtime)].join('–')} {t('boardGames.minutesShort')}
              </span>
            )}
            {game.age_min ? <span>{game.age_min}+</span> : null}
            {game.complexity ? (
              <span>
                {t('boardGames.complexity')}: {game.complexity}/5
              </span>
            ) : null}
            {game.bgg_rating ? (
              <a
                href={game.bgg_url ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/70"
              >
                BGG {game.bgg_rating}
              </a>
            ) : null}
          </DetailFacts>
        </DetailHero>

        {/* ---------- ფოტოები — ზემოთ და დიდად (§26.4) ---------- */}
        <Gallery game={game} />

        {game.description && (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{game.description}</p>
        )}

        {/* ---------- მაღაზიები ---------- */}
        {game.links.length > 0 && (
          <DetailSection title={t('boardGames.shops')}>
            <ul className="space-y-1.5 text-sm">
              {game.links.map((link, i) => (
                <li key={i} className="flex items-center gap-2">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate text-primary hover:text-primary/70"
                  >
                    {link.label || link.url}
                  </a>
                  {link.price != null && (
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {link.price} {link.currency ?? ''}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </DetailSection>
        )}

        <DetailSection title={t('boardGames.rulesTitle')} hint={t('boardGames.rulesHint')}>
          <Files game={game} />
        </DetailSection>

        <DetailSection title={t('boardGames.notesTitle')}>
          <Notes game={game} />
        </DetailSection>
      </div>
    </ModalShell>
  )
}

/** ატვირთვის საერთო ქცევა — ორივე ბლოკს (გალერეა/წესები) ერთი და იგივე სჭირდება */
function useFiles(game: BoardGame, kind: BoardGameFile['kind']) {
  const qc = useQueryClient()
  const { toast } = useToast()

  const query = useQuery({
    queryKey: ['board-game-files', game.id, kind],
    queryFn: () => fetchBoardGameFiles(game.id, kind),
  })

  const done = () => {
    qc.invalidateQueries({ queryKey: ['board-game-files', game.id] })
    qc.invalidateQueries({ queryKey: ['board-games'] })
    // 17.1 — ატვირთვა/წაშლა კვოტას ცვლის, ჰედერის ინდიკატორიც უნდა განახლდეს
    qc.invalidateQueries({ queryKey: ['storage'] })
    qc.invalidateQueries({ queryKey: ['me'] })
  }
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const upload = useMutation({
    mutationFn: (picked: File[]) => uploadBoardGameFiles(game.id, kind, picked),
    onSuccess: done,
    onError: fail,
  })

  const remove = useMutation({ mutationFn: deleteBoardGameFile, onSuccess: done, onError: fail })

  return { query, upload, remove }
}

/**
 * ფოტოები — ვიტრინა (§26.4, თამაშის §22.2-ის წესი). ⚠️ აქამდე `PhotoGrid`
 * იყო ბმულების ქვემოთ; ვიტრინა ერთ ფოტოს დიდად აჩვენებს და დანარჩენს
 * ზოლად — ჩანაწერის ფანჯარაში ბიბლიოთეკის ბადე ზედმეტი იყო.
 */
function Gallery({ game }: { game: BoardGame }) {
  const { t } = useTranslation()
  const { query, upload, remove } = useFiles(game, 'image')

  return (
    <DetailPhotos
      title={t('boardGames.galleryTitle')}
      hint={t('boardGames.galleryHint')}
      items={(query.data ?? []).map((file) => ({ id: file.id, src: file.url, title: file.original_name }))}
      loading={query.isLoading}
      uploading={upload.isPending}
      onUpload={(picked) => upload.mutate(picked)}
      onDelete={(id) => remove.mutate(id)}
      uploadLabel={t('boardGames.addPhotos')}
      emptyTitle={t('boardGames.galleryEmpty')}
      deleteTitle={t('boardGames.photoDeleteTitle')}
    />
  )
}

function Files({ game }: { game: BoardGame }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const input = useRef<HTMLInputElement>(null)
  const { query, upload, remove } = useFiles(game, 'rules')
  const files = query.data ?? []
  /* ონლაინ მნახველი (2026-09-14) — ⚠️ `resolve: storageUrl` იმიტომაა, რომ ეს
     მოდული **საჯარო დისკზეა**; დისკს backend წყვეტს და არა ფრონტი (§17.5). */
  const viewer = useFileViewer({ resolve: storageUrl, onDelete: (id) => remove.mutate(id) })


  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        className="mb-3"
        disabled={upload.isPending}
        onClick={() => input.current?.click()}
      >
        <Upload className="size-3.5" />
        {upload.isPending ? t('actions.saving') : t('boardGames.addRules')}
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept="application/pdf"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? [])
          if (picked.length) upload.mutate(picked)
          e.target.value = ''
        }}
      />

      {!query.isLoading && !files.length && (
        <p className="text-xs text-muted-foreground">{t('boardGames.rulesEmpty')}</p>
      )}

      <ul className="space-y-1.5">
        {files.map((file) => (
          <li
            key={file.id}
            className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm"
          >
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            {/* ⚠️ სახელი **ღილაკია** — ონლაინ მნახველი (2026-09-14) */}
            <button
              type="button"
              onClick={() => viewer.open(file)}
              className="min-w-0 flex-1 cursor-pointer truncate text-left hover:text-primary"
              title={t('files.viewerOpen')}
            >
              {file.original_name ?? file.url}
            </button>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {formatBytes(file.size)}
            </span>
            <a
              href={storageUrl(file.url) ?? '#'}
              download
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('books.fileDownload')}
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground"
            >
              <Download className="size-4" />
            </a>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-destructive"
              onClick={async () => {
                const ok = await confirm({
                  title: t('books.fileDeleteTitle'),
                  description: t('books.fileDeleteHint', { name: file.original_name ?? file.url }),
                  variant: 'destructive',
                })
                if (ok) remove.mutate(file.id)
              }}
              aria-label={t('actions.delete')}
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>

      {/* ონლაინ მნახველი — ერთი კომპონენტი ყველა მოდულზე (2026-09-14) */}
      {viewer.node}
    </div>
  )
}

function Notes({ game }: { game: BoardGame }) {
  const { t } = useTranslation()

  /* ⚠️ სხეული გაზიარებულია (`components/RecordNotes.tsx`, Tasks §6.7) */
  return (
    <RecordNotes
      queryKey={['board-game-notes', game.id]}
      invalidate={[['board-games']]}
      api={{
        list: () => fetchBoardGameNotes(game.id),
        create: (input) => createBoardGameNote(game.id, input.body),
        update: (id, input) => updateBoardGameNote(id, input.body),
        remove: deleteBoardGameNote,
      }}
      placeholder={t('boardGames.notePlaceholder')}
      addLabel={t('actions.add')}
      emptyTitle={t('boardGames.notesEmpty')}
      emptyHint={t('recordNotes.emptyHint')}
    />
  )
}

import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileText, Trash2, Upload, Users } from 'lucide-react'
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
} from '@/api/boardGames'
import { storageUrl } from '@/lib/api'
import { useFileViewer } from '@/components/FileViewer'
import { RecordNotes } from '@/components/RecordNotes'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { InfoHint } from '@/components/ui/info-hint'
import { ModalShell } from '@/components/ui/modal-shell'
import { PhotoGrid } from '@/components/ui/photo-grid'
import { VisibilityBadge } from '@/components/VisibilityToggle'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { formatBytes } from '@/lib/utils'

/* ============================================================
   ბორდგეიმის დეტალები — წესები, გალერეა და ჩანიშვნები (Tasks §14).

   ⚠️ **გალერეა `board_game_files.kind = 'image'`-შია** და არა
   `gallery_images`-ში: ის ცხრილი TMDB-დან ჩამოტვირთულ ფოტოებს ინახავს,
   user-ის ატვირთული კი სექციის ცხრილშია (ვიდეოს იგივე წესი).
   ============================================================ */

export function BoardGameDetail({ game, onClose }: { game: BoardGame; onClose: () => void }) {
  const { t } = useTranslation()

  const players = [game.players_min, game.players_max].filter(Boolean)
  const playtime = [game.playtime_min, game.playtime_max].filter(Boolean)

  return (
    <ModalShell title={game.title} onClose={onClose} wide>
      <div className="mt-4 space-y-6">
        {/* Tasks 16.1 — ხილვადობა: მესამე (ბოლო) ფენა. პროფილი და მოდული
            `/profile`-ზეა, ე.ი. აქ მარტო ეს გადამრთველი ვერაფერს გამოაჩენს. */}
        <div className="flex justify-end">
          {/* §6.1 — ხილვადობა პროფილზე იმართება; აქ მხოლოდ ბეჯი ჩანს */}
          <VisibilityBadge value={game.visibility} />
        </div>

        {/* ---------- მოკლე ცნობები ---------- */}
        <section className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-border p-3 text-sm">
          {players.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-4 text-muted-foreground" />
              {[...new Set(players)].join('–')} {t('boardGames.playersShort')}
            </span>
          )}
          {playtime.length > 0 && (
            <span className="text-muted-foreground">
              {[...new Set(playtime)].join('–')} {t('boardGames.minutesShort')}
            </span>
          )}
          {game.age_min ? <span className="text-muted-foreground">{game.age_min}+</span> : null}
          {game.complexity ? (
            <span className="text-muted-foreground">
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
        </section>

        {game.description && (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{game.description}</p>
        )}

        {/* ---------- მაღაზიები ---------- */}
        {game.links.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">{t('boardGames.shops')}</h3>
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
          </section>
        )}

        <section>
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
            {t('boardGames.galleryTitle')}
            <InfoHint info={t('boardGames.galleryHint')} />
          </h3>
          <Gallery game={game} />
        </section>

        <section>
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
            {t('boardGames.rulesTitle')}
            <InfoHint info={t('boardGames.rulesHint')} />
          </h3>
          <Files game={game} />
        </section>

        <section>
          <h3 className="mb-1 text-sm font-semibold">{t('boardGames.notesTitle')}</h3>
          <Notes game={game} />
        </section>
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

function Gallery({ game }: { game: BoardGame }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const input = useRef<HTMLInputElement>(null)
  const { query, upload, remove } = useFiles(game, 'image')
  const images = query.data ?? []

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
        {upload.isPending ? t('actions.saving') : t('boardGames.addPhotos')}
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept="image/*"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? [])
          if (picked.length) upload.mutate(picked)
          e.target.value = ''
        }}
      />

      {/* ⚠️ **საერთო `PhotoGrid`** და არა თვითნაკეთი ბადე (§2.9-ის წესი):
          lightbox, მონიშვნები, მასობრივი წაშლა/ჩამოტვირთვა და „რამდენი
          გამოჩნდეს" ერთბაშად მოდის — თვითნაკეთ ბადეს ვერცერთი არ ჰქონდა. */}
      <PhotoGrid
        items={images.map((file) => ({
          id: file.id,
          src: file.url,
          title: file.original_name,
          size: file.size,
        }))}
        emptyText={query.isLoading ? '' : t('boardGames.galleryEmpty')}
        onDelete={async (ids) => {
          const ok = await confirm({
            title: t('boardGames.photoDeleteTitle'),
            variant: 'destructive',
          })
          if (ok) ids.forEach((id) => remove.mutate(id))
        }}
      />
    </div>
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
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
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

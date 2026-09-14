import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileText, Play, Plus, Trash2, Upload } from 'lucide-react'
import {
  createVideoNote,
  deleteVideoFile,
  deleteVideoNote,
  fetchVideoFiles,
  fetchVideoNotes,
  fetchSimilarVideos,
  updateVideoNote,
  uploadVideoFiles,
  type Video,
} from '@/api/videos'
import { storageUrl } from '@/lib/api'
import { useFileViewer } from '@/components/FileViewer'
import { errorMessage } from '@/lib/errors'
import { formatDuration } from '@/lib/videoDuration'
import { VideoEmbed } from '@/components/VideoEmbed'
import { Button } from '@/components/ui/button'
import { ModalShell } from '@/components/ui/modal-shell'
import { PhotoGrid } from '@/components/ui/photo-grid'
import { VisibilityBadge } from '@/components/VisibilityToggle'
import { Tabs, TabInfo, type TabItem } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm, useToast } from '@/components/ui/feedback'

/* ============================================================
   ვიდეოს დეტალური ხედი (K3): ვიდეო · ფოტოები · ჩანიშვნები · დოკუმენტები.
   ფაილები `video_files`-შია, ჩანიშვნები `video_notes`-ში — ცხრილი სექციისაა.
   ============================================================ */

type Tab = 'video' | 'images' | 'notes' | 'docs'

function bytes(n: number): string {
  if (n <= 0) return '0 KB'
  const units = ['B', 'KB', 'MB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function VideoDetail({
  video,
  onClose,
  onOpen,
}: {
  video: Video
  onClose: () => void
  /** „მსგავს ვიდეოზე" გადასვლა (K4) — მშობელი წყვეტს, რას აკეთებს */
  onOpen?: (video: Video) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const [tab, setTab] = useState<Tab>('video')
  const [noteBody, setNoteBody] = useState('')
  const [editing, setEditing] = useState<{ id: number; body: string } | null>(null)

  const filesQ = useQuery({
    queryKey: ['video-files', video.id],
    queryFn: () => fetchVideoFiles(video.id),
  })
  const notesQ = useQuery({ queryKey: ['video-notes', video.id], queryFn: () => fetchVideoNotes(video.id) })

  const images = (filesQ.data ?? []).filter((a) => a.kind === 'image')
  const docs = (filesQ.data ?? []).filter((a) => a.kind === 'doc')
  const notes = notesQ.data ?? []

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['video-files', video.id] })
    qc.invalidateQueries({ queryKey: ['video-notes', video.id] })
    qc.invalidateQueries({ queryKey: ['videos'] })
  }
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const upload = useMutation({
    mutationFn: ({ kind, files }: { kind: 'image' | 'doc'; files: File[] }) =>
      uploadVideoFiles(video.id, kind, files),
    onSuccess: refresh,
    onError: fail,
  })
  const removeFile = useMutation({ mutationFn: deleteVideoFile, onSuccess: refresh, onError: fail })
  /* ონლაინ მნახველი (2026-09-14) — ⚠️ `resolve: storageUrl` იმიტომაა, რომ ეს
     მოდული **საჯარო დისკზეა**; დისკს backend წყვეტს და არა ფრონტი (§17.5). */
  const viewer = useFileViewer({ resolve: storageUrl, onDelete: (id) => removeFile.mutate(id) })

  const addNote = useMutation({
    mutationFn: (body: string) => createVideoNote(video.id, body),
    onSuccess: () => {
      setNoteBody('')
      refresh()
    },
    onError: fail,
  })
  const saveNote = useMutation({
    mutationFn: ({ id, body }: { id: number; body: string }) => updateVideoNote(id, body),
    onSuccess: () => {
      setEditing(null)
      refresh()
    },
    onError: fail,
  })
  const removeNote = useMutation({ mutationFn: deleteVideoNote, onSuccess: refresh, onError: fail })

  const pick = (kind: 'image' | 'doc') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length) upload.mutate({ kind, files })
    e.target.value = ''
  }

  const TABS: TabItem<Tab>[] = [
    { value: 'video', label: t('videos.tabVideo') },
    { value: 'images', label: t('videos.tabImages'), badge: images.length || undefined },
    { value: 'notes', label: t('videos.tabNotes'), badge: notes.length || undefined },
    { value: 'docs', label: t('videos.tabDocs'), badge: docs.length || undefined },
  ]

  const uploadButton = (kind: 'image' | 'doc') => (
    <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-3.5 text-sm hover:bg-muted">
      {kind === 'image' ? <Upload className="size-4" /> : <Plus className="size-4" />}
      {t(kind === 'image' ? 'videos.uploadImages' : 'videos.uploadDocs')}
      <input
        type="file"
        multiple
        accept={kind === 'image' ? 'image/*' : '.pdf,.doc,.docx,.txt,.rtf,.odt,.xls,.xlsx,.csv,.ppt,.pptx'}
        className="hidden"
        onChange={pick(kind)}
      />
    </label>
  )

  return (
    <ModalShell title={video.title} onClose={onClose} wide>
      {/* Tasks 16.1 — ხილვადობა: მესამე (ბოლო) ფენა. პროფილი და მოდული
          `/profile`-ზეა, ე.ი. აქ მარტო ეს გადამრთველი ვერაფერს გამოაჩენს. */}
      <div className="mt-4 flex justify-end">
        {/* §6.1 — ხილვადობა პროფილზე იმართება; აქ მხოლოდ ბეჯი ჩანს */}
        <VisibilityBadge value={video.visibility} />
      </div>

      <Tabs items={TABS} value={tab} onChange={setTab} className="mt-4" />

      <div className="mt-4">
        {tab === 'video' && (
          <>
            <VideoEmbed video={video} />
            {video.description && (
              <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{video.description}</p>
            )}
            {video.tags.length > 0 && (
              <p className="mt-3 flex flex-wrap gap-1">
                {video.tags.map((tag) => (
                  <span key={tag} className="rounded-[5px] bg-secondary px-1.5 py-0.5 text-[11px]">
                    #{tag}
                  </span>
                ))}
              </p>
            )}
            <SimilarVideos video={video} onOpen={onOpen} />
          </>
        )}

        {tab === 'images' && (
          <>
            <TabInfo>{t('videos.imagesInfo')}</TabInfo>
            <div className="mb-3">{uploadButton('image')}</div>
            {/* საერთო `PhotoGrid` (§2.9) — ადრე თვითნაკეთი ბადე იყო, სადაც
                დაჭერა ფოტოს **ახალ ჩანართში** ხსნიდა; ახლა lightbox-ია,
                მონიშვნებით და „რამდენი გამოჩნდეს" არჩევანით. */}
            <PhotoGrid
              items={images.map((a) => ({
                id: a.id,
                src: a.url,
                title: a.original_name,
                size: a.size,
              }))}
              emptyText={t('videos.noImages')}
              onDelete={(ids) => ids.forEach((id) => removeFile.mutate(id))}
            />
          </>
        )}

        {tab === 'notes' && (
          <>
            <TabInfo>{t('videos.notesInfo')}</TabInfo>
            <div className="mb-4">
              <Textarea
                rows={2}
                placeholder={t('videos.notePlaceholder')}
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
              />
              <div className="mt-2 flex justify-end">
                <Button
                  size="sm"
                  disabled={!noteBody.trim() || addNote.isPending}
                  onClick={() => addNote.mutate(noteBody.trim())}
                >
                  <Plus className="size-4" />
                  {t('videos.addNote')}
                </Button>
              </div>
            </div>

            {notes.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                {t('videos.noNotes')}
              </p>
            ) : (
              <ul className="space-y-2">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-lg border border-border p-3">
                    {editing?.id === n.id ? (
                      <>
                        <Textarea
                          rows={3}
                          value={editing.body}
                          onChange={(e) => setEditing({ id: n.id, body: e.target.value })}
                        />
                        <div className="mt-2 flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                            {t('actions.cancel')}
                          </Button>
                          <Button
                            size="sm"
                            disabled={!editing.body.trim()}
                            onClick={() => saveNote.mutate({ id: n.id, body: editing.body.trim() })}
                          >
                            {t('actions.save')}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="whitespace-pre-line text-sm">{n.body}</p>
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          {n.created_at && new Date(n.created_at).toLocaleString()}
                          <button
                            onClick={() => setEditing({ id: n.id, body: n.body })}
                            className="ml-auto cursor-pointer hover:text-foreground"
                          >
                            {t('actions.edit')}
                          </button>
                          <button
                            onClick={async () => {
                              const ok = await confirm({
                                title: t('videos.deleteVideoNote'),
                                variant: 'destructive',
                              })
                              if (ok) removeNote.mutate(n.id)
                            }}
                            className="cursor-pointer text-destructive hover:opacity-80"
                          >
                            {t('actions.delete')}
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {tab === 'docs' && (
          <>
            <TabInfo>{t('videos.docsInfo')}</TabInfo>
            <div className="mb-3">{uploadButton('doc')}</div>
            {docs.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                {t('videos.noDocs')}
              </p>
            ) : (
              <ul className="space-y-2">
                {docs.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    {/* ⚠️ სახელი **ღილაკია** — ონლაინ მნახველი (2026-09-14) */}
                    <button
                      type="button"
                      onClick={() => viewer.open(a)}
                      className="min-w-0 flex-1 cursor-pointer truncate text-left text-sm hover:underline"
                      title={t('files.viewerOpen')}
                    >
                      {a.original_name}
                    </button>
                    <span className="shrink-0 text-xs text-muted-foreground">{bytes(a.size)}</span>
                    <a
                      href={storageUrl(a.url) ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                      aria-label={t('videos.download')}
                    >
                      <Download className="size-4" />
                    </a>
                    <button
                      onClick={() => removeFile.mutate(a.id)}
                      aria-label={t('actions.delete')}
                      className="shrink-0 cursor-pointer text-destructive hover:opacity-80"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* ონლაინ მნახველი — ერთი კომპონენტი ყველა მოდულზე (2026-09-14) */}
      {viewer.node}
    </ModalShell>
  )
}

/* ---------- მსგავსი ვიდეოები (K4) ---------- */

/**
 * შემოთავაზება **ჩემი ბიბლიოთეკიდან** — საერთო ტეგები, სათაურის მსგავსება,
 * იგივე პლატფორმა/ტიპი (backend: `VideoSearch::similar()`).
 * YouTube-ის „related videos" API 2023-იდან აღარ არსებობს.
 */
function SimilarVideos({ video, onOpen }: { video: Video; onOpen?: (video: Video) => void }) {
  const { t } = useTranslation()
  const { data } = useQuery({
    queryKey: ['video-similar', video.id],
    queryFn: () => fetchSimilarVideos(video.id),
    staleTime: 60_000,
  })

  const similar = data ?? []
  if (!similar.length) return null

  return (
    <section className="mt-6 border-t border-border pt-4">
      <h3 className="mb-3 text-sm font-semibold">{t('videos.similar')}</h3>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {similar.map((v) => {
          const thumb = storageUrl(v.thumbnail)
          const inner = (
            <>
              <span className="relative block aspect-video overflow-hidden rounded-lg bg-muted">
                {thumb ? (
                  <img src={thumb} alt="" className="size-full object-cover" loading="lazy" />
                ) : (
                  <span className="grid size-full place-items-center text-muted-foreground">
                    <Play className="size-6" />
                  </span>
                )}
                {v.duration && (
                  <span className="absolute bottom-1 right-1 rounded-[4px] bg-black/75 px-1 py-0.5 text-[10px] text-white">
                    {formatDuration(v.duration)}
                  </span>
                )}
              </span>
              <span className="mt-1.5 block truncate text-xs font-medium" title={v.title}>
                {v.title}
              </span>
              <span className="block truncate text-[11px] capitalize text-muted-foreground">
                {v.platform}
                {v.tags.length > 0 && ` · #${v.tags.slice(0, 2).join(' #')}`}
              </span>
            </>
          )

          return (
            <li key={v.id}>
              {onOpen ? (
                <button
                  type="button"
                  onClick={() => onOpen(v)}
                  className="w-full cursor-pointer text-left hover:opacity-90"
                >
                  {inner}
                </button>
              ) : (
                <a href={v.url} target="_blank" rel="noopener noreferrer" className="block hover:opacity-90">
                  {inner}
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

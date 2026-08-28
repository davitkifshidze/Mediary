import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileText, Plus, Trash2, Upload } from 'lucide-react'
import {
  createNote,
  deleteAttachment,
  deleteNote,
  fetchAttachments,
  fetchNotes,
  updateNote,
  uploadAttachments,
  type Video,
} from '@/api/videos'
import { storageUrl } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { VideoEmbed } from '@/components/VideoEmbed'
import { Button } from '@/components/ui/button'
import { ModalShell } from '@/components/ui/modal-shell'
import { Tabs, TabInfo, type TabItem } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm, useToast } from '@/components/ui/feedback'

/* ============================================================
   ვიდეოს დეტალური ხედი (K3): ვიდეო · ფოტოები · ჩანიშვნები · დოკუმენტები.
   ფაილები polymorphic `attachments`-შია, ე.ი. იგივე UI მომავალ მოდულებსაც გამოადგება.
   ============================================================ */

type Tab = 'video' | 'images' | 'notes' | 'docs'

function bytes(n: number): string {
  if (n <= 0) return '0 KB'
  const units = ['B', 'KB', 'MB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function VideoDetail({ video, onClose }: { video: Video; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const [tab, setTab] = useState<Tab>('video')
  const [noteBody, setNoteBody] = useState('')
  const [editing, setEditing] = useState<{ id: number; body: string } | null>(null)

  const attachmentsQ = useQuery({
    queryKey: ['video-attachments', video.id],
    queryFn: () => fetchAttachments(video.id),
  })
  const notesQ = useQuery({ queryKey: ['video-notes', video.id], queryFn: () => fetchNotes(video.id) })

  const images = (attachmentsQ.data ?? []).filter((a) => a.kind === 'image')
  const docs = (attachmentsQ.data ?? []).filter((a) => a.kind === 'doc')
  const notes = notesQ.data ?? []

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['video-attachments', video.id] })
    qc.invalidateQueries({ queryKey: ['video-notes', video.id] })
    qc.invalidateQueries({ queryKey: ['videos'] })
  }
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const upload = useMutation({
    mutationFn: ({ kind, files }: { kind: 'image' | 'doc'; files: File[] }) =>
      uploadAttachments(video.id, kind, files),
    onSuccess: refresh,
    onError: fail,
  })
  const removeAttachment = useMutation({ mutationFn: deleteAttachment, onSuccess: refresh, onError: fail })
  const addNote = useMutation({
    mutationFn: (body: string) => createNote(video.id, body),
    onSuccess: () => {
      setNoteBody('')
      refresh()
    },
    onError: fail,
  })
  const saveNote = useMutation({
    mutationFn: ({ id, body }: { id: number; body: string }) => updateNote(id, body),
    onSuccess: () => {
      setEditing(null)
      refresh()
    },
    onError: fail,
  })
  const removeNote = useMutation({ mutationFn: deleteNote, onSuccess: refresh, onError: fail })

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
          </>
        )}

        {tab === 'images' && (
          <>
            <TabInfo>{t('videos.imagesInfo')}</TabInfo>
            <div className="mb-3">{uploadButton('image')}</div>
            {images.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                {t('videos.noImages')}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {images.map((a) => (
                  <div key={a.id} className="group relative aspect-square overflow-hidden rounded-lg bg-muted">
                    <a href={storageUrl(a.url) ?? '#'} target="_blank" rel="noopener noreferrer">
                      <img src={storageUrl(a.url) ?? ''} alt="" className="size-full object-cover" loading="lazy" />
                    </a>
                    <button
                      onClick={() => removeAttachment.mutate(a.id)}
                      aria-label={t('actions.delete')}
                      className="absolute right-1 top-1 hidden cursor-pointer rounded-md bg-black/70 p-1 text-white group-hover:block"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
                                title: t('videos.deleteNote'),
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
                    <span className="min-w-0 flex-1 truncate text-sm">{a.original_name}</span>
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
                      onClick={() => removeAttachment.mutate(a.id)}
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
    </ModalShell>
  )
}

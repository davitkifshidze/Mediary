import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileText, Plus, Trash2, Upload } from 'lucide-react'
import {
  createSongNote,
  deleteSongFile,
  deleteSongNote,
  fetchSongFiles,
  fetchSongNotes,
  updateSongNote,
  uploadSongFiles,
  type Song,
} from '@/api/songs'
import { storageUrl } from '@/lib/api'
import { useFileViewer } from '@/components/FileViewer'
import { RecordNotes } from '@/components/RecordNotes'
import { errorMessage } from '@/lib/errors'
import { formatBytes } from '@/lib/utils'
import { ModalShell } from '@/components/ui/modal-shell'
import { PhotoGrid } from '@/components/ui/photo-grid'
import { Tabs, TabInfo, type TabItem } from '@/components/ui/tabs'
import { useConfirm, useToast } from '@/components/ui/feedback'

/* ============================================================
   სიმღერის მიმაგრებული მასალა (Tasks §7.4): ფოტოები · ჩანიშვნები ·
   დოკუმენტები (ტექსტი, ნოტები, ბუკლეტი).

   ცხრილები **სექციისაა** — `song_files` / `song_notes` (2026-09-03-ის წესი),
   ხოლო ქცევა ზუსტად `VideoDetail`-ისაა: ერთი და იგივე ამოცანა ორ ფორმად არ
   უნდა დაიშალოს.

   ⚠️ **დაკვრა აქ არ არის და ეს განზრახაა** — სიმღერას თავისი `SongPlayer`
   აქვს და სიიდან პირდაპირ იხსნება; აქ მხოლოდ მასალაა.

   ⚠️ **აუდიოფაილი არ იტვირთება** — სიმღერის წყარო `songs.url`-ია
   (`VideoUrl`-ის allowlist), ე.ი. ატვირთვა მხოლოდ თანმხლებ მასალაზეა.
   ============================================================ */

type Tab = 'images' | 'notes' | 'docs'

const DOC_ACCEPT = '.pdf,.doc,.docx,.txt,.rtf,.odt,.xls,.xlsx,.csv,.ppt,.pptx'

export function SongDetail({ song, onClose }: { song: Song; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()

  const [tab, setTab] = useState<Tab>('images')

  const filesQ = useQuery({
    queryKey: ['song-files', song.id],
    queryFn: () => fetchSongFiles(song.id),
  })
  const notesQ = useQuery({
    queryKey: ['song-notes', song.id],
    queryFn: () => fetchSongNotes(song.id),
  })

  const images = (filesQ.data ?? []).filter((f) => f.kind === 'image')
  const docs = (filesQ.data ?? []).filter((f) => f.kind === 'doc')
  const notes = notesQ.data ?? []

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['song-files', song.id] })
    qc.invalidateQueries({ queryKey: ['song-notes', song.id] })
    // სიაში რიცხვები ბარათზე ჩანს — მათაც სჭირდებათ განახლება
    qc.invalidateQueries({ queryKey: ['songs'] })
  }
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const upload = useMutation({
    mutationFn: ({ kind, files }: { kind: 'image' | 'doc'; files: File[] }) =>
      uploadSongFiles(song.id, kind, files),
    onSuccess: refresh,
    onError: fail,
  })
  const removeFile = useMutation({ mutationFn: deleteSongFile, onSuccess: refresh, onError: fail })
  /* ონლაინ მნახველი (2026-09-14) — ⚠️ `resolve: storageUrl` იმიტომაა, რომ ეს
     მოდული **საჯარო დისკზეა**; დისკს backend წყვეტს და არა ფრონტი (§17.5). */
  const viewer = useFileViewer({ resolve: storageUrl, onDelete: (id) => removeFile.mutate(id) })


  const pick = (kind: 'image' | 'doc') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length) upload.mutate({ kind, files })
    // ⚠️ ველი იცარიელდეს, თორემ იმავე ფაილის ხელახლა არჩევა `change`-ს არ ისვრის
    e.target.value = ''
  }

  const uploadButton = (kind: 'image' | 'doc') => (
    <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-3.5 text-sm hover:bg-muted">
      {kind === 'image' ? <Upload className="size-4" /> : <Plus className="size-4" />}
      {t(kind === 'image' ? 'songs.uploadImages' : 'songs.uploadDocs')}
      <input
        type="file"
        multiple
        accept={kind === 'image' ? 'image/*' : DOC_ACCEPT}
        className="hidden"
        onChange={pick(kind)}
      />
    </label>
  )

  const TABS: TabItem<Tab>[] = [
    { value: 'images', label: t('songs.tabImages'), badge: images.length || undefined },
    { value: 'notes', label: t('songs.tabNotes'), badge: notes.length || undefined },
    { value: 'docs', label: t('songs.tabDocs'), badge: docs.length || undefined },
  ]

  return (
    <ModalShell title={song.title} onClose={onClose} wide>
      <Tabs items={TABS} value={tab} onChange={setTab} className="mt-4" />

      <div className="mt-4">
        {tab === 'images' && (
          <>
            <TabInfo>{t('songs.imagesInfo')}</TabInfo>
            <div className="mb-3">{uploadButton('image')}</div>
            {/* საერთო `PhotoGrid` (§2.9) — lightbox, მონიშვნები და
                „რამდენი გამოჩნდეს" უფასოდ მოდის */}
            <PhotoGrid
              items={images.map((f) => ({
                id: f.id,
                src: f.url,
                title: f.original_name,
                size: f.size,
              }))}
              emptyText={t('songs.noImages')}
              onDelete={(ids) => ids.forEach((id) => removeFile.mutate(id))}
            />
          </>
        )}

        {tab === 'notes' && (
          <>
            <TabInfo>{t('songs.notesInfo')}</TabInfo>
            {/* ⚠️ სხეული გაზიარებულია (Tasks §6.7) — იხ. `RecordNotes` */}
            <RecordNotes
              queryKey={['song-notes', song.id]}
              invalidate={[['songs']]}
              api={{
                list: () => fetchSongNotes(song.id),
                create: (input) => createSongNote(song.id, input.body),
                update: (id, input) => updateSongNote(id, input.body),
                remove: deleteSongNote,
              }}
              placeholder={t('songs.notePlaceholder')}
              addLabel={t('songs.addNote')}
              emptyTitle={t('songs.noNotes')}
              emptyHint={t('recordNotes.emptyHint')}
            />
          </>
        )}

        {tab === 'docs' && (
          <>
            <TabInfo>{t('songs.docsInfo')}</TabInfo>
            <div className="mb-3">{uploadButton('doc')}</div>
            {docs.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                {t('songs.noDocs')}
              </p>
            ) : (
              <ul className="space-y-2">
                {docs.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    {/* ⚠️ სახელი **ღილაკია** — ონლაინ მნახველი (2026-09-14) */}
                    <button
                      type="button"
                      onClick={() => viewer.open(f)}
                      className="min-w-0 flex-1 cursor-pointer truncate text-left text-sm hover:text-primary"
                      title={t('files.viewerOpen')}
                    >
                      {f.original_name}
                    </button>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                    <a
                      href={storageUrl(f.url) ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                      aria-label={t('songs.download')}
                    >
                      <Download className="size-4" />
                    </a>
                    <button
                      onClick={async () => {
                        const ok = await confirm({
                          title: t('songs.deleteSongFile'),
                          variant: 'destructive',
                        })
                        if (ok) removeFile.mutate(f.id)
                      }}
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

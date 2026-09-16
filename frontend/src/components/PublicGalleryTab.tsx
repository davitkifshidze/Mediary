import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Lock } from 'lucide-react'
import {
  fetchPublicGalleryPhotos,
  unlockPublicAlbum,
  type PublicGalleryPhoto,
} from '@/api/publicProfile'
import { storageUrl } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalShell } from '@/components/ui/modal-shell'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   **საჯარო პროფილის გალერეა (Tasks §7.4).**

   შენი სიტყვები: „სხვა იუზერმა ნახოს ჩემს გალერეაში გასაჯაროებული
   ფოტოები, ხოლო პაროლიანი ალბომები ვერ ნახოს … თუ პაროლს შეიყვანს, მერე
   გამოჩნდეს რეალური".

   ⚠️ **ჩანართი ფოტოებს ხატავს და არა ალბომებს.** დომენი `gallery_album`-ია
   (ერთადერთი, რასაც ხილვადობის გადამრთველი აქვს), მაგრამ *შიგთავსი*
   გამოთვლადია: საჯარო ჩანაწერების, მათი მსახიობებისა და საჯარო ალბომების
   ფოტოები. ბარათებად ალბომების ჩვენება „3 საქაღალდეს" აჩვენებდა იქ, სადაც
   ორასი ფოტოა.

   ⚠️ **ჩაკეტილი ფოტო რიგად მოდის, ფაილის გარეშე** (§7.11): `path` პასუხში
   საერთოდ არ არის, ე.ი. blur ნამდვილად ცარიელია. პროპორცია `width`/`height`-ს
   მოსდევს, თორემ პაროლის შეყვანისას ბადე ახტებოდა.

   ⚠️ **პაროლი მფლობელისაა** — უცხოსთვის ალბომი პრაქტიკულად ჩაკეტილი
   რჩება; მექანიზმი კი უნდა არსებობდეს, თორემ მფლობელიც ვერ ნახავდა
   საკუთარ საჯარო ბმულზე.
   ============================================================ */

/** ერთადერთი ბლარის აქტივი — `frontend/public/locked-photo.svg` */
const PLACEHOLDER = '/locked-photo.svg'

export function PublicGalleryTab({ username }: { username: string }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()

  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<PublicGalleryPhoto[]>([])
  const [unlocking, setUnlocking] = useState<number | null>(null)
  const [password, setPassword] = useState('')

  const query = useQuery({
    queryKey: ['public-gallery', username, page],
    queryFn: () => fetchPublicGalleryPhotos(username, page),
  })

  // გვერდები გროვდება („მეტის ჩვენება"), პირველი გვერდი კი სიას ანულებს
  const photos = useMemo(() => {
    if (!query.data) return rows
    return query.data.meta.current_page === 1
      ? query.data.data
      : [...rows.filter((r) => !query.data!.data.some((n) => n.id === r.id)), ...query.data.data]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data])

  const unlock = useMutation({
    mutationFn: (albumId: number) => unlockPublicAlbum(username, albumId, password),
    onSuccess: () => {
      setUnlocking(null)
      setPassword('')
      setRows([])
      setPage(1)
      qc.invalidateQueries({ queryKey: ['public-gallery', username] })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const meta = query.data?.meta

  if (query.isLoading && !photos.length) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!photos.length) {
    return <p className="py-16 text-center text-sm text-muted-foreground">{t('publicProfile.emptyDomain')}</p>
  }

  return (
    <div className="pb-10">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
        {photos.map((photo) => (
          <li
            key={photo.id}
            className="overflow-hidden rounded-md border border-border bg-muted"
            style={{
              aspectRatio: photo.width && photo.height ? `${photo.width} / ${photo.height}` : '3 / 2',
            }}
          >
            {photo.locked ? (
              /* ⚠️ ღილაკი თვითონ ფილაზეა — ჩაკეტილ ალბომამდე სხვა გზა
                 საჯარო გვერდზე არ არის (ალბომების სია აქ არ იხატება). */
              <button
                type="button"
                onClick={() => photo.album_id && setUnlocking(photo.album_id)}
                className="relative size-full cursor-pointer"
                title={t('gallery.albumUnlock')}
              >
                <img src={PLACEHOLDER} alt="" aria-hidden className="size-full object-cover" />
                <span className="absolute inset-0 grid place-items-center">
                  <Lock className="size-5 text-white/90 drop-shadow" />
                </span>
              </button>
            ) : (
              <img
                src={storageUrl(photo.path) ?? ''}
                alt=""
                loading="lazy"
                className="size-full object-cover"
              />
            )}
          </li>
        ))}
      </ul>

      {!!meta && meta.current_page < meta.last_page && (
        <div className="flex justify-center pt-6">
          <Button
            variant="outline"
            onClick={() => {
              setRows(photos)
              setPage((p) => p + 1)
            }}
            disabled={query.isFetching}
          >
            {query.isFetching && <Loader2 className="size-4 animate-spin" />}
            {t('actions.loadMore')}
          </Button>
        </div>
      )}

      {unlocking !== null && (
        <ModalShell title={t('gallery.albumUnlock')} onClose={() => setUnlocking(null)}>
          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (password) unlock.mutate(unlocking)
            }}
          >
            <p className="text-sm text-muted-foreground">{t('gallery.albumUnlockHint')}</p>
            <div>
              <Label htmlFor="public-album-password">{t('gallery.albumPassword')}</Label>
              <Input
                id="public-album-password"
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setUnlocking(null)}>
                {t('actions.cancel')}
              </Button>
              <Button type="submit" disabled={!password || unlock.isPending}>
                {t('gallery.albumUnlock')}
              </Button>
            </div>
          </form>
        </ModalShell>
      )}
    </div>
  )
}

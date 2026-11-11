import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, X } from 'lucide-react'
import { createPlaylist, updatePlaylist, type Playlist } from '@/api/playlists'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { useToast } from '@/components/ui/feedback'

/* ⚠️ გვერდიდან (`pages/PlaylistsPage`) აქ იმიტომ გადმოვიდა, რომ სიმღერის ფორმის
   „+" იმავე ფანჯარას ხსნის; `components/` გვერდს ვერ იმპორტირებს. */

/** დამატება/გადარქმევა — ერთი მოდალი, როგორც ვიდეოს ტიპებზე */
export function PlaylistDialog({
  playlist,
  onClose,
  onSaved,
}: {
  playlist: Playlist | null
  onClose: () => void
  /** შენახული ფლეილისტი — სიმღერის ფორმის „+" მას მაშინვე ირჩევს */
  onSaved?: (saved: Playlist) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [name, setName] = useState(playlist?.name ?? '')

  const save = useMutation({
    mutationFn: () =>
      playlist ? updatePlaylist(playlist.id, { name }) : createPlaylist({ name }),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['playlists'] })
      toast({ title: t('toast.saved'), variant: 'success' })
      onSaved?.(saved)
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <ModalShell title={playlist ? t('playlists.rename') : t('playlists.add')} onClose={onClose}>
      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) save.mutate()
        }}
      >
        <Label htmlFor="playlist-name">{t('playlists.name')}</Label>
        <Input
          id="playlist-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('playlists.namePlaceholder')}
          autoFocus
        />

        <ModalFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            <X className="size-4" />
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={!name.trim() || save.isPending}>
            <Save className="size-4" />
            {save.isPending ? t('actions.saving') : t('actions.save')}
          </Button>
        </ModalFooter>
      </form>
    </ModalShell>
  )
}

/** წაშლა — სიმღერები ხელუხლებელი რჩება, მხოლოდ ნაკრები ქრება */

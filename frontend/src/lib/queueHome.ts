import { setPlaylistSongs } from '@/api/playlists'
import { reorderSongs } from '@/api/songs'

/* ============================================================
   **რიგის „სახლი" — საიდან დაიწყო რიგი და სად ინახება მისი გადალაგება.**

   ფლეილისტიდან დაკრული რიგის გადალაგება თვითონ ფლეილისტის რიგია (ყველგან ჩანს),
   „ყველა სიმღერიდან" ხელით დალაგებით დაკრულისა — სიმღერების ხელით რიგი. სხვა
   რიგი (ვიდეოები, ძებნის შედეგი, სხვა დალაგება) სახლის გარეშეა: გადალაგება მხოლოდ
   დაკვრის რიგს ცვლის და არსად იწერება.

   ⚠️ **შენახვა მხოლოდ მაშინ, როცა რიგი წყაროს ზუსტად ასახავს.** ფლეილისტის
   შენახვა სრულ სიას წერს (`PUT /playlists/{id}/songs`) — რიგიდან ამოღებული სიმღერა
   ფლეილისტიდანაც გაქრებოდა. ამიტომ ამოღების შემდეგ ფლეილისტის რიგს სახლი აღარ აქვს
   (`lib/player.tsx`), აქ კი ორმაგი დაზღვევაა: სიმღერის გარდა სხვა ერთეული ან
   გამეორებული id — არაფერი ინახება.

   ⚠️ React-ისგან დამოუკიდებელია: ტესტი კომპონენტის გარეშე ამოწმებს, რა მიდის
   სერვერზე — და რომ სახლის გარეშე არაფერი მიდის.
   ============================================================ */

export type QueueHome = { kind: 'playlist'; id: number } | { kind: 'songs' }

interface Entry {
  kind: string
  id: number
}

/** შესანახი id-ები რიგის თანმიმდევრობით, ან `null` — თუ შენახვა არ შეიძლება */
export function homeOrder(home: QueueHome | null, queue: readonly Entry[]): number[] | null {
  if (!home || !queue.length) return null
  if (queue.some((entry) => entry.kind !== 'song')) return null

  const ids = queue.map((entry) => entry.id)

  return new Set(ids).size === ids.length ? ids : null
}

/**
 * გადალაგებული რიგის შენახვა მის სახლში.
 *
 * @returns React Query-ის გასაღებები, რომლებიც უნდა განახლდეს; `null` — არაფერი შენახულა
 */
export async function saveQueueOrder(home: QueueHome | null, queue: readonly Entry[]): Promise<unknown[][] | null> {
  const ids = homeOrder(home, queue)
  if (!home || !ids) return null

  if (home.kind === 'playlist') {
    await setPlaylistSongs(home.id, ids)

    return [['playlists']]
  }

  await reorderSongs(ids)

  return [['songs']]
}

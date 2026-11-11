import { useCallback, useState, useSyncExternalStore } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fetchBookmarks, refreshBookmarkFromLink, type Bookmark, type BookmarkFilters } from '@/api/bookmarks'
import { storageUrl } from '@/lib/api'
import { useBookmarkRefresh } from '@/lib/bookmarks'
import { errorMessage } from '@/lib/errors'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   **ბუკმარკის მთავარი ფოტო, რომელიც ბმულიდან მოდის.**

   ბმულიდან წამოღებული ფოტო მხოლოდ მისამართია (`image_url`) — ფაილი ჩვენთან არ
   იწერება. როცა საიტი მას წაშლის ან გადაარქმევს, ბარათზე გატეხილი სურათი რჩება.

   ⚠️ **გატეხილი ფოტო ერთხელ, ჩუმად ახლდება ბმულიდან** (`onError`): თუ გვერდი ახალ
   მისამართს იძლევა, ბარათი მას თავისით იღებს; თუ არა (ან ახალიც არ იტვირთება) —
   ფოტოს ადგილას ცარიელი მდგომარეობა ჩანს, „ბმულიდან განახლება" კი ხელით რჩება.
   ერთხელ — თორემ მკვდარი საიტი ყოველ დახატვაზე თავიდან გამოიძახებოდა.

   ⚠️ **მეხსიერება მოდულისაა და არა კომპონენტის**: სიაც და ფანჯარაც ერთსა და იმავე
   ბუკმარკს ხატავს, ე.ი. „ეს მისამართი გატეხილია" ორივემ ერთნაირად უნდა იცოდეს.
   გატეხილი **მისამართი** ინახება და არა ბუკმარკი — ახალი მისამართი ხელახლა იცდება.

   ⚠️ ატვირთული ფოტო (`bookmarks/…`, გალერეის გზა) ბმულიდან არ ახლდება — ის ჩვენი
   ფაილია; თუ ვერ ჩაიტვირთა, უბრალოდ ცარიელი მდგომარეობა ჩანს.
   ============================================================ */

/** ბუკმარკი, რომელზეც ჩუმი განახლება უკვე ვცადეთ */
const attempted = new Set<number>()
/** ბუკმარკი → მისამართი, რომელიც ვერ ჩაიტვირთა */
const broken = new Map<number, string>()
const listeners = new Set<() => void>()
let version = 0

function markBroken(id: number, image: string): void {
  broken.set(id, image)
  version += 1
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** დაშორებული მისამართი (og:image) და არა ჩვენი ფაილის გზა */
export function isRemoteImage(image: string | null | undefined): image is string {
  return !!image && /^https?:\/\//i.test(image)
}

/** მხოლოდ ტესტებისთვის — მოდულის მეხსიერება ტესტებს შორის არ უნდა გადადიოდეს */
export function resetBookmarkPhotos(): void {
  attempted.clear()
  broken.clear()
  version += 1
}

type PhotoOwner = Pick<Bookmark, 'id' | 'image'>

/**
 * ფოტოს მისამართი ბარათისა და ფანჯრისთვის + რა ვქნათ, როცა ვერ ჩაიტვირთა.
 */
export function useBookmarkPhoto() {
  useSyncExternalStore(subscribe, () => version)
  const refresh = useBookmarkRefresh()

  /** გატეხილად ნაცნობი მისამართი აღარ იხატება — ჩანს ცარიელი მდგომარეობა */
  const photoOf = useCallback(
    (bookmark: PhotoOwner): string | null =>
      bookmark.image && broken.get(bookmark.id) === bookmark.image ? null : storageUrl(bookmark.image),
    [],
  )

  const onError = useCallback(
    (bookmark: PhotoOwner) => {
      const image = bookmark.image
      if (!image) return

      if (!isRemoteImage(image) || attempted.has(bookmark.id)) {
        markBroken(bookmark.id, image)
        return
      }

      attempted.add(bookmark.id)
      refreshBookmarkFromLink(bookmark.id)
        .then((result) => {
          // ახალი მისამართი სიიდან მოვა; ისიც თუ გატყდა, მეორე `onError` მას მონიშნავს
          if (result.imageChanged) refresh()
          else markBroken(bookmark.id, image)
        })
        // უფლება არ აქვს, საიტი გათიშულია… — ჩუმად: ეს ფონური მცდელობაა
        .catch(() => markBroken(bookmark.id, image))
    },
    [refresh],
  )

  return { photoOf, onError }
}

/**
 * **„ბმულიდან განახლება"** — ხელით, ერთ ბუკმარკზე: ფოტო ყოველთვის იცვლება იმით,
 * რასაც გვერდი ახლა იძლევა; სათაური და აღწერა — მხოლოდ ცარიელი. შედეგს ამბობს.
 */
export function useRefreshFromLink() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const refresh = useBookmarkRefresh()

  return useMutation({
    mutationFn: (id: number) => refreshBookmarkFromLink(id),
    onSuccess: (result) => {
      refresh()
      // შეიცვალა — წარმატება; იგივე ფოტო — ცნობა; ფოტო საერთოდ არ მოგვცა — ვერ გამოვიდა
      toast(
        result.imageChanged
          ? { title: t('bookmarks.refresh.done'), variant: 'success' }
          : result.imageFound
            ? { title: t('bookmarks.refresh.same'), variant: 'info' }
            : { title: t('bookmarks.refresh.none'), variant: 'error' },
      )
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })
}

/** ერთდროულად რამდენი გვერდი იკითხება — საიტებს და ჩვენს სერვერს ნუ დავტვირთავთ */
const BULK_PARALLEL = 3

/**
 * **„ფოტოების განახლება"** — მიმდინარე ფილტრის ყველა ბუკმარკზე, რომლის ფოტოც
 * ბმულიდანაა (ან საერთოდ არ აქვს). ატვირთული ფოტოიანი გამოიტოვება: მის ფოტოს
 * ბმული არ ცვლის.
 *
 * ⚠️ თითო ბუკმარკი ცალკე მოთხოვნაა და არა ერთი გრძელი: გვერდების წაკითხვა
 * წამებს გრძელდება, ერთი მოთხოვნა კი ას ბუკმარკზე დროს ამოწურავდა და არაფერს
 * იტყოდა, რამდენი მოესწრო.
 */
export function useRefreshPhotos() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const refresh = useBookmarkRefresh()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  /** რამდენ ბუკმარკს შეეხება ეს ფილტრი */
  const targets = useCallback(async (filters: BookmarkFilters): Promise<Bookmark[]> => {
    const { items } = await fetchBookmarks({ ...filters, page: undefined, per_page: undefined, all: true })
    return items.filter((bookmark) => !bookmark.image || isRemoteImage(bookmark.image))
  }, [])

  const run = useCallback(
    async (list: Bookmark[]) => {
      let done = 0
      let changed = 0
      const queue = [...list]
      setProgress({ done, total: list.length })

      const worker = async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          try {
            const result = await refreshBookmarkFromLink(next.id)
            if (result.imageChanged) changed += 1
          } catch {
            // ერთი ჩავარდნა დანარჩენს არ აჩერებს — ჯამში ჩანს, რამდენი განახლდა
          }
          done += 1
          setProgress({ done, total: list.length })
        }
      }

      await Promise.all(Array.from({ length: Math.min(BULK_PARALLEL, list.length) }, worker))

      setProgress(null)
      refresh()
      toast({ title: t('bookmarks.refresh.bulkDone', { changed, total: list.length }), variant: 'success' })
    },
    [refresh, t, toast],
  )

  return { targets, run, progress }
}

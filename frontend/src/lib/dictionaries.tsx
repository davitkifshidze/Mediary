import type { ReactNode } from 'react'
import {
  deleteBoardGameGenre,
  fetchBoardGameGenres,
  reorderBoardGameGenres,
} from '@/api/boardGames'
import {
  deleteBookmarkCategory,
  fetchBookmarkCategories,
  reorderBookmarkCategories,
} from '@/api/bookmarks'
import {
  deleteCourseCategory,
  fetchCourseCategories,
  reorderCourseCategories,
} from '@/api/courses'
import { deleteBookGenre, fetchBookGenres, reorderBookGenres } from '@/api/books'
import { deleteGameGenre, fetchGameGenres, reorderGameGenres } from '@/api/games'
import { deleteNoteCategory, fetchNoteCategories, reorderNoteCategories } from '@/api/notes'
import { deleteSongGenre, fetchSongGenres, reorderSongGenres } from '@/api/songs'
import { deleteVideoType, fetchVideoTypes, reorderVideoTypes } from '@/api/videos'
import { BoardGameGenreDialog } from '@/components/BoardGameGenreDialog'
import { BookGenreDialog } from '@/components/BookGenreDialog'
import { BookmarkCategoryDialog } from '@/components/BookmarkCategoryDialog'
import { CourseCategoryDialog } from '@/components/CourseCategoryDialog'
import { GameGenreDialog } from '@/components/GameGenreDialog'
import { NoteCategoryDialog } from '@/components/NoteCategoryDialog'
import { SongGenreDialog } from '@/components/SongGenreDialog'
import { VideoTypeDialog } from '@/components/VideoTypeDialog'
import { StatusDialog } from '@/components/StatusDialog'
import {
  STATUS_DOMAINS,
  deleteStatus,
  fetchStatuses,
  reorderStatuses,
  type StatusDomain,
} from '@/api/statuses'
import type { DictionaryRemoval, DictionaryRemoved } from '@/api/dictionary'
import { statusesQueryKey } from '@/lib/statuses'
import { MEDIA } from '@/lib/media'
import type { Status } from '@/api/types'

/* ============================================================
   **ლექსიკონების ერთი რეესტრი** (Tasks §6.3).

   ⚠️ **შვიდი თითქმის იდენტური გვერდი ერთი გახდა.** `/video-types`,
   `/song-genres`, `/book-genres`, `/board-game-genres`, `/game-genres`,
   `/note-categories`, `/bookmark-categories` — ერთი და იგივე სია იყო
   (drag & drop, ისრები, რედაქტირება, წაშლა გადატანით), მხოლოდ სხვა
   endpoint-ით. ე.ი. ეს **ნაკლები კოდია და არა მეტი**, როგორც თასქშივე წერია.

   ⚠️ **წაშლის დიალოგი ერთია** და ის თამაშების ვერსიაა (ორი ცხადი არჩევანი:
   გადატანა თუ ცარიელად დატოვება). დანარჩენ ექვსს უფრო ღარიბი ჰქონდა და
   ერთი მათგანი „როგორც არის"-ს გაუქმებად კითხულობდა.

   ⚠️ **ტექსტები საერთოა** (`dictionaries.*`) — ექვს namespace-ში იმავე
   ოთხი ფრაზის ასლი ადრე თუ გვიან გაშორდებოდა. კონკრეტული სახელი
   („ჟანრი"/„კატეგორია"/„ტიპი") `{{name}}`-ით შემოდის.

   ⚠️ **რედაქტირების დიალოგი თითოს თავისი რჩება** — ის თავის endpoint-ზე
   წერს და ქეშსაც თვითონ ანახლებს; აქ მხოლოდ გამოძახებაა ერთ ადგილას.
   ============================================================ */

/** ლექსიკონის ერთეული — შვიდივეს ერთი და იგივე ფორმა აქვს */
export interface DictionaryItem {
  id: number
  name_ka: string
  name_en: string
  icon: string | null
  sort_order: number
  /**
   * ⚠️ `<x>_count` — ერთადერთი ველი, რომლითაც შვიდი ლექსიკონი სხვაობს
   * (`videos_count`, `books_count`…). სახელს `count()` კითხულობს, ე.ი. აქ
   * ღია ინდექსი ჯდება; დანარჩენი ველები ცხადად წერია.
   */
  [extra: string]: unknown
}

export interface DictionaryDef {
  /** მისამართის სეგმენტი — ძველი route-ებიც ამაზე გადამისამართდა */
  key: string
  /** `modules.key` — წვდომის შემოწმება და სათაურის ფერი აქედან მოდის */
  module: string
  /** i18n — ლექსიკონის სახელი გადამრჩევში და სათაურში */
  titleKey: string
  /** მოდულის გვერდი, საიდანაც მოხვედი („უკან" ბმული) */
  recordsRoute: string
  /**
   * react-query-ის გასაღები — **მასივი**, რომ ჩანაწერის მხარეს იმავე ქეშს
   * ეკითხებოდეს (`useStatuses` → `['statuses', domain]`). ერთი სტრიქონი
   * ორ სხვადასხვა ქეშს დაბადებდა და სტატუსის გადარქმევა სიაზე არ ჩანდებოდა.
   */
  queryKey: readonly unknown[]
  /** ჩანაწერების ქეში — წაშლა/გადატანა მასაც ცვლის */
  recordsQueryKey: string
  /** i18n — „12 წიგნი" */
  countKey: string
  list: () => Promise<DictionaryItem[]>
  reorder: (ids: number[]) => Promise<DictionaryItem[]>
  /** გადატანა · ცარიელად დატოვება · ჩანაწერების წაშლაც (ეტაპი 8, `api/dictionary.ts`) */
  remove: (id: number, removal: DictionaryRemoval) => Promise<DictionaryRemoved>
  count: (item: DictionaryItem) => number
  dialog: (item: DictionaryItem | null, onClose: () => void) => ReactNode
  /**
   * სტატუსის ლექსიკონი — ინდექსზე „სტატუსების" ჯგუფშია, შიგნით კი
   * „ყველა"/„რჩეული" რიგებადაც ჩანს და საიდბარის განლაგებაც იქ იმართება.
   */
  statusDomain?: StatusDomain
  /**
   * ⚠️ **pivot-ია** (სიმღერა/თამაში რამდენიმე ჟანრით) — „ჩანაწერების წაშლა"
   * ისეთ ჩანაწერსაც შლის, რომელსაც სხვა ჟანრიც აქვს, და დიალოგი ამას ცხადად ამბობს.
   */
  multi?: boolean
}

/**
 * ⚠️ `as never` მხოლოდ იმიტომაა, რომ თითო API თავის კონკრეტულ ტიპს
 * აბრუნებს (`BookGenre`, `VideoType`…), სია კი ერთ სტრუქტურულ ტიპზე დგას.
 * მათი ველები იდენტურია — განსხვავება მხოლოდ `<x>_count`-ია, რომელსაც
 * `count()` კითხულობს.
 */
const num = (value: unknown) => (typeof value === 'number' ? value : 0)

export const DICTIONARIES: DictionaryDef[] = [
  {
    key: 'video-types',
    module: 'video',
    titleKey: 'videoTypes.title',
    recordsRoute: '/videos',
    queryKey: ['video-types'],
    recordsQueryKey: 'videos',
    countKey: 'videos.count',
    list: fetchVideoTypes as never,
    reorder: reorderVideoTypes as never,
    remove: deleteVideoType,
    count: (item) => num(item.videos_count),
    dialog: (item, onClose) => <VideoTypeDialog type={item as never} onClose={onClose} />,
  },
  {
    key: 'song-genres',
    module: 'song',
    titleKey: 'songGenres.title',
    recordsRoute: '/songs',
    queryKey: ['song-genres'],
    recordsQueryKey: 'songs',
    countKey: 'songs.count',
    list: fetchSongGenres as never,
    reorder: reorderSongGenres as never,
    remove: deleteSongGenre,
    multi: true,
    count: (item) => num(item.songs_count),
    dialog: (item, onClose) => <SongGenreDialog genre={item as never} onClose={onClose} />,
  },
  {
    key: 'book-genres',
    module: 'book',
    titleKey: 'bookGenres.title',
    recordsRoute: '/books',
    queryKey: ['book-genres'],
    recordsQueryKey: 'books',
    countKey: 'books.count',
    list: fetchBookGenres as never,
    reorder: reorderBookGenres as never,
    remove: deleteBookGenre,
    count: (item) => num(item.books_count),
    dialog: (item, onClose) => <BookGenreDialog genre={item as never} onClose={onClose} />,
  },
  {
    key: 'board-game-genres',
    module: 'board_game',
    titleKey: 'boardGameGenres.title',
    recordsRoute: '/board-games',
    queryKey: ['board-game-genres'],
    recordsQueryKey: 'board-games',
    countKey: 'boardGames.count',
    list: fetchBoardGameGenres as never,
    reorder: reorderBoardGameGenres as never,
    remove: deleteBoardGameGenre,
    count: (item) => num(item.board_games_count),
    dialog: (item, onClose) => <BoardGameGenreDialog genre={item as never} onClose={onClose} />,
  },
  {
    key: 'game-genres',
    module: 'game',
    titleKey: 'gameGenres.title',
    recordsRoute: '/games',
    queryKey: ['game-genres'],
    recordsQueryKey: 'games',
    countKey: 'games.count',
    list: fetchGameGenres as never,
    reorder: reorderGameGenres as never,
    remove: deleteGameGenre,
    multi: true,
    count: (item) => num(item.games_count),
    dialog: (item, onClose) => <GameGenreDialog genre={item as never} onClose={onClose} />,
  },
  {
    key: 'note-categories',
    module: 'note',
    titleKey: 'noteCategories.title',
    recordsRoute: '/notes',
    queryKey: ['note-categories'],
    recordsQueryKey: 'notes',
    countKey: 'notes.count',
    list: fetchNoteCategories as never,
    reorder: reorderNoteCategories as never,
    remove: deleteNoteCategory,
    count: (item) => num(item.note_entries_count),
    dialog: (item, onClose) => <NoteCategoryDialog category={item as never} onClose={onClose} />,
  },
  {
    key: 'bookmark-categories',
    module: 'bookmark',
    titleKey: 'bookmarkCategories.title',
    recordsRoute: '/bookmarks',
    queryKey: ['bookmark-categories'],
    recordsQueryKey: 'bookmarks',
    countKey: 'bookmarks.count',
    list: fetchBookmarkCategories as never,
    reorder: reorderBookmarkCategories as never,
    remove: deleteBookmarkCategory,
    count: (item) => num(item.bookmarks_count),
    dialog: (item, onClose) => (
      <BookmarkCategoryDialog category={item as never} onClose={onClose} />
    ),
  },
  {
    // FEAT-25 — კურსის კატეგორიები (ბუკმარკის ზუსტი რიგი)
    key: 'course-categories',
    module: 'course',
    titleKey: 'courseCategories.title',
    recordsRoute: '/courses',
    queryKey: ['course-categories'],
    recordsQueryKey: 'courses',
    countKey: 'courses.count',
    list: fetchCourseCategories as never,
    reorder: reorderCourseCategories as never,
    remove: deleteCourseCategory,
    count: (item) => num(item.courses_count),
    dialog: (item, onClose) => <CourseCategoryDialog category={item as never} onClose={onClose} />,
  },
]

/**
 * **სტატუსების ლექსიკონები (Tasks §6.2/§6.4).**
 *
 * ⚠️ ექვსი რიგი **ერთი ციკლით** იწერება და არა ხელით: მათ შორის განსხვავება
 * მხოლოდ დომენია, შიგთავსი კი იდენტური — სწორედ ის, რაც §6.3-მა შვიდი
 * თითქმის ერთნაირი გვერდიდან ერთი გახადა.
 *
 * ⚠️ **წიგნი/თამაში/ბორდგეიმი აქ არაა** — მათი სტატუსი `enum`-ად რჩება
 * (მომხმარებლის ჩამონათვალი), ე.ი. მართვადი ლექსიკონი მათ არ ეხებათ.
 */
const STATUS_MODULE: Record<(typeof STATUS_DOMAINS)[number], string> = {
  movie: 'movie',
  series: 'series',
  anime: 'anime',
  video: 'video',
  note: 'note',
  bookmark: 'bookmark',
}

/** ჩანაწერების გვერდი დომენზე — მედიას თავისი მისამართი აქვს, დანარჩენს მოდულის */
const STATUS_ROUTE: Record<(typeof STATUS_DOMAINS)[number], string> = {
  movie: MEDIA.movie.libraryPath,
  series: MEDIA.series.libraryPath,
  anime: MEDIA.anime.libraryPath,
  video: '/videos',
  note: '/notes',
  bookmark: '/bookmarks',
}

/**
 * ⚠️ **სათაური დომენზეა და არა საერთო** — გადამრჩევში ექვსი ერთნაირი
 * „სტატუსები" ერთმანეთისგან არ გაირჩეოდა. გასაღებები ცხადად წერია
 * (და არა `` `statuses.title.${domain}` ``), რომ i18n-ის აუდიტმა დაინახოს.
 */
const STATUS_TITLE: Record<(typeof STATUS_DOMAINS)[number], string> = {
  movie: 'statuses.titleMovie',
  series: 'statuses.titleSeries',
  anime: 'statuses.titleAnime',
  video: 'statuses.titleVideo',
  note: 'statuses.titleNote',
  bookmark: 'statuses.titleBookmark',
}

const STATUS_COUNT_KEY: Record<(typeof STATUS_DOMAINS)[number], string> = {
  movie: 'library.count',
  series: 'library.countSeries',
  anime: 'library.countAnime',
  video: 'videos.count',
  note: 'notes.count',
  bookmark: 'bookmarks.count',
}

/**
 * ჩანაწერების სიის ქეშის გასაღები — **გვერდს** ეკუთვნის და არა დომენს.
 *
 * ⚠️ ადრე ეს `domain` ეწერა, ე.ი. `note`/`bookmark`/`video`-ზე `['note']`-ს
 * ანულებდა, სია კი `['notes', …]`-ზეა: სტატუსის წაშლა/გადატანა ჩანაწერების
 * გვერდზე მხოლოდ ქეშის ვადის გასვლის შემდეგ ჩნდებოდა (ეტაპი 8-ზე ნაპოვნი).
 */
const STATUS_RECORDS_KEY: Record<(typeof STATUS_DOMAINS)[number], string> = {
  movie: 'movie',
  series: 'series',
  anime: 'anime',
  video: 'videos',
  note: 'notes',
  bookmark: 'bookmarks',
}

for (const domain of STATUS_DOMAINS) {
  DICTIONARIES.push({
    key: `${domain}-statuses`,
    module: STATUS_MODULE[domain],
    titleKey: STATUS_TITLE[domain],
    recordsRoute: STATUS_ROUTE[domain],
    queryKey: statusesQueryKey(domain),
    recordsQueryKey: STATUS_RECORDS_KEY[domain],
    countKey: STATUS_COUNT_KEY[domain],
    statusDomain: domain,
    list: (() => fetchStatuses(domain)) as never,
    reorder: ((ids: number[]) => reorderStatuses(domain, ids)) as never,
    remove: (id, removal) => deleteStatus(domain, id, removal),
    count: (item) => num(item.records_count),
    dialog: (item, onClose) => (
      <StatusDialog domain={domain} status={item as unknown as Status | null} onClose={onClose} />
    ),
  })
}


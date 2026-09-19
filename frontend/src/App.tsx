import { Suspense, lazy, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
// ⚠️ **`lazy()` განზრახ არაა** — ეს ეკრანი გატეხილ მდგომარეობაშიც უნდა დაიხატოს
import { NotFoundPage } from '@/pages/NotFoundPage'
import { Header } from '@/components/Header'
import { Sidebar } from '@/components/Sidebar'
import { PlayerBar } from '@/components/PlayerBar'
import { DICTIONARIES } from '@/lib/dictionaries'
import { useAuth } from '@/lib/auth'
import { useVisitTracker } from '@/lib/audit'
import { PlayerProvider } from '@/lib/player'
import { ModulesProvider, useModules } from '@/lib/modules'
import { useNoteReminderWatcher } from '@/lib/noteReminders'
import { MEDIA, type MediaType } from '@/lib/media'

/* ============================================================
   მარშრუტების დონეზე დაყოფა (Tasks §4).

   ⚠️ **`lazy()` სახელიან ექსპორტს `default`-ად გადაათარგმნინებს.** ეს
   `.then()` მოსაწყენია, მაგრამ განზრახ ხელითაა დაწერილი: ზოგადი დამხმარე
   (`lazyPage(load, name)`) props-ების ტიპს კარგავს, ე.ი. `<LibraryPage
   type={type} />` აღარ შემოწმდებოდა — ზუსტად ის, რასაც `tsc` აქ იჭერს.

   ⚠️ **`Suspense` `<main>`-ის შიგნითაა**, ე.ი. ჩანაწერის ჩატვირთვისას
   ჰედერი, საიდბარი და **დამკვრელი ადგილზე რჩება**. მთელ გვერდზე
   გადაფარებული ლოდერი დაკვრას აწყვეტდა-არა, მაგრამ ყოველ ნავიგაციაზე
   აპლიკაციას „თავიდან დაწყებულად" აჩვენებდა.
   ============================================================ */
const LibraryPage = lazy(() => import('@/pages/LibraryPage').then((m) => ({ default: m.LibraryPage })))
const MoviePage = lazy(() => import('@/pages/MoviePage').then((m) => ({ default: m.MoviePage })))
const MovieFormPage = lazy(() => import('@/pages/MovieFormPage').then((m) => ({ default: m.MovieFormPage })))
const ActorPage = lazy(() => import('@/pages/ActorPage').then((m) => ({ default: m.ActorPage })))
const GenresPage = lazy(() => import('@/pages/GenresPage').then((m) => ({ default: m.GenresPage })))
const StatusBulkPage = lazy(() => import('@/pages/StatusBulkPage').then((m) => ({ default: m.StatusBulkPage })))
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const ImportPage = lazy(() => import('@/pages/ImportPage').then((m) => ({ default: m.ImportPage })))
const StatsPage = lazy(() => import('@/pages/StatsPage').then((m) => ({ default: m.StatsPage })))
const TrashPage = lazy(() => import('@/pages/TrashPage').then((m) => ({ default: m.TrashPage })))
const SyncPage = lazy(() => import('@/pages/SyncPage').then((m) => ({ default: m.SyncPage })))
const TranslationsPage = lazy(() => import('@/pages/TranslationsPage').then((m) => ({ default: m.TranslationsPage })))
const LoginPage = lazy(() => import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const RegisterPage = lazy(() => import('@/pages/RegisterPage').then((m) => ({ default: m.RegisterPage })))
const ResetPasswordPage = lazy(() =>
  import('@/pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
)
const ProfilePage = lazy(() => import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const PublicProfilePage = lazy(() => import('@/pages/PublicProfilePage').then((m) => ({ default: m.PublicProfilePage })))
const PeoplePage = lazy(() => import('@/pages/PeoplePage').then((m) => ({ default: m.PeoplePage })))
const SearchPage = lazy(() => import('@/pages/SearchPage').then((m) => ({ default: m.SearchPage })))
const ChatPage = lazy(() => import('@/pages/ChatPage').then((m) => ({ default: m.ChatPage })))
const ModulesPage = lazy(() => import('@/pages/ModulesPage').then((m) => ({ default: m.ModulesPage })))
const ModulePage = lazy(() => import('@/pages/ModulePage').then((m) => ({ default: m.ModulePage })))
const UsersPage = lazy(() => import('@/pages/UsersPage').then((m) => ({ default: m.UsersPage })))
const UserPage = lazy(() => import('@/pages/UserPage').then((m) => ({ default: m.UserPage })))
const RequestsPage = lazy(() => import('@/pages/RequestsPage').then((m) => ({ default: m.RequestsPage })))
const RolesPage = lazy(() => import('@/pages/RolesPage').then((m) => ({ default: m.RolesPage })))
const RolePage = lazy(() => import('@/pages/RolePage').then((m) => ({ default: m.RolePage })))
const VideosPage = lazy(() => import('@/pages/VideosPage').then((m) => ({ default: m.VideosPage })))
const SongsPage = lazy(() => import('@/pages/SongsPage').then((m) => ({ default: m.SongsPage })))
const BooksPage = lazy(() => import('@/pages/BooksPage').then((m) => ({ default: m.BooksPage })))
const BoardGamesPage = lazy(() => import('@/pages/BoardGamesPage').then((m) => ({ default: m.BoardGamesPage })))
const GamesPage = lazy(() => import('@/pages/GamesPage').then((m) => ({ default: m.GamesPage })))
const NotesPage = lazy(() => import('@/pages/NotesPage').then((m) => ({ default: m.NotesPage })))
const NoteRemindersPage = lazy(() =>
  import('@/pages/NoteRemindersPage').then((m) => ({ default: m.NoteRemindersPage })),
)
const BookmarksPage = lazy(() => import('@/pages/BookmarksPage').then((m) => ({ default: m.BookmarksPage })))
const CoursesPage = lazy(() => import('@/pages/CoursesPage').then((m) => ({ default: m.CoursesPage })))
const DictionariesPage = lazy(() => import('@/pages/DictionariesPage').then((m) => ({ default: m.DictionariesPage })))
const PlaylistsPage = lazy(() => import('@/pages/PlaylistsPage').then((m) => ({ default: m.PlaylistsPage })))
const PlaylistPage = lazy(() => import('@/pages/PlaylistPage').then((m) => ({ default: m.PlaylistPage })))
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const GalleryPage = lazy(() => import('@/pages/GalleryPage').then((m) => ({ default: m.GalleryPage })))
const GalleryRecordPage = lazy(() => import('@/pages/GalleryRecordPage').then((m) => ({ default: m.GalleryRecordPage })))
const PurgePage = lazy(() => import('@/pages/PurgePage').then((m) => ({ default: m.PurgePage })))
const CredentialsPage = lazy(() => import('@/pages/CredentialsPage').then((m) => ({ default: m.CredentialsPage })))
const BackupsPage = lazy(() => import('@/pages/BackupsPage').then((m) => ({ default: m.BackupsPage })))
const AuditPage = lazy(() => import('@/pages/AuditPage').then((m) => ({ default: m.AuditPage })))


/**
 * `/gallery/actors/:id` → `/actors/:id` (§8.5).
 *
 * ⚠️ **მსახიობს ერთი გვერდი აქვს.** გალერეის სია მასზე გადაგიყვანს და არა
 * მის ასლზე — ორი გვერდი ერთ დღეს სხვადასხვა შიგთავსს აჩვენებდა.
 */
function ActorRedirect() {
  const { id } = useParams()

  return <Navigate to={`/actors/${id}`} replace />
}

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}

/** გვერდის ნაჭრის ჩატვირთვა — გარსი ადგილზე რჩება */
function PageFallback() {
  return (
    <div className="grid place-items-center py-24">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  )
}

/** ავტორიზებულთათვის */
function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Splash />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return <>{children}</>
}

/** login/register — უკვე შესულს დეშბორდზე ვაბრუნებთ */
function GuestOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <Splash />
  if (user) return <Navigate to="/" replace />
  return <>{children}</>
}

/**
 * არა-მედია მოდულების გვერდები (`lib/modules.tsx: PAGE_MODULE_KEYS`).
 * ახალი ასეთი მოდული = ერთი ჩანაწერი აქ + ერთი key იმ სიაში.
 */
const MODULE_PAGES: Record<string, React.ReactNode> = {
  video: <VideosPage />,
  // 2026-09-03 — სიმღერები ცალკე მოდულია (ადრე ვიდეოს ქვე-სექცია იყო)
  song: <SongsPage />,
  // Tasks §12 — წიგნები
  book: <BooksPage />,
  // Tasks §14 — ბორდგეიმები
  board_game: <BoardGamesPage />,
  // Tasks §11 — თამაშები
  game: <GamesPage />,
  // Tasks §13 — ჩანაწერები (key `note`, ცხრილი `note_entries`)
  note: <NotesPage />,
  // Tasks §18 — ბუკმარკები (`DECISIONS.md` §10)
  bookmark: <BookmarksPage />,
  // FEAT-25 — კურსები
  course: <CoursesPage />,
  // Tasks 10 — გალერეა ცალკე მოდულია, ფოტოები კი ფილმებსა/სერიალებს ჰკიდია
  gallery: <GalleryPage />,
}

/** ერთი მედია-დომენის მარშრუტები (მოდული ჩართული უნდა იყოს) */
function mediaRoutes(type: MediaType) {
  const d = MEDIA[type]
  const lib = d.libraryPath.replace(/^\//, '')
  const base = d.detailBase.replace(/^\//, '')
  return [
    <Route key={`${type}-lib`} path={lib} element={<LibraryPage type={type} />} />,
    <Route key={`${type}-new`} path={`${base}/new`} element={<MovieFormPage type={type} />} />,
    <Route key={`${type}-show`} path={`${base}/:id`} element={<MoviePage type={type} />} />,
    <Route key={`${type}-edit`} path={`${base}/:id/edit`} element={<MovieFormPage type={type} />} />,
  ]
}

/**
 * აპლიკაციის გარსი — საიდბარი + მარშრუტები.
 * მედია-დომენების მარშრუტები **ჩართული მოდულებიდან** იგება (I3):
 * ჩაურთველი მოდულის მისამართი საერთოდ არ არსებობს.
 */
function AppShell() {
  const { mediaModules, pageModules, has, loading } = useModules()
  const { canAdmin } = useAuth()
  // უჯრის მდგომარეობა აქ არის — ჰედერის ჰამბურგერიც და საიდბარიც იყენებს (K12)
  const [drawerOpen, setDrawerOpen] = useState(false)
  // მასობრივი ოპერაციები (Tasks 4) — მედია-დომენებზე სტატუსი, ვიდეოებზე ტიპი/ტეგები
  const bulkAvailable = mediaModules.length > 0 || has('video')
  /** შეცდომის ზღვრის გასაღები — მისამართის შეცვლა შეცდომას ასუფთავებს */
  const location = useLocation()

  // §13.3 — შეხსენებების მოსმენა აპლიკაციის დონეზეა, რომ ნებისმიერ გვერდზე
  // მუშაობდეს და არა მხოლოდ `/notes`-ზე. მოდულის გარეშე polling არ ირთვება.
  useNoteReminderWatcher(has('note'))

  // Tasks §4.1 — „რომელ სექციაში შევიდა". აპლიკაციის დონეზეა, რომ ყველა
  // მარშრუტი დაიფაროს და არა მხოლოდ ის, ვინც გამოძახებას დაიმახსოვრებს.
  useVisitTracker()

  if (loading) return <Splash />

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header onMenu={() => setDrawerOpen(true)} />
      <div className="flex flex-1 flex-col lg:flex-row">
        <Sidebar drawerOpen={drawerOpen} onDrawerChange={setDrawerOpen} />
        {/* §7.2 — ქვედა ზოლი გვერდს არ უნდა ფარავდეს; სიმაღლეს თვითონ
            დამკვრელი წერს `--player-h`-ში (დახურულზე ცვლადი საერთოდ არ არის) */}
        <main className="min-w-0 flex-1 pb-[var(--player-h,0px)]">
        {/* ⚠️ ზღვარი `Suspense`-ზე **გარეთაა**: ჩანქის ჩატვირთვის ჩავარდნას
            `lazy()` რენდერის დროს აგდებს, ე.ი. შიგნიდან ვერ დაიჭირებოდა.
            `resetKey` მისამართია — სხვა სექციაზე გადასვლა ეკრანს ასუფთავებს. */}
        <ErrorBoundary resetKey={location.pathname}>
        <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* Tasks 2 — `/` დეშბორდია და არა ფილმების ბიბლიოთეკა */}
          <Route path="" element={<DashboardPage />} />

          {mediaModules.flatMap((m) => mediaRoutes(m.type))}

          {/* არა-მედია მოდულები საკუთარი გვერდით (I5) */}
          {pageModules.map((m) => (
            <Route key={m.key} path={m.route_base.replace(/^\//, '')} element={MODULE_PAGES[m.key]} />
          ))}

          {/* ეტაპი 11.2 — შეხსენებებს **თავისი სექცია** აქვს და არა ჩანაწერის
              ფორმის ნაწილი. მოდულის ჩართვაზეა დამოკიდებული, როგორც პლეილისტები. */}
          {has('note') && <Route path="notes/reminders" element={<NoteRemindersPage />} />}

          {/* ---------- ლექსიკონები: ერთი გვერდი, გადამრჩევით (§6.3) ----------
              ⚠️ **ძველი შვიდი მისამართი ცოცხალი რჩება** და ახალზე
              გადამისამართდება: საიდბარის ბმულები, „უკან" ბმულები და
              ბრაუზერის შენახული ჩანართები არ უნდა გატყდეს. */}
          <Route path="dictionaries" element={<DictionariesPage />} />
          <Route path="dictionaries/:key" element={<DictionariesPage />} />
          {DICTIONARIES.map((d) => (
            <Route
              key={d.key}
              path={d.key}
              element={<Navigate to={`/dictionaries/${d.key}`} replace />}
            />
          ))}

          {/* ---------- გალერეის ქვე-გვერდები (Tasks §8.5) ----------
              ⚠️ **გალერეა ერთი გვერდიდან ხუთ ჭრილად გაიშალა**: ყველა ფოტო ·
              ჩანაწერები · მსახიობები · ვიდეოები · წყაროები · მოდულები.
              ერთ სქროლზე ეს ყველაფერი (და ჩამოტვირთვის ბლოკიც) იმიტომ იყო
              ცუდი, რომ ერთმანეთს ფარავდა.

              ⚠️ `/gallery/actors/:id` **გადამისამართებაა** — მსახიობს
              **ერთი** გვერდი აქვს (`/actors/:id`); ორი ასლი ერთ დღეს
              სხვადასხვას აჩვენებდა. */}
          {has('gallery') && <Route path="gallery/records" element={<GalleryPage cut="records" />} />}
          {has('gallery') && (
            <Route path="gallery/records/:type/:id" element={<GalleryRecordPage />} />
          )}
          {has('gallery') && <Route path="gallery/actors" element={<GalleryPage cut="actors" />} />}
          {has('gallery') && <Route path="gallery/actors/:id" element={<ActorRedirect />} />}
          {/* §26 — ალბომები (და მათ შორის „ალბომის გარეშე" დარჩენილი ფოტოები) */}
          {has('gallery') && <Route path="gallery/albums" element={<GalleryPage cut="albums" />} />}
          {/* ⚠️ ძველი მისამართი (2026-09-16-მდე „უკატეგორიო") — შენახული ბმული ცოცხალია.
              ორი ცალკე რიგია და არა ერთი `&&` ორი `<Route>`-ით: JSX-ის ერთი
              გამოსახულება ერთ ელემენტს აბრუნებს. */}
          {has('gallery') && (
            <Route path="gallery/uncategorized" element={<Navigate to="/gallery/albums" replace />} />
          )}
          {has('gallery') && <Route path="gallery/videos" element={<GalleryPage cut="videos" />} />}
          {has('gallery') && <Route path="gallery/sources" element={<GalleryPage cut="sources" />} />}
          {has('gallery') && <Route path="gallery/modules" element={<GalleryPage cut="modules" />} />}

          {/* სიმღერების ქვე-გვერდები: პლეილისტები (ჟანრები ლექსიკონებშია) */}
          {pageModules.some((m) => m.key === 'song') && (
            <Route path="playlists" element={<PlaylistsPage />} />
          )}
          {pageModules.some((m) => m.key === 'song') && (
            <Route path="playlists/:id" element={<PlaylistPage />} />
          )}

          {/* გაზიარებული */}
          {mediaModules.length > 0 && <Route path="actors/:id" element={<ActorPage />} />}
          {mediaModules.length > 0 && <Route path="genres" element={<GenresPage />} />}
          {/* Tasks 4 — მასობრივი ოპერაციები ვიდეოებსაც ეხება, ე.ი. მედია-მოდულის გარეშეც ჩანს */}
          {bulkAvailable && <Route path="status" element={<StatusBulkPage />} />}
          {/* L2 — სინქრონი ქმედებაა და ცალკე გვერდზეა; TMDB მხოლოდ მედია-დომენებს ეხება */}
          {mediaModules.length > 0 && <Route path="sync" element={<SyncPage />} />}
          {/* Tasks 7 — თარგმანები; ორენოვანი სქემა მედია-დომენებზეა */}
          {mediaModules.length > 0 && <Route path="translations" element={<TranslationsPage />} />}
          {/* ძებნის შედეგები — ⚠️ **მოდულზე დამოცებული არაა**:
              ის თვითონ ეკითხება ძებნას ყველა ჩართულ დომენში და გამორთულს
              საერთოდ არ აჭვენებს. */}
          {/* FEAT-07 — CSV-ის იმპორტი. ⚠️ **მოდულზე დამოკიდებული არაა**:
              რომელ მოდულს ეხება, ფაილი წყვეტს, და კონტროლერი თვითონ
              ამოწმებს წვდომასაც და უფლებასაც (ისევე, როგორც ძებნა). */}
          <Route path="import" element={<ImportPage />} />
          {/* FEAT-08 — სტატისტიკა. ⚠️ **მოდულზე დამოკიდებული არაა**: პასუხი
              ყველა ჩართულ მოდულს ეხება და ჩაურთველი სიიდან თვითონ ცვივა. */}
          <Route path="stats" element={<StatsPage />} />
          <Route path="trash" element={<TrashPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          {/* Tasks §16.2 — „ვისთან ჰგავს ჩემი გემოვნება": საჯარო პროფილების
              კატალოგი. მოდულზე დამოკიდებული არაა — გვერდი თვითონ ამბობს,
              თუ ჩემი პროფილი ჯერ დახურულია. */}
          <Route path="people" element={<PeoplePage />} />
          {/* Tasks §16.3 — ჩატი. მოდულზე დამოკიდებული არაა; გვერდი თვითონ
              ამბობს, თუ პროფილი ჯერ საჯარო არაა. */}
          <Route path="chat" element={<ChatPage />} />
          <Route path="chat/:id" element={<ChatPage />} />
          {/* Tasks 1.4 — მოდულები ერთი სექციაა, ქარდი → შიდა გვერდი */}
          <Route path="modules" element={<ModulesPage />} />
          <Route path="modules/:key" element={<ModulePage />} />
          {/* Tasks 20 — მასობრივი წაშლა (გვერდი თვითონ ამოწმებს super_admin-ს) */}
          <Route path="purge" element={<PurgePage />} />
          {/* Tasks §21 — „მონაცემები": ჩემი გასაღებები და ლიმიტები.
              ⚠️ მოდულზე დამოკიდებული არაა და არც უნდა იყოს: გასაღები
              `modules` ცხრილში არ არის და ყველა ანგარიშს თავისი სჭირდება. */}
          <Route path="credentials" element={<CredentialsPage />} />
          {/* Tasks §22 — ბაზის დამპი (გვერდი თვითონ ამოწმებს super_admin-ს) */}
          <Route path="backups" element={<BackupsPage />} />
          {/* Tasks 1.5 — მოთხოვნები ცალკე სექციაა (ჩემიც და ადმინის ხედიც) */}
          <Route path="requests" element={<RequestsPage />} />

          {/* Tasks 1.1 — ადმინის ტაბები ცალკე სექციებად დაიშალა */}
          {/* Tasks 1.6 — წვდომა როლიდანაც შეიძლება მოვიდეს და არა მარტო super_admin-ისგან */}
          {canAdmin('users') && <Route path="users" element={<UsersPage />} />}
          {canAdmin('users') && <Route path="users/:id" element={<UserPage />} />}
          {canAdmin('roles') && <Route path="roles" element={<RolesPage />} />}
          {canAdmin('roles') && <Route path="roles/:id" element={<RolePage />} />}
          {/* Tasks §4.4 — აუდიტ-ლოგი; გვერდი თვითონაც ამოწმებს უფლებას */}
          {canAdmin('audit') && <Route path="audit" element={<AuditPage />} />}
          {/* ძველი მისამართები არ ტყდება */}
          <Route path="admin" element={<Navigate to="/users" replace />} />
          <Route path="admin/users/:id" element={<Navigate to="/users" replace />} />

          {/* ⚠️ არარსებული მისამართი **ცხადად** ითქმის (Tasks GAP-21): აქამდე ის
              უხმოდ დეშბორდზე გადადიოდა, ე.ი. ძველი გაზიარებული ბმულიც და
              შეცდომით აკრეფილი მისამართიც ერთნაირად „მუშაობდა".
              ⚠️ **გამორთული მოდულის მისამართიც აქ ჩავარდება** (მისი მარშრუტი
              საერთოდ არ იქმნება) და ესეც სწორია: backend-იც უცხო ჩანაწერზე
              404-ს აბრუნებს და არა 403-ს — „ეს არსებობს" თვითონაც ინფორმაციაა. */}
          <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
        </ErrorBoundary>
        </main>
      </div>
      {/* §7.2 — ერთი დამკვრელი მთელ აპზე. მარშრუტების **გარეთაა**: გვერდის
          შეცვლა დაკვრას არ წყვეტს, ე.ი. პლეილისტი ბოლომდე ჟღერს. */}
      <PlayerBar />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      {/* გარე მარშრუტები (login · register · საჯარო პროფილი) გარსის გარეთაა,
          ე.ი. საკუთარი fallback სჭირდებათ — აქ მთელი ეკრანი კანონიერია */}
      <ErrorBoundary>
      <Suspense fallback={<Splash />}>
      <Routes>
        <Route
          path="/login"
          element={
            <GuestOnly>
              <LoginPage />
            </GuestOnly>
          }
        />
        <Route
          path="/register"
          element={
            <GuestOnly>
              <RegisterPage />
            </GuestOnly>
          }
        />
        {/* FEAT-16 — ადმინის ერთჯერადი აღდგენის ბმული. ⚠️ **`GuestOnly`-ის
            გარეთაა განზრახ**: შესულმაც შეიძლება გახსნას (მეორე ანგარიშის
            ბმული, ან უბრალოდ დამახსოვრებული სესია) და დეშბორდზე გადაგდება
            იმ ერთადერთ ქმედებას წაშლიდა, რისთვისაც ბმული გაიცა. */}
        <Route path="/reset/:token" element={<ResetPasswordPage />} />

        {/* Tasks §16.1 — საჯარო პროფილი. ⚠️ **განზრახ `Protected`-ის გარეთაა**:
            გაზიარებადი ბმული ავტორიზაციის გარეშეც უნდა იხსნებოდეს. დაცვა
            backend-შია — სამი ფენა, ყველა default-ით `private`. */}
        <Route path="/u/:username" element={<PublicProfilePage />} />
        <Route
          path="/*"
          element={
            <Protected>
              <ModulesProvider>
                {/* §7.2 — რიგი მარშრუტებზე მაღლა ცხოვრობს */}
                <PlayerProvider>
                  <AppShell />
                </PlayerProvider>
              </ModulesProvider>
            </Protected>
          }
        />
      </Routes>
      </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  )
}

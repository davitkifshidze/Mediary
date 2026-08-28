import { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Header } from '@/components/Header'
import { Sidebar } from '@/components/Sidebar'
import { LibraryPage } from '@/pages/LibraryPage'
import { MoviePage } from '@/pages/MoviePage'
import { MovieFormPage } from '@/pages/MovieFormPage'
import { ActorPage } from '@/pages/ActorPage'
import { GenresPage } from '@/pages/GenresPage'
import { StatusBulkPage } from '@/pages/StatusBulkPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { ModulesPage } from '@/pages/ModulesPage'
import { AdminPage } from '@/pages/AdminPage'
import { AdminUserPage } from '@/pages/AdminUserPage'
import { VideosPage } from '@/pages/VideosPage'
import { useAuth } from '@/lib/auth'
import { ModulesProvider, useModules } from '@/lib/modules'
import { MEDIA, type MediaType } from '@/lib/media'

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
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

/** login/register — უკვე შესულს ბიბლიოთეკაზე ვაბრუნებთ */
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
  const { t } = useTranslation()
  const { mediaModules, pageModules, loading } = useModules()
  const { user } = useAuth()
  // უჯრის მდგომარეობა აქ არის — ჰედერის ჰამბურგერიც და საიდბარიც იყენებს (K12)
  const [drawerOpen, setDrawerOpen] = useState(false)

  if (loading) return <Splash />

  const hasMovie = mediaModules.some((m) => m.type === 'movie')
  const home = mediaModules[0]
    ? MEDIA[mediaModules[0].type].libraryPath
    : (pageModules[0]?.route_base ?? '/modules')

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header onMenu={() => setDrawerOpen(true)} />
      <div className="flex flex-1 flex-col lg:flex-row">
        <Sidebar drawerOpen={drawerOpen} onDrawerChange={setDrawerOpen} />
        <main className="min-w-0 flex-1">
        <Routes>
          {mediaModules.flatMap((m) => mediaRoutes(m.type))}

          {/* არა-მედია მოდულები საკუთარი გვერდით (I5) */}
          {pageModules.map((m) => (
            <Route key={m.key} path={m.route_base.replace(/^\//, '')} element={MODULE_PAGES[m.key]} />
          ))}

          {/* ფილმების მოდული გამორთულია → „/" პირველ ხელმისაწვდომ დომენზე გადადის */}
          {!hasMovie && <Route path="" element={<Navigate to={home} replace />} />}

          {/* გაზიარებული */}
          {mediaModules.length > 0 && <Route path="actors/:id" element={<ActorPage />} />}
          {mediaModules.length > 0 && <Route path="genres" element={<GenresPage />} />}
          {mediaModules.length > 0 && <Route path="status" element={<StatusBulkPage />} />}
          <Route path="settings" element={<SettingsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="modules" element={<ModulesPage />} />
          {user?.is_super_admin && <Route path="admin" element={<AdminPage />} />}
          {user?.is_super_admin && <Route path="admin/users/:id" element={<AdminUserPage />} />}

          {/* არარსებული/მიუწვდომელი მისამართი */}
          <Route
            path="*"
            element={
              mediaModules.length ? (
                <Navigate to={home} replace />
              ) : (
                <div className="mx-auto max-w-lg px-5 py-16 text-center">
                  <h1 className="text-xl font-semibold">{t('modules.emptyTitle')}</h1>
                  <p className="mt-2 text-sm text-muted-foreground">{t('modules.emptyHint')}</p>
                  <a
                    href="/modules"
                    className="mt-4 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                  >
                    {t('modules.title')}
                  </a>
                </div>
              )
            }
          />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
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
        <Route
          path="/*"
          element={
            <Protected>
              <ModulesProvider>
                <AppShell />
              </ModulesProvider>
            </Protected>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

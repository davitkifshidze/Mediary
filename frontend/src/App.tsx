import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { LibraryPage } from '@/pages/LibraryPage'
import { MoviePage } from '@/pages/MoviePage'
import { MovieFormPage } from '@/pages/MovieFormPage'
import { ActorPage } from '@/pages/ActorPage'
import { GenresPage } from '@/pages/GenresPage'
import { StatusBulkPage } from '@/pages/StatusBulkPage'

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen flex-col bg-background text-foreground lg:flex-row">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <Routes>
            {/* ფილმები */}
            <Route path="/" element={<LibraryPage type="movie" />} />
            <Route path="/movies/new" element={<MovieFormPage type="movie" />} />
            <Route path="/movies/:id" element={<MoviePage type="movie" />} />
            <Route path="/movies/:id/edit" element={<MovieFormPage type="movie" />} />
            {/* სერიალები */}
            <Route path="/series" element={<LibraryPage type="series" />} />
            <Route path="/series/new" element={<MovieFormPage type="series" />} />
            <Route path="/series/:id" element={<MoviePage type="series" />} />
            <Route path="/series/:id/edit" element={<MovieFormPage type="series" />} />
            {/* გაზიარებული */}
            <Route path="/actors/:id" element={<ActorPage />} />
            <Route path="/genres" element={<GenresPage />} />
            <Route path="/status" element={<StatusBulkPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

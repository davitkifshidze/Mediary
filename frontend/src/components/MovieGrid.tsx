import { MovieCard } from './MovieCard'
import type { MediaType } from '@/lib/media'
import type { MovieListItem } from '@/api/types'

export function MovieGrid({ movies, type = 'movie' }: { movies: MovieListItem[]; type?: MediaType }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {movies.map((m) => (
        <MovieCard key={m.id} movie={m} type={type} />
      ))}
    </div>
  )
}

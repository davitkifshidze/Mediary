/* ============================================================
   უკუთავსებადობა: ძველი movie-სახელები ახლა media.ts-ის მიღმაა.
   ახალი კოდი პირდაპირ `@/api/media`-დან იღებს (mediaApi(type) + საერთოები).
   ============================================================ */

export * from './media'

import { moviesApi } from './media'
import type { MediaFilters } from './media'

export type MovieFilters = MediaFilters

// movie-ზე მიბმული მალსახმობები (არსებული movie-გვერდები/კომპონენტები იყენებენ)
export const fetchMovies = moviesApi.list
export const fetchMovie = moviesApi.get
export const createMovie = moviesApi.create
export const updateMovie = moviesApi.update
export const deleteMovie = moviesApi.remove
export const setStatus = moviesApi.setStatus
export const toggleFavorite = moviesApi.toggleFavorite
export const resyncMovie = moviesApi.resync
export const addMovieFromTmdb = moviesApi.addFromTmdb
export const bulkSetStatus = moviesApi.bulkStatus

// lookupMovie — movie-დრაფტი (ძველი სახელი)
export { lookupDraft as lookupMovie } from './media'

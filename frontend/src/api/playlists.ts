import { api } from '@/lib/api'
import type { Song } from '@/api/songs'

/* ============================================================
   პლეილისტები — `song` მოდულის ნაწილი (2026-09-03).

   ⚠️ 2026-09-03-მდე პლეილისტი ვიდეოებს იკრებდა; სიმღერა ახლა საკუთარი
   მოდულია, ე.ი. აქ სიმღერების ნაკრები და თანმიმდევრობა იმართება.
   ============================================================ */

export interface Playlist {
  id: number
  name: string
  sort_order: number
  /** Tasks 16 — პლეილისტი დამოუკიდებელი გაზიარებადი ერთეულია */
  visibility: 'private' | 'public'
  /** სიაში მოდის */
  songs_count?: number
  /** შიდა გვერდზე მოდის, pivot-ის რიგით */
  songs?: Song[]
  created_at: string | null
}

export interface PlaylistInput {
  name: string
  visibility?: 'private' | 'public'
}

export async function fetchPlaylists(): Promise<Playlist[]> {
  const { data } = await api.get('/playlists')
  return data.data
}

export async function fetchPlaylist(id: number): Promise<Playlist> {
  const { data } = await api.get(`/playlists/${id}`)
  return data.data
}

export async function createPlaylist(input: PlaylistInput): Promise<Playlist> {
  const { data } = await api.post('/playlists', input)
  return data.data
}

export async function updatePlaylist(id: number, input: PlaylistInput): Promise<Playlist> {
  const { data } = await api.patch(`/playlists/${id}`, input)
  return data.data
}

export async function deletePlaylist(id: number): Promise<void> {
  await api.delete(`/playlists/${id}`)
}

/** პლეილისტების რიგი — მოწოდებული თანმიმდევრობა ხდება `sort_order` */
export async function reorderPlaylists(ids: number[]): Promise<Playlist[]> {
  const { data } = await api.post('/playlists/reorder', { ids })
  return data.data
}

/**
 * პლეილისტის სიმღერები — **სრული სია, რიგითვე**.
 * დამატება, მოშორება და drag & drop ერთი და იმავე რექვესთია.
 */
export async function setPlaylistSongs(id: number, songIds: number[]): Promise<Playlist> {
  const { data } = await api.put(`/playlists/${id}/songs`, { song_ids: songIds })
  return data.data
}

/** მეორე მიმართულება — ერთი სიმღერა რამდენიმე პლეილისტში */
export async function setSongPlaylists(songId: number, playlistIds: number[]): Promise<Playlist[]> {
  const { data } = await api.put(`/songs/${songId}/playlists`, { playlist_ids: playlistIds })
  return data.data
}

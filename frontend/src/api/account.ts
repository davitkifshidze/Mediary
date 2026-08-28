import { api, ensureCsrfCookie } from '@/lib/api'
import type { Settings } from '@/lib/settings'

/* ============================================================
   ავტორიზაცია, პროფილი, მოდულები, მოთხოვნები და ადმინ-პანელი (I7).
   ============================================================ */

export interface User {
  id: number
  name: string
  first_name: string | null
  last_name: string | null
  username: string | null
  email: string
  display_name: string
  avatar_path: string | null
  role: 'super_admin' | 'user'
  is_super_admin: boolean
  is_active: boolean
  settings: Partial<Settings> | null
  created_at: string | null
  modules?: string[]
  movies_count?: number
  series_count?: number
  videos_count?: number
}

export interface ModuleInfo {
  id: number
  key: string
  name_ka: string
  name_en: string
  description_ka: string | null
  description_en: string | null
  icon: string
  route_base: string
  api_base: string
  morph_alias: string | null
  is_sensitive: boolean
  is_active: boolean
  enabled_by_default: boolean
  sort_order: number
  users_count?: number
  /** ვის აქვს ჩართული — ადმინის ტაბი (K14) */
  users?: { id: number; display_name: string; is_super_admin: boolean; implicit: boolean }[]
  /** ჩართულია ჩემთვის (GET /modules) */
  enabled?: boolean
  /** უფლება აქვს (ადმინმა ჩართო) — `enabled=false && granted=true` ნიშნავს „თვითონ გამოვრთე" */
  granted?: boolean
  /** ბოლო მოთხოვნის სტატუსი, თუ არსებობს */
  request_status?: 'pending' | 'approved' | 'rejected' | null
  /** per-user per-module პარამეტრები (`module_user.settings`) — მაგ. 18+ consent */
  user_settings?: Record<string, unknown>
}

export interface ApprovalRequestItem {
  id: number
  type: 'module_access' | 'genre_delete'
  status: 'pending' | 'approved' | 'rejected'
  message: string | null
  payload: Record<string, unknown> | null
  created_at: string | null
  reviewed_at: string | null
  review_note: string | null
  user?: { id: number; display_name: string; email: string }
  reviewer?: { id: number; display_name: string } | null
  module?: { id: number; key: string; name_ka: string; name_en: string; icon: string } | null
  genre?: { id: number; slug: string; name_ka: string | null; name_en: string | null } | null
}

/* ---------- auth ---------- */

export interface LoginInput {
  login: string
  password: string
  remember?: boolean
}

export interface RegisterInput {
  name: string
  first_name?: string
  last_name?: string
  username: string
  email: string
  password: string
  password_confirmation: string
}

export async function login(input: LoginInput): Promise<User> {
  await ensureCsrfCookie()
  const { data } = await api.post('/auth/login', input)
  return data.data
}

export async function register(input: RegisterInput): Promise<User> {
  await ensureCsrfCookie()
  const { data } = await api.post('/auth/register', input)
  return data.data
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout')
}

export async function fetchMe(): Promise<User> {
  const { data } = await api.get('/auth/me')
  return data.data
}

/** პროფილი — multipart (ავატარი), method spoofing-ით */
export async function updateProfile(payload: FormData): Promise<User> {
  payload.append('_method', 'PATCH')
  const { data } = await api.post('/auth/profile', payload)
  return data.data
}

export async function updatePassword(input: {
  current_password: string
  password: string
  password_confirmation: string
}): Promise<void> {
  await api.patch('/auth/password', input)
}

export async function saveSettings(settings: Settings): Promise<void> {
  await api.put('/auth/settings', { settings })
}

/* ---------- მოდულები / მოთხოვნები ---------- */

export async function fetchModules(): Promise<ModuleInfo[]> {
  const { data } = await api.get('/modules')
  return data.data
}

export async function fetchMyRequests(): Promise<ApprovalRequestItem[]> {
  const { data } = await api.get('/requests')
  return data.data
}

export async function requestModule(moduleKey: string, message?: string): Promise<ApprovalRequestItem> {
  const { data } = await api.post('/requests/module', { module_key: moduleKey, message })
  return data.data
}

export async function cancelRequest(id: number): Promise<void> {
  await api.delete(`/requests/${id}`)
}

/** მოდულის ჩართვა/გამორთვა საკუთარი თავისთვის (K13) */
export async function setModuleEnabled(key: string, enabled: boolean): Promise<void> {
  await api.patch(`/modules/${key}`, { enabled })
}

/* ---------- ადმინი ---------- */

export async function fetchUsers(): Promise<User[]> {
  const { data } = await api.get('/admin/users')
  return data.data
}

/** მომხმარებლის შიდა გვერდი (K14) */
export interface UserDetail {
  user: User
  content: {
    movies: number
    series: number
    videos: number
    videos_adult: number
    favorites: number
  }
  storage: { files: number; bytes: number }
  last_activity: string | null
  modules: {
    id: number
    key: string
    name_ka: string
    name_en: string
    icon: string
    is_sensitive: boolean
    is_active: boolean
    granted: boolean
    enabled: boolean
    /** მომხმარებელმა თვითონ დამალა (K13) */
    hidden_by_user: boolean
    enabled_at: string | null
  }[]
  requests: ApprovalRequestItem[]
}

export async function fetchUserDetail(id: number): Promise<UserDetail> {
  const { data } = await api.get(`/admin/users/${id}`)
  return data
}

export async function updateUser(
  id: number,
  input: { role?: 'super_admin' | 'user'; is_active?: boolean },
): Promise<User> {
  const { data } = await api.patch(`/admin/users/${id}`, input)
  return data.data
}

export async function syncUserModules(id: number, moduleKeys: string[]): Promise<User> {
  const { data } = await api.put(`/admin/users/${id}/modules`, { module_keys: moduleKeys })
  return data.data
}

export async function deleteUser(id: number): Promise<void> {
  await api.delete(`/admin/users/${id}`)
}

export async function fetchAdminModules(): Promise<ModuleInfo[]> {
  const { data } = await api.get('/admin/modules')
  return data.data
}

export async function updateModule(id: number, input: Partial<ModuleInfo>): Promise<ModuleInfo> {
  const { data } = await api.patch(`/admin/modules/${id}`, input)
  return data.data
}

export async function fetchAdminRequests(status = 'pending'): Promise<ApprovalRequestItem[]> {
  const { data } = await api.get('/admin/requests', { params: { status } })
  return data.data
}

export async function fetchPendingCount(): Promise<number> {
  const { data } = await api.get('/admin/requests/pending-count')
  return data.pending as number
}

export async function approveRequest(id: number, note?: string): Promise<ApprovalRequestItem> {
  const { data } = await api.post(`/admin/requests/${id}/approve`, { review_note: note })
  return data.data
}

export async function rejectRequest(id: number, note?: string): Promise<ApprovalRequestItem> {
  const { data } = await api.post(`/admin/requests/${id}/reject`, { review_note: note })
  return data.data
}

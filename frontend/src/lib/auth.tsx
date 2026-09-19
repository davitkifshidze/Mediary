import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as account from '@/api/account'
import type { LoginInput, RegisterInput, User } from '@/api/account'
import { STORAGE_CHANGED_EVENT, UNAUTHENTICATED_EVENT } from '@/lib/api'

/* ============================================================
   ავტორიზაციის კონტექსტი (F4 / I7).
   სესია cookie-შია; აქ მხოლოდ მიმდინარე user-ს ვინახავთ.
   ============================================================ */

interface AuthApi {
  user: User | null
  /** პირველი /auth/me ჯერ არ დასრულებულა */
  loading: boolean
  isAdmin: boolean
  /**
   * მოდულის შიდა უფლება (Tasks 1.6 / 19.8) — `can('movie', 'delete')`.
   * მხოლოდ ინტერფეისს ემსახურება (ღილაკის დამალვა); ნამდვილი შემოწმება
   * backend-ის `permission:` middleware-შია.
   */
  can: (module: string, action: string) => boolean
  /**
   * ადმინის სექციაზე წვდომა (Tasks 1.6) — `canAdmin('users')` სექციისთვის,
   * `canAdmin('users', 'delete')` კონკრეტული ღილაკისთვის.
   * ⚠️ **`is_super_admin`-ს ნუ შეამოწმებ პირდაპირ** ბმულების დასამალად:
   * წვდომა როლიდანაც შეიძლება მოვიდეს.
   */
  canAdmin: (resource: string, action?: string) => boolean
  login: (input: LoginInput) => Promise<User>
  register: (input: RegisterInput) => Promise<User>
  logout: () => Promise<void>
  setUser: (user: User) => void
  refresh: () => void
}

const AuthContext = React.createContext<AuthApi>({
  user: null,
  loading: true,
  isAdmin: false,
  can: () => false,
  canAdmin: () => false,
  login: async () => {
    throw new Error('AuthProvider missing')
  },
  register: async () => {
    throw new Error('AuthProvider missing')
  },
  logout: async () => {},
  setUser: () => {},
  refresh: () => {},
})

export function useAuth() {
  return React.useContext(AuthContext)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()

  const { data, isLoading, isFetched } = useQuery({
    queryKey: ['me'],
    queryFn: account.fetchMe,
    retry: false,
    staleTime: Infinity,
    // 401 ჩვეულებრივი მდგომარეობაა (გამოსული მომხმარებელი) — ხმაური არ გვინდა
    throwOnError: false,
  })

  const user = data ?? null

  // სესიის გაუქმებაზე (401 ნებისმიერი endpoint-იდან) მთელი ქეში იწმინდება
  React.useEffect(() => {
    const onUnauth = () => {
      qc.setQueryData(['me'], null)
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
    }
    window.addEventListener(UNAUTHENTICATED_EVENT, onUnauth)
    return () => window.removeEventListener(UNAUTHENTICATED_EVENT, onUnauth)
  }, [qc])

  // ატვირთვა/წაშლა კვოტას ცვლის (17.3) — ჰედერის ინდიკატორი `['me']`-დან იკვებება
  React.useEffect(() => {
    const onStorage = () => {
      qc.invalidateQueries({ queryKey: ['me'] })
      qc.invalidateQueries({ queryKey: ['storage'] })
    }
    window.addEventListener(STORAGE_CHANGED_EVENT, onStorage)
    return () => window.removeEventListener(STORAGE_CHANGED_EVENT, onStorage)
  }, [qc])

  const loginMutation = useMutation({ mutationFn: account.login })
  const registerMutation = useMutation({ mutationFn: account.register })

  const api = React.useMemo<AuthApi>(
    () => ({
      user,
      loading: isLoading && !isFetched,
      isAdmin: !!user?.is_super_admin,
      can: (module, action) => {
        if (!user) return false
        // სუპერ-ადმინს (permissions === null) ყველაფერი შეუძლია
        if (user.is_super_admin || user.permissions == null) return true
        /* ⚠️ `'*'` ფოლბექი ამოღებულია (Tasks DEBT-19): wildcard 2026-09-15-ს
           მოიხსნა — `Role`-იდან, ვალიდატორიდან და მონაცემებიდანაც (მიგრაციამ
           `user` როლის მასკა მოდულებად გაშალა). backend `'*'`-ს **არასდროს**
           აბრუნებს, ე.ი. ეს ბრანჩი მკვდარი იყო და ცრუ შთაბეჭდილებას ტოვებდა,
           რომ მექანიზმი ცოცხალია — ზუსტად ის, რის გამოც შემდეგი მკითხველი
           მასზე დაეყრდნობოდა. */
        return (user.permissions[module] ?? []).includes(action)
      },
      // ⚠️ `'*'` აქ განზრახ არ მოქმედებს — backend-იც ასე იქცევა (`Role::allowsAdmin`)
      canAdmin: (resource, action) => {
        if (!user) return false
        if (user.is_super_admin || user.permissions == null) return true
        // მოქმედების გარეშე — „სექცია საერთოდ ჩანს თუ არა" (ბმული/მარშრუტი)
        if (!action) return (user.admin_resources ?? []).includes(resource)
        return (user.permissions[`admin:${resource}`] ?? []).includes(action)
      },
      login: async (input) => {
        const u = await loginMutation.mutateAsync(input)
        qc.setQueryData(['me'], u)
        qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
        return u
      },
      register: async (input) => {
        const u = await registerMutation.mutateAsync(input)
        qc.setQueryData(['me'], u)
        return u
      },
      logout: async () => {
        try {
          await account.logout()
        } finally {
          qc.setQueryData(['me'], null)
          qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
        }
      },
      setUser: (u) => qc.setQueryData(['me'], u),
      refresh: () => qc.invalidateQueries({ queryKey: ['me'] }),
    }),
    [user, isLoading, isFetched, loginMutation, registerMutation, qc],
  )

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>
}

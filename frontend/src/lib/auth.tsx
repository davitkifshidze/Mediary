import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as account from '@/api/account'
import type { LoginInput, RegisterInput, User } from '@/api/account'
import { UNAUTHENTICATED_EVENT } from '@/lib/api'

/* ============================================================
   ავტორიზაციის კონტექსტი (F4 / I7).
   სესია cookie-შია; აქ მხოლოდ მიმდინარე user-ს ვინახავთ.
   ============================================================ */

interface AuthApi {
  user: User | null
  /** პირველი /auth/me ჯერ არ დასრულებულა */
  loading: boolean
  isAdmin: boolean
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

  const loginMutation = useMutation({ mutationFn: account.login })
  const registerMutation = useMutation({ mutationFn: account.register })

  const api = React.useMemo<AuthApi>(
    () => ({
      user,
      loading: isLoading && !isFetched,
      isAdmin: !!user?.is_super_admin,
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

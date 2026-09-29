import { useCallback, useSyncExternalStore } from 'react'

/* ============================================================
   **CSS media query-ის პასუხი React-ში** (Tasks §35).

   ⚠️ **`useSyncExternalStore` და არა `useState` + `useEffect`**: ეფექტი
   პირველ დახატვას *შემდეგ* გაიგებდა სიგანეს, ე.ი. ფართო ეკრანზე დამკვრელი
   ერთი კადრით ქვედა ზოლად გამოჩნდებოდა და მერე გვერდზე გადახტებოდა.

   ⚠️ **`matchMedia`-ს არარსებობა „არ ემთხვევა"-ს უდრის.** jsdom-ს ის არ
   აქვს (ე.ი. ტესტები) და სწორი პასუხი იქ ვიწრო ეკრანის ქცევაა — ტესტი,
   რომელსაც ფართო სჭირდება, `window.matchMedia`-ს თვითონ ჩაანაცვლებს.
   ============================================================ */

function mediaList(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(query)
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      const list = mediaList(query)
      if (!list) return () => {}
      list.addEventListener('change', notify)
      return () => list.removeEventListener('change', notify)
    },
    [query],
  )

  return useSyncExternalStore(
    subscribe,
    () => mediaList(query)?.matches ?? false,
    () => false,
  )
}

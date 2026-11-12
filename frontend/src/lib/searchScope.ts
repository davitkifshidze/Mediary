import { safeGet, safeSet } from '@/lib/storage'

/* ============================================================
   ძებნის არეალი — რომელ დომენებში ეძებს ძებნის გვერდი.

   ცარიელი სია = ყველგან. არჩევანი ბრაუზერს ახსოვს; მისამართის `?domain=`
   (მძიმით გამოყოფილი სია) მასზე ძლიერია — ჰედერის „ყველა N შედეგი →" და
   გაზიარებული ბმული ზუსტად იმ არეალს ხსნის, რომელიც მისამართში წერია.
   ============================================================ */

const STORE_KEY = 'search-scope.domains'

/** ბრაუზერში დამახსოვრებული არეალი */
export function readScope(): string[] {
  try {
    const parsed: unknown = JSON.parse(safeGet(STORE_KEY) ?? '[]')

    return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === 'string') : []
  } catch {
    return []
  }
}

export function rememberScope(domains: string[]): void {
  safeSet(STORE_KEY, JSON.stringify(domains))
}

/**
 * მოქმედი არეალი: მისამართი → დამახსოვრებული; უცნობი დომენი (გამორთული მოდული,
 * წაშლილი პირადი მოდული) იჭრება. `available === null` — სია ჯერ არ მოსულა და
 * არაფერი იჭრება.
 */
export function scopeOf(param: string | null, remembered: string[], available: string[] | null): string[] {
  const asked = param !== null ? param.split(',').filter(Boolean) : remembered
  const known = available ? asked.filter((key) => available.includes(key)) : asked

  // ყველა ცალ-ცალკე მონიშნული იგივეა, რაც „ყველა"
  return available && known.length === available.length ? [] : [...new Set(known)]
}

/** ერთი ჩიპის გადართვა; ბოლო მონიშნულის მოხსნა „ყველას" აბრუნებს */
export function toggleScope(selected: string[], key: string): string[] {
  return selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]
}

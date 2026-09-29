import { describe, expect, it } from 'vitest'
import { apiBaseFor } from './apiUrl'

/* ============================================================
   `lib/apiUrl.ts` — API-ს ჰოსტი გვერდის loopback-სახელს მიჰყვება.

   ⚠️ შეცდომა აქ ჩუმია: გვერდი იხსნება, login კი „სერვერს ვერ
   დავუკავშირდი"-ს წერს, თუმცა სერვერი მუშაობს.
   ============================================================ */

describe('apiBaseFor', () => {
  it('127.0.0.1-ზე გახსნილ გვერდს API-საც 127.0.0.1-ზე მიმართავს', () => {
    expect(apiBaseFor('http://localhost:8000', '127.0.0.1')).toBe('http://127.0.0.1:8000')
  })

  it('და პირიქით — localhost-ის გვერდს localhost-ზე', () => {
    expect(apiBaseFor('http://127.0.0.1:8000', 'localhost')).toBe('http://localhost:8000')
  })

  it('ერთნაირ სახელს არ ეხება', () => {
    expect(apiBaseFor('http://localhost:8000', 'localhost')).toBe('http://localhost:8000')
  })

  it('რეალურ ჰოსტს არასდროს ცვლის', () => {
    expect(apiBaseFor('http://mediary.local', '127.0.0.1')).toBe('http://mediary.local')
    expect(apiBaseFor('http://localhost:8000', 'mediary.local')).toBe('http://localhost:8000')
    expect(apiBaseFor('http://localhost:8000', '192.168.1.5')).toBe('http://localhost:8000')
  })

  it('ცარიელი (იგივე origin) და გაუმართავი მნიშვნელობა უცვლელი რჩება', () => {
    expect(apiBaseFor('', '127.0.0.1')).toBe('')
    expect(apiBaseFor('/backend', '127.0.0.1')).toBe('/backend')
  })

  it('პორტსა და გზას ინარჩუნებს', () => {
    expect(apiBaseFor('http://localhost:8000/app/', '127.0.0.1')).toBe('http://127.0.0.1:8000/app')
    expect(apiBaseFor('https://localhost', '127.0.0.1')).toBe('https://127.0.0.1')
  })
})

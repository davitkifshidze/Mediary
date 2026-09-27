import { describe, expect, it } from 'vitest'
import { addTerm, findTerm, hasTerm, removeTerm, toggleTerm } from './webQuery'

/* ============================================================
   `lib/webQuery.ts` — ვებძებნის შეკითხვის ჩიპები (Tasks §19.1).

   ⚠️ **ორივე შეცდომა ჩუმია.** არასწორი „აქტიური" ჩიპი ტიპებით არ იჭერა
   (ყველაფერი `string`-ია), სიტყვის ნაწილის ამოჭრა კი ეკრანზე მხოლოდ მაშინ
   ჩანს, როცა შეკითხვა უკვე გაფუჭებულია და ძებნა (ფასიან წყაროზე) დაიხარჯა.
   ============================================================ */

describe('findTerm / hasTerm', () => {
  it('სახელს მთელ სიტყვად ცნობს, რეგისტრის მიუხედავად', () => {
    expect(hasTerm('The Matrix 1999 keanu reeves', 'Keanu Reeves')).toBe(true)
    expect(findTerm('The Matrix 1999', 'the matrix 1999')).toBe(0)
  })

  it('სიტყვის ნაწილს სახელად არ თვლის', () => {
    // ⚠️ „Ann" „Anna"-ში — `includes()` აქ აქტიურ ჩიპს დახატავდა
    expect(hasTerm('Anna Karenina', 'Ann')).toBe(false)
    expect(hasTerm('Anna Karenina Ann', 'Ann')).toBe(true)
  })

  it('პუნქტუაციას საზღვრად თვლის', () => {
    expect(hasTerm('„მატრიცა“, კიანუ', 'მატრიცა')).toBe(true)
    expect(hasTerm('Dune: Part Two', 'Dune')).toBe(true)
  })

  it('ფრჩხილიან სახელს შაბლონად არ კითხულობს', () => {
    expect(hasTerm('Alien (1979) poster', 'Alien (1979)')).toBe(true)
    expect(hasTerm('Alien 1979', 'Alien (1979)')).toBe(false)
  })

  it('ცარიელი სახელი არსად არ არის', () => {
    expect(findTerm('anything', '   ')).toBe(-1)
  })
})

describe('addTerm / removeTerm / toggleTerm', () => {
  it('ჩანაწერის სახელი თავში ემატება, მსახიობი — ბოლოში', () => {
    expect(addTerm('Keanu Reeves', 'The Matrix 1999', 'start')).toBe('The Matrix 1999 Keanu Reeves')
    expect(addTerm('The Matrix 1999', 'Keanu Reeves')).toBe('The Matrix 1999 Keanu Reeves')
  })

  it('უკვე მყოფს მეორედ არ ამატებს', () => {
    expect(addTerm('The Matrix Keanu Reeves', 'keanu reeves')).toBe('The Matrix Keanu Reeves')
  })

  it('ამოღება ორმაგ ინტერვალს არ ტოვებს', () => {
    expect(removeTerm('The Matrix 1999 Keanu Reeves portrait', 'Keanu Reeves')).toBe(
      'The Matrix 1999 portrait',
    )
    expect(removeTerm('Keanu Reeves', 'Keanu Reeves')).toBe('')
  })

  it('ამოღება სიტყვის ნაწილს არ ეხება', () => {
    expect(removeTerm('Anna Karenina Ann', 'Ann')).toBe('Anna Karenina')
    expect(removeTerm('Anna Karenina', 'Ann')).toBe('Anna Karenina')
  })

  it('ჩიპზე ორჯერ დაჭერა შეკითხვას აბრუნებს', () => {
    const once = toggleTerm('The Matrix 1999', 'Keanu Reeves')
    expect(once).toBe('The Matrix 1999 Keanu Reeves')
    expect(toggleTerm(once, 'Keanu Reeves')).toBe('The Matrix 1999')
  })

  it('ცარიელ შეკითხვას სახელს უბრალოდ უწერს', () => {
    expect(toggleTerm('', 'The Matrix 1999', 'start')).toBe('The Matrix 1999')
  })
})

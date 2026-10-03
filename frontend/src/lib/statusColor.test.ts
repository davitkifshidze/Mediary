import { describe, expect, it } from 'vitest'
import { resolveStatusColor, STATUS_PALETTE, statusFillColor, statusStyle } from '@/lib/statusColor'

/* ============================================================
   **სტატუსის საკუთარი ფერი** (Tasks §16.1).
   ============================================================ */

describe('resolveStatusColor', () => {
  it('maps a palette key to its CSS variable and passes a hex through', () => {
    expect(resolveStatusColor('c7')).toBe('var(--status-c7)')
    expect(resolveStatusColor('#2F6B8F')).toBe('#2F6B8F')
  })

  it('rejects anything else so a typo cannot paint the badge', () => {
    expect(resolveStatusColor(null)).toBeNull()
    expect(resolveStatusColor('')).toBeNull()
    expect(resolveStatusColor('red')).toBeNull()
    expect(resolveStatusColor('c13')).toBeNull()
    expect(resolveStatusColor('#abc')).toBeNull()
  })

  it('the palette has twelve tones', () => {
    expect(STATUS_PALETTE).toHaveLength(12)
  })
})

describe('statusStyle', () => {
  it('is undefined without a colour — the role classes stay in charge', () => {
    expect(statusStyle({ color: null }, 'badge')).toBeUndefined()
    expect(statusStyle(null, 'active')).toBeUndefined()
  })

  it('draws the three looks from one colour', () => {
    expect(statusStyle({ color: 'c12' }, 'badge')).toEqual({
      backgroundColor: 'color-mix(in oklab, var(--status-c12) 15%, transparent)',
      color: 'var(--status-c12)',
    })
    expect(statusStyle({ color: '#aa0000' }, 'active')).toEqual({ backgroundColor: '#aa0000', borderColor: '#aa0000', color: '#fff' })
    expect(statusStyle({ color: 'c1' }, 'inactive')?.borderColor).toBe('color-mix(in oklab, var(--status-c1) 50%, transparent)')
    expect(statusStyle({ color: 'c1' }, 'icon')).toEqual({ color: 'var(--status-c1)' })
  })

  it('the chart segment takes the own colour first', () => {
    expect(statusFillColor({ color: 'c4' }, 'var(--status-watched)')).toBe('var(--status-c4)')
    expect(statusFillColor({ color: null }, 'var(--status-watched)')).toBe('var(--status-watched)')
  })
})

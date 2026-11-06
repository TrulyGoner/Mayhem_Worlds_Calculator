import { describe, it, expect } from 'vitest'
import { yearsFor, freeYears, rosterFor, inferYearFromRoster } from './teams'
import type { Player } from './game'

const makePlayer = (overrides: Partial<Player> = {}): Player => ({
  id: 'test',
  name: 'Test',
  role: 'MID',
  score: 80,
  year: 2023,
  team: 'T1',
  ...overrides,
})

const players: Player[] = [
  makePlayer({ name: 'Faker', role: 'MID', team: 'T1', year: 2023, score: 95 }),
  makePlayer({ name: 'Zeus', role: 'TOP', team: 'T1', year: 2023, score: 90 }),
  makePlayer({ name: 'Oner', role: 'JUNGLE', team: 'T1', year: 2023, score: 88 }),
  makePlayer({ name: 'Gumayusi', role: 'ADC', team: 'T1', year: 2023, score: 92 }),
  makePlayer({ name: 'Keria', role: 'SUPPORT', team: 'T1', year: 2023, score: 93 }),
  makePlayer({ name: 'Faker', role: 'MID', team: 'T1', year: 2022, score: 93 }),
  makePlayer({ name: 'Zeus', role: 'TOP', team: 'T1', year: 2022, score: 88 }),
  makePlayer({ name: 'Oner', role: 'JUNGLE', team: 'T1', year: 2022, score: 85 }),
  makePlayer({ name: 'Gumayusi', role: 'ADC', team: 'T1', year: 2022, score: 90 }),
  makePlayer({ name: 'Keria', role: 'SUPPORT', team: 'T1', year: 2022, score: 91 }),
  makePlayer({ name: 'Canyon', role: 'JUNGLE', team: 'Dplus Kia', year: 2023, score: 94 }),
  makePlayer({ name: 'ShowMaker', role: 'MID', team: 'Dplus Kia', year: 2023, score: 93 }),
]

describe('teams', () => {
  describe('yearsFor', () => {
    it('returns unique years sorted descending', () => {
      const years = yearsFor('T1', players)
      expect(years).toEqual([2023, 2022])
    })

    it('returns empty for unknown team', () => {
      expect(yearsFor('Unknown', players)).toEqual([])
    })
  })

  describe('freeYears', () => {
    it('excludes years used in other slots', () => {
      const slots = [
        { team: 'T1', year: 2023 },
        { team: 'Dplus Kia', year: null },
        { team: 'T1', year: null },
      ]
      const free = freeYears('T1', players, slots, 2)
      expect(free).toEqual([2022])
    })

    it('returns all years if none used', () => {
      const slots = [
        { team: 'Dplus Kia', year: 2023 },
        { team: 'Dplus Kia', year: null },
        { team: 'T1', year: null },
      ]
      const free = freeYears('T1', players, slots, 2)
      expect(free).toEqual([2023, 2022])
    })
  })

  describe('rosterFor', () => {
    it('returns players for team/year sorted by role order then score', () => {
      const roster = rosterFor('T1', 2023, players)
      expect(roster.length).toBe(5)
      expect(roster[0].role).toBe('TOP')
      expect(roster[1].role).toBe('JUNGLE')
      expect(roster[2].role).toBe('MID')
      expect(roster[3].role).toBe('ADC')
      expect(roster[4].role).toBe('SUPPORT')
    })

    it('returns empty for missing team/year', () => {
      expect(rosterFor('Unknown', 2023, players)).toEqual([])
      expect(rosterFor('T1', 2020, players)).toEqual([])
    })
  })

  describe('inferYearFromRoster', () => {
    it('infers year from multiple name matches when unique', () => {
      // Only 2023 roster has these players; 2022 has different names
      const uniquePlayers: Player[] = [
        makePlayer({ name: 'Unique1', role: 'TOP', team: 'T1', year: 2023 }),
        makePlayer({ name: 'Unique2', role: 'JUNGLE', team: 'T1', year: 2023 }),
        makePlayer({ name: 'Unique3', role: 'MID', team: 'T1', year: 2023 }),
        makePlayer({ name: 'Unique4', role: 'ADC', team: 'T1', year: 2023 }),
        makePlayer({ name: 'Unique5', role: 'SUPPORT', team: 'T1', year: 2023 }),
        makePlayer({ name: 'Other1', role: 'TOP', team: 'T1', year: 2022 }),
        makePlayer({ name: 'Other2', role: 'JUNGLE', team: 'T1', year: 2022 }),
      ]
      const text = 'Unique1 Unique2 Unique3 Unique4 Unique5'
      const result = inferYearFromRoster(text, 'T1', uniquePlayers)
      expect(result.year).toBe(2023)
      expect(result.candidates).toEqual([2023])
    })

    it('returns null when ambiguous (equal matches across years)', () => {
      const text = 'Faker Zeus'
      const result = inferYearFromRoster(text, 'T1', players)
      expect(result.year).toBeNull()
    })

    it('returns null for insufficient matches (< 2)', () => {
      const text = 'Faker'
      const result = inferYearFromRoster(text, 'T1', players)
      expect(result.year).toBeNull()
    })

    it('handles normalized matching with 5 unique names', () => {
      const uniquePlayers: Player[] = [
        makePlayer({ name: 'Unique1', role: 'TOP', team: 'T1', year: 2023 }),
        makePlayer({ name: 'Unique2', role: 'JUNGLE', team: 'T1', year: 2023 }),
        makePlayer({ name: 'Unique3', role: 'MID', team: 'T1', year: 2023 }),
        makePlayer({ name: 'Unique4', role: 'ADC', team: 'T1', year: 2023 }),
        makePlayer({ name: 'Unique5', role: 'SUPPORT', team: 'T1', year: 2023 }),
      ]
      const text = 'unique1 unique2 unique3 unique4 unique5'
      const result = inferYearFromRoster(text, 'T1', uniquePlayers)
      expect(result.year).toBe(2023)
    })
  })
})
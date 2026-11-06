import { describe, it, expect } from 'vitest'
import { normalize, bestTeamMatch, pickYear, TEAM_ALIASES } from './fuzzy'

describe('fuzzy', () => {
  describe('normalize', () => {
    it('lowercases and removes non-alphanumeric ASCII', () => {
      expect(normalize('Hello World!')).toBe('helloworld')
      expect(normalize('TSM')).toBe('tsm')
      expect(normalize('Team SoloMid')).toBe('teamsolomid')
      expect(normalize('G2 Esports')).toBe('g2esports')
    })

    it('removes non-Latin characters', () => {
      expect(normalize('Дженьши')).toBe('')
      expect(normalize('Fenerbahçe')).toBe('fenerbahe')
    })
  })

  describe('TEAM_ALIASES', () => {
    it('contains expected major team aliases', () => {
      expect(TEAM_ALIASES.has('tsm')).toBe(true)
      expect(TEAM_ALIASES.has('rng')).toBe(true)
      expect(TEAM_ALIASES.has('g2')).toBe(true)
      expect(TEAM_ALIASES.has('dk')).toBe(true)
      expect(TEAM_ALIASES.has('fnc')).toBe(true)
      expect(TEAM_ALIASES.has('c9')).toBe(true)
    })

    it('maps aliases to correct canonical names', () => {
      expect(TEAM_ALIASES.get('tsm')).toContain('TSM')
      expect(TEAM_ALIASES.get('rng')).toContain('Royal Never Give Up')
      expect(TEAM_ALIASES.get('dk')).toContain('Dplus Kia')
      expect(TEAM_ALIASES.get('dwg')).toContain('Dplus Kia')
    })
  })

  describe('bestTeamMatch', () => {
    const teams = ['TSM', 'Cloud9', 'Team Liquid', 'Fnatic', 'G2 Esports', 'Dplus Kia', 'T1', 'Gen.G']

    it('matches exact team name', () => {
      const result = bestTeamMatch('T1', teams)
      expect(result.team).toBe('T1')
      expect(result.score).toBe(1)
    })

    it('matches alias', () => {
      const result = bestTeamMatch('tsm', teams)
      expect(result.team).toBe('TSM')
      expect(result.score).toBeGreaterThan(0.8)
    })

    it('matches partial name', () => {
      const result = bestTeamMatch('Cloud', teams)
      expect(result.team).toBe('Cloud9')
    })

    it('returns first team for unknown input (fallback)', () => {
      const result = bestTeamMatch('xyz123', teams)
      expect(result.team).toBe('T1')
      expect(result.score).toBeGreaterThan(0)
    })

    it('handles case insensitivity', () => {
      const result = bestTeamMatch('fnatic', teams)
      expect(result.team).toBe('Fnatic')
    })

    it('prefers alias match over fuzzy', () => {
      const result = bestTeamMatch('dk', teams)
      expect(result.team).toBe('Dplus Kia')
    })
  })

  describe('pickYear', () => {
    it('picks exact year from text', () => {
      expect(pickYear('T1 2023 roster', [2022, 2023, 2024])).toBe(2023)
    })

    it('handles OCR errors O->0, I->1, Z->2', () => {
      expect(pickYear('T1 2O23', [2022, 2023, 2024])).toBe(2023)
      expect(pickYear('T1 20I3', [2022, 2023, 2024])).toBe(2023)
      expect(pickYear('T1 202Z', [2022, 2023, 2024])).toBe(2022)
    })

    it('returns null for no match', () => {
      expect(pickYear('no year here', [2023, 2024])).toBeNull()
    })

    it('requires high confidence (>= 0.75)', () => {
      // '2023' vs '2020' = 0.75 similarity (3/4), meets threshold
      expect(pickYear('2023', [2020, 2030])).toBe(2020)
      // '2023' vs '2030' = 0.5 similarity, below threshold
      expect(pickYear('2023', [2030])).toBeNull()
    })

    it('picks best match among candidates', () => {
      expect(pickYear('year 2023 or 2024', [2022, 2023, 2024])).toBe(2023)
    })
  })
})
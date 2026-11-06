import { describe, it, expect, vi } from 'vitest'
import { parsePlayer, loadPlayers } from './ratings'

describe('ratings', () => {
  const validRow = {
    player: 'Faker',
    position: 'MID',
    year: 2023,
    team: 'T1',
    placement: 'WINNER',
    games: 15,
    raw_stat_values: {
      WinRate: 80,
      KDA: 5.2,
      'Kill participation': 70.5,
      'Gold diff @ 15': 200,
      'First blood': 0.3,
      'clear ward / minute': 0.8,
      'Damage / minute': 600,
    },
    adjusted_competition_score: 95.5,
    confidence_multiplier: 0.9,
  }

  describe('parseRow', () => {
    it('parses valid row', () => {
      const row = { ...validRow }
      const result = parsePlayer(row, 0)
      expect(result.name).toBe('Faker')
      expect(result.role).toBe('MID')
      expect(result.year).toBe(2023)
      expect(result.team).toBe('T1')
      expect(result.placement).toBe('WINNER')
      expect(result.games).toBe(15)
      expect(result.score).toBe(95.5)
      expect(result.confidence).toBe(0.9)
      expect(result.winRate).toBe(80)
      expect(result.kda).toBe(5.2)
      expect(result.kp).toBe(70.5)
      expect(result.goldDiff15).toBe(200)
      expect(result.firstBlood).toBe(0.3)
      expect(result.clearWards).toBe(0.8)
      expect(result.dpm).toBe(600)
    })

    it('generates id from name, team, year, position', () => {
      const row = { ...validRow }
      const result = parsePlayer(row, 0)
      expect(result.id).toBe('Faker-T1-2023-MID')
    })

    it('handles missing optional stats', () => {
      const row = {
        ...validRow,
        raw_stat_values: {},
        placement: 'NONE',
        games: 0,
      }
      const result = parsePlayer(row, 0)
      expect(result.placement).toBe('NONE')
      expect(result.games).toBeUndefined()
      expect(result.winRate).toBeUndefined()
      expect(result.kda).toBeUndefined()
    })

    it('coerces numeric strings to numbers', () => {
      const row = {
        ...validRow,
        year: '2023',
        games: '15',
        adjusted_competition_score: '95.5',
        confidence_multiplier: '0.9',
      }
      const result = parsePlayer(row, 0)
      expect(result.year).toBe(2023)
      expect(result.games).toBe(15)
      expect(result.score).toBe(95.5)
      expect(result.confidence).toBe(0.9)
    })

    it('falls back to 0 for invalid numbers', () => {
      const row = {
        ...validRow,
        year: 'invalid',
        adjusted_competition_score: 'invalid',
      }
      const result = parsePlayer(row, 0)
      expect(result.year).toBe(0)
      expect(result.score).toBe(0)
    })

    it('filters out zero games', () => {
      const row = { ...validRow, games: 0 }
      const result = parsePlayer(row, 0)
      expect(result.games).toBeUndefined()
    })

    it('throws on missing required fields', () => {
      expect(() => parsePlayer({ ...validRow, player: 123 }, 0)).toThrow()
      expect(() => parsePlayer({ ...validRow, team: 123 }, 0)).toThrow()
      expect(() => parsePlayer({ ...validRow, position: 'INVALID' }, 0)).toThrow()
    })

    it('throws on invalid row format', () => {
      expect(() => parsePlayer(null as any, 0)).toThrow()
      expect(() => parsePlayer('string' as any, 0)).toThrow()
    })
  })

  describe('loadPlayers', () => {
    it('fetches and parses players', async () => {
      const mockPlayers = [
        { ...validRow, player: 'Faker', team: 'T1', year: 2023, position: 'MID' },
        { ...validRow, player: 'Zeus', team: 'T1', year: 2023, position: 'TOP' },
      ]

      const originalFetch = globalThis.fetch
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ player_competition_scores: mockPlayers }),
      })

      try {
        const players = await loadPlayers()
        expect(players).toHaveLength(2)
        expect(players[0].name).toBe('Faker')
        expect(players[1].name).toBe('Zeus')
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    it('throws on failed fetch', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })
      await expect(loadPlayers()).rejects.toThrow('Не удалось загрузить рейтинг: 404')
    })
  })
})
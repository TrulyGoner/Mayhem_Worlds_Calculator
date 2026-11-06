import { describe, it, expect } from 'vitest'
import { calculateTeamScore, scoreBreakdown, getScoreTone } from './scoring'
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

describe('scoring', () => {
  describe('scoreBreakdown', () => {
    it('returns zero for empty roster', () => {
      const result = scoreBreakdown([])
      expect(result.power).toBe(0)
      expect(result.base).toBe(0)
      expect(result.carryBonus).toBe(0)
      expect(result.weakPenalty).toBe(0)
      expect(result.weakRole).toBeNull()
    })

    it('calculates weighted base correctly', () => {
      const players: Player[] = [
        makePlayer({ role: 'TOP', score: 80 }),
        makePlayer({ role: 'JUNGLE', score: 80 }),
        makePlayer({ role: 'MID', score: 80 }),
        makePlayer({ role: 'ADC', score: 80 }),
        makePlayer({ role: 'SUPPORT', score: 80 }),
      ]
      const result = scoreBreakdown(players)
      expect(result.base).toBe(80)
      expect(result.carryBonus).toBe(0)
      expect(result.weakPenalty).toBe(0)
      expect(result.power).toBe(80)
    })

    it('applies carry bonus for top performers', () => {
      const players: Player[] = [
        makePlayer({ role: 'TOP', score: 95 }),
        makePlayer({ role: 'JUNGLE', score: 80 }),
        makePlayer({ role: 'MID', score: 80 }),
        makePlayer({ role: 'ADC', score: 80 }),
        makePlayer({ role: 'SUPPORT', score: 80 }),
      ]
      const result = scoreBreakdown(players)
      expect(result.carryBonus).toBeGreaterThan(0)
      expect(result.carryBonus).toBeLessThanOrEqual(2.5)
      expect(result.power).toBeGreaterThan(result.base)
    })

    it('applies weak penalty for bottom performers', () => {
      const players: Player[] = [
        makePlayer({ role: 'TOP', score: 80 }),
        makePlayer({ role: 'JUNGLE', score: 80 }),
        makePlayer({ role: 'MID', score: 80 }),
        makePlayer({ role: 'ADC', score: 80 }),
        makePlayer({ role: 'SUPPORT', score: 60 }),
      ]
      const result = scoreBreakdown(players)
      expect(result.weakPenalty).toBeGreaterThan(0)
      expect(result.weakPenalty).toBeLessThanOrEqual(2)
      expect(result.weakRole).toBe('SUPPORT')
      expect(result.power).toBeLessThan(result.base)
    })

    it('caps carry bonus at 2.5', () => {
      const players: Player[] = [
        makePlayer({ role: 'TOP', score: 100 }),
        makePlayer({ role: 'JUNGLE', score: 100 }),
        makePlayer({ role: 'MID', score: 100 }),
        makePlayer({ role: 'ADC', score: 50 }),
        makePlayer({ role: 'SUPPORT', score: 50 }),
      ]
      const result = scoreBreakdown(players)
      expect(result.carryBonus).toBeLessThanOrEqual(2.5)
    })

    it('caps weak penalty at 2.0', () => {
      const players: Player[] = [
        makePlayer({ role: 'TOP', score: 100 }),
        makePlayer({ role: 'JUNGLE', score: 100 }),
        makePlayer({ role: 'MID', score: 100 }),
        makePlayer({ role: 'ADC', score: 100 }),
        makePlayer({ role: 'SUPPORT', score: 0 }),
      ]
      const result = scoreBreakdown(players)
      expect(result.weakPenalty).toBeLessThanOrEqual(2.0)
    })

    it('picks best player per role when duplicates exist', () => {
      const players: Player[] = [
        makePlayer({ role: 'MID', score: 70, name: 'Weak' }),
        makePlayer({ role: 'MID', score: 90, name: 'Strong' }),
        makePlayer({ role: 'TOP', score: 80 }),
        makePlayer({ role: 'JUNGLE', score: 80 }),
        makePlayer({ role: 'ADC', score: 80 }),
        makePlayer({ role: 'SUPPORT', score: 80 }),
      ]
      const result = scoreBreakdown(players)
      expect(result.base).toBeCloseTo(82.4, 1)
    })

    it('ignores players with non-finite scores', () => {
      const players: Player[] = [
        makePlayer({ role: 'TOP', score: NaN }),
        makePlayer({ role: 'JUNGLE', score: Infinity }),
        makePlayer({ role: 'MID', score: 80 }),
        makePlayer({ role: 'ADC', score: 80 }),
        makePlayer({ role: 'SUPPORT', score: 80 }),
      ]
      const result = scoreBreakdown(players)
      expect(result.base).toBeCloseTo(80, 1)
    })
  })

  describe('calculateTeamScore', () => {
    it('rounds to one decimal', () => {
      const players: Player[] = [
        makePlayer({ role: 'TOP', score: 80.123 }),
        makePlayer({ role: 'JUNGLE', score: 80.456 }),
        makePlayer({ role: 'MID', score: 80.789 }),
        makePlayer({ role: 'ADC', score: 80.111 }),
        makePlayer({ role: 'SUPPORT', score: 80.999 }),
      ]
      const score = calculateTeamScore(players)
      expect(score).toBe(Math.round(score * 10) / 10)
    })
  })

  describe('getScoreTone', () => {
    it('returns elite for >= 90', () => {
      expect(getScoreTone(90)).toBe('elite')
      expect(getScoreTone(95)).toBe('elite')
    })
    it('returns strong for >= 80', () => {
      expect(getScoreTone(80)).toBe('strong')
      expect(getScoreTone(89)).toBe('strong')
    })
    it('returns average for < 80', () => {
      expect(getScoreTone(79)).toBe('average')
      expect(getScoreTone(50)).toBe('average')
    })
  })
})
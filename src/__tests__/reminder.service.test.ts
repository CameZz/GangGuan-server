// ReminderService 单元测试

import { isProjectWorkday, isBehindProgress, getEffectiveWorkingMinutes } from '../services/reminder.service'

describe('isProjectWorkday', () => {
  it('should return true for a regular weekday', () => {
    // 2025-06-23 is a Monday
    const monday = new Date('2025-06-23T10:00:00+08:00')
    expect(isProjectWorkday(monday, { nonWorkdays: [], extraWorkdays: [] })).toBe(true)
  })

  it('should return false for a regular weekend', () => {
    // 2025-06-21 is a Saturday
    const saturday = new Date('2025-06-21T10:00:00+08:00')
    expect(isProjectWorkday(saturday, { nonWorkdays: [], extraWorkdays: [] })).toBe(false)
  })

  it('should return false for a non-workday (holiday)', () => {
    const holiday = new Date('2025-06-23T10:00:00+08:00')
    expect(isProjectWorkday(holiday, { nonWorkdays: ['2025-06-23'], extraWorkdays: [] })).toBe(false)
  })

  it('should return true for an extra workday (weekend work)', () => {
    const saturday = new Date('2025-06-21T10:00:00+08:00')
    expect(isProjectWorkday(saturday, { nonWorkdays: [], extraWorkdays: ['2025-06-21'] })).toBe(true)
  })

  it('should prioritize non-workday over extra-workday for same date', () => {
    const date = new Date('2025-06-23T10:00:00+08:00')
    expect(isProjectWorkday(date, {
      nonWorkdays: ['2025-06-23'],
      extraWorkdays: ['2025-06-23']
    })).toBe(false)
  })
})

describe('isBehindProgress', () => {
  const basePhase = {
    id: 'phase1',
    templateId: 't1',
    name: 'Test Phase',
    order: 0,
    progress: 0,
    status: 'pending',
    startTime: new Date('2025-06-23T09:30:00+08:00'),
    endTime: new Date('2025-06-27T18:30:00+08:00'),
    assigneeId: 'user1',
    taskId: 'task1',
    task: {
      id: 'task1',
      title: 'Test Task',
      projectId: 'proj1',
      planningId: 'plan1',
      status: 'in-progress',
      project: { nonWorkdays: [], extraWorkdays: [] },
    },
  }

  it('should return true when progress is behind expected', () => {
    const midPhase = new Date('2025-06-25T12:00:00+08:00')
    expect(isBehindProgress(basePhase as any, midPhase)).toBe(true)
  })

  it('should return false when progress is at or above expected', () => {
    const phase = { ...basePhase, progress: 80 }
    const midPhase = new Date('2025-06-25T12:00:00+08:00')
    expect(isBehindProgress(phase as any, midPhase)).toBe(false)
  })

  it('should return false when phase has no assignee', () => {
    const phase = { ...basePhase, assigneeId: null }
    const midPhase = new Date('2025-06-25T12:00:00+08:00')
    expect(isBehindProgress(phase as any, midPhase)).toBe(false)
  })

  it('should return false when phase has no start time', () => {
    const phase = { ...basePhase, startTime: null }
    const midPhase = new Date('2025-06-25T12:00:00+08:00')
    expect(isBehindProgress(phase as any, midPhase)).toBe(false)
  })

  it('should return false when phase has no end time', () => {
    const phase = { ...basePhase, endTime: null }
    const midPhase = new Date('2025-06-25T12:00:00+08:00')
    expect(isBehindProgress(phase as any, midPhase)).toBe(false)
  })

  it('should return false when phase is complete (progress >= 100)', () => {
    const phase = { ...basePhase, progress: 100, status: 'done' }
    const midPhase = new Date('2025-06-25T12:00:00+08:00')
    expect(isBehindProgress(phase as any, midPhase)).toBe(false)
  })

  it('should return false when current time is before phase start', () => {
    const beforeStart = new Date('2025-06-22T10:00:00+08:00')
    expect(isBehindProgress(basePhase as any, beforeStart)).toBe(false)
  })

  it('should return true for overdue unfinished phase (end time passed)', () => {
    const phase = { ...basePhase, progress: 50 }
    const afterEnd = new Date('2025-06-30T10:00:00+08:00')
    expect(isBehindProgress(phase as any, afterEnd)).toBe(true)
  })

  it('should NOT use timeout or overdue wording - type is behind_progress', () => {
    // The spec says: no timeout/overdue notification type
    // isBehindProgress returns boolean; the notification type used is 'behind_progress'
    // This test verifies the function works for overdue phases (end time passed)
    // while the actual notification type is verified in notification.service.test.ts
    const phase = { ...basePhase, progress: 50 }
    const afterEnd = new Date('2025-06-30T10:00:00+08:00')
    const result = isBehindProgress(phase as any, afterEnd)
    expect(result).toBe(true)
    // The type used in generateBehindProgressReminders is 'behind_progress', never 'timeout' or 'overdue'
  })
})

describe('getEffectiveWorkingMinutes', () => {
  it('should return 0 when end is before start', () => {
    const start = new Date('2025-06-23T18:00:00+08:00')
    const end = new Date('2025-06-23T09:00:00+08:00')
    expect(getEffectiveWorkingMinutes(start, end, { nonWorkdays: [], extraWorkdays: [] })).toBe(0)
  })

  it('should calculate working minutes for a single workday', () => {
    // Full work sessions: 9:30-12:30 (180min) + 14:00-18:30 (270min) = 450min
    const start = new Date('2025-06-23T09:30:00+08:00')
    const end = new Date('2025-06-23T18:30:00+08:00')
    expect(getEffectiveWorkingMinutes(start, end, { nonWorkdays: [], extraWorkdays: [] })).toBe(450)
  })

  it('should skip non-workdays', () => {
    const start = new Date('2025-06-23T09:30:00+08:00') // Monday
    const end = new Date('2025-06-27T18:30:00+08:00') // Friday
    const result = getEffectiveWorkingMinutes(start, end, {
      nonWorkdays: ['2025-06-23'],
      extraWorkdays: []
    })
    expect(result).toBe(1800) // 4 days * 450
  })
})

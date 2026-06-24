import { TaskPhase } from '@prisma/client'
import { config } from '../config'
import { prisma } from '../utils/prisma'
import { notificationService } from './notification.service'

interface WorkdayConfig {
  nonWorkdays?: string[]
  extraWorkdays?: string[]
}

const WORK_SESSIONS = [
  { start: 9 * 60 + 30, end: 12 * 60 + 30 },
  { start: 14 * 60, end: 18 * 60 + 30 }
]

const MINUTE_MS = 60 * 1000

type ScheduledPhase = TaskPhase & {
  task: {
    id: string
    title: string
    projectId: string
    planningId: string | null
    status: string
    project: {
      nonWorkdays: any
      extraWorkdays: any
    }
  }
}

function getZonedParts(date: Date, timezone = config.timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23'
  }).formatToParts(date)
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]))
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    dateKey: `${byType.year}-${byType.month}-${byType.day}`,
    hour: Number(byType.hour),
    minute: Number(byType.minute),
    weekday: weekdayMap[byType.weekday] ?? 0
  }
}

function toStringArray(value: any): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function isProjectWorkday(date: Date, project: WorkdayConfig): boolean {
  const parts = getZonedParts(date)
  const nonWorkdays = toStringArray(project.nonWorkdays)
  const extraWorkdays = toStringArray(project.extraWorkdays)
  if (nonWorkdays.includes(parts.dateKey)) return false
  if (extraWorkdays.includes(parts.dateKey)) return true
  return parts.weekday >= 1 && parts.weekday <= 5
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function setTimeOnDate(date: Date, minutes: number): Date {
  const next = new Date(date)
  next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
  return next
}

function isWorkdayLocal(date: Date, project: WorkdayConfig): boolean {
  const key = formatDateKey(date)
  const nonWorkdays = toStringArray(project.nonWorkdays)
  const extraWorkdays = toStringArray(project.extraWorkdays)
  if (nonWorkdays.includes(key)) return false
  if (extraWorkdays.includes(key)) return true
  const day = date.getDay()
  return day >= 1 && day <= 5
}

export function getEffectiveWorkingMinutes(start: Date, end: Date, project: WorkdayConfig): number {
  if (end.getTime() <= start.getTime()) return 0

  let total = 0
  const current = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate())

  while (current <= last) {
    if (isWorkdayLocal(current, project)) {
      for (const session of WORK_SESSIONS) {
        const sessionStart = setTimeOnDate(current, session.start)
        const sessionEnd = setTimeOnDate(current, session.end)
        const overlapStart = Math.max(start.getTime(), sessionStart.getTime())
        const overlapEnd = Math.min(end.getTime(), sessionEnd.getTime())
        if (overlapEnd > overlapStart) {
          total += Math.round((overlapEnd - overlapStart) / MINUTE_MS)
        }
      }
    }
    current.setDate(current.getDate() + 1)
  }

  return total
}

function getExpectedProgress(phase: ScheduledPhase, now: Date): number {
  if (!phase.startTime || !phase.endTime) return 0
  const workDuration = getEffectiveWorkingMinutes(phase.startTime, phase.endTime, phase.task.project)
  if (workDuration <= 0) return now.getTime() > phase.endTime.getTime() && isProjectWorkday(now, phase.task.project) ? 100 : 0
  const elapsed = getEffectiveWorkingMinutes(phase.startTime, now, phase.task.project)
  return Math.min(100, Math.max(0, (elapsed / workDuration) * 100))
}

export function isBehindProgress(phase: ScheduledPhase, now = new Date()): boolean {
  if (!phase.assigneeId || !phase.startTime || !phase.endTime) return false
  if (phase.progress >= 100 || phase.status === 'done') return false
  if (now.getTime() < phase.startTime.getTime()) return false
  return phase.progress < getExpectedProgress(phase, now)
}

function getWindowKey(now: Date, windowTime: string): string {
  return `${getZonedParts(now).dateKey}T${windowTime}`
}

function dayRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

class ReminderService {
  private timer: ReturnType<typeof setInterval> | null = null
  private lastWindowKey: string | null = null

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.runDueWindow(new Date())
    }, 60 * 1000)
    void this.runDueWindow(new Date())
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  async runDueWindow(now: Date): Promise<void> {
    const parts = getZonedParts(now)
    const time = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`
    if (time !== '09:45' && time !== '18:15') return

    const windowKey = `${parts.dateKey}-${time}`
    if (this.lastWindowKey === windowKey) return
    this.lastWindowKey = windowKey

    await this.generateBehindProgressReminders(now, time)
    if (time === '18:15') {
      await this.generateProgressUpdateReminders(now, time)
    }
  }

  async generateBehindProgressReminders(now = new Date(), windowTime = 'manual'): Promise<number> {
    const phases = await this.getCandidatePhases()
    let created = 0
    for (const phase of phases) {
      if (!isProjectWorkday(now, phase.task.project)) continue
      if (!isBehindProgress(phase, now)) continue
      await notificationService.create({
        recipientId: phase.assigneeId!,
        type: 'behind_progress',
        title: '任务进度落后',
        body: `${phase.task.title} / ${phase.name} 当前进度低于计划进度`,
        projectId: phase.task.projectId,
        planningId: phase.task.planningId,
        taskId: phase.task.id,
        phaseId: phase.id,
        dedupeKey: `behind_progress:${phase.assigneeId}:${phase.id}:${getWindowKey(now, windowTime)}`
      })
      created++
    }
    return created
  }

  async generateProgressUpdateReminders(now = new Date(), windowTime = '18:15'): Promise<number> {
    const phases = await this.getCandidatePhases()
    const range = dayRange(now)
    let created = 0

    for (const phase of phases) {
      if (!phase.assigneeId || !phase.startTime) continue
      if (!isProjectWorkday(now, phase.task.project)) continue
      if (phase.progress >= 100 || phase.status === 'done') continue
      if (now.getTime() < phase.startTime.getTime()) continue

      const updatedToday = await prisma.taskProgressHistory.count({
        where: {
          phaseId: phase.id,
          operatorId: phase.assigneeId,
          createdAt: { gte: range.start, lt: range.end }
        }
      })
      if (updatedToday > 0) continue

      await notificationService.create({
        recipientId: phase.assigneeId,
        type: 'progress_update',
        title: '请更新任务进度',
        body: `${phase.task.title} / ${phase.name} 今天还没有提交进度`,
        projectId: phase.task.projectId,
        planningId: phase.task.planningId,
        taskId: phase.task.id,
        phaseId: phase.id,
        dedupeKey: `progress_update:${phase.assigneeId}:${phase.id}:${getWindowKey(now, windowTime)}`
      })
      created++
    }
    return created
  }

  private async getCandidatePhases(): Promise<ScheduledPhase[]> {
    return prisma.taskPhase.findMany({
      where: {
        assigneeId: { not: null },
        progress: { lt: 100 },
        task: { status: { notIn: ['done', 'abandoned'] } }
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            projectId: true,
            planningId: true,
            status: true,
            project: {
              select: {
                nonWorkdays: true,
                extraWorkdays: true
              }
            }
          }
        }
      }
    }) as Promise<ScheduledPhase[]>
  }
}

export const reminderService = new ReminderService()
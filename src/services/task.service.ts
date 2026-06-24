import { Task, TaskPhase, TaskHistory, TaskProgressHistory } from '@prisma/client'
import { prisma } from '../utils/prisma'
import { generateId } from '../utils/id'
import { notificationService } from './notification.service'

type TaskStatus = 'todo' | 'in-progress' | 'done' | 'abandoned'
type TaskPriority = 'low' | 'medium' | 'high'
type TaskItemType = 'requirement' | 'task'
type TaskPhaseStatus = 'pending' | 'in-progress' | 'done'
type TaskStage = 'filed' | 'designing' | 'initial' | 'preliminary' | 'final' | 'finalAcceptance' | 'completed'

interface CreateTaskParams {
  projectId: string
  planningId?: string | null
  itemType: TaskItemType
  parentRequirementId?: string | null
  title: string
  description: string
  priority: TaskPriority
  dueDate?: string | null
  assigneeId?: string | null
  phases?: UpdateTaskPhaseParams[]
  references?: UpdateReferenceParams[]
  comments?: UpdateCommentParams[]
}

interface UpdateTaskParams {
  title?: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  dueDate?: string | null
  assigneeId?: string | null
  planningId?: string | null
  parentRequirementId?: string | null
  stage?: TaskStage
  currentPhaseId?: string | null
  phases?: UpdateTaskPhaseParams[]
  references?: UpdateReferenceParams[]
  comments?: UpdateCommentParams[]
}

interface UpdateReferenceParams {
  id?: string
  type?: string
  url?: string
  title?: string
  authorId?: string | null
  createdAt?: string | Date | null
}

interface UpdateCommentParams {
  id?: string
  authorId?: string
  content?: string
  createdAt?: string | Date | null
}

interface UpdateTaskPhaseParams {
  id?: string
  templateId?: string
  name?: string
  order?: number
  assigneeId?: string | null
  progress?: number
  status?: TaskPhaseStatus
  startTime?: string | Date | null
  endTime?: string | Date | null
}

type NormalizedTaskPhaseInput = {
  id: string
  templateId: string
  name: string
  order: number
  assigneeId: string | null
  progress: number
  status: TaskPhaseStatus
  startTime: Date | null
  endTime: Date | null
}

type NormalizedReferenceInput = {
  id: string
  type: string
  url: string
  title: string
  authorId: string | null
  createdAt: Date | undefined
}

type NormalizedCommentInput = {
  id: string
  authorId: string
  content: string
  createdAt: Date | undefined
}

type TaskWithRelations = Task & {
  phases: TaskPhase[]
  references: any[]
  comments: any[]
}

export class TaskService {
  async getByProject(projectId: string): Promise<TaskWithRelations[]> {
    return prisma.task.findMany({
      where: { projectId },
      include: this.taskInclude(),
      orderBy: { createdAt: 'desc' }
    })
  }

  async getByPlanning(planningId: string): Promise<TaskWithRelations[]> {
    return prisma.task.findMany({
      where: { planningId },
      include: this.taskInclude(),
      orderBy: { createdAt: 'desc' }
    })
  }

  async getById(id: string): Promise<TaskWithRelations | null> {
    return prisma.task.findUnique({
      where: { id },
      include: this.taskInclude()
    })
  }

  async create(data: CreateTaskParams, operatorId?: string): Promise<TaskWithRelations> {
    const { projectId, planningId, itemType, parentRequirementId, title, description, priority, dueDate, assigneeId } = data
    const references = this.normalizeReferenceInputs(data.references, operatorId)
    const comments = this.normalizeCommentInputs(data.comments, operatorId)

    if (itemType === 'requirement') {
      return prisma.task.create({
        data: {
          itemType: 'requirement',
          parentRequirementId: null,
          title,
          description,
          status: 'todo',
          priority,
          dueDate: null,
          assigneeId: null,
          stage: 'filed',
          currentPhaseId: null,
          projectId,
          planningId: planningId || null,
          references: { create: references },
          comments: { create: comments }
        },
        include: this.taskInclude()
      })
    }

    const templates = await prisma.projectPhaseTemplate.findMany({
      where: { projectId, enabled: true },
      orderBy: { order: 'asc' }
    })

    const phases = data.phases !== undefined
      ? this.normalizeTaskPhaseInputs(data.phases)
      : templates.map(template => ({
          id: generateId(),
          templateId: template.id,
          name: template.name,
          order: template.order,
          assigneeId: null,
          progress: 0,
          status: 'pending' as TaskPhaseStatus,
          startTime: null,
          endTime: null
        }))

    const currentPhase = this.getCurrentPhase(phases as TaskPhase[])
    const status = this.deriveStatusFromPhases(phases as TaskPhase[], 'todo')
    const stage = this.deriveStageFromPhase(currentPhase as TaskPhase | null)

    return prisma.task.create({
      data: {
        itemType: 'task',
        parentRequirementId: parentRequirementId || null,
        title,
        description,
        status,
        priority,
        dueDate: this.toNullableDate(dueDate) ?? null,
        assigneeId: assigneeId || currentPhase?.assigneeId || null,
        stage,
        currentPhaseId: currentPhase?.id || null,
        projectId,
        planningId: planningId || null,
        references: { create: references },
        comments: { create: comments },
        phases: {
          create: phases.map(phase => ({
            id: phase.id,
            templateId: phase.templateId,
            name: phase.name,
            order: phase.order,
            progress: phase.progress,
            status: phase.status,
            startTime: phase.startTime,
            endTime: phase.endTime,
            assigneeId: phase.assigneeId
          }))
        }
      },
      include: this.taskInclude()
    })
  }

  async update(id: string, data: UpdateTaskParams, operatorId?: string): Promise<TaskWithRelations> {
    const existingTask = await this.getById(id)
    if (!existingTask) throw new Error('任务不存在')

    const isRequirement = existingTask.itemType === 'requirement'
    const phases = isRequirement
      ? []
      : data.phases !== undefined
        ? this.normalizeTaskPhaseInputs(data.phases)
        : existingTask.phases
    const currentPhase = this.getCurrentPhase(phases as TaskPhase[])
    const statusChanged = data.status !== undefined && data.status !== existingTask.status
    const nextStatus = isRequirement
      ? 'todo'
      : statusChanged
        ? data.status!
        : data.phases !== undefined
          ? this.deriveStatusFromPhases(phases as TaskPhase[], (data.status || existingTask.status) as TaskStatus)
          : (data.status || existingTask.status) as TaskStatus
    const nextStage = isRequirement
      ? 'filed'
      : data.phases !== undefined
        ? this.deriveStageFromPhase(currentPhase as TaskPhase | null)
        : (data.stage || existingTask.stage) as TaskStage
    const nextCurrentPhaseId = isRequirement
      ? null
      : data.phases !== undefined
        ? currentPhase?.id || null
        : data.currentPhaseId
    const nextAssigneeId = isRequirement
      ? null
      : data.phases !== undefined
        ? currentPhase?.assigneeId || null
        : data.assigneeId
    const references = data.references !== undefined ? this.normalizeReferenceInputs(data.references, operatorId) : null
    const comments = data.comments !== undefined ? this.normalizeCommentInputs(data.comments, operatorId) : null

    if (operatorId) {
      await this.recordHistory(id, data, existingTask, operatorId)
      if (!isRequirement && data.phases !== undefined) {
        await this.recordProgressHistories(id, existingTask.phases, phases as NormalizedTaskPhaseInput[], operatorId)
      }
    }

    const task = await prisma.$transaction(async tx => {
      if (data.phases !== undefined || isRequirement) {
        const incomingPhaseIds = new Set(phases.map(phase => phase.id))
        await tx.taskPhase.deleteMany({ where: { taskId: id, id: { notIn: [...incomingPhaseIds] } } })

        const existingPhaseIds = new Set(existingTask.phases.map(phase => phase.id))
        for (const phase of phases as NormalizedTaskPhaseInput[]) {
          const phaseData = {
            templateId: phase.templateId,
            name: phase.name,
            order: phase.order,
            progress: phase.progress,
            status: phase.status,
            startTime: phase.startTime,
            endTime: phase.endTime,
            assigneeId: phase.assigneeId
          }
          if (existingPhaseIds.has(phase.id)) {
            await tx.taskPhase.update({ where: { id: phase.id }, data: phaseData })
          } else {
            await tx.taskPhase.create({ data: { id: phase.id, taskId: id, ...phaseData } })
          }
        }
      }

      if (references) {
        const incomingReferenceIds = new Set(references.map(reference => reference.id))
        await tx.reference.deleteMany({ where: { taskId: id, id: { notIn: [...incomingReferenceIds] } } })

        const existingReferenceIds = new Set(existingTask.references.map(reference => reference.id))
        for (const reference of references) {
          const referenceData = {
            type: reference.type,
            url: reference.url,
            title: reference.title,
            authorId: reference.authorId,
            createdAt: reference.createdAt
          }
          if (existingReferenceIds.has(reference.id)) {
            await tx.reference.update({ where: { id: reference.id }, data: referenceData })
          } else {
            await tx.reference.create({ data: { id: reference.id, taskId: id, ...referenceData } })
          }
        }
      }

      if (comments) {
        const incomingCommentIds = new Set(comments.map(comment => comment.id))
        await tx.comment.deleteMany({ where: { taskId: id, id: { notIn: [...incomingCommentIds] } } })

        const existingCommentIds = new Set(existingTask.comments.map(comment => comment.id))
        for (const comment of comments) {
          const commentData = {
            authorId: comment.authorId,
            content: comment.content,
            createdAt: comment.createdAt
          }
          if (existingCommentIds.has(comment.id)) {
            await tx.comment.update({ where: { id: comment.id }, data: commentData })
          } else {
            await tx.comment.create({ data: { id: comment.id, taskId: id, ...commentData } })
          }
        }
      }

      return tx.task.update({
        where: { id },
        data: {
          title: data.title,
          description: data.description,
          status: nextStatus,
          priority: data.priority,
          dueDate: data.dueDate === undefined ? undefined : this.toNullableDate(data.dueDate),
          assigneeId: nextAssigneeId,
          planningId: data.planningId,
          parentRequirementId: isRequirement ? null : data.parentRequirementId,
          stage: nextStage,
          currentPhaseId: nextCurrentPhaseId,
          updatedAt: new Date()
        },
        include: this.taskInclude()
      })
    })

    if (operatorId && comments) {
      const existingCommentIds = new Set(existingTask.comments.map(comment => comment.id))
      for (const comment of comments.filter(comment => !existingCommentIds.has(comment.id))) {
        await notificationService.notifyComment(id, comment, comment.authorId || operatorId)
      }
    }

    if (operatorId && references) {
      const existingReferenceIds = new Set(existingTask.references.map(reference => reference.id))
      for (const reference of references.filter(reference => !existingReferenceIds.has(reference.id))) {
        await notificationService.notifyReference(id, reference, reference.authorId || operatorId)
      }
    }

    return task
  }

  async delete(id: string): Promise<void> {
    const task = await this.getById(id)
    if (!task) throw new Error('任务不存在')

    if (task.itemType === 'requirement') {
      const childCount = await prisma.task.count({ where: { parentRequirementId: id } })
      if (childCount > 0) throw new Error('需求单下有子任务，不能删除')
    }

    await prisma.task.delete({ where: { id } })
  }

  async move(id: string, status: TaskStatus, operatorId?: string): Promise<TaskWithRelations> {
    const task = await this.getById(id)
    if (!task) throw new Error('任务不存在')

    if (operatorId && task.status !== status) {
      await prisma.taskHistory.create({
        data: { taskId: id, operatorId, field: 'status', oldValue: task.status, newValue: status }
      })
    }

    return prisma.task.update({
      where: { id },
      data: { status, updatedAt: new Date() },
      include: this.taskInclude()
    })
  }

  async updatePhaseProgress(taskId: string, phaseId: string, progress: number, operatorId: string): Promise<TaskWithRelations> {
    const task = await this.getById(taskId)
    if (!task) throw new Error('任务不存在')

    const phase = task.phases.find(p => p.id === phaseId)
    if (!phase) throw new Error('阶段不存在')

    const clampedProgress = Math.max(0, Math.min(100, Math.round(Number(progress))))
    const phaseStatus = this.getPhaseStatus(clampedProgress)

    if (phase.progress !== clampedProgress) {
      await prisma.taskProgressHistory.create({
        data: {
          taskId,
          phaseId,
          phaseName: phase.name,
          assigneeId: phase.assigneeId,
          operatorId,
          oldProgress: phase.progress,
          newProgress: clampedProgress
        }
      })
    }

    await prisma.taskPhase.update({
      where: { id: phaseId },
      data: {
        progress: clampedProgress,
        status: phaseStatus,
        startTime: phase.progress === 0 && clampedProgress > 0 ? new Date() : phase.startTime,
        endTime: clampedProgress >= 100 ? new Date() : null
      }
    })

    const updatedTask = await this.getById(taskId)
    if (!updatedTask) throw new Error('任务不存在')

    const newCurrentPhase = this.getCurrentPhase(updatedTask.phases)
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: this.deriveStatusFromPhases(updatedTask.phases, task.status as TaskStatus),
        stage: this.deriveStageFromPhase(newCurrentPhase),
        currentPhaseId: newCurrentPhase?.id || null,
        assigneeId: newCurrentPhase?.assigneeId || task.assigneeId,
        updatedAt: new Date()
      }
    })

    return (await this.getById(taskId))!
  }

  async getHistories(taskId: string): Promise<TaskHistory[]> {
    return prisma.taskHistory.findMany({ where: { taskId }, orderBy: { createdAt: 'desc' } })
  }

  async getProgressHistories(taskId: string): Promise<TaskProgressHistory[]> {
    return prisma.taskProgressHistory.findMany({ where: { taskId }, orderBy: { createdAt: 'desc' } })
  }

  async getProjectProgressHistories(projectId: string): Promise<TaskProgressHistory[]> {
    return prisma.taskProgressHistory.findMany({
      where: { task: { projectId } },
      orderBy: { createdAt: 'desc' }
    })
  }

  private taskInclude() {
    return {
      phases: { orderBy: { order: 'asc' as const } },
      references: true,
      comments: true
    }
  }

  private getCurrentPhase(phases: TaskPhase[]): TaskPhase | null {
    return phases.find(p => p.status !== 'done') || phases[phases.length - 1] || null
  }

  private getPhaseStatus(progress: number): TaskPhaseStatus {
    if (progress <= 0) return 'pending'
    if (progress >= 100) return 'done'
    return 'in-progress'
  }

  private normalizeTaskPhaseInputs(phases: UpdateTaskPhaseParams[] = []): NormalizedTaskPhaseInput[] {
    return [...phases]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((phase, index) => {
        const progress = Math.max(0, Math.min(100, Math.round(Number(phase.progress ?? 0))))
        const id = phase.id || generateId()
        return {
          id,
          templateId: phase.templateId || id,
          name: phase.name || `Phase ${index + 1}`,
          order: Number.isFinite(phase.order) ? phase.order! : index,
          assigneeId: phase.assigneeId || null,
          progress,
          status: this.getPhaseStatus(progress),
          startTime: this.toNullableDate(phase.startTime) ?? null,
          endTime: this.toNullableDate(phase.endTime) ?? null
        }
      })
      .sort((a, b) => a.order - b.order)
      .map((phase, index) => ({ ...phase, order: index }))
  }

  private normalizeReferenceInputs(references: UpdateReferenceParams[] = [], fallbackAuthorId?: string): NormalizedReferenceInput[] {
    return references
      .map(reference => ({
        id: reference.id || generateId(),
        type: reference.type || 'link',
        url: (reference.url || '').trim(),
        title: (reference.title || '').trim(),
        authorId: reference.authorId || fallbackAuthorId || null,
        createdAt: this.toNullableDate(reference.createdAt) || undefined
      }))
      .filter(reference => reference.url || reference.title)
  }

  private normalizeCommentInputs(comments: UpdateCommentParams[] = [], fallbackAuthorId?: string): NormalizedCommentInput[] {
    return comments
      .map(comment => ({
        id: comment.id || generateId(),
        authorId: comment.authorId || fallbackAuthorId || '',
        content: (comment.content || '').trim(),
        createdAt: this.toNullableDate(comment.createdAt) || undefined
      }))
      .filter(comment => comment.authorId && comment.content)
  }

  private toNullableDate(value: string | Date | null | undefined): Date | null | undefined {
    if (value === undefined) return undefined
    if (value === null || value === '') return null
    return value instanceof Date ? value : new Date(value)
  }

  private toHistoryValue(field: string, value: unknown): string {
    if (field !== 'dueDate') return String(value ?? '')
    if (value === undefined || value === null || value === '') return ''
    const date = value instanceof Date ? value : new Date(String(value))
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString()
  }

  private deriveStageFromPhase(phase: TaskPhase | null): TaskStage {
    if (!phase) return 'filed'
    const byOrder: TaskStage[] = ['filed', 'designing', 'initial', 'preliminary', 'final', 'finalAcceptance', 'completed']
    const order = Number((phase as any).order)
    if (Number.isFinite(order) && byOrder[order]) return byOrder[order]

    const name = phase.name || ''
    if (name.includes('设计')) return 'designing'
    if (name.includes('初版实现')) return 'initial'
    if (name.includes('初步验收')) return 'preliminary'
    if (name.includes('终版完成')) return 'final'
    if (name.includes('最终验收')) return 'finalAcceptance'
    if (name.includes('完成')) return 'completed'
    return 'filed'
  }

  private deriveStatusFromPhases(phases: TaskPhase[], currentStatus: TaskStatus): TaskStatus {
    if (currentStatus === 'abandoned') return 'abandoned'
    if (phases.length === 0) return currentStatus
    if (phases.every(p => p.status === 'done')) return 'done'
    if (phases.some(p => p.status === 'in-progress')) return 'in-progress'
    return 'todo'
  }

  private async recordHistory(taskId: string, newData: UpdateTaskParams, oldTask: TaskWithRelations, operatorId: string): Promise<void> {
    const fieldsToTrack = ['title', 'description', 'status', 'priority', 'dueDate', 'assigneeId', 'stage'] as const
    for (const field of fieldsToTrack) {
      const oldValue = oldTask[field]
      const newValue = newData[field]
      if (newValue !== undefined && this.toHistoryValue(field, oldValue) !== this.toHistoryValue(field, newValue)) {
        await prisma.taskHistory.create({
          data: {
            taskId,
            operatorId,
            field,
            oldValue: this.toHistoryValue(field, oldValue),
            newValue: this.toHistoryValue(field, newValue)
          }
        })
      }
    }
  }

  private async recordProgressHistories(
    taskId: string,
    oldPhases: TaskPhase[],
    newPhases: NormalizedTaskPhaseInput[],
    operatorId: string
  ): Promise<void> {
    const oldById = new Map(oldPhases.map(phase => [phase.id, phase]))
    for (const phase of newPhases) {
      const oldPhase = oldById.get(phase.id)
      if (!oldPhase || oldPhase.progress === phase.progress) continue
      await prisma.taskProgressHistory.create({
        data: {
          taskId,
          phaseId: phase.id,
          phaseName: phase.name,
          assigneeId: phase.assigneeId,
          operatorId,
          oldProgress: oldPhase.progress,
          newProgress: phase.progress
        }
      })
    }
  }
}

export const taskService = new TaskService()
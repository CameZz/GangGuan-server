// 任务服务（核心）

import { Task, TaskPhase, TaskHistory, TaskProgressHistory } from '@prisma/client'
import { prisma } from '../utils/prisma'
import { generateId } from '../utils/id'

// 任务状态类型
type TaskStatus = 'todo' | 'in-progress' | 'done' | 'abandoned'
type TaskPriority = 'low' | 'medium' | 'high'
type TaskItemType = 'requirement' | 'task'
type TaskPhaseStatus = 'pending' | 'in-progress' | 'done'
type TaskStage = 'filed' | 'designing' | 'initial' | 'preliminary' | 'final' | 'finalAcceptance' | 'completed'

// 创建任务参数
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
  references?: UpdateReferenceParams[]
  comments?: UpdateCommentParams[]
}

// 更新任务参数
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
}

type NormalizedCommentInput = {
  id: string
  authorId: string
  content: string
  createdAt: Date | undefined
}

// 包含关联数据的任务类型
type TaskWithRelations = Task & {
  phases: TaskPhase[]
  references: any[]
  comments: any[]
}

export class TaskService {
  // 获取项目的所有任务
  async getByProject(projectId: string): Promise<TaskWithRelations[]> {
    return prisma.task.findMany({
      where: { projectId },
      include: {
        phases: { orderBy: { order: 'asc' } },
        references: true,
        comments: true
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  // 获取规划的所有任务
  async getByPlanning(planningId: string): Promise<TaskWithRelations[]> {
    return prisma.task.findMany({
      where: { planningId },
      include: {
        phases: { orderBy: { order: 'asc' } },
        references: true,
        comments: true
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  // 根据 ID 获取任务
  async getById(id: string): Promise<TaskWithRelations | null> {
    return prisma.task.findUnique({
      where: { id },
      include: {
        phases: { orderBy: { order: 'asc' } },
        references: true,
        comments: true
      }
    })
  }

  // 创建任务
  async create(data: CreateTaskParams, operatorId?: string): Promise<TaskWithRelations> {
    const { projectId, planningId, itemType, parentRequirementId, title, description, priority, dueDate, assigneeId } = data
    const references = this.normalizeReferenceInputs(data.references)
    const comments = this.normalizeCommentInputs(data.comments, operatorId)

    // 获取项目的阶段模板
    const phaseTemplates = await prisma.projectPhaseTemplate.findMany({
      where: { projectId, enabled: true },
      orderBy: { order: 'asc' }
    })

    // 根据任务类型处理
    if (itemType === 'requirement') {
      // 需求单：无阶段、无负责人、无截止日期
      const task = await prisma.task.create({
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
          references: {
            create: references
          },
          comments: {
            create: comments
          }
        },
        include: {
          phases: true,
          references: true,
          comments: true
        }
      })
      return task
    }

    // 任务：从模板生成阶段
    const phases = phaseTemplates.map(template => ({
      id: generateId(),
      templateId: template.id,
      name: template.name,
      order: template.order,
      progress: 0,
      status: 'pending' as TaskPhaseStatus,
      startTime: null,
      endTime: null,
      assigneeId: null
    }))

    // 推导当前阶段
    const currentPhase = phases[0] || null
    const stage = this.deriveStageFromPhase(currentPhase ? { name: currentPhase.name } as any : null)
    const status = 'todo' as TaskStatus

    const task = await prisma.task.create({
      data: {
        itemType: 'task',
        parentRequirementId: parentRequirementId || null,
        title,
        description,
        status,
        priority,
        dueDate: dueDate ? new Date(dueDate) : null,
        assigneeId: assigneeId || currentPhase?.assigneeId || null,
        stage,
        currentPhaseId: currentPhase?.id || null,
        projectId,
        planningId: planningId || null,
        references: {
          create: references
        },
        comments: {
          create: comments
        },
        // 创建关联的阶段
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
      include: {
        phases: { orderBy: { order: 'asc' } },
        references: true,
        comments: true
      }
    })

    return task
  }

  // 更新任务
  async update(id: string, data: UpdateTaskParams, operatorId?: string): Promise<TaskWithRelations> {
    const existingTask = await this.getById(id)
    if (!existingTask) {
      throw new Error('任务不存在')
    }

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
    const references = data.references !== undefined ? this.normalizeReferenceInputs(data.references) : null
    const comments = data.comments !== undefined ? this.normalizeCommentInputs(data.comments, operatorId) : null

    // 记录历史
    if (operatorId) {
      await this.recordHistory(id, data, existingTask, operatorId)
      if (!isRequirement && data.phases !== undefined) {
        await this.recordProgressHistories(id, existingTask.phases, phases as NormalizedTaskPhaseInput[], operatorId)
      }
    }

    const task = await prisma.$transaction(async tx => {
      if (data.phases !== undefined || isRequirement) {
        const incomingPhaseIds = new Set(phases.map(phase => phase.id))

        await tx.taskPhase.deleteMany({
          where: {
            taskId: id,
            id: { notIn: [...incomingPhaseIds] }
          }
        })

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
            await tx.taskPhase.update({
              where: { id: phase.id },
              data: phaseData
            })
          } else {
            await tx.taskPhase.create({
              data: {
                id: phase.id,
                taskId: id,
                ...phaseData
              }
            })
          }
        }
      }

      if (references) {
        const incomingReferenceIds = new Set(references.map(reference => reference.id))

        await tx.reference.deleteMany({
          where: {
            taskId: id,
            id: { notIn: [...incomingReferenceIds] }
          }
        })

        const existingReferenceIds = new Set(existingTask.references.map(reference => reference.id))
        for (const reference of references) {
          const referenceData = {
            type: reference.type,
            url: reference.url,
            title: reference.title
          }

          if (existingReferenceIds.has(reference.id)) {
            await tx.reference.update({
              where: { id: reference.id },
              data: referenceData
            })
          } else {
            await tx.reference.create({
              data: {
                id: reference.id,
                taskId: id,
                ...referenceData
              }
            })
          }
        }
      }

      if (comments) {
        const incomingCommentIds = new Set(comments.map(comment => comment.id))

        await tx.comment.deleteMany({
          where: {
            taskId: id,
            id: { notIn: [...incomingCommentIds] }
          }
        })

        const existingCommentIds = new Set(existingTask.comments.map(comment => comment.id))
        for (const comment of comments) {
          const commentData = {
            authorId: comment.authorId,
            content: comment.content,
            createdAt: comment.createdAt
          }

          if (existingCommentIds.has(comment.id)) {
            await tx.comment.update({
              where: { id: comment.id },
              data: commentData
            })
          } else {
            await tx.comment.create({
              data: {
                id: comment.id,
                taskId: id,
                ...commentData
              }
            })
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
        include: {
          phases: { orderBy: { order: 'asc' } },
          references: true,
          comments: true
        }
      })
    })

    return task
  }

  // 删除任务
  async delete(id: string): Promise<void> {
    const task = await this.getById(id)
    if (!task) {
      throw new Error('任务不存在')
    }

    // 需求单有子任务时不能删除
    if (task.itemType === 'requirement') {
      const childCount = await prisma.task.count({
        where: { parentRequirementId: id }
      })
      if (childCount > 0) {
        throw new Error('需求单下有子任务，不能删除')
      }
    }

    await prisma.task.delete({ where: { id } })
  }

  // 移动任务状态
  async move(id: string, status: TaskStatus, operatorId?: string): Promise<TaskWithRelations> {
    const task = await this.getById(id)
    if (!task) {
      throw new Error('任务不存在')
    }

    // 记录历史
    if (operatorId && task.status !== status) {
      await prisma.taskHistory.create({
        data: {
          taskId: id,
          operatorId,
          field: 'status',
          oldValue: task.status,
          newValue: status
        }
      })
    }

    const updatedTask = await prisma.task.update({
      where: { id },
      data: { status, updatedAt: new Date() },
      include: {
        phases: { orderBy: { order: 'asc' } },
        references: true,
        comments: true
      }
    })

    return updatedTask
  }

  // 更新阶段进度
  async updatePhaseProgress(
    taskId: string,
    phaseId: string,
    progress: number,
    operatorId: string
  ): Promise<TaskWithRelations> {
    const task = await this.getById(taskId)
    if (!task) {
      throw new Error('任务不存在')
    }

    const phase = task.phases.find(p => p.id === phaseId)
    if (!phase) {
      throw new Error('阶段不存在')
    }

    // 限制进度范围
    const clampedProgress = Math.max(0, Math.min(100, progress))

    // 推导阶段状态
    const phaseStatus = this.getPhaseStatus(clampedProgress)

    // 记录进度历史
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

    // 更新阶段
    await prisma.taskPhase.update({
      where: { id: phaseId },
      data: {
        progress: clampedProgress,
        status: phaseStatus,
        // 如果进度从 0 开始，设置开始时间
        startTime: phase.progress === 0 && clampedProgress > 0 ? new Date() : phase.startTime,
        // 如果进度达到 100，设置结束时间
        endTime: clampedProgress >= 100 ? new Date() : null
      }
    })

    // 重新获取更新后的任务
    const updatedTask = await this.getById(taskId)!

    // 推导任务整体状态
    const newStatus = this.deriveStatusFromPhases(updatedTask!.phases, task.status as TaskStatus)
    const newStage = this.deriveStageFromPhase(this.getCurrentPhase(updatedTask!.phases))
    const newCurrentPhase = this.getCurrentPhase(updatedTask!.phases)

    // 更新任务派生字段
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: newStatus,
        stage: newStage,
        currentPhaseId: newCurrentPhase?.id || null,
        assigneeId: newCurrentPhase?.assigneeId || task.assigneeId,
        updatedAt: new Date()
      }
    })

    return (await this.getById(taskId))!
  }

  // ============ 规范化逻辑（移植自客户端） ============

  // 获取当前阶段（第一个未完成阶段）
  private getCurrentPhase(phases: TaskPhase[]): TaskPhase | null {
    return phases.find(p => p.status !== 'done') || phases[phases.length - 1] || null
  }

  // 推导阶段状态
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

  private toNullableDate(value: string | Date | null | undefined): Date | null | undefined {
    if (value === undefined) return undefined
    if (value === null || value === '') return null
    return value instanceof Date ? value : new Date(value)
  }

  private toHistoryValue(field: string, value: unknown): string {
    if (field !== 'dueDate') {
      return String(value ?? '')
    }

    if (value === undefined || value === null || value === '') {
      return ''
    }

    const date = value instanceof Date ? value : new Date(String(value))
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString()
  }

  private normalizeReferenceInputs(references: UpdateReferenceParams[] = []): NormalizedReferenceInput[] {
    return references
      .map(reference => ({
        id: reference.id || generateId(),
        type: reference.type || 'link',
        url: (reference.url || '').trim(),
        title: (reference.title || '').trim()
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

  // 从阶段推导任务阶段（TaskStage）
  private deriveStageFromPhase(phase: TaskPhase | null): TaskStage {
    if (!phase) return 'filed'

    const stageMap: Record<string, TaskStage> = {
      '立案': 'filed',
      '设计': 'designing',
      '初版实现': 'initial',
      '初步验收': 'preliminary',
      '终版完成': 'final',
      '最终验收': 'finalAcceptance',
      '完成': 'completed'
    }

    return stageMap[phase.name] || 'filed'
  }

  // 从阶段进度推导任务状态
  private deriveStatusFromPhases(phases: TaskPhase[], currentStatus: TaskStatus): TaskStatus {
    // 如果原状态是 abandoned，保持不变
    if (currentStatus === 'abandoned') return 'abandoned'

    if (phases.length === 0) return currentStatus

    const allDone = phases.every(p => p.status === 'done')
    if (allDone) return 'done'

    const anyInProgress = phases.some(p => p.status === 'in-progress')
    if (anyInProgress) return 'in-progress'

    return 'todo'
  }

  // 记录任务历史
  private async recordHistory(
    taskId: string,
    newData: UpdateTaskParams,
    oldTask: TaskWithRelations,
    operatorId: string
  ): Promise<void> {
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

  // 获取任务历史
  async getHistories(taskId: string): Promise<TaskHistory[]> {
    return prisma.taskHistory.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' }
    })
  }

  // 获取任务进度历史
  async getProgressHistories(taskId: string): Promise<TaskProgressHistory[]> {
    return prisma.taskProgressHistory.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' }
    })
  }

  // 获取项目的所有进度历史
  async getProjectProgressHistories(projectId: string): Promise<TaskProgressHistory[]> {
    return prisma.taskProgressHistory.findMany({
      where: {
        task: { projectId }
      },
      orderBy: { createdAt: 'desc' }
    })
  }
}

export const taskService = new TaskService()

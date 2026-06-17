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
}

// 更新任务参数
interface UpdateTaskParams {
  title?: string
  description?: string
  priority?: TaskPriority
  dueDate?: string | null
  assigneeId?: string | null
  planningId?: string | null
  parentRequirementId?: string | null
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
          planningId: planningId || null
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

    // 记录历史
    if (operatorId) {
      await this.recordHistory(id, data, existingTask, operatorId)
    }

    // 更新任务
    const task = await prisma.task.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        priority: data.priority,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        assigneeId: data.assigneeId,
        planningId: data.planningId,
        parentRequirementId: data.parentRequirementId,
        updatedAt: new Date()
      },
      include: {
        phases: { orderBy: { order: 'asc' } },
        references: true,
        comments: true
      }
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
    const fieldsToTrack = ['title', 'description', 'priority', 'dueDate', 'assigneeId'] as const

    for (const field of fieldsToTrack) {
      const oldValue = oldTask[field]
      const newValue = newData[field]

      if (newValue !== undefined && oldValue !== newValue) {
        await prisma.taskHistory.create({
          data: {
            taskId,
            operatorId,
            field,
            oldValue: String(oldValue ?? ''),
            newValue: String(newValue ?? '')
          }
        })
      }
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

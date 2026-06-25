// 数据迁移脚本：为现有项目和申请补填 assignedReviewerId
// 运行方式: npx ts-node prisma/migrations/assign-reviewer-migration.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('开始迁移: assign-reviewer-for-approval')

  // 1. 找到第一个 PM 或管理员作为默认审批人
  const defaultReviewer = await prisma.user.findFirst({
    where: {
      OR: [
        { role: 'pm' },
        { isAdmin: true }
      ]
    },
    select: { id: true, name: true }
  })

  if (!defaultReviewer) {
    console.error('错误: 系统中没有 PM 或管理员用户，无法设置默认审批人')
    process.exit(1)
  }

  console.log(`找到默认审批人: ${defaultReviewer.name} (${defaultReviewer.id})`)

  // 2. 为所有项目设置 defaultReviewerId
  const projects = await prisma.project.findMany({
    select: { id: true, name: true }
  })

  console.log(`找到 ${projects.length} 个项目需要更新`)

  for (const project of projects) {
    await prisma.project.update({
      where: { id: project.id },
      data: { defaultReviewerId: defaultReviewer.id }
    })
    console.log(`  项目 "${project.name}" 已设置默认审批人`)
  }

  // 3. 为现有申请设置 assignedReviewerId
  const approvals = await prisma.taskApprovalRequest.findMany({
    select: {
      id: true,
      title: true,
      status: true,
      reviewerId: true,
      projectId: true
    }
  })

  console.log(`找到 ${approvals.length} 个申请需要更新`)

  for (const approval of approvals) {
    // 已审批的申请：使用 reviewerId
    // pending 状态的申请：使用项目的 defaultReviewerId
    let assignedReviewerId: string

    if (approval.status !== 'pending' && approval.reviewerId) {
      assignedReviewerId = approval.reviewerId
    } else {
      // 获取项目的默认审批人
      const project = await prisma.project.findUnique({
        where: { id: approval.projectId },
        select: { defaultReviewerId: true }
      })
      assignedReviewerId = project?.defaultReviewerId || defaultReviewer.id
    }

    await prisma.taskApprovalRequest.update({
      where: { id: approval.id },
      data: { assignedReviewerId }
    })
    console.log(`  申请 "${approval.title}" (${approval.status}) 已设置指定审批人`)
  }

  console.log('迁移完成!')
}

main()
  .catch((e) => {
    console.error('迁移失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

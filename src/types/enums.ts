export enum TaskStatus {
  Todo = 'todo',
  InProgress = 'in-progress',
  Done = 'done',
  Abandoned = 'abandoned'
}

export enum TaskPriority {
  Low = 'low',
  Medium = 'medium',
  High = 'high'
}

export enum TaskItemType {
  Requirement = 'requirement',
  Task = 'task'
}

export enum TaskPhaseStatus {
  Pending = 'pending',
  InProgress = 'in-progress',
  Done = 'done'
}

export enum TaskStage {
  Filed = 'filed',
  Designing = 'designing',
  Initial = 'initial',
  Preliminary = 'preliminary',
  Final = 'final',
  FinalAcceptance = 'finalAcceptance',
  Completed = 'completed'
}

export enum NotificationType {
  ProgressUpdate = 'progress_update',
  BehindProgress = 'behind_progress',
  Comment = 'comment',
  Reference = 'reference',
  ApprovalSubmitted = 'approval_submitted',
  ApprovalApproved = 'approval_approved',
  ApprovalRejected = 'approval_rejected',
  ApprovalCancelled = 'approval_cancelled'
}

export enum WSMessageType {
  TaskCreate = 'task:create',
  TaskUpdate = 'task:update',
  TaskDelete = 'task:delete',
  ProjectCreate = 'project:create',
  ProjectUpdate = 'project:update',
  ProjectDelete = 'project:delete',
  MemberCreate = 'member:create',
  MemberUpdate = 'member:update',
  MemberDelete = 'member:delete',
  PlanningCreate = 'planning:create',
  PlanningUpdate = 'planning:update',
  PlanningDelete = 'planning:delete',
  UserLogin = 'user:login',
  UserLogout = 'user:logout',
  UserCreate = 'user:create',
  UserUpdate = 'user:update',
  UserDelete = 'user:delete',
  SyncInit = 'sync:init',
  SyncUpdate = 'sync:update',
  NotificationCreate = 'notification:create',
  NotificationUpdate = 'notification:update',
  NotificationReadAll = 'notification:read-all',
  ApprovalCreate = 'approval:create',
  ApprovalUpdate = 'approval:update'
}
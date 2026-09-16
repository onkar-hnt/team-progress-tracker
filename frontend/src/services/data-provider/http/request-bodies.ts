import type {
  CreateAssignedTaskRequest,
  CreateDailyWorkEntryRequest,
  CreateDeveloperRequest,
  CreateMentorCommentRequest,
  CreateMentorRequest,
  CreateProjectRequest,
  UpdateAssignedTaskRequest,
  UpdateDailyWorkEntryRequest,
  UpdateDeveloperRequest,
  UpdateMentorCommentRequest,
  UpdateMentorRequest,
  UpdateProjectRequest,
} from '@models/index'

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

export function developerCreateBody(request: CreateDeveloperRequest): Record<string, unknown> {
  return {
    name: request.name.trim(),
    employeeId: blankToNull(request.employeeId),
    role: blankToNull(request.role),
    location: blankToNull(request.location),
    active: request.active,
    email: blankToNull(request.email),
    accessRole: request.accessRole ?? null,
    primaryProjectId: request.primaryProjectId ?? null,
    createdDate: request.createdDate ?? null,
  }
}

export function developerUpdateBody(request: UpdateDeveloperRequest): Record<string, unknown> {
  const payload: Record<string, unknown> = {}

  if ('name' in request && request.name !== undefined) payload.name = request.name.trim()
  if ('employeeId' in request) payload.employeeId = blankToNull(request.employeeId)
  if ('role' in request) payload.role = blankToNull(request.role)
  if ('location' in request) payload.location = blankToNull(request.location)
  if ('active' in request && request.active !== undefined) payload.active = request.active
  if ('email' in request) payload.email = blankToNull(request.email)
  if ('accessRole' in request) payload.accessRole = request.accessRole ?? null
  if ('primaryProjectId' in request) payload.primaryProjectId = request.primaryProjectId ?? null
  if ('createdDate' in request) payload.createdDate = request.createdDate ?? null

  return payload
}

export function mentorCreateBody(request: CreateMentorRequest): Record<string, unknown> {
  return {
    name: request.name.trim(),
    email: request.email.trim(),
    active: request.active,
    createdDate: request.createdDate ?? null,
  }
}

export function mentorUpdateBody(request: UpdateMentorRequest): Record<string, unknown> {
  const payload: Record<string, unknown> = {}

  if (request.name !== undefined) payload.name = request.name.trim()
  if (request.email !== undefined) payload.email = request.email.trim()
  if (request.active !== undefined) payload.active = request.active
  if (request.createdDate !== undefined) payload.createdDate = request.createdDate

  return payload
}

export function projectCreateBody(request: CreateProjectRequest): Record<string, unknown> {
  return {
    name: request.name.trim(),
    client: blankToNull(request.client),
    description: blankToNull(request.description),
    status: request.status,
    active: request.active,
    startDate: blankToNull(request.startDate),
    endDate: blankToNull(request.endDate),
    mentorId: request.mentorId ?? null,
    assignedDeveloperIds: [...request.assignedDeveloperIds],
  }
}

export function projectUpdateBody(request: UpdateProjectRequest): Record<string, unknown> {
  const payload: Record<string, unknown> = {}

  if ('name' in request && request.name !== undefined) payload.name = request.name.trim()
  if ('client' in request) payload.client = blankToNull(request.client)
  if ('description' in request) payload.description = blankToNull(request.description)
  if ('status' in request && request.status !== undefined) payload.status = request.status
  if ('active' in request && request.active !== undefined) payload.active = request.active
  if ('startDate' in request) payload.startDate = blankToNull(request.startDate)
  if ('endDate' in request) payload.endDate = blankToNull(request.endDate)
  if ('mentorId' in request) payload.mentorId = request.mentorId ?? null
  if ('assignedDeveloperIds' in request && request.assignedDeveloperIds !== undefined) {
    payload.assignedDeveloperIds = [...request.assignedDeveloperIds]
  }

  return payload
}

export function taskCreateBody(request: CreateAssignedTaskRequest): Record<string, unknown> {
  return {
    name: request.name.trim(),
    description: blankToNull(request.description),
    projectId: request.projectId,
    developerId: request.developerId,
    mentorId: request.mentorId ?? null,
    priority: request.priority,
    status: request.status,
    createdDate: request.createdDate,
    dueDate: blankToNull(request.dueDate),
    estimatedHours: request.estimatedHours ?? null,
  }
}

export function taskUpdateBody(request: UpdateAssignedTaskRequest): Record<string, unknown> {
  const payload: Record<string, unknown> = {}

  if ('name' in request && request.name !== undefined) payload.name = request.name.trim()
  if ('projectId' in request && request.projectId !== undefined) payload.projectId = request.projectId
  if ('developerId' in request && request.developerId !== undefined) {
    payload.developerId = request.developerId
  }
  if ('priority' in request && request.priority !== undefined) payload.priority = request.priority
  if ('status' in request && request.status !== undefined) payload.status = request.status
  if ('createdDate' in request && request.createdDate !== undefined) {
    payload.createdDate = request.createdDate
  }
  if ('description' in request) payload.description = blankToNull(request.description)
  if ('mentorId' in request) payload.mentorId = request.mentorId ?? null
  if ('dueDate' in request) payload.dueDate = blankToNull(request.dueDate)
  if ('estimatedHours' in request) payload.estimatedHours = request.estimatedHours ?? null

  return payload
}

export function dailyWorkCreateBody(request: CreateDailyWorkEntryRequest): Record<string, unknown> {
  return {
    date: request.date,
    developerId: request.developerId,
    projectId: request.projectId,
    taskId: request.taskId ?? null,
    taskTitle: request.taskTitle.trim(),
    description: blankToNull(request.description),
    workDone: blankToNull(request.workDone),
    plannedWork: blankToNull(request.plannedWork),
    status: request.status,
    priority: request.priority,
    progress: request.progress,
    hoursSpent: request.hoursSpent ?? null,
    estimatedHours: request.estimatedHours ?? null,
    isBlocked: request.isBlocked,
    blockerDescription: blankToNull(request.blockerDescription),
    remarks: blankToNull(request.remarks),
  }
}

export function dailyWorkUpdateBody(request: UpdateDailyWorkEntryRequest): Record<string, unknown> {
  const payload: Record<string, unknown> = {}

  if ('developerId' in request && request.developerId !== undefined) {
    payload.developerId = request.developerId
  }
  if ('projectId' in request && request.projectId !== undefined) payload.projectId = request.projectId
  if ('date' in request && request.date !== undefined) payload.date = request.date
  if ('taskTitle' in request && request.taskTitle !== undefined) {
    payload.taskTitle = request.taskTitle.trim()
  }
  if ('status' in request && request.status !== undefined) payload.status = request.status
  if ('priority' in request && request.priority !== undefined) payload.priority = request.priority
  if ('progress' in request && request.progress !== undefined) payload.progress = request.progress
  if ('isBlocked' in request && request.isBlocked !== undefined) payload.isBlocked = request.isBlocked
  if ('taskId' in request) payload.taskId = request.taskId ?? null
  if ('description' in request) payload.description = blankToNull(request.description)
  if ('workDone' in request) payload.workDone = blankToNull(request.workDone)
  if ('plannedWork' in request) payload.plannedWork = blankToNull(request.plannedWork)
  if ('hoursSpent' in request) payload.hoursSpent = request.hoursSpent ?? null
  if ('estimatedHours' in request) payload.estimatedHours = request.estimatedHours ?? null
  if ('blockerDescription' in request) {
    payload.blockerDescription = blankToNull(request.blockerDescription)
  }
  if ('remarks' in request) payload.remarks = blankToNull(request.remarks)

  return payload
}

export function commentCreateBody(request: CreateMentorCommentRequest): Record<string, unknown> {
  return {
    developerId: request.developerId,
    mentorId: request.mentorId ?? null,
    projectId: request.projectId ?? null,
    taskId: request.taskId ?? null,
    date: request.date,
    comment: request.comment.trim(),
    progressUpdate: blankToNull(request.progressUpdate),
    blockers: blankToNull(request.blockers),
    recommendations: blankToNull(request.recommendations),
  }
}

export function commentUpdateBody(request: UpdateMentorCommentRequest): Record<string, unknown> {
  const payload: Record<string, unknown> = {}

  if ('comment' in request && request.comment !== undefined) payload.comment = request.comment.trim()
  if ('date' in request && request.date !== undefined) payload.date = request.date
  if ('developerId' in request && request.developerId !== undefined) {
    payload.developerId = request.developerId
  }
  if ('mentorId' in request) payload.mentorId = request.mentorId ?? null
  if ('taskId' in request) payload.taskId = request.taskId ?? null
  if ('projectId' in request) payload.projectId = request.projectId ?? null
  if ('progressUpdate' in request) payload.progressUpdate = blankToNull(request.progressUpdate)
  if ('blockers' in request) payload.blockers = blankToNull(request.blockers)
  if ('recommendations' in request) {
    payload.recommendations = blankToNull(request.recommendations)
  }

  return payload
}

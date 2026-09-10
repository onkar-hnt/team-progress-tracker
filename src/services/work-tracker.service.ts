import type {
  CreateDailyWorkEntryRequest,
  DailyWorkEntry,
  DailyWorkQuery,
  Developer,
  Project,
  UpdateDailyWorkEntryRequest,
} from '@models/index'

import { getDataProvider } from './data-provider/index'
import type { DataProvider, DataProviderCapabilities } from './data-provider/index'
import type { DateRange } from '@utils/date.utils'
import { getWeekRange, toNearestWorkingDay } from '@utils/date.utils'
import type { DailyTrendPoint, StatusBreakdown } from '@utils/work-summary.utils'
import {
  buildDailyTrend,
  calculateCompletionRate,
  findBlockedEntries,
  findDevelopersMissingUpdate,
  findDevelopersWithUpdate,
  sumHoursLogged,
  summariseStatuses,
} from '@utils/work-summary.utils'
import { sortByMostRecent } from '@utils/task.utils'

/**
 * An entry with its lookups resolved, ready for tables and cards.
 *
 * Ids remain on the object so that navigation and filtering keep using keys;
 * the added names are for display only.
 */
export interface DailyWorkEntryView extends DailyWorkEntry {
  developerName: string
  projectName: string
  client?: string
}

/** Everything the dashboard needs for a single selected day. */
export interface DayOverview {
  date: string
  entries: DailyWorkEntryView[]
  statuses: StatusBreakdown
  completionRate: number
  hoursLogged: number
  developersUpdated: Developer[]
  developersMissingUpdate: Developer[]
  blockedEntries: DailyWorkEntryView[]
}

/** Everything the dashboard needs for a period such as a week. */
export interface RangeOverview {
  range: DateRange
  entries: DailyWorkEntryView[]
  statuses: StatusBreakdown
  completionRate: number
  hoursLogged: number
  trend: DailyTrendPoint[]
  blockedEntries: DailyWorkEntryView[]
}

/**
 * Application-facing data service.
 *
 * Features talk to this class, never to a provider. It owns the work that is
 * independent of storage: resolving developer and project names, assembling
 * the composite views screens actually need, and applying business rules such
 * as "only active developers can be missing an update".
 *
 * Because it depends on `DataProvider` rather than a concrete backend, moving
 * from mock data to SharePoint, and later to an API, changes nothing here.
 */
export class WorkTrackerService {
  private readonly provider: DataProvider

  constructor(provider: DataProvider) {
    this.provider = provider
  }

  get capabilities(): DataProviderCapabilities {
    return this.provider.capabilities
  }

  getDevelopers(): Promise<Developer[]> {
    return this.provider.getDevelopers()
  }

  async getActiveDevelopers(): Promise<Developer[]> {
    const developers = await this.provider.getDevelopers()
    return developers.filter((developer) => developer.active)
  }

  getProjects(): Promise<Project[]> {
    return this.provider.getProjects()
  }

  async getActiveProjects(): Promise<Project[]> {
    const projects = await this.provider.getProjects()
    return projects.filter((project) => project.active)
  }

  getDailyWorkEntries(query?: DailyWorkQuery): Promise<DailyWorkEntry[]> {
    return this.provider.getDailyWorkEntries(query)
  }

  getDailyWorkEntryById(id: string): Promise<DailyWorkEntry | null> {
    return this.provider.getDailyWorkEntryById(id)
  }

  /** Entries with names resolved, newest first. */
  async getDailyWorkEntryViews(query?: DailyWorkQuery): Promise<DailyWorkEntryView[]> {
    const [entries, developers, projects] = await Promise.all([
      this.provider.getDailyWorkEntries(query),
      this.provider.getDevelopers(),
      this.provider.getProjects(),
    ])

    return sortByMostRecent(entries).map((entry) =>
      this.toEntryView(entry, developers, projects),
    )
  }

  createDailyWorkEntry(request: CreateDailyWorkEntryRequest): Promise<DailyWorkEntry> {
    return this.provider.createDailyWorkEntry(request)
  }

  updateDailyWorkEntry(
    id: string,
    request: UpdateDailyWorkEntryRequest,
  ): Promise<DailyWorkEntry> {
    return this.provider.updateDailyWorkEntry(id, request)
  }

  deleteDailyWorkEntry(id: string): Promise<void> {
    return this.provider.deleteDailyWorkEntry(id)
  }

  async getDayOverview(isoDate: string): Promise<DayOverview> {
    const [entries, developers, projects] = await Promise.all([
      this.provider.getDailyWorkEntries({ dateFrom: isoDate, dateTo: isoDate }),
      this.provider.getDevelopers(),
      this.provider.getProjects(),
    ])

    const views = sortByMostRecent(entries).map((entry) =>
      this.toEntryView(entry, developers, projects),
    )

    return {
      date: isoDate,
      entries: views,
      statuses: summariseStatuses(entries),
      completionRate: calculateCompletionRate(entries),
      hoursLogged: sumHoursLogged(entries),
      developersUpdated: findDevelopersWithUpdate(developers, entries, isoDate),
      developersMissingUpdate: findDevelopersMissingUpdate(developers, entries, isoDate),
      blockedEntries: findBlockedEntries(views),
    }
  }

  async getRangeOverview(range: DateRange): Promise<RangeOverview> {
    const [entries, developers, projects] = await Promise.all([
      this.provider.getDailyWorkEntries({ dateFrom: range.from, dateTo: range.to }),
      this.provider.getDevelopers(),
      this.provider.getProjects(),
    ])

    const views = sortByMostRecent(entries).map((entry) =>
      this.toEntryView(entry, developers, projects),
    )

    return {
      range,
      entries: views,
      statuses: summariseStatuses(entries),
      completionRate: calculateCompletionRate(entries),
      hoursLogged: sumHoursLogged(entries),
      trend: buildDailyTrend(entries, range),
      blockedEntries: findBlockedEntries(views),
    }
  }

  /** Overview for the Monday-to-Sunday week containing `isoDate`. */
  getWeekOverview(isoDate: string): Promise<RangeOverview> {
    return this.getRangeOverview(getWeekRange(isoDate))
  }

  /**
   * Falls back to the previous working day so that opening the dashboard on a
   * Sunday shows Friday's work instead of an empty screen.
   */
  getWorkingDayOverview(isoDate: string): Promise<DayOverview> {
    return this.getDayOverview(toNearestWorkingDay(isoDate))
  }

  /**
   * Resolves display names, tolerating ids with no matching lookup row.
   *
   * A missing lookup is surfaced in the UI rather than hidden, because a
   * blank name would hide the fact that the workbook has an orphaned row.
   */
  private toEntryView(
    entry: DailyWorkEntry,
    developers: readonly Developer[],
    projects: readonly Project[],
  ): DailyWorkEntryView {
    const developer = developers.find((candidate) => candidate.id === entry.developerId)
    const project = projects.find((candidate) => candidate.id === entry.projectId)

    return {
      ...entry,
      developerName: developer?.name ?? `Unknown (${entry.developerId})`,
      projectName: project?.name ?? `Unknown (${entry.projectId})`,
      ...(project?.client === undefined ? {} : { client: project.client }),
    }
  }
}

let cachedService: WorkTrackerService | undefined

export function getWorkTrackerService(): WorkTrackerService {
  cachedService ??= new WorkTrackerService(getDataProvider())
  return cachedService
}

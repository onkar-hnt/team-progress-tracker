import { useMemo, useState } from 'react'

import type { DropdownOption } from '@components/ui/dropdown/Dropdown'
import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Panel } from '@components/ui/panel/Panel'
import { useDevelopers, useProjects } from '@hooks/use-work-tracker'
import { downloadCsv, toCsv } from '@utils/csv.utils'
import { getMonthRange, todayIsoDate } from '@utils/date.utils'

import {
  buildDeveloperReportFilename,
  buildEntriesCsv,
  describeReportRange,
  useDeveloperReport,
} from '../hooks/use-developer-report'
import type { DeveloperReportFilters as Filters } from '../hooks/use-developer-report'

import { DeveloperReportFilters } from './DeveloperReportFilters'
import { DeveloperReportResults } from './DeveloperReportResults'

import './DeveloperReportPanel.scss'

function defaultFilters(): Filters {
  const range = getMonthRange(todayIsoDate())

  return { developerId: '', projectId: '', from: range.from, to: range.to }
}

function findProblem(filters: Filters): string | null {
  if (filters.developerId === '') return 'Choose a developer to report on.'
  if (filters.from === '' || filters.to === '') return 'Choose both a from and a to date.'
  if (filters.from > filters.to) return 'The from date must be on or before the to date.'

  return null
}

function isSameFilters(left: Filters, right: Filters): boolean {
  return (
    left.developerId === right.developerId &&
    left.projectId === right.projectId &&
    left.from === right.from &&
    left.to === right.to
  )
}

export function DeveloperReportPanel() {
  const [draft, setDraft] = useState<Filters>(defaultFilters)
  const [applied, setApplied] = useState<Filters | null>(null)

  const developersQuery = useDevelopers()
  const projectsQuery = useProjects()
  const report = useDeveloperReport(applied)

  const developerOptions = useMemo<DropdownOption[]>(
    () => [
      { value: '', label: 'Select a developer' },
      ...(developersQuery.data ?? []).map((developer) => ({
        value: developer.id,
        label: developer.active ? developer.name : `${developer.name} (inactive)`,
      })),
    ],
    [developersQuery.data],
  )

  const projectOptions = useMemo<DropdownOption[]>(
    () => [
      { value: '', label: 'All projects' },
      ...(projectsQuery.data ?? []).map((project) => ({ value: project.id, label: project.name })),
    ],
    [projectsQuery.data],
  )

  const appliedDeveloperName = useMemo(() => {
    if (applied === null) return ''

    return (developersQuery.data ?? []).find((d) => d.id === applied.developerId)?.name ?? 'developer'
  }, [applied, developersQuery.data])

  const optionsError = developersQuery.error ?? projectsQuery.error

  const download = () => {
    if (applied === null) return

    downloadCsv(
      buildDeveloperReportFilename(appliedDeveloperName, applied),
      toCsv(buildEntriesCsv(report.entries)),
    )
  }

  return (
    <Panel
      description={
        applied === null
          ? 'Pick a developer and a period, then generate a report of everything they logged.'
          : `${appliedDeveloperName} · ${describeReportRange(applied)}${
              applied.projectId === ''
                ? ' · all projects'
                : ` · ${projectOptions.find((o) => o.value === applied.projectId)?.label ?? 'one project'}`
            }`
      }
      title="Developer activity report"
    >
      <div className="developer-report">
        {optionsError === null ? (
          <DeveloperReportFilters
            developerOptions={developerOptions}
            isGenerating={report.isPending}
            isLoadingOptions={developersQuery.isPending || projectsQuery.isPending}
            isStale={applied !== null && !isSameFilters(draft, applied)}
            onChange={setDraft}
            onClear={() => {
              setDraft(defaultFilters())
              setApplied(null)
            }}
            onGenerate={() => setApplied(draft)}
            problem={findProblem(draft)}
            projectOptions={projectOptions}
            value={draft}
          />
        ) : (
          <ErrorState
            message={`The filters could not be loaded: ${optionsError.message}`}
            onRetry={() => void developersQuery.refetch()}
          />
        )}

        {report.error !== null ? (
          <ErrorState message={`The report could not be generated: ${report.error.message}`} />
        ) : report.isPending ? (
          <Skeleton label="Generating the report…" rows={4} />
        ) : applied === null ? null : (
          <DeveloperReportResults
            entries={report.entries}
            onDownload={download}
            summary={report.summary}
          />
        )}
      </div>
    </Panel>
  )
}

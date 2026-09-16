<#
    Exercises the rules that used to live in Postgres triggers and policies,
    through the gateway, as three different people. Run after run-all.ps1.

    Usage: pwsh ./scripts/smoke-test.ps1
#>

$ErrorActionPreference = 'Continue'

$gateway = 'http://localhost:5100'
$passed = 0
$failed = 0

function Check($name, $condition, $detail) {
    if ($condition) {
        Write-Host ("PASS  {0}" -f $name) -ForegroundColor Green
        $script:passed++
    }
    else {
        Write-Host ("FAIL  {0}  {1}" -f $name, $detail) -ForegroundColor Red
        $script:failed++
    }
}

function Call($method, $path, $token, $body) {
    $headers = @{}

    if ($token) {
        $headers['Authorization'] = "Bearer $token"
    }

    $arguments = @{
        Uri         = "$gateway$path"
        Method      = $method
        Headers     = $headers
        ContentType = 'application/json'
    }

    if ($body) {
        $arguments['Body'] = ($body | ConvertTo-Json -Depth 6)
    }

    try {
        return @{ Ok = $true; Response = (Invoke-RestMethod @arguments) }
    }
    catch {
        return @{
            Ok     = $false
            Status = $_.Exception.Response.StatusCode.value__
            Body   = $_.ErrorDetails.Message
        }
    }
}

function SignIn($email, $password) {
    $result = Call POST '/api/auth/login' $null @{ email = $email; password = $password }

    if (-not $result.Ok) {
        throw "sign-in failed for $email : $($result.Status) $($result.Body)"
    }

    return $result.Response.data
}

Write-Host "`n== identity ==" -ForegroundColor Cyan

$admin = SignIn 'admin@handt.ai' 'Admin@1234'
Check 'admin signs in as admin' ($admin.user.role -eq 'admin') $admin.user.role
Check 'admin is not forced to change password' (-not $admin.user.mustChangePassword) 'flag set'

$wrong = Call POST '/api/auth/login' $null @{ email = 'admin@handt.ai'; password = 'wrong-password' }
Check 'a wrong password is refused with 401' ($wrong.Status -eq 401) $wrong.Status

$anonymous = Call GET '/api/developers' $null $null
Check 'an unauthenticated read is refused with 401' ($anonymous.Status -eq 401) $anonymous.Status

Write-Host "`n== roster ==" -ForegroundColor Cyan

$developers = (Call GET '/api/developers' $admin.accessToken $null).Response.data
$mentors = (Call GET '/api/mentors' $admin.accessToken $null).Response.data
$projects = (Call GET '/api/projects' $admin.accessToken $null).Response.data

Check 'admin sees the seeded employees' ($developers.Count -ge 6) $developers.Count
Check 'admin sees the seeded mentors' ($mentors.Count -ge 2) $mentors.Count
Check 'admin sees the seeded projects' ($projects.Count -ge 3) $projects.Count
Check 'employees carry a business code' ($developers[0].code -match '^DEV\d+$') $developers[0].code
Check 'projects list their assigned employees' ($null -ne $projects[0].assignedDeveloperIds) 'missing'

Write-Host "`n== provisioning and forced password change ==" -ForegroundColor Cyan

# An employee without a login gets one. Once every employee has been through a
# previous run the administrator resets a password instead, which reaches the
# same place: a session that must choose its own password before it can do
# anything. Written this way so the script can be run twice.
$subject = $developers | Where-Object { $_.email -and -not $_.profileId } | Select-Object -First 1
$temporary = $null
$wasProvisioned = $false

if ($null -ne $subject) {
    $provision = Call POST '/api/accounts/provision' $admin.accessToken @{
        table = 'developers'
        rowId = $subject.id
    }

    Check 'provisioning creates a login' ($provision.Ok -and $provision.Response.data.created) $provision.Body

    $temporary = $provision.Response.data.temporaryPassword
    Check 'provisioning returns a temporary password' ($temporary.Length -ge 8) 'missing'
    $wasProvisioned = $true
}
else {
    $subject = $developers | Where-Object { $_.email } | Select-Object -First 1
    Check 'an employee with a login is available' ($null -ne $subject) 'none available'

    $reset = Call POST '/api/accounts/reset-password' $admin.accessToken @{
        table    = 'developers'
        rowId    = $subject.id
        password = 'EmployeeReset@2026'
    }

    Check 'an administrator can reset an employee password' $reset.Ok $reset.Body
    Check 'a reset password must be changed' ($reset.Response.data.mustChangePassword) 'flag not set'

    $temporary = 'EmployeeReset@2026'
}

$firstSignIn = SignIn $subject.email $temporary
Check 'a new login must change its password' ($firstSignIn.user.mustChangePassword) 'flag not set'
Check 'a forced session is not linked to the roster yet' ($null -eq $firstSignIn.user.developerId) 'linked early'

# Only the password the service derived and handed over is refused as a choice.
# A password an administrator typed into a reset is not, so this check belongs
# to the provisioning branch.
if ($wasProvisioned) {
    $reuse = Call POST '/api/auth/change-password' $firstSignIn.accessToken @{ newPassword = $temporary }
    Check 'the handed-out password cannot be kept' ($reuse.Status -eq 400) $reuse.Status
}

$tooShort = Call POST '/api/auth/change-password' $firstSignIn.accessToken @{ newPassword = 'short1' }
Check 'a password under eight characters is refused' ($tooShort.Status -eq 400) $tooShort.Status

$changed = Call POST '/api/auth/change-password' $firstSignIn.accessToken @{ newPassword = 'Employee@2026' }
Check 'the password change succeeds' $changed.Ok $changed.Body

$developer = SignIn $subject.email 'Employee@2026'
Check 'the developer is now linked to their roster row' ($developer.user.developerId -eq $subject.id) $developer.user.developerId
Check 'the developer signs in as a developer' ($developer.user.role -eq 'developer') $developer.user.role

Write-Host "`n== scope (what replaced row level security) ==" -ForegroundColor Cyan

$ownView = (Call GET '/api/developers' $developer.accessToken $null).Response.data
Check 'a developer sees only themselves on the roster' ($ownView.Count -eq 1 -and $ownView[0].id -eq $subject.id) $ownView.Count

$forbiddenTask = Call POST '/api/tasks' $developer.accessToken @{
    name        = 'Task a developer should not be able to create'
    projectId   = $projects[0].id
    developerId = $subject.id
    priority    = 'medium'
    status      = 'not-started'
}
Check 'a developer cannot create a task directly' ($forbiddenTask.Status -eq 403) $forbiddenTask.Status

$accountsAsDeveloper = Call GET '/api/accounts' $developer.accessToken $null
Check 'a developer cannot list logins' ($accountsAsDeveloper.Status -eq 403) $accountsAsDeveloper.Status

$otherDeveloper = $developers | Where-Object { $_.id -ne $subject.id } | Select-Object -First 1
$otherReport = Call GET "/api/reports/developers/$($otherDeveloper.id)" $developer.accessToken $null
Check 'a developer cannot report on somebody else' ($otherReport.Status -in 403, 401) $otherReport.Status

Write-Host "`n== a daily update creates its own task ==" -ForegroundColor Cyan

$title = "Smoke test task $(Get-Random)"
$today = (Get-Date).ToString('yyyy-MM-dd')

$entry = Call POST '/api/daily-updates' $developer.accessToken @{
    date            = $today
    developerId     = $subject.id
    projectId       = $projects[0].id
    taskTitle       = $title
    status          = 'in-progress'
    priority        = 'high'
    progress        = 40
    hoursSpent      = 6
    estimatedHours  = 20
    isBlocked       = $false
    workDone        = 'Wrote the smoke test.'
}

Check 'the developer can log work' $entry.Ok $entry.Body

$created = $entry.Response.data
Check 'the entry was linked to a task' ($null -ne $created.taskId) 'no task id'

$task = (Call GET "/api/tasks/$($created.taskId)" $developer.accessToken $null).Response.data
Check 'the task took its name from the entry' ($task.name -eq $title) $task.name
Check 'the task took the estimate from the entry' ([decimal]$task.estimatedHours -eq 20) $task.estimatedHours
Check 'the task counted one worked day' ([int]$task.workedDays -eq 1) $task.workedDays
Check 'the task counted the reported hours' ([decimal]$task.actualHours -eq 6) $task.actualHours

$sameTitle = Call POST '/api/daily-updates' $developer.accessToken @{
    date        = (Get-Date).AddDays(-1).ToString('yyyy-MM-dd')
    developerId = $subject.id
    projectId   = $projects[0].id
    taskTitle   = $title
    status      = 'in-progress'
    priority    = 'high'
    progress    = 20
    isBlocked   = $false
}

Check 'a second entry with the same title adopts the same task' `
    ($sameTitle.Response.data.taskId -eq $created.taskId) $sameTitle.Response.data.taskId

$task = (Call GET "/api/tasks/$($created.taskId)" $developer.accessToken $null).Response.data
Check 'two days are now counted' ([int]$task.workedDays -eq 2) $task.workedDays
Check 'a day without reported hours counts as eight' ([decimal]$task.actualHours -eq 14) $task.actualHours

Write-Host "`n== status flows both ways ==" -ForegroundColor Cyan

$entryCompleted = Call PUT "/api/daily-updates/$($created.id)" $developer.accessToken @{
    date        = $today
    developerId = $subject.id
    projectId   = $projects[0].id
    taskTitle   = $title
    status      = 'completed'
    priority    = 'high'
    progress    = 100
    hoursSpent  = 6
    isBlocked   = $false
}

Check 'the entry can be completed' $entryCompleted.Ok $entryCompleted.Body

$task = (Call GET "/api/tasks/$($created.taskId)" $developer.accessToken $null).Response.data
Check 'completing the entry completed its task' ($task.status -eq 'completed') $task.status

$blocked = Call PATCH "/api/tasks/$($created.taskId)/status" $admin.accessToken @{ status = 'blocked' }
Check 'an admin can set a task status' $blocked.Ok $blocked.Body

$entryAfter = (Call GET "/api/daily-updates/$($created.id)" $developer.accessToken $null).Response.data
Check 'blocking the task blocked its entry' ($entryAfter.status -eq 'blocked') $entryAfter.status
Check 'blocking the task set the blocked flag' ($entryAfter.isBlocked -eq $true) $entryAfter.isBlocked

$developerStatus = Call PATCH "/api/tasks/$($created.taskId)/status" $developer.accessToken @{ status = 'in-progress' }
Check 'the assignee can set their own task status' $developerStatus.Ok $developerStatus.Body

Write-Host "`n== the comment trail ==" -ForegroundColor Cyan

# A mentor without a login gets one; on a second run against the same database
# every mentor already has one, so the administrator resets a password instead.
# Either way the mentor arrives here having been made to choose their own.
$mentorRow = $mentors | Where-Object { $_.email -and -not $_.profileId } | Select-Object -First 1
$handedOver = $null

if ($null -ne $mentorRow) {
    $mentorProvision = Call POST '/api/accounts/provision' $admin.accessToken @{
        table = 'mentors'
        rowId = $mentorRow.id
    }

    Check 'provisioned a mentor login' $mentorProvision.Ok $mentorProvision.Body

    if ($mentorProvision.Ok) {
        $handedOver = $mentorProvision.Response.data.temporaryPassword
    }
}
else {
    $mentorRow = $mentors | Select-Object -First 1
    $reset = Call POST '/api/accounts/reset-password' $admin.accessToken @{
        table    = 'mentors'
        rowId    = $mentorRow.id
        password = 'MentorReset@2026'
    }

    Check 'an administrator can reset a mentor password' $reset.Ok $reset.Body
    Check 'a reset password must be changed' ($reset.Response.data.mustChangePassword) 'flag not set'

    if ($reset.Ok) {
        $handedOver = 'MentorReset@2026'
    }
}

$mentorToken = $null

if ($handedOver) {
    $mentorFirst = SignIn $mentorRow.email $handedOver
    Call POST '/api/auth/change-password' $mentorFirst.accessToken @{ newPassword = 'Mentor@2026' } | Out-Null
    $mentorSession = SignIn $mentorRow.email 'Mentor@2026'
    $mentorToken = $mentorSession.accessToken
    Check 'the mentor signs in as a mentor' ($mentorSession.user.role -eq 'mentor') $mentorSession.user.role
    Check 'the mentor is linked to their mentor row' ($mentorSession.user.mentorId -eq $mentorRow.id) $mentorSession.user.mentorId
}

if ($mentorToken) {
    # The seeded assignments do not necessarily cover the employee provisioned
    # above, and a mentor may only speak about their own. The administrator adds
    # the link first, which is how it happens in the application too.
    $existing = @((Call GET '/api/mentor-assignments' $admin.accessToken $null).Response.data |
        Where-Object { $_.mentorId -eq $mentorRow.id } |
        ForEach-Object { $_.developerId })

    if ($existing -notcontains $subject.id) {
        $existing += $subject.id
    }

    $assigned = Call PUT "/api/mentors/$($mentorRow.id)/assignments" $admin.accessToken @{
        developerIds = $existing
    }

    Check 'an administrator can assign the employee to the mentor' $assigned.Ok $assigned.Body

    $visible = @((Call GET '/api/developers' $mentorToken $null).Response.data)
    Check 'a mentor sees their assigned employees' ($visible.Count -ge 1) $visible.Count
    Check 'the mentor now sees the provisioned employee' `
        (@($visible | Where-Object { $_.id -eq $subject.id }).Count -eq 1) $visible.Count

    $mentorComment = Call POST '/api/feedback' $mentorToken @{
        developerId = $subject.id
        mentorId    = $mentorRow.id
        taskId      = $created.taskId
        projectId   = $projects[0].id
        comment     = 'Please add a test for the eight hour fallback.'
    }

    Check 'a mentor can comment on an employee task' $mentorComment.Ok $mentorComment.Body
    Check 'the comment is stamped as written by a mentor' `
        ($mentorComment.Response.data.authorRole -eq 'mentor') $mentorComment.Response.data.authorRole

    $reply = Call POST '/api/feedback' $developer.accessToken @{
        developerId = $subject.id
        taskId      = $created.taskId
        comment     = 'Added, thank you.'
    }

    Check 'the developer can reply on their own task' $reply.Ok $reply.Body
    Check 'the reply is stamped as written by a developer' `
        ($reply.Response.data.authorRole -eq 'developer') $reply.Response.data.authorRole

    $trail = (Call GET "/api/feedback?taskIds=$($created.taskId)" $developer.accessToken $null).Response.data
    Check 'the whole trail is returned for the task' ($trail.Count -ge 2) $trail.Count

    $foreign = Call POST '/api/feedback' $developer.accessToken @{
        developerId = $otherDeveloper.id
        taskId      = $created.taskId
        comment     = 'A comment on somebody else.'
    }
    Check 'a developer cannot comment for another employee' ($foreign.Status -in 400, 403) $foreign.Status
}

Write-Host "`n== notifications ==" -ForegroundColor Cyan

if ($mentorToken) {
    # Filters are wrapped in @() throughout: a filter that matches exactly one
    # record returns that record rather than a list, and asking a single record
    # for its Count gives nothing, which reads as a failure that is not one.
    $mentorInbox = @((Call GET '/api/notifications' $mentorToken $null).Response.data)
    $submitted = @($mentorInbox | Where-Object { $_.type -eq 'daily_update_submitted' })
    Check 'the mentor was told about the daily update' ($submitted.Count -ge 1) $mentorInbox.Count

    $developerInbox = @((Call GET '/api/notifications' $developer.accessToken $null).Response.data)
    $ownUpdate = @($developerInbox | Where-Object { $_.type -eq 'daily_update_submitted' })
    Check 'the developer was not told about their own update' ($ownUpdate.Count -eq 0) $ownUpdate.Count

    $comments = @($developerInbox | Where-Object { $_.type -eq 'task_comment_added' })
    Check 'the developer was told about the mentor comment' ($comments.Count -ge 1) (
        "inbox holds: " + (($developerInbox | ForEach-Object { $_.type }) -join ', '))
    Check 'the comment notification points at the task' `
        ($comments[0].entityType -eq 'task' -and $comments[0].entityId -eq $created.taskId) $comments[0].entityId

    $unread = (Call GET '/api/notifications/unread-count' $developer.accessToken $null).Response.data
    Check 'the developer has unread notifications' ($unread -ge 1) $unread

    $read = Call POST "/api/notifications/$($comments[0].id)/read" $developer.accessToken $null
    Check 'a notification can be marked read' $read.Ok $read.Body

    $foreignRead = Call POST "/api/notifications/$($comments[0].id)/read" $mentorToken $null
    Check 'somebody else cannot mark it read' ($foreignRead.Status -in 403, 404) $foreignRead.Status

    $muted = Call PUT '/api/notification-preferences' $developer.accessToken @{
        mutedNotificationTypes = @('task_status_changed')
    }
    Check 'notification preferences can be saved' $muted.Ok $muted.Body

    $rubbish = Call PUT '/api/notification-preferences' $developer.accessToken @{
        mutedNotificationTypes = @('not_a_real_type')
    }
    Check 'an unknown notification type is refused' ($rubbish.Status -eq 400) $rubbish.Status
}

Write-Host "`n== the change log ==" -ForegroundColor Cyan

$changes = (Call GET '/api/change-log?limit=100' $admin.accessToken $null).Response.data
Check 'the change log recorded the work' ($changes.Count -ge 1) $changes.Count

$entryChanges = @($changes | Where-Object { $_.recordId -eq $created.id })
Check 'the log has lines for the entry' ($entryChanges.Count -ge 1) $entryChanges.Count
Check 'a log line names who made the change' `
    (@($entryChanges | Where-Object { $_.changedByName }).Count -ge 1) 'no name'
Check 'a log line carries a before and after' `
    (@($changes | Where-Object { @($_.changes).Count -ge 1 }).Count -ge 1) 'no field changes'

$derived = @($changes | Where-Object { $_.changes.field -contains 'ActualHours' -or $_.changes.field -contains 'WorkedDays' })
Check 'derived effort columns are kept out of the log' ($derived.Count -eq 0) $derived.Count

Write-Host "`n== the recycle bin ==" -ForegroundColor Cyan

# Held in its own variable so every check below asks about the same row, and a
# comparison against a missing id cannot pass by matching nothing.
$deletedEntryId = $sameTitle.Response.data.id
Check 'the second entry has an id to delete' ($null -ne $deletedEntryId) 'no id in the create response'

$deleted = Call DELETE "/api/daily-updates/$deletedEntryId" $developer.accessToken $null
Check 'the developer can delete their own entry' $deleted.Ok $deleted.Body

$stillListed = @((Call GET '/api/daily-updates' $developer.accessToken $null).Response.data |
    Where-Object { $_.id -eq $deletedEntryId })
Check 'a deleted entry disappears from the list' ($stillListed.Count -eq 0) $stillListed.Count

$bin = (Call GET '/api/recycle-bin' $developer.accessToken $null).Response.data
$inBin = @($bin | Where-Object { $_.id -eq $deletedEntryId })
Check 'the deleted entry is in the bin' ($inBin.Count -eq 1) (
    "looked for $deletedEntryId, bin holds: " + (($bin | ForEach-Object { "$($_.kind)/$($_.id)" }) -join ', '))

$task = (Call GET "/api/tasks/$($created.taskId)" $developer.accessToken $null).Response.data
Check 'deleting an entry recounts the task effort' ([int]$task.workedDays -eq 1) $task.workedDays

$restored = Call POST "/api/recycle-bin/entry/$deletedEntryId/restore" $developer.accessToken $null
Check 'the entry can be restored' $restored.Ok $restored.Body

$backAgain = @((Call GET '/api/daily-updates' $developer.accessToken $null).Response.data |
    Where-Object { $_.id -eq $deletedEntryId })
Check 'a restored entry is listed again' ($backAgain.Count -eq 1) $backAgain.Count

Write-Host "`n== reports ==" -ForegroundColor Cyan

$from = (Get-Date).AddDays(-30).ToString('yyyy-MM-dd')
$to = (Get-Date).ToString('yyyy-MM-dd')

$teamReport = Call GET "/api/reports/team?from=$from&to=$to" $admin.accessToken $null
Check 'the team report is produced' $teamReport.Ok $teamReport.Body
Check 'the team report totals hours' ([decimal]$teamReport.Response.data.hoursLogged -gt 0) $teamReport.Response.data.hoursLogged
Check 'the team report breaks down by employee' `
    ($teamReport.Response.data.developers.Count -ge 1) $teamReport.Response.data.developers.Count

$ownReport = Call GET "/api/reports/developers/$($subject.id)?from=$from&to=$to" $developer.accessToken $null
Check 'a developer can report on themselves' $ownReport.Ok $ownReport.Body

$backwards = Call GET "/api/reports/team?from=$to&to=$from" $admin.accessToken $null
Check 'a backwards date range is refused' ($backwards.Status -eq 400) $backwards.Status

$teamReportAsDeveloper = Call GET "/api/reports/team?from=$from&to=$to" $developer.accessToken $null
Check 'a developer cannot read the team report' ($teamReportAsDeveloper.Status -eq 403) $teamReportAsDeveloper.Status

Write-Host "`n== validation ==" -ForegroundColor Cyan

$noTitle = Call POST '/api/daily-updates' $developer.accessToken @{
    date        = $today
    developerId = $subject.id
    projectId   = $projects[0].id
    taskTitle   = '   '
    status      = 'in-progress'
    priority    = 'medium'
    progress    = 10
    isBlocked   = $false
}
Check 'an empty task title is refused' ($noTitle.Status -eq 400) $noTitle.Status

$badStatus = Call POST '/api/daily-updates' $developer.accessToken @{
    date        = $today
    developerId = $subject.id
    projectId   = $projects[0].id
    taskTitle   = 'Bad status'
    status      = 'nearly-done'
    priority    = 'medium'
    progress    = 10
    isBlocked   = $false
}
Check 'an unknown status is refused' ($badStatus.Status -eq 400) $badStatus.Status

$badProgress = Call POST '/api/daily-updates' $developer.accessToken @{
    date        = $today
    developerId = $subject.id
    projectId   = $projects[0].id
    taskTitle   = 'Bad progress'
    status      = 'in-progress'
    priority    = 'medium'
    progress    = 140
    isBlocked   = $false
}
Check 'progress above one hundred is refused' ($badProgress.Status -eq 400) $badProgress.Status

$forOther = Call POST '/api/daily-updates' $developer.accessToken @{
    date        = $today
    developerId = $otherDeveloper.id
    projectId   = $projects[0].id
    taskTitle   = 'Logged against somebody else'
    status      = 'in-progress'
    priority    = 'medium'
    progress    = 10
    isBlocked   = $false
}
Check 'a developer cannot log work for somebody else' ($forOther.Status -in 400, 403) $forOther.Status

Write-Host ''
Write-Host ("passed {0}, failed {1}" -f $passed, $failed) -ForegroundColor $(if ($failed -eq 0) { 'Green' } else { 'Red' })

if ($failed -gt 0) {
    exit 1
}

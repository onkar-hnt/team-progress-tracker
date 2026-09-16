using System.Text.Json;

using Work.Domain;

namespace Work.Application;

internal static class WorkMapping
{
    public static AssignedTaskDto ToDto(WorkTask task) => new()
    {
        Id = task.Id,
        Name = task.Name,
        Code = task.Code,
        Description = task.Description,
        ProjectId = task.ProjectId,
        DeveloperId = task.DeveloperId,
        MentorId = task.MentorId,
        Priority = task.Priority,
        Status = task.Status,
        CreatedDate = DateStrings.From(task.CreatedDate),
        DueDate = DateStrings.From(task.DueDate),
        EstimatedHours = task.EstimatedHours,
        WorkedDays = task.WorkedDays,
        ActualHours = task.ActualHours,
        UpdatedAt = DateStrings.From(task.UpdatedAt),
    };

    public static DailyWorkEntryDto ToDto(DailyUpdate entry) => new()
    {
        Id = entry.Id,
        Date = DateStrings.From(entry.EntryDate),
        DeveloperId = entry.DeveloperId,
        ProjectId = entry.ProjectId,
        TaskId = entry.TaskId,
        TaskTitle = entry.TaskTitle,
        Description = entry.Description,
        WorkDone = entry.WorkDone,
        PlannedWork = entry.PlannedWork,
        Status = entry.Status,
        Priority = entry.Priority,
        Progress = entry.Progress,
        HoursSpent = entry.HoursSpent,
        EstimatedHours = entry.EstimatedHours,
        IsBlocked = entry.IsBlocked,
        BlockerDescription = entry.BlockerDescription,
        Remarks = entry.Remarks,
        CreatedAt = DateStrings.From(entry.CreatedAt),
        UpdatedAt = DateStrings.From(entry.UpdatedAt),
    };

    public static MentorCommentDto ToDto(Feedback comment) => new()
    {
        Id = comment.Id,
        DeveloperId = comment.DeveloperId,
        MentorId = comment.MentorId,
        AuthorProfileId = comment.AuthorProfileId,
        AuthorRole = comment.AuthorRole,
        TaskId = comment.TaskId,
        ProjectId = comment.ProjectId,
        Date = DateStrings.From(comment.FeedbackDate),
        Comment = comment.Comment,
        ProgressUpdate = comment.ProgressUpdate,
        Blockers = comment.Blockers,
        Recommendations = comment.Recommendations,
        CreatedAt = DateStrings.From(comment.CreatedAt),
        UpdatedAt = DateStrings.From(comment.UpdatedAt),
    };

    public static ChangeRecordDto ToDto(RecordHistory row)
    {
        var changes = ParseChanges(row.Changes);

        return new ChangeRecordDto
        {
            Id = row.Id,
            TableName = row.TableName,
            RecordId = row.RecordId,
            Action = row.Action,
            Subject = row.Subject,
            SubjectDeveloperId = row.SubjectDeveloperId,
            ChangedBy = row.ChangedBy,
            ChangedByName = row.ChangedByName,
            ChangedAt = DateStrings.From(row.ChangedAt),
            Changes = changes,
        };
    }

    private static IReadOnlyList<FieldChangeDto> ParseChanges(string json)
    {
        if (string.IsNullOrWhiteSpace(json) || json == "{}")
        {
            return [];
        }

        try
        {
            using var document = JsonDocument.Parse(json);

            if (document.RootElement.ValueKind != JsonValueKind.Array)
            {
                return [];
            }

            var list = new List<FieldChangeDto>();

            foreach (var element in document.RootElement.EnumerateArray())
            {
                var field = element.GetProperty("field").GetString() ?? string.Empty;
                string? before = element.TryGetProperty("before", out var beforeProp) && beforeProp.ValueKind != JsonValueKind.Null
                    ? beforeProp.GetString()
                    : null;
                string? after = element.TryGetProperty("after", out var afterProp) && afterProp.ValueKind != JsonValueKind.Null
                    ? afterProp.GetString()
                    : null;

                list.Add(new FieldChangeDto { Field = field, Before = before, After = after });
            }

            return list;
        }
        catch (JsonException)
        {
            return [];
        }
    }

    public static void ApplyTaskRequest(SaveTaskRequest request, WorkTask task)
    {
        task.Name = request.Name.Trim();
        task.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        task.ProjectId = request.ProjectId;
        task.DeveloperId = request.DeveloperId;
        task.MentorId = request.MentorId;
        task.Priority = request.Priority;
        task.Status = request.Status;
        task.CreatedDate = string.IsNullOrWhiteSpace(request.CreatedDate)
            ? task.CreatedDate == default ? DateStrings.Today() : task.CreatedDate
            : DateStrings.ParseDate(request.CreatedDate, "Created date");
        task.DueDate = DateStrings.ParseOptionalDate(request.DueDate, "Due date");
        task.EstimatedHours = request.EstimatedHours;

        if (task.DueDate is DateOnly due && due < task.CreatedDate)
        {
            throw new ValidationFailedException("Due date cannot be before the created date.");
        }
    }

    public static void ApplyTaskRequest(SaveTaskRequest request, JsonFieldSet fields, WorkTask task)
    {
        if (fields.Has("name") && !string.IsNullOrWhiteSpace(request.Name))
        {
            task.Name = request.Name.Trim();
        }

        if (fields.Has("description"))
        {
            task.Description = string.IsNullOrWhiteSpace(request.Description)
                ? null
                : request.Description.Trim();
        }

        if (fields.Has("projectId"))
        {
            task.ProjectId = request.ProjectId;
        }

        if (fields.Has("developerId"))
        {
            task.DeveloperId = request.DeveloperId;
        }

        if (fields.Has("mentorId"))
        {
            task.MentorId = request.MentorId;
        }

        if (fields.Has("priority"))
        {
            task.Priority = request.Priority;
        }

        if (fields.Has("status"))
        {
            task.Status = request.Status;
        }

        if (fields.Has("createdDate"))
        {
            task.CreatedDate = string.IsNullOrWhiteSpace(request.CreatedDate)
                ? task.CreatedDate
                : DateStrings.ParseDate(request.CreatedDate, "Created date");
        }

        if (fields.Has("dueDate"))
        {
            task.DueDate = DateStrings.ParseOptionalDate(request.DueDate, "Due date");
        }

        if (fields.Has("estimatedHours"))
        {
            task.EstimatedHours = request.EstimatedHours;
        }

        if (fields.Has("createdDate") || fields.Has("dueDate"))
        {
            if (task.DueDate is DateOnly due && due < task.CreatedDate)
            {
                throw new ValidationFailedException("Due date cannot be before the created date.");
            }
        }
    }

    public static DailyUpdate FromDailyRequest(SaveDailyWorkEntryRequest request)
    {
        return new DailyUpdate
        {
            EntryDate = DateStrings.ParseDate(request.Date, "Date"),
            DeveloperId = request.DeveloperId,
            ProjectId = request.ProjectId,
            TaskId = request.TaskId,
            TaskTitle = request.TaskTitle.Trim(),
            Description = TrimOrNull(request.Description),
            WorkDone = TrimOrNull(request.WorkDone),
            PlannedWork = TrimOrNull(request.PlannedWork),
            Status = request.Status,
            Priority = request.Priority,
            Progress = request.Progress,
            HoursSpent = request.HoursSpent,
            EstimatedHours = request.EstimatedHours,
            IsBlocked = request.IsBlocked,
            BlockerDescription = TrimOrNull(request.BlockerDescription),
            Remarks = TrimOrNull(request.Remarks),
        };
    }

    public static void ApplyDailyRequest(SaveDailyWorkEntryRequest request, DailyUpdate entry)
    {
        entry.EntryDate = DateStrings.ParseDate(request.Date, "Date");
        entry.DeveloperId = request.DeveloperId;
        entry.ProjectId = request.ProjectId;
        entry.TaskId = request.TaskId;
        entry.TaskTitle = request.TaskTitle.Trim();
        entry.Description = TrimOrNull(request.Description);
        entry.WorkDone = TrimOrNull(request.WorkDone);
        entry.PlannedWork = TrimOrNull(request.PlannedWork);
        entry.Status = request.Status;
        entry.Priority = request.Priority;
        entry.Progress = request.Progress;
        entry.HoursSpent = request.HoursSpent;
        entry.EstimatedHours = request.EstimatedHours;
        entry.IsBlocked = request.IsBlocked;
        entry.BlockerDescription = TrimOrNull(request.BlockerDescription);
        entry.Remarks = TrimOrNull(request.Remarks);
    }

    public static void ApplyDailyRequest(
        SaveDailyWorkEntryRequest request,
        JsonFieldSet fields,
        DailyUpdate entry)
    {
        if (fields.Has("date"))
        {
            entry.EntryDate = DateStrings.ParseDate(request.Date, "Date");
        }

        if (fields.Has("developerId"))
        {
            entry.DeveloperId = request.DeveloperId;
        }

        if (fields.Has("projectId"))
        {
            entry.ProjectId = request.ProjectId;
        }

        if (fields.Has("taskId"))
        {
            entry.TaskId = request.TaskId;
        }

        if (fields.Has("taskTitle") && !string.IsNullOrWhiteSpace(request.TaskTitle))
        {
            entry.TaskTitle = request.TaskTitle.Trim();
        }

        if (fields.Has("description"))
        {
            entry.Description = TrimOrNull(request.Description);
        }

        if (fields.Has("workDone"))
        {
            entry.WorkDone = TrimOrNull(request.WorkDone);
        }

        if (fields.Has("plannedWork"))
        {
            entry.PlannedWork = TrimOrNull(request.PlannedWork);
        }

        if (fields.Has("status"))
        {
            entry.Status = request.Status;
        }

        if (fields.Has("priority"))
        {
            entry.Priority = request.Priority;
        }

        if (fields.Has("progress"))
        {
            entry.Progress = request.Progress;
        }

        if (fields.Has("hoursSpent"))
        {
            entry.HoursSpent = request.HoursSpent;
        }

        if (fields.Has("estimatedHours"))
        {
            entry.EstimatedHours = request.EstimatedHours;
        }

        if (fields.Has("isBlocked"))
        {
            entry.IsBlocked = request.IsBlocked;
        }

        if (fields.Has("blockerDescription"))
        {
            entry.BlockerDescription = TrimOrNull(request.BlockerDescription);
        }

        if (fields.Has("remarks"))
        {
            entry.Remarks = TrimOrNull(request.Remarks);
        }
    }

    public static Feedback FromCommentRequest(SaveCommentRequest request)
    {
        return new Feedback
        {
            DeveloperId = request.DeveloperId,
            MentorId = request.MentorId,
            TaskId = request.TaskId,
            ProjectId = request.ProjectId,
            FeedbackDate = string.IsNullOrWhiteSpace(request.Date)
                ? DateStrings.Today()
                : DateStrings.ParseDate(request.Date, "Date"),
            Comment = request.Comment.Trim(),
            ProgressUpdate = TrimOrNull(request.ProgressUpdate),
            Blockers = TrimOrNull(request.Blockers),
            Recommendations = TrimOrNull(request.Recommendations),
        };
    }

    public static void ApplyCommentRequest(SaveCommentRequest request, Feedback comment)
    {
        comment.DeveloperId = request.DeveloperId;
        comment.MentorId = request.MentorId;
        comment.TaskId = request.TaskId;
        comment.ProjectId = request.ProjectId;

        if (!string.IsNullOrWhiteSpace(request.Date))
        {
            comment.FeedbackDate = DateStrings.ParseDate(request.Date, "Date");
        }

        comment.Comment = request.Comment.Trim();
        comment.ProgressUpdate = TrimOrNull(request.ProgressUpdate);
        comment.Blockers = TrimOrNull(request.Blockers);
        comment.Recommendations = TrimOrNull(request.Recommendations);
    }

    public static void ApplyCommentRequest(
        SaveCommentRequest request,
        JsonFieldSet fields,
        Feedback comment)
    {
        if (fields.Has("developerId"))
        {
            comment.DeveloperId = request.DeveloperId;
        }

        if (fields.Has("mentorId"))
        {
            comment.MentorId = request.MentorId;
        }

        if (fields.Has("taskId"))
        {
            comment.TaskId = request.TaskId;
        }

        if (fields.Has("projectId"))
        {
            comment.ProjectId = request.ProjectId;
        }

        if (fields.Has("date") && !string.IsNullOrWhiteSpace(request.Date))
        {
            comment.FeedbackDate = DateStrings.ParseDate(request.Date, "Date");
        }

        if (fields.Has("comment") && !string.IsNullOrWhiteSpace(request.Comment))
        {
            comment.Comment = request.Comment.Trim();
        }

        if (fields.Has("progressUpdate"))
        {
            comment.ProgressUpdate = TrimOrNull(request.ProgressUpdate);
        }

        if (fields.Has("blockers"))
        {
            comment.Blockers = TrimOrNull(request.Blockers);
        }

        if (fields.Has("recommendations"))
        {
            comment.Recommendations = TrimOrNull(request.Recommendations);
        }
    }

    private static string? TrimOrNull(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

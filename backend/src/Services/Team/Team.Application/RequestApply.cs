using Team.Domain;

namespace Team.Application;

internal static class RequestApply
{
    /// <summary>
    /// PUT bodies use the same shape as POST. Only keys present in the JSON are
    /// applied; null optional fields clear nullable columns when their key was
    /// sent. Name is applied only when non-blank.
    /// </summary>
    public static void CreateDeveloper(SaveDeveloperRequest request, Developer row)
    {
        row.Name = request.Name.Trim();
        row.EmployeeId = BlankToNull(request.EmployeeId);
        row.Role = BlankToNull(request.Role);
        row.Location = BlankToNull(request.Location);
        row.Active = request.Active;
        row.Email = BlankToNull(request.Email);
        row.AccessRole = request.AccessRole;
        row.ProfileId = request.ProfileId;
        row.PrimaryProjectId = request.PrimaryProjectId;
        row.CreatedDate = DateStrings.ParseOptionalDate(request.CreatedDate, "Created date");

        if (!string.IsNullOrWhiteSpace(request.Code))
        {
            row.Code = request.Code.Trim();
        }
    }

    public static void UpdateDeveloper(SaveDeveloperRequest request, JsonFieldSet fields, Developer row)
    {
        if (fields.Has("name") && !string.IsNullOrWhiteSpace(request.Name))
        {
            row.Name = request.Name.Trim();
        }

        if (fields.Has("employeeId"))
        {
            row.EmployeeId = BlankToNull(request.EmployeeId);
        }

        if (fields.Has("role"))
        {
            row.Role = BlankToNull(request.Role);
        }

        if (fields.Has("location"))
        {
            row.Location = BlankToNull(request.Location);
        }

        if (fields.Has("active"))
        {
            row.Active = request.Active;
        }

        if (fields.Has("email"))
        {
            row.Email = BlankToNull(request.Email);
        }

        if (fields.Has("accessRole"))
        {
            row.AccessRole = request.AccessRole;
        }

        if (fields.Has("profileId"))
        {
            row.ProfileId = request.ProfileId;
        }

        if (fields.Has("primaryProjectId"))
        {
            row.PrimaryProjectId = request.PrimaryProjectId;
        }

        if (fields.Has("createdDate"))
        {
            row.CreatedDate = DateStrings.ParseOptionalDate(request.CreatedDate, "Created date");
        }
    }

    public static void CreateMentor(SaveMentorRequest request, Mentor row)
    {
        row.Name = request.Name.Trim();
        row.Email = request.Email.Trim();
        row.Active = request.Active;
        row.CreatedDate = DateStrings.ParseOptionalDate(request.CreatedDate, "Created date");

        if (!string.IsNullOrWhiteSpace(request.Code))
        {
            row.Code = request.Code.Trim();
        }
    }

    public static void UpdateMentor(SaveMentorRequest request, JsonFieldSet fields, Mentor row)
    {
        if (fields.Has("name") && !string.IsNullOrWhiteSpace(request.Name))
        {
            row.Name = request.Name.Trim();
        }

        if (fields.Has("email"))
        {
            row.Email = request.Email.Trim();
        }

        if (fields.Has("active"))
        {
            row.Active = request.Active;
        }

        if (fields.Has("createdDate"))
        {
            row.CreatedDate = DateStrings.ParseOptionalDate(request.CreatedDate, "Created date");
        }
    }

    public static void CreateProject(SaveProjectRequest request, Project row)
    {
        row.Name = request.Name.Trim();
        row.Client = BlankToNull(request.Client);
        row.Description = BlankToNull(request.Description);
        row.Active = request.Active;
        row.Status = request.Status;
        row.StartDate = DateStrings.ParseOptionalDate(request.StartDate, "Start date");
        row.EndDate = DateStrings.ParseOptionalDate(request.EndDate, "End date");
        row.MentorId = request.MentorId;

        if (!string.IsNullOrWhiteSpace(request.Code))
        {
            row.Code = request.Code.Trim();
        }
    }

    public static void UpdateProject(SaveProjectRequest request, JsonFieldSet fields, Project row)
    {
        if (fields.Has("name") && !string.IsNullOrWhiteSpace(request.Name))
        {
            row.Name = request.Name.Trim();
        }

        if (fields.Has("client"))
        {
            row.Client = BlankToNull(request.Client);
        }

        if (fields.Has("description"))
        {
            row.Description = BlankToNull(request.Description);
        }

        if (fields.Has("active"))
        {
            row.Active = request.Active;
        }

        if (fields.Has("status"))
        {
            row.Status = request.Status;
        }

        if (fields.Has("startDate"))
        {
            row.StartDate = DateStrings.ParseOptionalDate(request.StartDate, "Start date");
        }

        if (fields.Has("endDate"))
        {
            row.EndDate = DateStrings.ParseOptionalDate(request.EndDate, "End date");
        }

        if (fields.Has("mentorId"))
        {
            row.MentorId = request.MentorId;
        }

        EnsureProjectDates(row);
    }

    private static void EnsureProjectDates(Project row)
    {
        if (row.StartDate is not null && row.EndDate is not null && row.EndDate < row.StartDate)
        {
            throw new ValidationFailedException("End date cannot be before the start date.");
        }
    }

    private static string? BlankToNull(string? value)
    {
        var trimmed = value?.Trim() ?? string.Empty;

        return trimmed.Length == 0 ? null : trimmed;
    }
}

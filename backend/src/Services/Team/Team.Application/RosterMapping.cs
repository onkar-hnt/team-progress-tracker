using Team.Domain;

namespace Team.Application;

internal static class RosterMapping
{
    public static DeveloperDto ToDto(Developer row) => new()
    {
        Id = row.Id,
        Name = row.Name,
        Code = row.Code,
        EmployeeId = row.EmployeeId,
        Role = row.Role,
        Location = row.Location,
        Active = row.Active,
        Email = row.Email,
        AccessRole = row.AccessRole,
        ProfileId = row.ProfileId,
        PrimaryProjectId = row.PrimaryProjectId,
        CreatedDate = DateStrings.From(row.CreatedDate),
        DeletedAt = DateStrings.From(row.DeletedAt),
    };

    public static MentorDto ToDto(Mentor row) => new()
    {
        Id = row.Id,
        Name = row.Name,
        Email = row.Email,
        Active = row.Active,
        ProfileId = row.ProfileId,
        Code = row.Code,
        CreatedDate = DateStrings.From(row.CreatedDate),
        DeletedAt = DateStrings.From(row.DeletedAt),
    };

    public static MentorAssignmentDto ToDto(MentorAssignment row) => new()
    {
        Id = row.Id,
        MentorId = row.MentorId,
        DeveloperId = row.DeveloperId,
        AssignedDate = DateStrings.From(row.AssignedDate),
        Active = row.Active,
    };

    public static LeaveDayDto ToDto(LeaveDay row) => new()
    {
        Id = row.Id,
        DeveloperId = row.DeveloperId,
        Date = DateStrings.From(row.LeaveDate),
        Note = row.Note,
        RecordedBy = row.RecordedBy,
        CreatedAt = DateStrings.From(row.CreatedAt),
    };

    public static ProjectDto ToDto(
        Project row,
        IReadOnlyList<Guid> memberIds,
        IReadOnlyList<Guid> mentorIds) => new()
    {
        Id = row.Id,
        Name = row.Name,
        Client = row.Client,
        Active = row.Active,
        Code = row.Code,
        Description = row.Description,
        Status = row.Status,
        StartDate = DateStrings.From(row.StartDate),
        EndDate = DateStrings.From(row.EndDate),
        MentorId = row.MentorId,
        MentorIds = ResponsibleMentorIds(row, mentorIds),
        AssignedDeveloperIds = memberIds,
        DeletedAt = DateStrings.From(row.DeletedAt),
    };

    /// <summary>
    /// The primary mentor leads the list and is included even without a
    /// responsibility row, so a project written by an older client still reads
    /// back with an owner.
    /// </summary>
    public static IReadOnlyList<Guid> ResponsibleMentorIds(
        Project row,
        IReadOnlyList<Guid> mentorIds)
    {
        Guid[] leading = row.MentorId is Guid primary ? [primary] : [];

        return [.. leading.Concat(mentorIds).Distinct()];
    }
}

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

    public static ProjectDto ToDto(Project row, IReadOnlyList<Guid> memberIds) => new()
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
        AssignedDeveloperIds = memberIds,
        DeletedAt = DateStrings.From(row.DeletedAt),
    };
}

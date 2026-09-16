using Contracts;

using Notifications.Application;
using Notifications.Domain;

namespace Backend.UnitTests.Fakes;

internal sealed class FakeNotificationRepository : INotificationRepository
{
    public List<Notification> Added { get; } = [];

    public void Add(Notification notification) => Added.Add(notification);

    public void AddOrUpdatePreferences(UserPreferences preferences) { }

    public Task<int> CountUnreadAsync(Guid profileId, CancellationToken cancellationToken) =>
        Task.FromResult(0);

    public Task<Notification?> FindForRecipientAsync(
        Guid notificationId,
        Guid profileId,
        CancellationToken cancellationToken) =>
        Task.FromResult<Notification?>(null);

    public Task<UserPreferences?> FindPreferencesAsync(Guid profileId, CancellationToken cancellationToken) =>
        Task.FromResult<UserPreferences?>(null);

    public Task<IReadOnlyList<Notification>> ListForRecipientAsync(
        Guid profileId,
        int take,
        CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<Notification>>([]);

    public Task MarkAllReadAsync(Guid profileId, CancellationToken cancellationToken) =>
        Task.CompletedTask;

    public Task<IReadOnlyDictionary<Guid, IReadOnlyList<string>>> GetMutedTypesByProfileIdsAsync(
        IReadOnlyCollection<Guid> profileIds,
        CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyDictionary<Guid, IReadOnlyList<string>>>(
            new Dictionary<Guid, IReadOnlyList<string>>());

    public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}

internal sealed class TeamRequestApplyInvoker
{
    private static readonly Type RequestApplyType =
        typeof(global::Team.Application.SaveDeveloperRequestValidator).Assembly.GetType("Team.Application.RequestApply")
        ?? throw new InvalidOperationException("Team.Application.RequestApply was not found.");

    public static void UpdateDeveloper(
        SaveDeveloperRequest request,
        JsonFieldSet fields,
        global::Team.Domain.Developer row) =>
        Invoke("UpdateDeveloper", request, fields, row);

    public static void UpdateProject(
        SaveProjectRequest request,
        JsonFieldSet fields,
        global::Team.Domain.Project row) =>
        Invoke("UpdateProject", request, fields, row);

    private static void Invoke(string name, params object[] args)
    {
        var methods = RequestApplyType.GetMethods(
            System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Public);

        var method = methods.FirstOrDefault(m => m.Name == name && m.GetParameters().Length == args.Length)
            ?? throw new InvalidOperationException($"Method {name} was not found.");

        try
        {
            method.Invoke(null, args);
        }
        catch (System.Reflection.TargetInvocationException ex) when (ex.InnerException is not null)
        {
            throw ex.InnerException;
        }
    }
}

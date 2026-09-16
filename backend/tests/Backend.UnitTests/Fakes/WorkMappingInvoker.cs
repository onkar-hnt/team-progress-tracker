using Contracts;

using Work.Domain;

namespace Backend.UnitTests.Fakes;

internal static class WorkMappingInvoker
{
    private static readonly Type WorkMappingType =
        typeof(global::Work.Application.SaveTaskRequestValidator).Assembly.GetType("Work.Application.WorkMapping")
        ?? throw new InvalidOperationException("Work.Application.WorkMapping was not found.");

    public static void ApplyTaskRequest(SaveTaskRequest request, JsonFieldSet fields, WorkTask task) =>
        Invoke("ApplyTaskRequest", request, fields, task);

    public static void ApplyDailyRequest(
        SaveDailyWorkEntryRequest request,
        JsonFieldSet fields,
        DailyUpdate entry) =>
        Invoke("ApplyDailyRequest", request, fields, entry);

    private static void Invoke(string name, params object[] args)
    {
        var methods = WorkMappingType.GetMethods(
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

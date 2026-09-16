using System.Text;

using SharedKernel;

namespace Identity.Domain;

/// <summary>
/// The password rules, in one place. The minimum of eight characters matches
/// what the Set password screen asks for; anything shorter is refused here too,
/// because the screen is not the only way in.
/// </summary>
public static class PasswordPolicy
{
    public const int MinimumLength = 8;

    public static IReadOnlyList<string> Problems(string? password)
    {
        var problems = new List<string>();

        if (string.IsNullOrWhiteSpace(password))
        {
            problems.Add("Enter a password.");
            return problems;
        }

        if (password.Length < MinimumLength)
        {
            problems.Add($"Use at least {MinimumLength} characters.");
        }

        if (!password.Any(char.IsLetter))
        {
            problems.Add("Include at least one letter.");
        }

        if (!password.Any(char.IsDigit))
        {
            problems.Add("Include at least one number.");
        }

        return problems;
    }

    public static void Require(string? password)
    {
        var problems = Problems(password);

        if (problems.Count > 0)
        {
            throw new ValidationFailedException("That password cannot be used.", problems);
        }
    }

    /// <summary>
    /// The password a new account is created with, derived from the person's
    /// name exactly as initial_password_for() did in Postgres: the first word
    /// if it has three or more letters or digits, else the whole name stripped
    /// to letters and digits, else 'Employee' — then '@123'.
    /// </summary>
    public static string TemporaryFor(string name)
    {
        var firstWord = Alphanumeric(name.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault());

        if (firstWord.Length >= 3)
        {
            return firstWord + "@123";
        }

        var whole = Alphanumeric(name);

        return (whole.Length >= 3 ? whole : "Employee") + "@123";
    }

    private static string Alphanumeric(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var builder = new StringBuilder(value.Length);

        foreach (var character in value)
        {
            if (char.IsLetterOrDigit(character))
            {
                builder.Append(character);
            }
        }

        return builder.ToString();
    }
}

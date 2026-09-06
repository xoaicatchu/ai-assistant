using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using ProxyAgent.Api.Storage;

namespace ProxyAgent.Api.Admin;

public sealed class AdminOptions
{
    public string InitialUsername { get; set; } = string.Empty;
    public string InitialPassword { get; set; } = string.Empty;
}

public static class AdminPasswordHasher
{
    private const string Prefix = "pbkdf2-sha256";
    private const int Iterations = 120_000;
    private const int SaltSize = 16;
    private const int KeySize = 32;

    public static string Hash(string password)
    {
        ArgumentNullException.ThrowIfNull(password);
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var key = Derive(password, salt, Iterations);
        return string.Join('$', Prefix, Iterations, Encode(salt), Encode(key));
    }

    public static bool Verify(string password, string storedHash)
    {
        if (string.IsNullOrEmpty(password) || string.IsNullOrWhiteSpace(storedHash))
        {
            return false;
        }

        try
        {
            var parts = storedHash.Split('$');
            if (parts.Length != 4 || parts[0] != Prefix ||
                !int.TryParse(parts[1], out var iterations) || iterations < 50_000 || iterations > 2_000_000)
            {
                return false;
            }

            var salt = Decode(parts[2]);
            var expected = Decode(parts[3]);
            var actual = Derive(password, salt, iterations);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch (FormatException)
        {
            return false;
        }
        catch (ArgumentException)
        {
            return false;
        }
    }

    private static byte[] Derive(string password, byte[] salt, int iterations) =>
        Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password),
            salt,
            iterations,
            HashAlgorithmName.SHA256,
            KeySize);

    private static string Encode(byte[] bytes) => Convert.ToBase64String(bytes)
        .Replace('+', '-')
        .Replace('/', '_')
        .TrimEnd('=');

    private static byte[] Decode(string value)
    {
        var base64 = value.Replace('-', '+').Replace('_', '/');
        base64 = base64.PadRight(base64.Length + ((4 - base64.Length % 4) % 4), '=');
        return Convert.FromBase64String(base64);
    }
}

public sealed class AdminAuthService(
    IOptions<AdminOptions> options,
    IAdminAccountStore store)
{
    public const string AuthenticationScheme = "admin-cookie";
    public const string PolicyName = "admin-only";

    private readonly AdminOptions options = options.Value;

    public void EnsureSeeded()
    {
        if (store.HasAccount() ||
            string.IsNullOrWhiteSpace(options.InitialUsername) ||
            string.IsNullOrWhiteSpace(options.InitialPassword))
        {
            return;
        }

        var username = NormalizeUsername(options.InitialUsername);
        ValidatePassword(options.InitialPassword);
        store.Create(username, AdminPasswordHasher.Hash(options.InitialPassword));
    }

    public AdminAccount? Authenticate(string? username, string? password)
    {
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrEmpty(password))
        {
            return null;
        }

        var account = store.Get(NormalizeUsername(username));
        return account is not null && AdminPasswordHasher.Verify(password, account.PasswordHash)
            ? account
            : null;
    }

    public void ChangePassword(string username, string currentPassword, string newPassword)
    {
        var account = Authenticate(username, currentPassword)
            ?? throw new InvalidOperationException("The current admin password is incorrect.");
        ValidatePassword(newPassword);
        store.UpdatePasswordHash(account.Username, AdminPasswordHasher.Hash(newPassword));
    }

    public static string NormalizeUsername(string username) => username.Trim();

    public static void ValidatePassword(string password)
    {
        if (string.IsNullOrWhiteSpace(password) || password.Length < 8 || password.Length > 256)
        {
            throw new ArgumentException("Admin password must be between 8 and 256 characters.");
        }
    }
}

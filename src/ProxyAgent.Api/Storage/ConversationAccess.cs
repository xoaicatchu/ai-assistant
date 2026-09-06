using System.Security.Cryptography;
using System.Text;

namespace ProxyAgent.Api.Storage;

public static class ConversationAccessToken
{
    private const int TokenSize = 32;

    public static string Create()
    {
        var bytes = RandomNumberGenerator.GetBytes(TokenSize);
        return Encode(bytes);
    }

    public static string Hash(string token)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(token);
        return Encode(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    }

    public static bool Matches(string? token, string? storedHash)
    {
        if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(storedHash))
        {
            return false;
        }

        try
        {
            var actual = SHA256.HashData(Encoding.UTF8.GetBytes(token));
            var expected = Decode(storedHash);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch (FormatException)
        {
            return false;
        }
    }

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

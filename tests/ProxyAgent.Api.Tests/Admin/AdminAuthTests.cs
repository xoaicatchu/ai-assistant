using ProxyAgent.Api.Admin;

namespace ProxyAgent.Api.Tests.Admin;

public sealed class AdminAuthTests
{
    [Fact]
    public void Password_hash_round_trips_without_containing_the_plaintext()
    {
        const string password = "correct-horse-battery-staple";
        var hash = AdminPasswordHasher.Hash(password);

        Assert.NotEqual(password, hash);
        Assert.True(AdminPasswordHasher.Verify(password, hash));
        Assert.False(AdminPasswordHasher.Verify("wrong-password", hash));
    }

    [Fact]
    public void Password_hash_rejects_a_malformed_stored_value()
    {
        Assert.False(AdminPasswordHasher.Verify("password", "not-a-password-hash"));
    }
}

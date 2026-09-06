using ProxyAgent.Api.Storage;

namespace ProxyAgent.Api.Tests.Storage;

public sealed class ConversationAccessTests
{
    [Fact]
    public void Owner_tokens_are_url_safe_and_only_the_matching_token_verifies()
    {
        var token = ConversationAccessToken.Create();
        var hash = ConversationAccessToken.Hash(token);

        Assert.Matches("^[A-Za-z0-9_-]+$", token);
        Assert.Matches("^[A-Za-z0-9_-]+$", hash);
        Assert.True(ConversationAccessToken.Matches(token, hash));
        Assert.False(ConversationAccessToken.Matches("wrong-token", hash));
        Assert.False(ConversationAccessToken.Matches(null, hash));
    }
}

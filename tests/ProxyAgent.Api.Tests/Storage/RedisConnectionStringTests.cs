using ProxyAgent.Api.Storage;

namespace ProxyAgent.Api.Tests.Storage;

public sealed class RedisConnectionStringTests
{
    [Fact]
    public void Converts_a_rediss_uri_to_tls_redis_options_without_logging_the_secret()
    {
        var options = RedisConnectionStringNormalizer.CreateOptions(
            "rediss://default:p%40ss%3Aword@redis.example.com:6380");

        Assert.Contains("redis.example.com:6380", options.EndPoints.Single().ToString(), StringComparison.Ordinal);
        Assert.Equal("default", options.User);
        Assert.Equal("p@ss:word", options.Password);
        Assert.True(options.Ssl);
        Assert.False(options.AbortOnConnectFail);
        Assert.Equal(3000, options.ConnectTimeout);
    }

    [Fact]
    public void Rejects_a_redis_uri_without_credentials_or_host()
    {
        Assert.Throws<ArgumentException>(() =>
            RedisConnectionStringNormalizer.CreateOptions("rediss://redis.example.com:6380"));
        Assert.Throws<ArgumentException>(() =>
            RedisConnectionStringNormalizer.CreateOptions("rediss://default:secret@"));
    }
}

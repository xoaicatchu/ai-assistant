using Npgsql;
using ProxyAgent.Api.Storage;

namespace ProxyAgent.Api.Tests.Storage;

public sealed class PostgresConnectionStringTests
{
    [Fact]
    public void Converts_a_postgresql_uri_to_an_npgsql_connection_string()
    {
        var connectionString = PostgresConnectionStringNormalizer.Normalize(
            "postgresql://postgres:p%40ss%3Aword@db.example.com:6543/app?sslmode=require");
        var builder = new NpgsqlConnectionStringBuilder(connectionString);

        Assert.Equal("db.example.com", builder.Host);
        Assert.Equal(6543, builder.Port);
        Assert.Equal("app", builder.Database);
        Assert.Equal("postgres", builder.Username);
        Assert.Equal("p@ss:word", builder.Password);
        Assert.Equal(SslMode.Require, builder.SslMode);
    }

    [Fact]
    public void Leaves_key_value_connection_strings_unchanged()
    {
        const string connectionString =
            "Host=db.example.com;Port=5432;Database=app;Username=postgres;Password=secret";

        Assert.Equal(connectionString, PostgresConnectionStringNormalizer.Normalize(connectionString));
    }

    [Fact]
    public void Rejects_a_postgresql_uri_without_credentials_or_database()
    {
        Assert.Throws<ArgumentException>(() =>
            PostgresConnectionStringNormalizer.Normalize("postgresql://db.example.com/app"));
        Assert.Throws<ArgumentException>(() =>
            PostgresConnectionStringNormalizer.Normalize("postgresql://postgres:secret@db.example.com"));
    }
}

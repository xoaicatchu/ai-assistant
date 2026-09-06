namespace ProxyAgent.Api.Storage;

public sealed class StorageUnavailableException(string message, Exception? innerException = null)
    : Exception(message, innerException);

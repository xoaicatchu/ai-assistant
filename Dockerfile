FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY src/ProxyAgent.Api/ProxyAgent.Api.csproj src/ProxyAgent.Api/
COPY src/ProxyAgent.Infrastructure/ProxyAgent.Infrastructure.csproj src/ProxyAgent.Infrastructure/
COPY src/ProxyAgent.Application/ProxyAgent.Application.csproj src/ProxyAgent.Application/
COPY src/ProxyAgent.Domain/ProxyAgent.Domain.csproj src/ProxyAgent.Domain/
RUN dotnet restore src/ProxyAgent.Api/ProxyAgent.Api.csproj

COPY src/ProxyAgent.Api/ src/ProxyAgent.Api/
COPY src/ProxyAgent.Infrastructure/ src/ProxyAgent.Infrastructure/
COPY src/ProxyAgent.Application/ src/ProxyAgent.Application/
COPY src/ProxyAgent.Domain/ src/ProxyAgent.Domain/
RUN dotnet publish src/ProxyAgent.Api/ProxyAgent.Api.csproj \
    --configuration Release \
    --output /app/publish \
    --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080

COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "ProxyAgent.Api.dll"]

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY src/ProxyAgent.Presentation/ProxyAgent.Presentation.csproj src/ProxyAgent.Presentation/
COPY src/ProxyAgent.Infrastructure/ProxyAgent.Infrastructure.csproj src/ProxyAgent.Infrastructure/
COPY src/ProxyAgent.Application/ProxyAgent.Application.csproj src/ProxyAgent.Application/
COPY src/ProxyAgent.Domain/ProxyAgent.Domain.csproj src/ProxyAgent.Domain/
RUN dotnet restore src/ProxyAgent.Presentation/ProxyAgent.Presentation.csproj

COPY src/ProxyAgent.Presentation/ src/ProxyAgent.Presentation/
COPY src/ProxyAgent.Infrastructure/ src/ProxyAgent.Infrastructure/
COPY src/ProxyAgent.Application/ src/ProxyAgent.Application/
COPY src/ProxyAgent.Domain/ src/ProxyAgent.Domain/
RUN dotnet publish src/ProxyAgent.Presentation/ProxyAgent.Presentation.csproj \
    --configuration Release \
    --output /app/publish \
    --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080

COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "ProxyAgent.Presentation.dll"]

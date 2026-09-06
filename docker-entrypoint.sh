#!/bin/sh
set -eu

# Vercel assigns the container port at runtime. ASP.NET Core must bind to that
# exact port instead of the fixed development/default port from the image.
export ASPNETCORE_HTTP_PORTS="${PORT:-80}"

exec dotnet ProxyAgent.Presentation.dll

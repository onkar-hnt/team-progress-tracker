# syntax=docker/dockerfile:1

# One image definition for all six hosts.
#
# The services differ only in which project is published and which assembly is
# started, so they are build arguments rather than six near-identical files
# that drift apart. `docker-compose.yml` passes them.
#
# The build context is the whole `backend/` directory on purpose: every service
# references BuildingBlocks, so restoring one project still needs the others.

ARG DOTNET_VERSION=10.0

FROM mcr.microsoft.com/dotnet/sdk:${DOTNET_VERSION} AS build
ARG PROJECT
WORKDIR /src

COPY . .
RUN dotnet publish "${PROJECT}" --configuration Release --output /app

FROM mcr.microsoft.com/dotnet/aspnet:${DOTNET_VERSION} AS runtime
ARG APP_DLL

# curl is here for the health check below, which is what lets the gateway wait
# for the services it proxies to instead of starting into a 502.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app .

# Containers are addressed by service name, so binding to localhost - which is
# what appsettings.json does for a developer machine - would make this
# unreachable from the gateway.
ENV ASPNETCORE_URLS=http://+:8080 \
    APP_DLL=${APP_DLL}

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --retries=12 --start-period=20s \
    CMD curl --fail --silent http://localhost:8080/health || exit 1

# Not root: the .NET images define this account for exactly this.
USER $APP_UID

# `exec` so the process is PID 1 and a stop signal reaches it rather than a shell.
ENTRYPOINT ["/bin/sh", "-c", "exec dotnet /app/$APP_DLL"]

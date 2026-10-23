# Multi-stage build para .NET 10 LTS Web API (Render / Docker)
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY Directory.Build.props ./
COPY services/api/TopicLog.Api.csproj services/api/
COPY services/worker/TopicLog.Worker.csproj services/worker/
RUN dotnet restore services/api/TopicLog.Api.csproj

COPY services/ services/
RUN dotnet publish services/api/TopicLog.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:5080
EXPOSE 5080

ENTRYPOINT ["dotnet", "TopicLog.Api.dll"]

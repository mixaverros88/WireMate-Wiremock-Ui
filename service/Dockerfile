# syntax=docker/dockerfile:1.6

FROM maven:3-eclipse-temurin-25-alpine AS build
WORKDIR /app

# Resolve dependencies first so the layer caches when only sources change.
COPY pom.xml .
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -q clean package -DskipTests

FROM eclipse-temurin:25-jre-alpine
WORKDIR /app

LABEL org.opencontainers.image.source="https://github.com/mixaverros88/WireMate"
LABEL org.opencontainers.image.description="WireMate backend — web UI and management dashboard for WireMock"
LABEL org.opencontainers.image.licenses="MIT"

# Run as non-root.
RUN addgroup -S app && adduser -S app -G app
USER app

COPY --from=build --chown=app:app /app/target/service-0.0.1-SNAPSHOT.jar app.jar

# JDWP debug agent listens on container port 8000 (compose publishes it as
# host 8002). Default-on via JAVA_TOOL_OPTIONS so it stays overridable —
# disable per-environment with JAVA_TOOL_OPTIONS="".
ENV JAVA_TOOL_OPTIONS="-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:8000"
EXPOSE 8081 8000

ENTRYPOINT ["java", "-jar", "app.jar"]

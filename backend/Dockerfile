# syntax=docker/dockerfile:1.7

FROM alpine:3.20 AS artifact
WORKDIR /workspace

ARG JAR_FILE=target/backend.jar
COPY ${JAR_FILE} app.jar

FROM eclipse-temurin:17-jre-jammy AS runtime
WORKDIR /app

ENV PORT=8080 \
    JAVA_OPTS=""

RUN addgroup --system app && adduser --system --ingroup app app

COPY --from=artifact /workspace/app.jar /app/app.jar

EXPOSE 8080
USER app

ENTRYPOINT ["sh","-c","exec java $JAVA_OPTS -jar /app/app.jar"]

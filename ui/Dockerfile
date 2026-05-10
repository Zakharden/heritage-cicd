# syntax=docker/dockerfile:1.7

FROM alpine:3.20 AS artifact
WORKDIR /workspace

COPY dist/ ./dist/

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=artifact /workspace/dist/ /usr/share/nginx/html/

EXPOSE 8081

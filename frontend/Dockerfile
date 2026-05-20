FROM node:20-alpine

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

COPY scripts/ensure-project-log-docs.mjs ./scripts/
COPY frontend/docker-entrypoint.sh ./docker-entrypoint.sh
COPY frontend/ .

RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 5173

ENTRYPOINT ["/app/docker-entrypoint.sh"]

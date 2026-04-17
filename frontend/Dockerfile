FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Reproducible install from lockfile (package-lock.json is committed)
RUN npm ci

# Copy source
COPY . .

EXPOSE 5173

# Vite dev server (proxy target set via env in docker-compose)
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

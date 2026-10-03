FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM python:3.13-slim AS server
WORKDIR /app
ENV NODE_ENV=production PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
COPY requirements.txt ./
RUN pip install --no-cache-dir --require-hashes -r requirements.txt && useradd --create-home --uid 10001 pulse
COPY --chown=pulse:pulse backend ./backend
COPY --chown=pulse:pulse alembic.ini ./
COPY --from=build --chown=pulse:pulse /app/dist/web ./dist/web
USER pulse
EXPOSE 3001
CMD ["python", "-m", "backend.cli", "api"]

FROM nginx:1.28-alpine AS web
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/web /usr/share/nginx/html
EXPOSE 80

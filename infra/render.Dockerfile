FROM node:24-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --no-audit --no-fund
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
COPY tsconfig.json ./
RUN npm run build

FROM python:3.13-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
COPY requirements.txt ./
RUN pip install --no-cache-dir --require-hashes -r requirements.txt \
    && useradd --create-home --uid 10001 pulse
COPY --chown=pulse:pulse backend ./backend
COPY --chown=pulse:pulse alembic.ini ./
COPY --from=frontend --chown=pulse:pulse /app/dist/web ./dist/web
USER pulse
EXPOSE 10000
CMD ["python", "-m", "backend.cli", "api"]

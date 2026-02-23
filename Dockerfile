FROM node:22-slim AS base

# OpenSSL 설치 
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# --- Install dependencies only when needed ---
FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# --- Production dependencies ---
FROM base AS prod-deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- Build stage (Next.js 빌드) ---
FROM base AS builder
WORKDIR /app

ARG DATABASE_URL

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma Client 생성 (TypeScript 타입 생성)
RUN DATABASE_URL=$DATABASE_URL npx prisma generate

# Next.js 빌드 시 환경 변수 검증 건너뛰기
ENV SKIP_ENV_VALIDATION=true
RUN npm run build

# --- Development image (app과 worker 모두 사용) ---
FROM base AS dev
WORKDIR /app

# Copy node_modules from deps
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Entrypoint 스크립트 실행 권한 부여
RUN chmod +x entrypoint.app.sh entrypoint.worker.sh

CMD ["npm", "run", "dev"]

# --- Production image for Next.js App ---
FROM base AS prod-app
WORKDIR /app

ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY package.json ./
COPY --from=builder /app/prisma ./prisma

# Entrypoint 스크립트 복사 및 실행 권한 부여
COPY entrypoint.app.sh ./
RUN chmod +x entrypoint.app.sh

CMD ["npm", "start"]

# --- Production image for Worker ---
FROM base AS prod-worker
WORKDIR /app

ENV NODE_ENV=production

# 프로덕션 의존성 복사
COPY --from=prod-deps /app/node_modules ./node_modules
# Worker 소스 코드 복사
COPY src/workers ./src/workers
COPY src/shared ./src/shared
COPY package.json ./
COPY tsconfig.json ./
COPY --from=builder /app/prisma ./prisma

# Entrypoint 스크립트 복사 및 실행 권한 부여
COPY entrypoint.worker.sh ./
RUN chmod +x entrypoint.worker.sh

CMD ["npm", "run", "worker"]
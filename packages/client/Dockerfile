FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json tsconfig.json next.config.ts tailwind.config.ts postcss.config.js ./
RUN npm install
COPY src/ src/
COPY app/ app/

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "packages/client/server.js"]

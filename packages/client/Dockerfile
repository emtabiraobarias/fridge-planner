FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json tsconfig.json next.config.ts tailwind.config.ts postcss.config.js ./
RUN npm install
COPY src/ src/
COPY app/ app/

# E0b: public OIDC config is inlined into the client bundle at build time.
# Passed as --build-arg by the CD workflow (deploy-nextjs.yml); non-secret.
ARG NEXT_PUBLIC_OIDC_ISSUER
ARG NEXT_PUBLIC_OIDC_CLIENT_ID
ARG NEXT_PUBLIC_OIDC_REDIRECT_URI
ENV NEXT_PUBLIC_OIDC_ISSUER=$NEXT_PUBLIC_OIDC_ISSUER
ENV NEXT_PUBLIC_OIDC_CLIENT_ID=$NEXT_PUBLIC_OIDC_CLIENT_ID
ENV NEXT_PUBLIC_OIDC_REDIRECT_URI=$NEXT_PUBLIC_OIDC_REDIRECT_URI

# The release version, reported by GET /api/health so a deployment can be asked which
# release it is actually serving (see that route + scripts/verify-rollout.sh). Set in
# BOTH stages deliberately: the runner stage is what serves it, but declaring it here
# too means the value is correct whether Next reads it at runtime or folds it in during
# the build. `dev` is the local default.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Re-declared: build args do not cross stage boundaries. This is the one the running
# server reads for GET /api/health.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
# Build context is packages/client (package-rooted), so Next's standalone output
# emits server.js at the root — not the monorepo-nested packages/client/server.js.
CMD ["node", "server.js"]

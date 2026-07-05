# Caddy edge image with the Stage-1 Caddyfile baked in.
#
# Why baked, not bind-mounted: on the Portainer/TrueNAS target, a repo-relative
# single-file bind mount (./deploy/Caddyfile) isn't visible to the Docker daemon,
# so Docker auto-creates the source as a directory and the mount fails. Baking the
# config into the image removes the host-path dependency entirely.
#
# Build context is deploy/ (so `COPY Caddyfile` resolves). Stage 2 (public domain):
# edit deploy/Caddyfile, then rebuild+republish this image (tag caddy-v*).
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile

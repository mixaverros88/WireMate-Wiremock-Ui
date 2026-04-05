# Build Stage
# The output (dist/) is static JS/CSS and identical for every target arch, so
# always build on the runner's native platform. Without this, the linux/arm64
# variant runs `npm install` + `vite build` under QEMU emulation, which is
# extremely slow and stalls CI. Only the nginx stage below is per-arch.
FROM --platform=$BUILDPLATFORM node:26-alpine3.23 AS build-stage
WORKDIR /app
COPY package*.json ./
# Vite 8 uses rolldown, which ships its native binary as a platform-specific
# optional dependency (e.g. @rolldown/binding-linux-x64-musl). npm has a
# long-standing bug where optional deps from a lockfile generated on a
# different platform are not always installed — causing
# "MODULE_NOT_FOUND: .../rolldown/dist/shared/binding-*.mjs" at build time.
# Removing the lockfile inside the image forces npm to re-resolve native
# bindings against the actual container arch (linux/amd64 or linux/arm64).
RUN rm -f package-lock.json && npm install --include=optional
COPY . .
RUN npm run build

# Production Stage
FROM nginx:1.25.5-alpine AS final-stage

LABEL org.opencontainers.image.source="https://github.com/mixaverros88/WireMate"
LABEL org.opencontainers.image.description="WireMate frontend — web UI and management dashboard for WireMock"
LABEL org.opencontainers.image.licenses="MIT"

COPY --from=build-stage /app/dist /usr/share/nginx/html
COPY --from=build-stage /app/default.conf ./etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
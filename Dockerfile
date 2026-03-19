# syntax=docker/dockerfile:1
# Build stage: compile TypeScript + package Linux AppImage
FROM node:22-bookworm-slim AS builder

# Install system packages electron-builder needs for Linux packaging:
#   - fakeroot / dpkg-dev  → .deb production
#   - rpm                  → .rpm production
#   - libarchive-tools     → AppImage packaging (bsdtar)
#   - libgtk-3-0 + friends → native node module compilation against Electron headers
#   - libx11-xcb1, etc.    → Electron sandbox dependencies needed at build time
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fakeroot \
    dpkg-dev \
    rpm \
    libarchive-tools \
    libgtk-3-0 \
    libnotify4 \
    libnss3 \
    libxss1 \
    libxtst6 \
    libx11-xcb1 \
    libxcb-dri3-0 \
    libgbm1 \
    libasound2 \
    libxrandr2 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxfixes3 \
    libxi6 \
    xvfb \
    git \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package.json package-lock.json ./

# Install deps — electron-builder downloads the Electron binary here too
RUN npm ci

# Copy the rest of the source
COPY . .

# Build TypeScript + package as AppImage
# Disable code signing (not needed for dev builds)
RUN CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:linux

# ── Final image just holds the built artifact ─────────────────────────────────
FROM scratch AS artifact
COPY --from=builder /app/dist/*.AppImage /

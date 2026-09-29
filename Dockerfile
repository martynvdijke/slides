# Build every deck and the landing overview, compile the Go live-question
# backend, then serve everything from a single small image.
#
# Usage:
#   docker build -t slides .
#   docker run --rm -p 8080:8080 -v slides-data:/data slides
#
# The container serves the public decks at / and the admin console, audience
# page, projector view, API and WebSocket under /admin, /e/{code}, /live/{code},
# /api/* and /ws/*.

# syntax=docker/dockerfile:1

# ---- deck build stage ----
FROM node:24-alpine AS decks
WORKDIR /app

COPY package.json package-lock.json ./
COPY decks ./decks
COPY templates ./templates
COPY scripts ./scripts

RUN npm ci --no-audit --no-fund
RUN npm run build

# ---- server build stage ----
FROM golang:1.27-alpine AS server
WORKDIR /src

COPY server/go.mod server/go.sum ./
RUN go mod download

COPY server ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/slides .

# ---- runtime stage ----
FROM alpine:3.21

RUN apk add --no-cache ca-certificates tzdata \
	&& adduser -D -u 10001 slides \
	&& mkdir -p /data/media \
	&& chown -R slides:slides /data

WORKDIR /app

ENV PORT=8080 \
	DB_PATH=/data/slides.db \
	MEDIA_DIR=/data/media \
	DECKS_DIR=/app/dist

COPY --from=server /out/slides /usr/local/bin/slides
COPY --from=decks /app/dist /app/dist

USER slides
EXPOSE 8080
VOLUME ["/data"]

ENTRYPOINT ["slides"]

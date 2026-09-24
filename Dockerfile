# Build every deck and the landing overviewer, then serve statically.
# Usage:
#   docker build -t slides .
#   docker run --rm -p 8080:80 slides

# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY decks ./decks
COPY templates ./templates
COPY scripts ./scripts

RUN npm ci --no-audit --no-fund
RUN npm run build

# ---- serve stage ----
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

# Optional dedicated Playwright runner (Railway / Fly / any Docker host).
# Build from repo root:
#   docker build -f services/playwright-runner/Dockerfile -t itrs-journey-runner .
# Run:
#   docker run -p 8787:8787 itrs-journey-runner
FROM mcr.microsoft.com/playwright:v1.51.1-jammy

WORKDIR /app
COPY package.json package-lock.json ./
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --omit=dev=false
COPY api ./api
COPY server ./server

ENV JOURNEY_SERVER_PORT=8787
EXPOSE 8787
CMD ["npx", "tsx", "server/journey-server.ts"]

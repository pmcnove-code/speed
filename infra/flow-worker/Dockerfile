FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /app/infra/flow-worker
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates xdotool \
    xvfb \
    x11vnc \
    novnc \
    websockify \
    ffmpeg \
    fonts-dejavu-core \
    fonts-liberation2 \
  && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -o /tmp/chrome.deb \
  && apt-get update && apt-get install -y /tmp/chrome.deb \
  && rm -f /tmp/chrome.deb && rm -rf /var/lib/apt/lists/*
COPY infra/flow-worker/package.json infra/flow-worker/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
ENV PATH="/app/infra/flow-worker/node_modules/.bin:${PATH}"
COPY infra/flow-worker ./
COPY shared /app/shared
ENV NODE_ENV=production
ENV FLOW_DATA_DIR=/data/flow-sessions
ENV FLOW_CHROME_PATH=/usr/bin/google-chrome-stable
ENV FLOW_HEADLESS=1
ENV FLOW_STEALTH=1
RUN mkdir -p /data/flow-sessions && chmod 700 /data/flow-sessions
EXPOSE 8787 6080
CMD ["node", "server.mjs"]

FROM node:20-slim AS base

RUN apt-get update \
    && apt-get install -y wget gnupg ffmpeg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
ENV NODE_ENV production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
ENV PUPPETEER_EXECUTABLE_PATH /usr/bin/google-chrome

RUN npm run build:hono

RUN addgroup --system --gid 1001 appuser
RUN adduser --system --uid 1001 appuser
USER appuser

ENV PORT 3000
EXPOSE 3000

CMD ["node", "dist/server.js"]

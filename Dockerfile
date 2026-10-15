# The sim server (server/sim): rooms over WebSockets. The page itself is
# static and stays on Vercel (or any static host) with VITE_SIM_URL pointing
# at this service. See docs/multiplayer-plan.md, section 9.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
# isolated-vm ships prebuilt binaries for linux x64/arm64; nothing to compile.
RUN npm ci --omit=dev
COPY server ./server
COPY src ./src
COPY public/bricktalk ./public/bricktalk
EXPOSE 8787
ENV PORT=8787 SANDBOX=isolate
CMD ["node", "server/sim/index.js"]

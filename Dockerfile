# Colyseus game server for Music Land (deploy on Render, Fly.io, a VPS, ...).
# Build from the repo root: the server shares game data and the map with the web client.
FROM node:22-slim
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev
COPY src/data ./src/data
COPY src/game/maps.ts ./src/game/maps.ts
COPY src/services/localStore.ts src/services/store.ts src/services/supabaseStore.ts ./src/services/
COPY server/src ./server/src
WORKDIR /app/server
ENV NODE_ENV=production
EXPOSE 2567
CMD ["npx", "tsx", "src/index.ts"]

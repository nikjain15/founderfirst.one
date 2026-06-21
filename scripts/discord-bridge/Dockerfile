# Discord bridge image — discord.js + tsx (TypeScript).
FROM node:22-slim

WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY bridge.ts tsconfig.json ./

CMD ["npx", "tsx", "bridge.ts"]

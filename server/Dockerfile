# Backend foco (Node/Express + Prisma) para despliegue en Temps/LevelRail
# Debian-based: los engines de Prisma 5 no cargan en Alpine (musl + libssl)
FROM node:22-slim
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma prisma
RUN npx prisma generate
COPY src src
COPY resources resources
EXPOSE 3001
CMD ["npm", "start"]

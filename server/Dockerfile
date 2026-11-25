# Backend foco (Node/Express + Prisma) para despliegue en Temps/LevelRail
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma prisma
RUN npx prisma generate
COPY src src
COPY resources resources
EXPOSE 3001
CMD ["npm", "start"]

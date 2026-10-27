# Worker de Mascota LIVE (Railway, Render, Fly…). Se construye desde la raíz del repo porque usa ../core.
FROM node:22-alpine
WORKDIR /app
COPY worker/package.json worker/package-lock.json ./worker/
RUN cd worker && npm ci --omit=dev
COPY core ./core
COPY worker ./worker
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "worker/server.js"]

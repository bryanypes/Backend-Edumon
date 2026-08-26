FROM node:24-alpine

WORKDIR /app

# Copiado por separado de package*.json: esta capa solo se reconstruye cuando
# cambian las dependencias, no en cada cambio de código.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

# La imagen oficial ya trae un usuario sin privilegios llamado "node"
USER node

ENV NODE_ENV=production
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/ || exit 1

CMD ["node", "src/index.js"]

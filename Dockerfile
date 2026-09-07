FROM node:24-alpine

WORKDIR /app

# Copiado por separado de package*.json: esta capa solo se reconstruye cuando
# cambian las dependencias, no en cada cambio de código.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

# Almacenamiento local de archivos subidos. Debe montarse un volumen persistente
# aquí (fotos, adjuntos, APK); si no, se pierde en cada redeploy.
ENV UPLOAD_DIR=/data/uploads
RUN mkdir -p /data/uploads && chown -R node:node /data
VOLUME ["/data/uploads"]

# La imagen oficial ya trae un usuario sin privilegios llamado "node"
USER node

ENV NODE_ENV=production
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/ || exit 1

CMD ["node", "src/index.js"]

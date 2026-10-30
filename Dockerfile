FROM node:22-alpine

WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --chown=node:node server.js server-https.js co-study-server.js server-config.js ./
COPY --chown=node:node room-store.js user-store.js supabase-user-store.js schedule-utils.js ./
COPY --chown=node:node services ./services
COPY --chown=node:node public ./public
COPY --chown=node:node audio ./audio
COPY --chown=node:node images ./images
COPY --chown=node:node videos ./videos
COPY --chown=node:node design-system/*.css ./design-system/
COPY --chown=node:node 404.html account.html admin.html blog.html contact.html ./
COPY --chown=node:node blog-best-study-rooms.html blog-study-with-me.html ./
COPY --chown=node:node index.html landing.html lobby.html open.html privacy.html terms.html ./
COPY --chown=node:node platform.html recovery.html ./

RUN mkdir -p /app/data/backups && chown -R node:node /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

USER node

CMD ["node", "server.js"]

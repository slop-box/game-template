FROM node:22-alpine
WORKDIR /app
COPY package.json server.js qr.js ./
COPY public ./public
# Anything the game saves goes in /app/data (Slop Box mounts a volume there if the game needs one).
RUN mkdir -p /app/data && chown node:node /app/data
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
# The commit being built (the publish workflow passes it in). /healthz reports it, so you can tell
# when the server is running your latest push.
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
EXPOSE 3000
# Watchtower only updates labeled containers when it runs with label-enable
LABEL com.centurylinklabs.watchtower.enable="true"
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1
USER node
CMD ["node", "server.js"]

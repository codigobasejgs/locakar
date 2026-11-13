FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache git \
  # libsignal vem do GitHub por git+ssh no lockfile; no build não há chave SSH: usa HTTPS público.
  && git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" \
  && git config --global --add url."https://github.com/".insteadOf "git@github.com:"
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY index.mjs ./
RUN mkdir -p /data/sessions && chown -R node:node /data
USER node
ENV NODE_ENV=production DATA_DIR=/data/sessions PORT=8790
EXPOSE 8790
CMD ["node", "index.mjs"]

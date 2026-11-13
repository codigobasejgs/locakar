FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache git
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY index.mjs ./
USER node
ENV NODE_ENV=production DATA_DIR=/data/sessions PORT=8790
EXPOSE 8790
CMD ["node", "index.mjs"]

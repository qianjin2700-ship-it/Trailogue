# syntax=docker/dockerfile:1

FROM node:22.22.1-bookworm-slim

WORKDIR /app

COPY package.json ./
COPY scripts/node-runtime-bootstrap.mjs scripts/node-runtime-bootstrap.mjs
COPY packages/domain packages/domain
COPY packages/contracts packages/contracts
COPY packages/config packages/config
COPY packages/database packages/database
COPY apps/api apps/api

RUN npm run install:api && npm --prefix apps/api run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "--prefix", "apps/api", "start"]

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY app ./app
COPY shared ./shared
RUN npm exec -- esbuild app/main.mjs --bundle --format=esm --platform=browser --outfile=dist/app.js --minify
RUN npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=9041
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
COPY shared ./shared
COPY app ./app
COPY models ./models
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 9041
CMD ["node","server/index.mjs"]

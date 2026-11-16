# Build web UI, then run unified WS + static server with Bun.
FROM oven/bun:1.3 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN npm ci

FROM deps AS build
COPY . .
# Same-origin WS in production — leave VITE_WS_URL unset.
RUN npm run build --workspace web

FROM oven/bun:1.3 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV STATIC_DIR=/app/apps/web/dist
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server ./apps/server
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
EXPOSE 8080
CMD ["bun", "run", "apps/server/src/index.ts"]

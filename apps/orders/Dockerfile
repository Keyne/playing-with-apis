FROM node:22-alpine AS build
WORKDIR /app
COPY apps/orders/package.json apps/orders/package-lock.json ./
RUN npm ci
COPY apps/orders/tsconfig.json ./
COPY apps/orders/src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY apps/orders/package.json apps/orders/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY specs/orders.openapi.yaml ./openapi.yaml
ENV OPENAPI_PATH=/app/openapi.yaml
EXPOSE 8080
CMD ["node", "dist/main.js"]

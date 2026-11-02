FROM node:22-slim
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
ENV NODE_ENV=production PORT=3000
VOLUME /app/data
EXPOSE 3000
CMD ["node", "src/server.js"]

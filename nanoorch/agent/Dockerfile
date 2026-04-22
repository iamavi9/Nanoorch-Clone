FROM node:20-alpine
WORKDIR /agent

COPY package.json .
RUN npm install --omit=dev && npm cache clean --force

COPY runner.js .

ENV NODE_ENV=production

CMD ["node", "runner.js"]

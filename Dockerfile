FROM node:lts as build
WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm install

COPY . ./

RUN npm run build && \
    rm -rf node_modules && \
    npm install --production

FROM node:lts-slim
WORKDIR /usr/src/app

COPY --from=build /usr/src/app /usr/src/app

EXPOSE 3000
EXPOSE 3001
CMD [ "npm", "start" ]

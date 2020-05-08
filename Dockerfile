FROM node:13.7-alpine as develop-stage

# clone repo directory
WORKDIR /usr/src/drawing-server
COPY package*.json ./

# install and run the image
RUN yarn
COPY . .
EXPOSE 5052
CMD ["yarn", "run", "start-prod"]
FROM node:10.1.0

WORKDIR /faredge-mqtt-file-data-publisher

COPY package.json /faredge-mqtt-file-data-publisher
COPY package-lock.json /faredge-mqtt-file-data-publisher
RUN npm install

COPY . /faredge-mqtt-file-data-publisher

CMD [ "node", "index.js" ]

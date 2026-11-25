FROM node:22-alpine

WORKDIR /opt/application/

COPY package.json ./

RUN npm install --production --registry=https://registry.npmmirror.com

COPY . .

RUN chmod 755 /opt/application/run.sh

EXPOSE 8000

CMD ["/opt/application/run.sh"]

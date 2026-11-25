FROM node:22-alpine

WORKDIR /opt/application/

COPY package.json ./
COPY run.sh ./

RUN chmod 755 /opt/application/run.sh
RUN npm install --production --registry=https://registry.npmmirror.com

COPY ./dist ./dist

EXPOSE 8000

CMD ["/opt/application/run.sh"]

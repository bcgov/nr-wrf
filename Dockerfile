#FROM node:alpine3.14 AS BUILD_IMAGE
FROM caddy:2.1.1-alpine
WORKDIR /app
COPY ["js", "/app/js"]
#COPY ["jquery-ui/package.json", "/app/"]
COPY ["jquery-ui", "/app/jquery-ui"]
COPY ["css", "/app/css"]
COPY ["fonts", "/app/fonts"]
COPY ["icons", "/app/icons"]
COPY ["images", "/app/images"]
COPY ["index.html", "/app/."]


RUN apk update && apk add bash curl

EXPOSE 8080
ENTRYPOINT ["caddy", "file-server", "--listen", ":8080", "." ]
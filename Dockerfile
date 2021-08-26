FROM node:alpine3.14 AS BUILD_IMAGE

WORKDIR /app
COPY ["js", "/app/js"]
COPY ["jquery-ui/package.json", "/app/"]
COPY ["jquery-ui", "/app/jquery-ui"]
COPY ["css", "/app/css"]
COPY ["fonts", "/app/fonts"]
COPY ["icons", "/app/icons"]
COPY ["images", "/app/images"]




#"css", "fonts", "icons", "images", "jquery-ui", "."]
RUN apk update && apk add bash
RUN npm install; npm run build
#RUN npm install; npm run build

# FROM caddy:2.1.1-alpine
# WORKDIR /app
# COPY --from=BUILD_IMAGE /app .
FROM node:lts-alpine

RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont font-noto-cjk

VOLUME ["/koishi"]
WORKDIR "/koishi"
ENTRYPOINT ["/koishi/entrypoint.sh"]
CMD [ "yarn", "start" ]

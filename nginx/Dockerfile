FROM nginx:1.27-alpine

RUN apk add --no-cache gettext

COPY nginx.conf /etc/nginx/nginx.conf
COPY nav.template.html /etc/nginx/nav.template.html
COPY module_disabled.html /usr/share/nginx/html/module_disabled.html
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

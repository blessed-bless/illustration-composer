FROM node:22-bookworm-slim

RUN useradd --create-home --uid 10001 appuser
WORKDIR /app

COPY package.json ./
COPY server.mjs index.html style.css ./
COPY src ./src
COPY catalog ./catalog
COPY palettes ./palettes
COPY examples ./examples

RUN chown -R appuser:appuser /app
USER appuser

ENV PORT=5173
EXPOSE 5173

CMD ["node", "server.mjs"]

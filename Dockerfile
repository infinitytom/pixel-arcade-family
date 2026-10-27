FROM python:3.12-alpine AS engine
WORKDIR /build
COPY engine-lock.json ./
COPY scripts/fetch_engine.py scripts/fetch_engine.py
RUN python scripts/fetch_engine.py /engine

FROM python:3.12-alpine
LABEL org.opencontainers.image.source="https://github.com/infinitytom/pixel-arcade-family"
LABEL org.opencontainers.image.title="像素放映厅 · 家庭版"
WORKDIR /app
COPY --from=engine /engine /app/engine
COPY server.py catalog.py ./
COPY scripts/fetch_cheats.py ./scripts/fetch_cheats.py
COPY site ./site
RUN mkdir /roms && chown 10001:10001 /roms
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 ROM_ROOT=/roms PORT=8080
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health',timeout=3)"
CMD ["python", "server.py"]

# syntax=docker/dockerfile:1
# =============================================================================
#  R Aula Viva · UNACHI — Imagen de producción (Node.js + R)
#  Pensada para desplegarse con Dokploy (Build Type: Dockerfile) detrás de
#  Traefik, que termina HTTPS y reenvía las conexiones WebSocket.
#
#  Construcción local:   docker build -t r-aula-viva .
#  Con paquetes CRAN:    docker build --build-arg R_PACKAGES="ggplot2 readxl" -t r-aula-viva .
# =============================================================================

ARG R_VERSION=4.6.1
ARG NODE_VERSION=24

# -----------------------------------------------------------------------------
# Etapa 1: dependencias de Node (solo producción, reproducibles con lockfile)
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
 && npm cache clean --force

# -----------------------------------------------------------------------------
# Etapa 2: binario oficial de Node.js (se copia a la imagen de R)
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS node

# -----------------------------------------------------------------------------
# Etapa 3: imagen final sobre Rocker (R compilado con soporte cairo, Ubuntu LTS)
# -----------------------------------------------------------------------------
FROM rocker/r-ver:${R_VERSION} AS runtime

# Paquetes CRAN opcionales separados por espacios (p. ej. "ggplot2 readxl dplyr").
# Rocker usa binarios precompilados de Posit Package Manager: la instalación es rápida.
ARG R_PACKAGES=""

# tini: init mínimo (reenvía SIGTERM y recoge procesos huérfanos de Rscript)
# libcairo2 + fuentes: gráficos PNG sin servidor X
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini libcairo2 fonts-dejavu-core ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN if [ -n "${R_PACKAGES}" ]; then \
      install2.r --error --skipinstalled --ncpus -1 ${R_PACKAGES} \
      && rm -rf /tmp/downloaded_packages; \
    fi

# Node.js oficial (mismo binario que la imagen node:*-slim)
COPY --from=node /usr/local/bin/node /usr/local/bin/node

# Usuario sin privilegios: el código R de los usuarios NO corre como root
RUN groupadd --system --gid 10001 raula \
 && useradd --system --uid 10001 --gid raula --create-home --home-dir /home/raula \
      --shell /usr/sbin/nologin raula

WORKDIR /app
# Código de la aplicación propiedad de root y de solo lectura para "raula":
# un script de R no puede modificar el servidor ni la interfaz.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json server.js ./
COPY public ./public

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    R_TIMEOUT=20000 \
    TMPDIR=/tmp \
    HOME=/home/raula \
    R_LIBS_SITE=/usr/local/lib/R/site-library

USER raula
EXPOSE 3000

# Verificación de salud (Dokploy/Swarm reinicia el contenedor si falla)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]

# Despliegue de R Aula Viva en VPS Hostinger con Dokploy

Guía para publicar `PGBeermann/r-aula-vivo` en un VPS de Hostinger administrado con **Dokploy**, usando el `Dockerfile` del repositorio. Dokploy construye la imagen, la ejecuta y la publica detrás de **Traefik**, que gestiona el dominio, el certificado HTTPS de Let's Encrypt y el tráfico WebSocket.

```
Navegador ──HTTPS/WSS──► Traefik (80/443, Dokploy) ──HTTP/WS──► contenedor r-aula-viva:3000
                                                                 ├─ node server.js (usuario raula)
                                                                 └─ Rscript --vanilla (cola limitada)
```

---

## 0. Requisitos previos

| Elemento | Verificación |
|---|---|
| VPS Hostinger con Dokploy instalado y panel accesible | `https://IP_DEL_VPS:3000` o el dominio del panel |
| Puertos **80** y **443** abiertos en el *firewall* del VPS (hPanel › VPS › Seguridad › Firewall) | Necesarios para Traefik y Let's Encrypt |
| Un subdominio, p. ej. `raula.sudominio.com` | — |
| RAM recomendada: ≥ 2 GB libres para la aplicación | R consume ~80–150 MB por ejecución simultánea |

---

## 1. DNS (antes de crear el dominio en Dokploy)

En el gestor DNS de su dominio (hPanel › Dominios › DNS / Nameservers) cree un registro:

| Tipo | Nombre | Valor | TTL |
|---|---|---|---|
| A | `raula` | IP pública del VPS | 3600 |

Compruebe la propagación: `nslookup raula.sudominio.com` debe devolver la IP del VPS.
> Dokploy recomienda apuntar el DNS **antes** de agregar el dominio; si no, Let's Encrypt puede no emitir el certificado y habría que recrear el dominio o reiniciar Traefik.

---

## 2. Generar las claves

**Clave del docente (hash SHA-256)** — se guarda solo el hash en el servidor:

```bash
# Linux / macOS / Git Bash
printf '%s' 'MiClaveSegura2026' | sha256sum
```
```powershell
# Windows PowerShell
[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes('MiClaveSegura2026'))).Replace('-','').ToLower()
```

Copie los 64 caracteres hexadecimales. Defina además un **código de clase** corto para los estudiantes (p. ej. `QM230-2026`).

---

## 3. Crear la aplicación en Dokploy

1. **Projects › Create Project** → nombre: `UNACHI-Aulas`.
2. Dentro del proyecto: **Create Service › Application** → nombre `r-aula-viva`.
3. Pestaña **General › Provider**: **GitHub** (o *Git* con la URL pública `https://github.com/PGBeermann/r-aula-vivo.git`).
   - Repository: `r-aula-vivo` · Branch: `main`.
4. **Build Type**: `Dockerfile`
   - Dockerfile Path: `Dockerfile`
   - Docker Context Path: `.`
   - Docker Build Stage: *(vacío)*
5. **Save**.

### 3.1 Variables de entorno (pestaña *Environment*)

```env
TEACHER_KEY_SHA256=pegue_aqui_los_64_caracteres
CLASS_KEY=QM230-2026
PUBLIC_URL=https://raula.sudominio.com
R_TIMEOUT=20000
MAX_CONCURRENT_R=2
MAX_QUEUE=60
```

`NODE_ENV=production`, `PORT=3000` y `HOST=0.0.0.0` ya vienen definidos en la imagen. En producción el servidor **no arranca** si no se define `TEACHER_KEY` o `TEACHER_KEY_SHA256`.

### 3.2 Paquetes de R adicionales (opcional)

En **Environment › Build Time Arguments**:

```env
R_PACKAGES=ggplot2 readxl dplyr
```

Se instalan en la imagen durante la construcción (binarios de Posit Package Manager). Los usuarios no pueden instalar paquetes en tiempo de ejecución (la biblioteca del sistema es de solo lectura para el usuario `raula`).

### 3.3 Dominio (pestaña *Domains › Add Domain*)

| Campo | Valor |
|---|---|
| Host | `raula.sudominio.com` |
| Path | `/` |
| Container Port | `3000` |
| HTTPS | Activado |
| Certificate | Let's Encrypt |

No configure nada en **Advanced › Ports**: Traefik enruta por el puerto del contenedor y exponer puertos directos puede interferir con el dominio. Traefik reenvía WebSocket sin configuración adicional; el cliente usa `wss://` automáticamente cuando la página se sirve por HTTPS.

### 3.4 Recursos (pestaña *Advanced › Resources*) — recomendado

| Parámetro | Valor sugerido (VPS KVM 2) |
|---|---|
| Memory Limit | `2147483648` (2 GB) |
| CPU Limit | `2000000000` (2 CPU) |

Memoria en **bytes** y CPU en **nanoCPUs** (1 000 000 000 = 1 núcleo). Así un script de R descontrolado no afecta al panel de Dokploy ni a otras aplicaciones (SIGPRI, etc.). Tras cambiar recursos pulse **Redeploy**.

### 3.5 Desplegar

Pulse **Deploy** y siga el registro en **Deployments**. La primera construcción descarga `rocker/r-ver` (~900 MB) y tarda varios minutos; las siguientes usan la caché.

Para despliegue automático en cada `git push` a `main`, active **Autodeploy** (proveedor GitHub) o configure el *webhook* que muestra Dokploy en **Deployments**.

---

## 4. Verificación

```bash
curl -s https://raula.sudominio.com/healthz
# {"status":"ok","clients":0,"activeRuns":0,"queued":0}

curl -s https://raula.sudominio.com/api/info
# {"ips":[],"port":3000,"publicUrl":"https://raula.sudominio.com","classKeyRequired":true}
```

En **Logs** de la aplicación debe aparecer:

```
R AULA VIVA  —  Servidor en marcha  (producción)
Clave del docente:  definida por TEACHER_KEY_SHA256 (no se muestra)
Código de clase:    requerido para estudiantes (CLASS_KEY)
```

Prueba funcional: entre como docente, ejecute `plot(1:10)`; abra otra ventana como estudiante (con el código de clase) y confirme que recibe el gráfico.

Desde la terminal del contenedor (Dokploy › *Docker Terminal*) puede verificar R:

```bash
Rscript --vanilla -e 'cat(R.version.string, capabilities("cairo"), "\n")'
```

---

## 5. Solución de problemas

| Síntoma | Causa probable | Acción |
|---|---|---|
| *Bad Gateway* | Puerto del dominio distinto de 3000 | Domains › Container Port = 3000 |
| Certificado no válido | DNS creado después del dominio | Verifique DNS, elimine y recree el dominio |
| Contenedor reiniciándose | Falta `TEACHER_KEY_SHA256`/`TEACHER_KEY` | Revise Logs (`[FATAL]`) y Environment |
| "Conectando…" permanente | WebSocket bloqueado por un proxy externo (p. ej. Cloudflare con proxy) | En Cloudflare, habilite WebSockets o use DNS-only |
| "[SERVIDOR OCUPADO]" | Cola llena | Aumente `MAX_CONCURRENT_R` (según CPU) o `MAX_QUEUE` |
| "[TIEMPO EXCEDIDO]" | Script muy largo | Aumente `R_TIMEOUT` (ms) |

---

## 6. Consideraciones de seguridad

La aplicación ejecuta **código R arbitrario**. Medidas aplicadas en esta versión:

- R corre como usuario sin privilegios (`raula`, UID 10001); el código de la aplicación es de solo lectura.
- Las variables `TEACHER_KEY`, `TEACHER_KEY_SHA256` y `CLASS_KEY` se eliminan del entorno que recibe R. Como un proceso del mismo usuario puede leer `/proc/<pid>/environ` del servidor, use **`TEACHER_KEY_SHA256`** en internet: un script malicioso obtendría solo el hash.
- `CLASS_KEY` impide que visitantes anónimos ejecuten R.
- Cola global (`MAX_CONCURRENT_R`), una ejecución individual simultánea por conexión, tiempo máximo por ejecución, límite de 1 MB por mensaje WebSocket y demora de 1 s ante claves incorrectas.
- Límites de CPU/RAM del contenedor (sección 3.4).

Limitación conocida: R conserva acceso de salida a internet desde el contenedor. Si se requiere aislamiento de red, conviene una red Docker interna sin salida o reglas de firewall de egreso.

---

## Referencias

- Dokploy — Build Type: https://docs.dokploy.com/docs/core/applications/build-type
- Dokploy — Domains: https://docs.dokploy.com/en/docs/core/application/domains
- Dokploy — Troubleshooting de dominios: https://docs.dokploy.com/docs/core/troubleshooting/domains
- Dokploy — Advanced (recursos en bytes y nanoCPUs): https://docs.dokploy.com/docs/core/applications/advanced
- Rocker Project — imágenes `rocker/r-ver`: https://rocker-project.org/images/versioned/r-ver.html
- Docker — referencia de Dockerfile (`HEALTHCHECK`, `USER`, multi-stage): https://docs.docker.com/reference/dockerfile/
- tini: https://github.com/krallin/tini

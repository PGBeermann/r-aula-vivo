# R Aula Viva · UNACHI

Aula colaborativa para enseñar **R en tiempo real dentro de la red Wi-Fi del salón**, sin necesidad de internet.

El **docente** escribe y ejecuta código R; **todos los estudiantes ven el código y los resultados (texto y gráficos) en vivo**. Cada estudiante tiene además su propio taller para practicar y puede **enviar sus scripts al docente**, quien los ejecuta, corrige y devuelve retroalimentación.

- **Motor de R:** el código se ejecuta con `Rscript` en la máquina del docente (R completo, todos los paquetes CRAN, gráficos reales).
- **Sincronización:** WebSocket sobre la red local (LAN/Wi-Fi).
- **Sin internet:** todos los recursos de la interfaz (editor CodeMirror) están incluidos localmente.

---

## 1. Requisitos (solo en la laptop del docente)

Los estudiantes **no instalan nada**: solo abren un navegador.

| Software | Versión sugerida | Verificar |
|---|---|---|
| **Node.js** | 18 o superior | `node --version` |
| **R** | 4.x | `Rscript --version` |
| **cairo** (para gráficos) | incluido en R en Windows/macOS; en Linux instalar `libcairo2` | `Rscript -e 'capabilities("cairo")'` → debe decir `TRUE` |

### Instalar R
- **Windows:** descargue R desde CRAN (https://cran.r-project.org) e instálelo. `Rscript.exe` queda disponible; si `Rscript` no se reconoce en la terminal, agregue `C:\Program Files\R\R-4.x.x\bin` al `PATH`.
- **macOS:** `brew install r` o el instalador de CRAN.
- **Ubuntu/Debian (VPS o laptop Linux):**
  ```bash
  sudo apt-get update
  sudo apt-get install -y r-base-core libcairo2
  ```

### Instalar Node.js
Descárguelo de https://nodejs.org (versión LTS) o, en Linux:
```bash
sudo apt-get install -y nodejs npm
```

---

## 2. Instalación del proyecto

Descomprima la carpeta `r-aula-vivo` en la laptop del docente y, **una sola vez y con internet**, instale la dependencia del servidor:

```bash
cd r-aula-vivo
npm install
```

Esto descarga la librería `ws` (WebSocket). A partir de aquí ya **no se necesita internet**.

> Si desea dejar la laptop lista para usarla siempre sin conexión, ejecute `npm install` una vez en su casa/oficina; la carpeta `node_modules` queda guardada y el aula funcionará offline.

---

## 3. Puesta en marcha (el día de clase)

1. Conecte la **laptop del docente** a la red Wi-Fi del aula (el enrutador puede estar **sin salida a internet**; basta con que docente y estudiantes estén en la **misma red**).
2. Inicie el servidor:
   ```bash
   cd r-aula-vivo
   npm start
   ```
   o bien:
   ```bash
   node server.js
   ```
3. La terminal mostrará algo como:
   ```
   ================================================================
     R AULA VIVA  —  Servidor en marcha
   ================================================================
     Clave del docente:  unachi-docente
     Los estudiantes deben abrir en su navegador:
        http://192.168.1.15:3000
   ================================================================
   ```
4. **Anote la dirección** (por ejemplo `http://192.168.1.15:3000`) y compártala con los estudiantes (pizarra o proyector).

### Cómo obtener la IP manualmente (si hiciera falta)
- **Windows:** `ipconfig` → busque *Dirección IPv4* de la Wi-Fi.
- **macOS/Linux:** `ip addr` o `ifconfig` → busque la IP `192.168.x.x` / `10.x.x.x`.

---

## 4. Uso

### Docente
1. Abra la dirección en su navegador → **“Soy docente”** → nombre + **clave** → *Entrar al aula*.
2. Escriba R en el editor. Lo que escribe **se refleja en vivo** en la pantalla de cada estudiante.
3. Pulse **▶ Ejecutar** (o `Ctrl/Cmd + Enter`); el texto y los gráficos aparecen para **toda la clase**.
4. Marque **“Auto-ejecutar”** para que el código corra solo, 1,2 s después de dejar de escribir (útil para demostraciones en vivo).
5. En la columna derecha verá los **estudiantes conectados** y sus **envíos**. Haga clic en un envío para ejecutarlo, escribir comentarios y **devolver la corrección** al estudiante.
6. Con **📂 Abrir** carga un script guardado en su computadora y con **💾 Guardar** descarga el código actual como archivo `.R`.
7. Con **🌐 Exportar HTML** convierte la salida (código + consola + gráficos) en un informe HTML autónomo con estilo similar al de RStudio; el archivo se **descarga** y se **abre** en una pestaña nueva.

### Estudiante
1. Abra la dirección → **“Soy estudiante”** → nombre → *Entrar al aula*.
2. **📺 Clase en vivo:** ve el código y los resultados del docente en tiempo real.
3. **✍️ Mi taller:** practica su propio R (`Ctrl/Cmd + Enter` para ejecutar) y con **📤 Enviar al docente** manda su script para revisión.
4. **✅ Revisiones:** recibe los comentarios y el código corregido del docente, con opción de cargarlo en su taller.
5. En **Mi taller** puede **📂 Abrir** (cargar un script de su computadora) y **💾 Guardar** (descargar su código). En **Clase en vivo** puede guardar el código del docente como `.R`.
6. Con **🌐 Exportar HTML** genera un informe HTML (código + consola + gráficos) que se descarga y se abre en una pestaña nueva, tanto de su taller como de la clase.

Los archivos `.R` y los informes `.html` se guardan y se leen desde la **computadora de cada usuario** (docente o estudiante) mediante el navegador; no se suben al servidor. El informe HTML es autónomo: los gráficos van incrustados, por lo que puede compartirse o abrirse sin conexión.

---

## 5. Configuración

Variables de entorno (opcionales en el aula; obligatorias las de clave en producción):

| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor. |
| `HOST` | `0.0.0.0` | Interfaz de escucha. |
| `TEACHER_KEY` | `unachi-docente` | Clave del docente en texto plano. **Cámbiela.** |
| `TEACHER_KEY_SHA256` | — | Hash SHA-256 (hex) de la clave del docente. Recomendado en servidores públicos; tiene prioridad sobre `TEACHER_KEY`. |
| `CLASS_KEY` | — | Código que deben ingresar los estudiantes. Si no se define, entran solo con su nombre. |
| `PUBLIC_URL` | — | URL que se muestra en la pantalla de acceso (p. ej. `https://raula.sudominio.com`). |
| `R_TIMEOUT` | `20000` | Tiempo máximo por ejecución de R (ms). |
| `MAX_CONCURRENT_R` | nº de núcleos (mín. 2) | Procesos `Rscript` simultáneos; el resto espera en cola. |
| `MAX_QUEUE` | `60` | Ejecuciones en espera antes de responder "servidor ocupado". |
| `NODE_ENV` | — | Con `production` el servidor exige definir la clave del docente y no la muestra en el registro. |

Ejemplos:
```bash
# Linux/macOS
TEACHER_KEY="quimica2026" PORT=8080 node server.js

# Windows (PowerShell)
$env:TEACHER_KEY="quimica2026"; $env:PORT=8080; node server.js
```

---

## 6. Despliegue en el VPS de Hostinger con Docker / Dokploy

El repositorio incluye un `Dockerfile` de producción (R 4.6 de Rocker + Node.js 24, usuario sin privilegios, `tini`, *healthcheck* en `/healthz`). La guía completa paso a paso está en **[DEPLOY-DOKPLOY.md](DEPLOY-DOKPLOY.md)**.

Prueba local de la imagen:
```bash
docker build -t r-aula-viva .
docker run --rm -p 3000:3000 -e TEACHER_KEY="quimica2026" -e CLASS_KEY="QM230" r-aula-viva
# abrir http://localhost:3000
```

---

## 7. Nota de seguridad (importante)

Esta herramienta **ejecuta código R arbitrario en la máquina anfitriona**. Es adecuada para un **aula de confianza en red local**. Considere:

- Úsela en una red del aula, no expuesta a internet abierto sin protección.
- Cambie siempre `TEACHER_KEY`.
- El servidor aplica un **tiempo máximo por ejecución** (`R_TIMEOUT`) para evitar bloqueos, pero no es un entorno *sandbox*. Para uso en internet público, ejecútelo con un usuario del sistema sin privilegios y, de ser posible, dentro de un contenedor.

---

## 8. Estructura del proyecto

```
r-aula-vivo/
├── server.js              # Servidor HTTP + WebSocket + motor de R
├── package.json / package-lock.json
├── Dockerfile             # Imagen de producción (Dokploy)
├── .dockerignore
├── .env.example           # Variables de entorno de referencia
├── DEPLOY-DOKPLOY.md      # Guía de despliegue en Hostinger + Dokploy
├── README.md
└── public/
    ├── index.html         # Interfaz
    ├── styles.css
    ├── app.js             # Lógica del cliente (WebSocket, editor, salida)
    └── vendor/codemirror/ # Editor de código (offline)
```

---

*Universidad Autónoma de Chiriquí — Escuela de Química.*

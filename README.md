# Alta Panel

Panel interno de operaciones y P&L para AltaHomes (alquiler de corta estancia en
Malaga). Se alimenta automaticamente de la Guesty Open API y de una hoja de
Google con los costes. Una sola pagina con detalle por unidad, en espanol,
protegida por contrasena y pensada para movil.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind v4
- Recharts para graficos
- Postgres (Neon / Vercel Postgres) como cache y fuente de la UI
- Despliegue en Vercel + Vercel Cron (sync nocturno)

## Arquitectura (resumen)

- Todas las llamadas a Guesty y a la hoja ocurren en el servidor. Los secretos
  nunca llegan al cliente.
- El token de Guesty se cachea en la tabla `guesty_token` y solo se renueva
  cuando quedan menos de 60 min para expirar (Guesty limita a ~5 tokens/dia).
  La renovacion se serializa con un advisory lock de Postgres.
- La UI lee siempre de Postgres, asi que si el sync falla se siguen mostrando
  los ultimos datos correctos con un aviso no bloqueante.
- Sync incremental por `lastUpdatedAt`, con refresco completo semanal (lunes).

## Variables de entorno

| Variable | Donde | Descripcion |
|---|---|---|
| `DATABASE_URL` | servidor | Cadena Neon "pooled" (con `-pooler`). |
| `DATABASE_URL_UNPOOLED` | servidor | Cadena Neon directa. Solo para migraciones. |
| `GUESTY_CLIENT_ID` | servidor | Client id de la Open API. |
| `GUESTY_CLIENT_SECRET` | servidor | Client secret de la Open API. |
| `DASHBOARD_PASSWORD` | servidor | Contrasena de acceso al panel. |
| `SESSION_SECRET` | servidor | Secreto para firmar la cookie de sesion (`openssl rand -base64 48`). |
| `CRON_SECRET` | servidor | Secreto que valida el cron de Vercel. |
| `COSTES_CSV_URL` | servidor | URL CSV publicada de la pestana Costes. |
| `UNIDADES_CSV_URL` | servidor | URL CSV publicada de la pestana Unidades. |
| `TZ` | servidor | `Europe/Madrid`. |

Copia `.env.example` a `.env.local` para desarrollo local.

## Pasos manuales (los hace el equipo, no el codigo)

1. **Guesty Open API**: crea una integracion Open API y copia client id + secret.
2. **Hoja de Google**: crea una hoja con dos pestanas `Costes` y `Unidades`
   usando las plantillas de la carpeta `plantillas/`. Luego
   `Archivo > Compartir > Publicar en la web`, publica cada pestana como CSV y
   guarda las dos URLs en `COSTES_CSV_URL` y `UNIDADES_CSV_URL`.
   - La columna `unidad` debe coincidir EXACTAMENTE con el `nickname` del listing
     en Guesty (acentos, espacios y mayusculas incluidos).
3. **Neon (Vercel Postgres)**: crea la base de datos desde Vercel (pestana
   Storage) y copia las dos cadenas de conexion.
4. **Vercel**: conecta el repo de GitHub, anade las variables de entorno y
   confirma el cron.

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # rellena los valores
npm run migrate              # crea las tablas (usa DATABASE_URL_UNPOOLED)
npm run dev
```

## Despliegue en Vercel (paso a paso)

1. Sube el repo a GitHub (ver mas abajo).
2. En Vercel, `Add New > Project` y selecciona el repo. Framework: Next.js.
3. En `Storage`, crea una base de datos Postgres (Neon). Vercel anade
   `DATABASE_URL` y `DATABASE_URL_UNPOOLED` automaticamente.
4. En `Settings > Environment Variables`, anade el resto de variables de la
   tabla (Production y Preview).
5. Despliega. Tras el primer deploy, ejecuta la migracion una vez apuntando a la
   BD de produccion: pon las dos cadenas en `.env.local` y ejecuta
   `npm run migrate`.
6. El cron esta definido en `vercel.json` (`/api/sync` a las 03:00 UTC). Vercel
   envia la cabecera `Authorization: Bearer <CRON_SECRET>`, que el endpoint
   valida.
7. Entra en el panel con `DASHBOARD_PASSWORD` y pulsa "Actualizar datos" para el
   primer sync manual.

### Subir a GitHub

```bash
git add -A
git commit -m "Alta Panel: version inicial"
git remote add origin https://github.com/<usuario>/alta-panel.git
git branch -M main
git push -u origin main
```

## Cron y refresco manual

- Nocturno: `/api/sync` a las 03:00 UTC (= 05:00 en horario de verano de Madrid,
  04:00 en invierno; el sync es idempotente y la hora exacta no es critica).
- Manual: boton "Actualizar datos" (POST a `/api/sync`), limitado a una vez cada
  10 minutos.

## Reconciliacion end to end (antes de darlo por bueno)

1. Lanza un sync y comprueba en `sync_log` que termina en `ok`.
2. Compara el numero de reservas por unidad con lo que muestra Guesty.
3. Cuadra un mes de una unidad al euro:
   - Ingresos alojamiento, limpieza y comisiones de canal del P&L mensual.
   - Nota: "Comisiones de canal" se toma de `money.hostServiceFee` (o
     `hostServiceFeeIncTax`). Si en Guesty la comision real de un canal aparece
     en otro campo, ajustar `extraerMoney` en `lib/guesty/map.ts`.

## Estructura

- `lib/guesty/` cliente de Guesty (token, http, mapeo).
- `lib/sync.ts` orquestacion del sync (Guesty + hojas -> Postgres).
- `lib/metrics.ts` metricas y P&L.
- `lib/auth.ts` + `proxy.ts` gate de acceso (cookie firmada).
- `app/` UI (portfolio y detalle por unidad).
- `db/schema.sql` esquema. `scripts/migrate.ts` migracion.
- `plantillas/` plantillas CSV de las hojas.

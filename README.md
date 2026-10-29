# Mascota LIVE

Mascota animada para directos que reacciona a TikTok LIVE, YouTube Live, Twitch y Facebook Live.
Los usuarios crean cuenta (Supabase) y pagan con Mercado Pago: un plan mensual con horas en vivo incluidas, más recargas de horas.

## Partes

| Carpeta | Qué es | Dónde corre |
|---|---|---|
| `web/` | Next.js: portada, cuentas, panel, planes, pagos, conexión de cuentas y la página del overlay (`/o/<llave>`) | Vercel |
| `worker/` | Node siempre encendido: conexiones a las plataformas, motor de reacciones de cada streamer, cobro por minuto. Reparte las animaciones por SSE | Railway / Render / Fly (usar el `Dockerfile` de la raíz) |
| `core/` | Motor de reacciones, configuración, mascota SVG y cifrado de tokens; lo usan la web y el worker | — |
| `supabase/schema.sql` | Tablas, RLS y funciones (planes, recargas, monedero de minutos, mascota, conexiones, tokens cifrados, sesiones) | Supabase → SQL Editor |

```
plataforma → conector (worker) → motor (cola, prioridades, límites) → SSE → overlay en OBS
                                                                     → panel (estado, cola, voz)
```

## Cómo se crea la mascota

En el panel, pestaña Mascota, el usuario elige una de tres formas:

1. **Personaje del catálogo**: Chispa, Michi (gato), Bolt (robot), Boo (fantasma), Rexi (dino) y Tobi (osito). Todos son originales y se recolorean.
2. **Su imagen**: sube un PNG transparente (o GIF/WebP/JPG, máx. 2 MB) al bucket público `mascotas` de Supabase Storage, en su carpeta `<user id>/`. Opcionalmente versiones feliz, triste y sorprendida. La imagen salta, baila y se mueve con las mismas animaciones de cuerpo.
3. **Con IA**: describe la mascota y Claude Opus 5.5 devuelve un diseño en JSON por partes (cuerpo, orejas, brazos, pies, cola…) con salida estructurada. `core/mascot.js` lo valida (solo formas y colores de la paleta, nada de texto ni enlaces) y lo dibuja con el mismo motor que el catálogo, así que hereda las 8 animaciones, la cara, los colores y los accesorios. Cupo mensual por plan en `plans.ai_designs` (Gratis 1, Creator 5, Pro 20, Business 50, propuesta); los intentos fallidos no cuentan.

## Voz de la mascota

En la pestaña Voz el streamer elige entre cuatro motores (`voice.engine`). Si un audio no llega en 4 s o falla, se usa la voz del navegador:

- **navegador:** voces del sistema, gratis.
- **grabada:** audios propios por reacción y para las invitaciones (hasta 5 por grupo, se turnan), grabados en el panel o subidos al bucket `mascotas`. No dicen nombres.
- **elevenlabs:** voces de la cuenta de la plataforma (`ELEVENLABS_API_KEY` en web y worker). Cupo mensual de caracteres por plan (`plans.tts_chars`: Creator 15 000, Pro 40 000, Business 100 000, propuesta) con `consume_tts`. El worker guarda el audio en caché, así que las frases repetidas no se cobran dos veces.
- **elevenlabs_propia:** el streamer conecta su API key (cifrada en `platform_tokens`) y usa cualquier voz de su cuenta, incluida su voz clonada; no gasta el cupo de la plataforma.

El worker genera el audio (modelo `eleven_flash_v2_5`) y lo sirve en `/audio/<id>.mp3`; el overlay o el panel lo reproducen.

## Resumen de cada directo

- **Estadísticas por plataforma (todos los planes):** el worker cuenta comentarios, personas que comentaron, entradas, likes, follows, suscripciones, regalos y su valor, y quién comentó o regaló más (`live_sessions.stats`).
- **Resumen del chat con IA (`plans.summaries`: Creator, Pro, Business):** lo más comentado, lo que más pidieron con ideas para aprovecharlo, preguntas repetidas, ánimo del chat, momentos destacados y sugerencias para el próximo directo. Se genera con Claude la primera vez que el usuario lo abre (`/api/resumen`) y se guarda en `live_sessions.summary`.
- **Privacidad:** los comentarios se guardan sin nombres en `session_comments` (máx. 5000 por directo) solo para el resumen; se borran al generarlo o a los 30 días. El streamer puede desactivarlo en Límites.

## Administración (/admin)

Acceso: correos en `ADMIN_EMAILS` (Vercel) o `profiles.is_admin = true`. Todo lo que hace un admin queda en `admin_actions`.

- **Resumen:** usuarios y altas, suscripciones activas por plan, ingreso mensual recurrente, cobrado, directos en vivo, horas en vivo, uso de IA y gráficas diarias de 30 días.
- **Usuarios:** búsqueda por correo o id y ficha con plan, horas, suscripciones, pagos, directos, conexiones, mascotas con IA y notas. Acciones: dar o quitar horas (del plan o extra), regalar un plan por N meses (se renueva cada mes mientras dure), cancelar suscripción al final del periodo o de inmediato quitando horas, suspender o reactivar la cuenta (bloquea el inicio de sesión en Supabase Auth y el worker corta su directo en menos de un minuto) y dar o quitar permiso de admin.
- **Planes y recargas:** precio, horas, plataformas, cupo de mascotas IA, resumen IA y activar o desactivar.

## Cobro

- Planes en la tabla `plans` (Gratis 3 h, Creator $99 / 30 h, Pro $199 / 80 h, Business $399 / 200 h) y recargas en `hour_packs` (5, 15 y 40 h). Son los precios de prueba del documento; se editan en Supabase.
- Solo se cobran los minutos en que al menos una plataforma está transmitiendo de verdad. Probar, ensayar y el simulador son gratis.
- El worker descuenta un minuto por minuto (`consume_minutes`): primero los del plan, luego las recargas. Si se acaban, se detiene el directo.
- La sesión se detiene sola si no hay directo en 20 min o si OBS está desconectado 15 min. Si el worker se reinicia, las sesiones abiertas se reanudan solas.
- `plans.max_platforms` limita cuántas plataformas se conectan a la vez.

## Plataformas

| Plataforma | Cómo | Eventos | Requisitos |
|---|---|---|---|
| Twitch | IRC oficial anónimo + EventSub con la cuenta del streamer | chat, bits, suscripciones, raids; follows si conecta su cuenta | App en dev.twitch.tv |
| YouTube | YouTube Data API v3 con la clave del servidor | chat, Super Chat, Super Sticker, membresías | Clave de API. **Cuota diaria**: 10 000 unidades por defecto alcanzan para pocas horas de chat al día en total; hay que pedir ampliación a Google antes de lanzar |
| Facebook | Graph API con el token de la página | comentarios y reacciones | App de Meta con `pages_show_list`, `pages_read_engagement`, `pages_read_user_content` aprobados en App Review (mientras tanto solo funciona con usuarios de prueba). Solo páginas, no perfiles |
| TikTok | `tiktok-live-connector` (**no oficial, experimental**) | entradas, comentarios, likes, follows, regalos (con diamantes) | Nada obligatorio; `TIKTOK_SIGN_API_KEY` de eulerstream.com sube los límites. Puede dejar de funcionar si TikTok cambia y va contra sus términos de uso automatizado |

## Puesta en marcha

1. **Supabase**: crear proyecto, correr `supabase/schema.sql`. En Authentication → URL Configuration poner la URL de la web.
2. **Llave de tokens**: `openssl rand -base64 32` → `TOKENS_KEY` igual en web y worker.
3. **Worker**: desplegar con el `Dockerfile` de la raíz y las variables de `worker/.env.example`. `SITE_URL` = URL de la web (para CORS).
4. **Web**: en Vercel, carpeta raíz `web`, variables de `web/.env.example`. `PB_WORKER_URL` = URL pública del worker. Activar “Include files outside the root directory” (viene activado) porque usa `../core`.
5. **IA**: `ANTHROPIC_API_KEY` en la web (ruta `/api/mascota/generar`, hasta 300 s).
6. **Mercado Pago**: webhook a `https://<web>/api/mercadopago/webhook` con los eventos de pagos y suscripciones; copiar la clave secreta a `MP_WEBHOOK_SECRET`.
7. **Twitch**: redirect `https://<web>/api/conectar/twitch/callback`. **Facebook**: redirect `https://<web>/api/conectar/facebook/callback`.
8. En OBS: fuente de navegador, URL que da el panel, 1920×1080.

## Pruebas

```
cd core && node --test              # motor de reacciones
cd worker && npm test               # conectores, cifrado y cobro por minuto (base falsa)
node supabase/test-schema.mjs supabase/schema.sql   # esquema en PGlite (ver cabecera del archivo)
cd web && npm run build
```

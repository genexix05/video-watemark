# Video Watermark

Aplicación de escritorio para superponer varias marcas de agua en fotografías
y vídeos. Funciona localmente, sin cuentas ni servicios remotos.

## Uso

1. Selecciona una foto o vídeo con el selector del sistema.
2. Añade marcas PNG, JPEG o WebP.
3. Muévelas, cambia su tamaño, rotación, opacidad y orden. En vídeo también
   puedes definir cuándo aparece cada marca.
4. Pulsa **Exportar**, elige un perfil y un destino. Puedes cancelar mientras
   FFmpeg procesa el archivo.

Las capas ocultas no se exportan. La exportación conserva las dimensiones del
medio. Los vídeos mantienen duración, FPS y audio cuando el archivo de origen
permite analizarlos correctamente.

## Desarrollo

Requiere Node.js 20 o posterior.

```bash
npm install
npm run dev
```

Comprobaciones:

```bash
npm run lint
npm run typecheck
npm run build
```

La aplicación usa Electron + React/TypeScript. `src/main` contiene el IPC y el
procesamiento privilegiado; `src/preload` expone una API mínima;
`src/renderer` no tiene acceso a Node; y `src/shared` define los contratos.

## Empaquetado

Genera cada instalador en su sistema operativo de destino:

```bash
npm run package:mac
npm run package:win
npm run package:linux
```

Los artefactos se escriben en `release/`. El paso `prepare:media` copia FFmpeg
y FFprobe para la plataforma y arquitectura actuales a los recursos del
paquete. No se requiere una instalación global de estas herramientas.

Los binarios de `ffmpeg-static` tienen licencia GPL-3.0-or-later. Antes de
distribuir el producto deben incluirse las licencias y avisos exigidos y
revisarse las obligaciones aplicables al instalador completo.

## Privacidad y seguridad

- Los archivos no se suben ni se envían a ningún servidor.
- El proyecto vive solo en memoria; no guarda historial ni copias de origen.
- La ventana usa sandbox, aislamiento de contexto, CSP y
  `nodeIntegration: false`.
- El proceso principal solo acepta rutas elegidas previamente con los
  selectores nativos. El destino se autoriza para una única exportación.
- Se procesa primero un archivo temporal; el destino se sustituye únicamente
  cuando la exportación termina correctamente.

El modo desarrollo puede abrir conexiones locales de Vite para recarga en
caliente. La aplicación empaquetada no necesita red en tiempo de ejecución.

## Formatos y limitaciones

Entradas habituales: PNG, JPEG, WebP, BMP, GIF, MP4, MOV, MKV, WebM, M4V y
AVI. TIFF y HEIF/HEIC no se ofrecen porque su previsualización no es fiable en
Chromium, aunque algunas compilaciones de FFmpeg puedan decodificarlos. Que
una extensión aparezca en el selector no garantiza
que el binario FFmpeg incluido pueda decodificar todas sus variantes.

Imágenes:

- PNG es sin pérdida.
- JPEG y WebP permiten ajustar calidad, pero vuelven a comprimir la imagen.
- Solo se exporta una imagen estática; GIF/WebP animados no conservan la
  animación.
- Los metadatos EXIF/ICC no se preservan de forma completa.

Vídeos:

- MP4/MOV/MKV usan H.264; WebM usa VP9.
- **Alta calidad** usa CRF 18 (VP9: 20), **compacto** CRF 28 (VP9: 34) y
  **sin pérdida** usa H.264 QP 0 o VP9 lossless. “Sin pérdida” evita pérdida
  adicional del vídeo, pero no recupera información del original y produce
  archivos muy grandes.
- El audio se copia cuando el códec es compatible con el contenedor; en caso
  contrario se convierte a AAC u Opus.
- La disponibilidad real de HEVC, AV1, formatos profesionales, perfiles,
  HDR, subtítulos, múltiples pistas y canales depende de la compilación de
  FFmpeg. Subtítulos, capítulos y pistas auxiliares no se conservan.
- No hay aceleración por hardware; vídeos largos o de alta resolución pueden
  tardar y consumir bastante CPU y espacio temporal.

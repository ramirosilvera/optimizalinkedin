# LinkedIn Profile Optimizer

Aplicación web que usa IA (Google Gemini) para analizar perfiles de LinkedIn y generar recomendaciones estratégicas personalizadas.

## ¿Qué hace?

1. Realiza un cuestionario adaptativo (hasta 9 preguntas) para entender el objetivo profesional del usuario.
2. El usuario sube el PDF de su perfil de LinkedIn.
3. Gemini extrae el contenido del PDF y genera un análisis con:
   - Puntaje general (1–10)
   - Titular y resumen mejorados
   - Fortalezas y áreas de mejora
   - Recomendaciones concretas
   - Estrategia de contenido personalizada

## Stack

- **Frontend**: React 19 + Vite + Tailwind CSS → desplegado en GitHub Pages
- **Backend**: Cloudflare Worker (proxy para Gemini API)
- **IA**: Google Gemini 2.5 Flash Lite

## Setup local

```bash
npm install
```

Creá un archivo `.env.local` con:

```
VITE_WORKER_URL=https://<tu-worker>.workers.dev
```

```bash
npm run dev
```

## Deploy

El deploy a GitHub Pages se hace automáticamente vía GitHub Actions al hacer push a `main`.

La variable `VITE_WORKER_URL` debe estar configurada como secret en el repositorio de GitHub (`Settings > Secrets > Actions`).

## Cloudflare Worker

El Worker actúa como proxy CORS para llamadas a la Gemini API. Requiere:

- Secret `GEMINI_API_KEY` configurado en el dashboard de Cloudflare.
- Variable `ALLOWED_ORIGIN` (default: `https://ramirosilvera.github.io`) — se puede sobrescribir desde el dashboard o con `wrangler secret put ALLOWED_ORIGIN`.

Para deployar el Worker:

```bash
cd worker
npx wrangler deploy
```

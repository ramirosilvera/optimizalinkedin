# Radar Laboral — Investigación y Arquitectura
## Feature: "Oportunidades Recomendadas por IA"

> **Estado:** Investigación completa — pendiente de implementación  
> **Rama:** `claude/optimizalk-ai-job-recommendations-R8RYO`  
> **Fecha:** 2026-05-24

---

## Resumen Ejecutivo

**Radar Laboral** transforma OptimizaLK de una herramienta de CV en un **sistema operativo de empleabilidad**. El usuario ya tiene diagnóstico, CV optimizado, y Kanban — le falta el destino. Radar Laboral cierra ese loop: analiza el perfil real del usuario y encuentra oportunidades donde tiene más probabilidad de ser contratado.

**Costo estimado por sesión:** `$0.00071 USD` (frío) / `$0.00036 USD` (con caché)  
**Fuentes de empleos día 1:** RemoteOK + Remotive + Jobicy — sin costo, sin auth  
**Stack adicional necesario:** Cero nueva infraestructura. Todo entra en el Worker existente + 3 tablas Supabase nuevas.

---

## Tabla de Contenidos

1. [Posicionamiento del Feature](#1-posicionamiento)
2. [Flujo de Usuario Rediseñado](#2-flujo-de-usuario)
3. [Fuentes de Empleos — Investigación Completa](#3-fuentes-de-empleos)
4. [Arquitectura de IA para Matching](#4-arquitectura-ia-matching)
5. [Arquitectura Backend](#5-arquitectura-backend)
6. [Estrategia de Ingesta y Datos](#6-ingesta-y-datos)
7. [UX Design Specification](#7-ux-design)
8. [Monetización y Pricing](#8-monetizacion)
9. [Costos Estimados Reales](#9-costos)
10. [Riesgos Técnicos](#10-riesgos)
11. [MVP Recomendado](#11-mvp)
12. [Roadmap de Implementación](#12-roadmap)
13. [Configuración Manual Requerida](#13-configuracion-manual)

---

## 1. Posicionamiento

### Nombre
**"Radar Laboral"** — tagline: *"Tu próximo trabajo, encontrado por IA"*

### El Loop que Cierra

```
CV optimizado → [VACÍO ACTUAL] → Kanban → Entrevistas
                      ↑
              Radar Laboral lo llena
```

Sin Radar Laboral, OptimizaLK es una herramienta de preparación sin destino. Con Radar Laboral, es el único lugar donde el profesional LATAM gestiona su carrera de punta a punta.

### Diferenciador vs. Competencia

| Plataforma | Lo que hace |
|---|---|
| LinkedIn Jobs | Muestra empleos, no sabe tu CV real |
| Indeed/Bumeran | Sin IA real, sin prep integrada |
| **Radar Laboral** | Conoce tu CV real → sugiere donde tenés chances → prepara la entrevista |

La ventaja injusta es la **integración vertical**: el contexto del CV, el score de LinkedIn, y el historial de interviews. Eso no se copia en 3 meses.

---

## 2. Flujo de Usuario

```
PASO 0: Registro
→ Usuario sube/crea CV
→ Sistema extrae perfil laboral automáticamente

PASO 1: Diagnóstico LinkedIn (EXISTENTE)
→ Score del perfil
→ [NUEVO TRIGGER] → "Tu perfil está listo. Veamos qué oportunidades existen."
→ CTA: "Activar Radar Laboral"

PASO 2: CV Generation (EXISTENTE)
→ Usuario genera/optimiza CV
→ [NUEVO TRIGGER] → "¿Querés ver los 5 puestos donde más chances tenés ahora?"
→ CTA: "Ver mis matches"

PASO 3: RADAR LABORAL ← NUEVO
→ Sistema analiza CV + perfil
→ Muestra resultados rankeados por compatibilidad
→ Cada card: % match, empresa, título, fortalezas, gaps, salario estimado
→ Acciones: [Guardar en Kanban] [Adaptar CV] [Preparar entrevista]

PASO 4: Kanban (EXISTENTE — ahora con datos reales)
→ Las oportunidades guardadas aparecen pre-llenadas
→ Columna inicial: "Interesado" o la primera que tenga el usuario

PASO 5: Interview Training (EXISTENTE — ahora contextualizado)
→ Cuando mueve tarjeta a "Entrevista agendada":
→ "Preparamos la entrevista para [Empresa X] / [Puesto Y]?"
→ El trainer se configura con el JD real de la vacante
```

### El "Aha Moment"
Ocurre en **90 segundos**: el usuario ve un empleo que ya conocía pero no había considerado para sí mismo — y el sistema muestra exactamente qué skills suyos hacen match. Eso diferencia Radar de un buscador.

### Triggers de Entrada al Feature

| Trigger | Contexto | Conversión esperada |
|---|---|---|
| Post-CV | Inmediatamente después de generar CV | 60-70% |
| Post-Diagnóstico | "Tu score es 74/100, 8 empleos buscan este perfil" | 40-50% |
| Kanban vacío | Después de 48h sin tarjetas | 30-40% |
| Email semanal | Re-engagement usuarios inactivos | 15-25% |

---

## 3. Fuentes de Empleos

### 3.1 Fuentes Gratuitas — Implementar Día 1

#### RemoteOK
- **URL:** `https://remoteok.com/api`
- **Auth:** Ninguna
- **Formato:** JSON array completo
- **Coverage:** Global remote, tags estructurados, salary en USD
- **Rate limit:** Sin límite oficial; respectar 4 polls/hora
- **ToS:** Requiere attribution + link directo a remoteok.com por listing
- **Calidad de datos:** Alta — structured tags, salary_min/max incluidos
- **Veredicto:** ✅ Integrar día 1

#### Remotive
- **URL:** `https://remotive.com/api/remote-jobs`
- **Auth:** Ninguna
- **Filtro LATAM:** Campo `candidate_required_location` — filtrar por "LATAM", "Latin America", "Americas"
- **Rate limit:** Sin límite; respetar polling razonable
- **Veredicto:** ✅ Integrar día 1

#### Jobicy
- **URL:** `https://jobicy.com/api/v2/remote-jobs?geo=latam&count=50`
- **Auth:** Ninguna
- **Filtro nativo LATAM:** `geo=latam` — el único feed gratuito con filtro geográfico LATAM nativo
- **Rate limit:** **Máximo 1 req/hora por ToS** (respetar estrictamente)
- **Veredicto:** ✅ Integrar día 1 — mejor coverage LATAM gratuito

#### Himalayas
- **URL:** `https://himalayas.app/jobs/api?country=ar&page=1`
- **Auth:** Ninguna
- **Filtro:** `country=`, `seniority=`, `timezone=`
- **Rate limit:** Máx 20 jobs/request; 429 si excedés
- **Veredicto:** ⚠️ Opcional — menor volumen que los anteriores

### 3.2 ATS con APIs Públicas — Implementar Semana 2-4

#### Greenhouse
- **Base URL:** `https://boards-api.greenhouse.io/v1/boards/{token}/jobs`
- **Auth:** Ninguna para GET endpoints
- **Con descripciones:** `?content=true`
- **Rate limit:** Sin límite oficial; API muy cacheada
- **Discovery de tokens:** `https://boards.greenhouse.io/{token}` en la URL de la empresa
- **Empresas LATAM relevantes:** Mercado Libre, Globant, HubSpot, Anthropic, Stripe, Auth0/Okta
- **Veredicto:** ✅ Curar lista de 30-50 empresas, polling cada 4h

#### Lever
- **URL:** `https://api.lever.co/v0/postings/{slug}?mode=json`
- **Auth:** Ninguna
- **Filtros:** `?mode=json&location=Buenos+Aires&team=Engineering`
- **Rate limit:** 10 req/seg (amplio)
- **Empresas LATAM:** Globant, Rappi (verificar slug)
- **Veredicto:** ✅ Curar lista de 15-20 empresas

#### Ashby
- **URL:** `https://api.ashbyhq.com/posting-api/job-board/{name}?includeCompensation=true`
- **Auth:** Ninguna
- **Ventaja única:** `includeCompensation=true` devuelve rangos salariales — el mejor dato salarial de cualquier ATS público
- **Veredicto:** ✅ Integrar — especialmente valioso por salary data

#### SmartRecruiters
- **URL:** `https://api.smartrecruiters.com/v1/companies/{company}/postings`
- **Auth:** Ninguna para lecturas públicas
- **Relevancia:** SAP adquirió SmartRecruiters → creciente importancia para empresas enterprise LATAM
- **Veredicto:** ⚠️ Opcional V2

### 3.3 Cobertura LATAM Local — GetOnBoard + Jooble

#### GetOnBoard (PRIORIDAD ALTA)
- **URL:** `https://www.getonbrd.com/api/v0/jobs?per_page=50&page=1`
- **Auth:** Ninguna
- **Formato:** JSON:API
- **Coverage:** Chile, Argentina, Colombia, México, Perú, Remote LATAM
- **Rate limit:** No documentado; 1 req/30s seguro
- **Veredicto:** ✅ La mejor API nativa LATAM disponible gratuitamente

#### Jooble (ACCESO INDIRECTO A BUMERAN/COMPUTRABAJO/ZONAJOBS)
- **URL:** `POST https://jooble.org/api/{API_KEY}`
- **Auth:** API key gratuita (registro en jooble.org/api/about)
- **Body:** `{"keywords": "...", "location": "Argentina", "page": "1"}`
- **Coverage:** Agrega Bumeran, Computrabajo, ZonaJobs, InfoJobs Argentina — los boards nativos sin API pública
- **Rate limit:** No documentado; arrancar con 1 req/2h, backoff en 429
- **Veredicto:** ✅ Alta prioridad — única forma de acceder a boards LATAM nativos sin scraping

### 3.4 Fuente Paga — JSearch (RapidAPI)

- **URL:** `https://jsearch.p.rapidapi.com/search?query=...&country=ar`
- **Auth:** RapidAPI key
- **Coverage:** Agrega Indeed (scraped) + LinkedIn (scraped) + Glassdoor + Google for Jobs
- **Filtro por país:** `country=ar|mx|co|cl|br`
- **40+ campos** incluyendo salario estructurado
- **Pricing:**
  | Tier | Precio | Requests/mes |
  |---|---|---|
  | Free | $0 | ~200 |
  | Pro | ~$25/mes | ~3.000 |
  | Ultra | ~$75/mes | ~10.000 |
- **Estrategia:** Usar SOLO on-demand cuando Supabase no tiene matches suficientes. NUNCA para ingesta background.
- **Veredicto:** ✅ Integrar Mes 2 como fallback real-time

### 3.5 Fuentes NO Recomendadas

| Fuente | Razón |
|---|---|
| **LinkedIn Jobs API** | Cerrada para startups. No hay API pública en 2026. |
| **Indeed Publisher API** | **DEPRECATED.** Solo existe Sponsored Jobs API ($3 EUR/call). |
| **Workday CXS** | Endpoint no documentado, se rompe sin aviso. Usar JSearch para capturar Workday jobs. |
| **Bumeran/Computrabajo directo** | Sin API pública. Scraping agresivo = anti-bot. Usar Jooble. |

### 3.6 Stack Recomendado por Fase

**Fase 1 — Día 1 (costo $0):**
```
RemoteOK + Remotive + Jobicy(geo=latam)
```

**Fase 2 — Semana 2-4 (costo $0):**
```
+ GetOnBoard + Greenhouse(30 boards) + Lever(15 boards) + Jooble(AR+MX+CO)
```

**Fase 3 — Mes 2+ (costo $25-75/mes):**
```
+ JSearch via RapidAPI (on-demand real-time fallback)
+ Ashby (startups con salary data)
```

---

## 4. Arquitectura IA Matching

### Decisión Central: Arquitectura Híbrida

```
50 jobs fetched
      │
      ▼ Step 1 (0 tokens)
Rule-based pre-filter
  - keyword overlap (skills vs. description)
  - seniority matching
  - industry proximity
  - location/remote
  - language check
      │
      ▼ Top 15 retained
      │
      ▼ Step 2 (AI — 3 batches of 5)
Gemini Flash Lite batch re-ranking
  - reads description carefully
  - corrects seniority mismatches
  - detects implicit requirements
      │
      ▼ Top 10 ranked
      │
      ▼ Step 3 (AI — lazy, on click)
Gap analysis for top 3
  - específico y accionable
  - fires solo cuando usuario hace click en "Ver brecha"
```

**Costo total por sesión:** ~5.300 tokens frío → `$0.00071 USD`  
**Con caché:** ~2.485 tokens → `$0.00036 USD`

### Perfil de Búsqueda (sin tokens)

```javascript
function buildJobSearchProfile(analisis, cv) {
  return {
    cargo_objetivo: analisis.objetivo_laboral || cv.titular,
    seniority: inferSeniority(analisis.años_experiencia, analisis.cargo_actual),
    industria: analisis.industria,
    ubicacion: analisis.ubicacion,
    skills_hard: mergeDedup([
      ...analisis.palabras_clave_sugeridas,
      ...(cv.habilidades || [])
    ]),
    idiomas: cv.idiomas || analisis.idiomas || [],
    años_exp: analisis.años_experiencia,
    objetivo_laboral: analisis.objetivo_laboral,
    cv_quality: cv?.quality?.score,
    profile_score: analisis.puntaje_general,
  }
}
```

### Pesos del Scoring

```javascript
const WEIGHTS = {
  skills:     0.35,  // mayor peso — skills son el predictor más fuerte
  seniority:  0.25,
  industry:   0.20,
  location:   0.12,
  languages:  0.08,
}
```

### Prompt A: Generación de Queries (cacheado 7 días)

```javascript
// ~700 tokens por call. Resultado: 5 queries para buscar empleos.
// Ejemplo input: HR Manager, 8 años, Buenos Aires, tech
// Ejemplo output:
// queries: [
//   "HR Manager Transformación Cultural Buenos Aires",
//   "People Manager LATAM tecnología",
//   "HRBP Senior Argentina",
//   "Head of People tech startup",
//   "Talent Development Manager / Cultura Organizacional"
// ]
```

El prompt completo genera:
- `queries[]` — 5 queries para APIs de empleos
- `cargo_normalizado` — para display
- `seniority_detectado` — confirmación
- `industrias_objetivo[]` — para filtros
- `skills_top5[]` — para matching

### Prompt B: Batch Matching (3 calls × 5 jobs)

Input: perfil resumido + 5 job descriptions (max 300 chars c/u)  
Output: por cada job:
```json
{
  "job_id": "...",
  "match_score": 0-100,
  "skills_match": 0-100,
  "seniority_match": 0-100,
  "fortalezas": ["liderazgo de equipos", "HR analytics"],
  "gaps": ["inglés avanzado recomendado"]
}
```

**~1.200 tokens por call. 3 calls = 3.600 tokens totales.**

### Prompt C: Gap Analysis (lazy — solo en click)

Input: perfil + top 3 jobs  
Output: por cada job:
```json
{
  "job_id": "...",
  "brecha_principal": "...",
  "accion_inmediata": "Completá un curso de Google Analytics en Coursera",
  "tiempo_estimado": "1 mes",
  "prioridad": "Alta",
  "consejo_candidatura": "..."
}
```

**~1.000 tokens. Solo si el usuario hace click — 30-40% de usuarios.**

### Skill Synonym Map (0 tokens, alto impacto)

Archivo estático `skill_synonyms.json` con ~200 entradas:
```json
{
  "recursos humanos": ["rrhh", "hr", "human resources", "people"],
  "gestión de proyectos": ["project management", "pm", "pmo", "scrum master"],
  "análisis de datos": ["data analytics", "bi", "business intelligence", "tableau"]
}
```

Esto hace que el pre-filter de keywords sea tan preciso como si fuera IA, sin tokens.

### Estrategia de Caché

| Capa | Clave | TTL | Contenido |
|---|---|---|---|
| Cloudflare KV | `jq:{userId}` | 7 días | Queries generadas por IA |
| Cloudflare KV | `jp:{userId}` | 7 días | Profile object interpretado |
| Cloudflare KV | `jl:{queryHash}` | 4 horas | Job listings raw por query |
| Cloudflare KV | `jar:{userId}:{batchHash}` | 4 horas | Resultados batch AI |
| Supabase | `job_cache` | 24-45 días | Jobs normalizados |
| Supabase | `job_recommendations` | 60 días | Matches con scores por usuario |

**Invalidación:** Nueva diagnosis → invalida `jq:` y `jp:` del usuario.  
**Cache hit rate esperado:** 85% en queries, 45% en batch matches → reducción de tokens de 5.300 a ~2.485 en steady state.

---

## 5. Arquitectura Backend

### Nuevas Acciones en el Worker

#### `ai_job_recommendations` (acción principal)
```
Input: { profile_text, queries[], location, remote_ok, count, user_id }

1. Validate inputs (min 50 chars profile_text)
2. checkJobSearchRateLimit() — free: 5/día, premium: 30/día
3. queryHash = SHA256(canonical JSON)
4. Check KV cache → HIT: return immediately
5. Check Supabase job_cache → HIT: warm KV + return
6. Fan-out fetch: RemoteOK + Remotive + Jobicy + GetOnBoard (parallel, 10s timeout)
7. Normalize + dedup
8. Pre-filter top 15 (rule-based, 0 tokens)
9. Gemini batch matching (3 calls × 5 jobs)
10. Save to job_recommendations + historial (ctx.waitUntil)
11. Return top-N with scores + rec_id
```

#### `job_save_to_kanban`
Convierte un `job_recommendations` row en `postulaciones` existente:
```javascript
{
  empresa: job.company,
  puesto: job.title,
  link_aviso: job.url,
  notas: recommendation.summary,
  columna_id: first_kanban_column,  // auto-resolved
}
```

#### `job_update_status`
PATCH liviano a `job_recommendations.status`:
- `'new'` → `'seen'` (al cargar)
- `'seen'` → `'saved'` (bookmark)
- `'seen'` → `'dismissed'` (swipe away)
- `'saved'` → `'applied'` (usuario confirma)

### Nuevas Tablas Supabase

#### `job_cache` (central)
```sql
CREATE TABLE job_cache (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source          text NOT NULL CHECK (source IN (
    'remoteok','remotive','jobicy','greenhouse','lever',
    'ashby','getonbrd','jooble','jsearch','adzuna'
  )),
  external_id     text NOT NULL,
  UNIQUE (source, external_id),
  title           text NOT NULL,
  company         text,
  company_logo    text,
  description     text,             -- max 6.000 chars
  location_text   text,
  country_codes   text[] DEFAULT '{}',
  is_remote       boolean DEFAULT false,
  is_latam_eligible boolean DEFAULT false,
  salary_min      integer,
  salary_max      integer,
  salary_currency char(3),
  skills          text[] DEFAULT '{}',
  seniority       text,
  industry        text,
  apply_url       text,
  posted_at       timestamptz,
  expires_at      timestamptz DEFAULT now() + interval '30 days',
  fetched_at      timestamptz DEFAULT now(),
  tombstoned      boolean DEFAULT false
);

CREATE INDEX ON job_cache (is_latam_eligible, seniority, posted_at DESC)
  WHERE expires_at > now() AND tombstoned = false;
CREATE INDEX ON job_cache USING gin(to_tsvector('spanish', title || ' ' || coalesce(company,'')));
```

#### `job_recommendations` (por usuario)
```sql
CREATE TABLE job_recommendations (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid REFERENCES auth.users NOT NULL,
  job_cache_id    uuid REFERENCES job_cache(id) ON DELETE SET NULL,
  -- Snapshot denormalizado (sobrevive si job_cache expira)
  job_title       text NOT NULL,
  job_company     text,
  job_url         text,
  job_location    text,
  -- AI results
  match_score     numeric(4,2),
  strengths       text[],
  gaps            text[],
  summary         text,
  -- User interaction
  status          text DEFAULT 'new' CHECK (status IN ('new','seen','saved','applied','dismissed')),
  -- Metadata
  source_queries  text[],
  created_at      timestamptz DEFAULT now(),
  expires_at      timestamptz DEFAULT now() + interval '60 days'
);

CREATE INDEX ON job_recommendations (user_id, created_at DESC);
CREATE INDEX ON job_recommendations (user_id, status) WHERE status IN ('saved','applied');

ALTER TABLE job_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own recommendations" ON job_recommendations
  FOR ALL USING (auth.uid() = user_id);
```

#### `job_searches` (caché de búsquedas)
```sql
CREATE TABLE job_searches (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES auth.users,
  query_hash  text NOT NULL,
  queries     text[],
  location    text,
  result_ids  uuid[],
  created_at  timestamptz DEFAULT now(),
  expires_at  timestamptz DEFAULT now() + interval '2 hours'
);

CREATE INDEX ON job_searches (query_hash, expires_at DESC);
```

### Rate Limiting (nuevos límites)

```javascript
// Agregar a RATE_LIMITS en worker/index.js:
ai_job_recommendations: { hourly: 5, daily: 15 },
job_search:             { hourly: 10, daily: 30 },
job_save_to_kanban:     { hourly: 20, daily: 100 },
job_update_status:      { hourly: 60, daily: 300 },

// Límites por plan (nuevo checkJobSearchRateLimit):
// Free:    5 recommendation searches/día
// Premium: 30 recommendation searches/día
// KV key:  "jrl:{userId}:{YYYY-MM-DD}"
```

### Integración con Features Existentes

**Job → Kanban:**
- `job_save_to_kanban` crea `postulaciones` row con datos pre-llenados
- Primera columna del usuario como destino automático
- Toast: "Agregado a tu Kanban ✓"

**Job → CV Adapter:**
- Botón "Adaptar CV" llama `ai_job_adapter` existente con `link_aviso = job.url`
- Requiere agregar dominios de job boards al allowlist de `fetch_url` (actualmente solo linkedin.com)
- Agregar: `remoteok.com`, `remotive.com`, `greenhouse.io`, `lever.co`, etc.

**Job → Interview Prep:**
- Botón "Preparar entrevista" llama `ai_interview_questions` existente con `job_title` y `company`
- Cero cambios de backend — solo frontend pasa los parámetros correctos

**Historial:**
```javascript
// tipo: 'job_recommendations'
{
  queries: ["analista datos", "data analyst remote"],
  location: "Buenos Aires",
  remote_ok: true,
  match_count: 8,
  top_match: { title: "Data Analyst Jr", company: "MercadoLibre", score: 87 },
  generated_at: "2026-05-24T14:30:00Z"
}
```

### Manejo de Errores y Fallbacks

| Fallo | Detección | Respuesta |
|---|---|---|
| API de empleos timeout (>10s) | AbortController | Saltar esa fuente, continuar con otras |
| Todas las APIs caídas | `jobs.length === 0` | Mostrar resultados cacheados previos |
| Gemini quota exceeded (429) | `status === 429` | Retornar recomendaciones previas de DB, `fallback: true` |
| AI devuelve JSON inválido | `JSON.parse` throws | Mostrar jobs por recencia sin match score |
| Sin matches (todos < 50) | `matches.length === 0` | "Intentá con términos más amplios" + sugerencias |
| Usuario sin perfil | `profile_text.length < 50` | Bloquear + CTA a completar diagnóstico |

---

## 6. Ingesta y Datos

### Worker de Ingesta Separado

**Razón:** Los Cron Triggers de Cloudflare tienen 30 segundos de wall-clock time y no afectan la latencia del worker principal. Los fetches de 30+ boards de Greenhouse + normalización exceden el límite de CPU del request handler.

```toml
# worker/wrangler-ingestion.toml (nuevo archivo)
name = "optimizalk-ingestion"
main = "ingestion-worker.js"

[triggers]
crons = [
  "*/30 * * * *",   # GetOnBoard (cada 30 min)
  "0 * * * *",      # Jobicy + Greenhouse fast-check (cada hora)
  "0 */4 * * *",    # RemoteOK + Remotive + Greenhouse full + Lever + Jooble (cada 4h)
  "0 2 * * *"       # Cleanup diario (2 AM UTC)
]
```

### Flujo de Datos

```
Ingestion Worker (cron)
  ├─ Fetch RemoteOK → normalize → dedup → upsert Supabase → warm KV
  ├─ Fetch Remotive → normalize → dedup → upsert Supabase
  ├─ Fetch Jobicy(geo=latam) → normalize → dedup → upsert Supabase
  ├─ Fetch GetOnBoard(pages 1-5) → normalize → dedup → upsert Supabase
  ├─ Fetch Greenhouse(30 boards) → normalize → dedup → upsert Supabase
  ├─ Fetch Lever(15 boards) → normalize → dedup → upsert Supabase
  └─ Fetch Jooble(AR+MX+CO) → normalize → dedup → upsert Supabase

Main Worker (on-demand)
  ├─ Check KV cache (jobs:{queryHash}) → HIT: return
  ├─ Check Supabase job_cache → HIT: warm KV + return
  └─ MISS: fetch live (RemoteOK+Remotive+Jobicy) → normalize → AI match → return
```

### Normalización Universal

Cada fuente devuelve campos distintos. El normalizer los mapea al schema universal:

```javascript
// Schema universal — todas las fuentes producen esto:
{
  id: "source:external_id",       // "remoteok:12345"
  source: string,
  external_id: string,
  title: string,
  company: string,
  company_logo: string|null,
  description: string|null,       // max 2.000 chars (truncado)
  location_text: string,
  country_codes: string[],        // ["AR","MX"] o ["WORLDWIDE"]
  is_remote: boolean,
  is_latam_eligible: boolean,     // filtro clave
  salary_min: number|null,
  salary_max: number|null,
  salary_currency: string|null,
  skills: string[],               // max 25
  seniority: string|null,         // "Junior"|"Semi Senior"|"Senior"|"Lead"|"Director"
  industry: string|null,
  apply_url: string,
  posted_at: string|null,
  expires_at: string,             // posted_at + 30d default
  fetched_at: string,
}
```

### Extracción de Skills (0 tokens)

Diccionario de ~350 entries, match con regex por título + descripción. Cubre:
- Lenguajes: Python, JavaScript, Java, React, SQL, etc.
- Cloud: AWS, GCP, Azure, Docker, Kubernetes
- Tools: Excel, Power BI, Salesforce, SAP, HubSpot
- HR terms: Reclutamiento, RRHH, Nómina, NIIF
- Marketing: SEO, SEM, Google Analytics, Social Media
- Soft skills en español: Liderazgo, Gestión de proyectos, etc.

### Deduplicación Cross-Source

```javascript
// Fingerprint = company_normalizado + title_primeras6palabras + country_code
// Ejemplo: "accenture|senior software engineer|ar"

// Prioridad de fuentes (mayor = preferido):
SOURCE_PRIORITY = {
  greenhouse: 8,  // fuente original, más confiable
  lever: 7,
  getonbrd: 7,
  remoteok: 6,
  jobicy: 5,
  remotive: 4,
  jsearch: 3,     // agrega fuentes, más propenso a duplicados
  jooble: 2,
}
```

### Planificación de Capacidad Supabase

```
Jobs nuevos/día (promedio): ~200
TTL promedio: 30 días
Jobs en steady state: 200 × 30 = ~6.000
Tamaño por row: ~2 KB
Storage total: 6.000 × 2 KB = ~12 MB (+ 50% índices = ~18 MB)

Supabase free tier: 500 MB → 3.6% de utilización
Cuándo upgradear: si supera 400 MB → nunca en MVP
```

### Fresquedad y Tombstoning

```javascript
// Detectar jobs cerrados: ausencia en la próxima ingesta
// Si un job estaba en la corrida anterior pero no en la actual → tombstone
// expires_at = now() + 7 días (ventana de tombstone)
// Cleanup diario elimina jobs tombstoned con expires_at < now()
```

### Anti-Bot y Ciudadanía Web

- **User-Agent identificado:** `OptimizaLK/1.0 (career platform; contact: hola@optimizalinkedin.com)`
- **Respetar ToS:** Especialmente Jobicy (1 req/hora hard limit)
- **Jitter entre requests:** 50-200ms entre boards de Greenhouse/Lever
- **Exponential backoff con full jitter** en todos los fetches
- **Cloudflare-on-Cloudflare:** Las APIs oficiales (boards-api.greenhouse.io, api.lever.co) no tienen Bot Fight Mode — seguros.
- **NO usar Workers para HTML scraping** — las IPs de Cloudflare tienen mala reputación en sistemas anti-bot

---

## 7. UX Design

### JobRecommendationsScreen — Layout Principal

```
┌────────────────────────────────────────┐
│ ← Radar Laboral                    🔔  │ ← header sticky
├────────────────────────────────────────┤
│ Hola Martín 👋                         │
│ Encontramos 8 oportunidades           │
│ compatibles con tu perfil             │
├────────────────────────────────────────┤
│ [Remoto ✓] [Argentina ✓] [Senior ✓] ▼ │ ← filtros como chips
├────────────────────────────────────────┤
│ ┌──────────────────────────────────┐   │
│ │ 🏢 People Manager                │   │
│ │    Mercado Libre · Buenos Aires  │   │
│ │                                  │   │
│ │  ████████████░░░  87%            │   │ ← score ring animado
│ │                                  │   │
│ │  ✅ liderazgo de equipos         │   │
│ │  ✅ HR analytics                 │   │
│ │  ✅ experiencia en tech          │   │
│ │  ⚠  inglés avanzado             │   │
│ │                                  │   │
│ │  USD 3.500 – 5.000/mes (est.)   │   │ ← salary estimate
│ │  Publicado hace 3 días           │   │
│ │                                  │   │
│ │  [💾 Guardar] [📄 Adaptar CV]    │   │
│ └──────────────────────────────────┘   │
│                                        │
│ ┌──────────────────────────────────┐   │
│ │ [blurred — Premium]              │   │ ← teaser free users
│ │  ██% match — Desbloquear →       │   │
│ └──────────────────────────────────┘   │
└────────────────────────────────────────┘
```

### Loading States (3-8 segundos de procesamiento)

Secuencia de mensajes con animación:
```
"Leyendo tu perfil..."         (0-1.5s)
"Buscando oportunidades..."    (1.5-3s)
"Calculando compatibilidad..."  (3-5s)
"Priorizando los mejores..."    (5-7s)
[Results appear progressively]
```

Skeleton cards durante la carga para percepción de velocidad.

### Job Card — Especificación Mobile

- Ancho: 100% del viewport en mobile
- Touch targets mínimos: 44×44px
- Font size mínimo: 14px body, 18px score, 20px título
- Swipe derecha: guardar (con animación de corazón)
- Swipe izquierda: descartar (slide-out animation)
- Expandir card: toca para ver descripción completa + gap analysis

### Match Score Visual

- **Componente:** `ScoreRing` existente — reutilizar con colores nuevos
- **Animación:** Count-up de 0 → score en 1.2s al aparecer
- **Colores:**
  - 85-100: `#10B981` (verde esmeralda)
  - 65-84: `#F59E0B` (amarillo)
  - < 65: `#6B7280` (gris — no mostrar rojo, es desmotivador)
- **Label dinámico:**
  - ≥85: "Muy alta compatibilidad"
  - ≥70: "Buena compatibilidad"
  - ≥55: "Compatibilidad media"
  - < 55: no mostrar (ocultar cards < 50%)

### Puntos de Entrada al Feature

**1. Post-CV (conversión más alta):**
```jsx
// En CvScreen, después de generar CV exitosamente:
<div className="radar-prompt">
  <span>🎯 Tu CV está optimizado.</span>
  <p>¿Querés ver dónde aplicarlo?</p>
  <button onClick={() => setScreen('job-recommendations')}>
    Ver mis oportunidades →
  </button>
</div>
```

**2. Post-Diagnóstico:**
```jsx
// En ResultsScreen, debajo del score:
<div className="radar-prompt">
  <p>8 empleos buscan perfiles como el tuyo ahora mismo.</p>
  <button>Activar Radar Laboral</button>
</div>
```

**3. Kanban vacío:**
```jsx
// En TrackingScreen si postulaciones.length === 0 y hace 48h del registro:
<EmptyState
  icon="📡"
  title="Tu Kanban está vacío"
  description="¿Querés que el Radar encuentre oportunidades reales para vos?"
  cta="Buscar oportunidades"
  onCta={() => setScreen('job-recommendations')}
/>
```

### Flujo Job → Kanban

```
Usuario hace click en [💾 Guardar]
          │
          ▼
Llamada a job_save_to_kanban
          │
          ▼
Toast: "✓ Agregado a tu Kanban"
Con link: "Ver en Kanban →"
          │
          ▼
Card obtiene badge "Guardado" (estado visual)
```

### Empty States

```
Sin resultados relevantes:
"No encontramos matches exactos para tu perfil en este momento.
Intentá ampliar la búsqueda o revisitar en 24hs cuando tengamos nuevas ofertas."
[Buscar con términos más amplios]

Sin perfil completo:
"Primero completá tu diagnóstico para que el Radar pueda encontrar
las oportunidades más compatibles con vos."
[Ir al diagnóstico]

Rate limit alcanzado:
"Usaste tus 5 búsquedas de hoy.
Volvé mañana para nuevas oportunidades, o pasate a Premium para búsquedas ilimitadas."
[Ver planes]
```

### Mobile-First Checklist

- [ ] Bottom sheet para filtros (no sidebar)
- [ ] Pull-to-refresh en la lista de cards
- [ ] Sticky header con filtros activos como chips
- [ ] Swipe gestures (right=save, left=dismiss)
- [ ] Bottom navigation integrada si se agrega tab permanente
- [ ] Animación de score count-up en CSS (no JS para performance)
- [ ] Skeleton loading cards (shimmer effect)
- [ ] Minimum touch targets 44×44px en todos los botones

---

## 8. Monetización

### Recomendación: Model C — Freemium con Límites

**Free tier:**
- 2 búsquedas/día
- 5 resultados por búsqueda
- Sin empresa completa (solo industria), sin link directo, sin salary estimate
- Con: % de match, título, seniority, skills gap básico

**Premium (incluido en suscripción existente):**
- Búsquedas ilimitadas
- Empresa completa + link directo
- Salary estimate
- Alertas semanales por email/push
- Gap analysis detallado con acciones concretas
- Historial de búsquedas guardadas

### Pricing

No crear tier nuevo para MVP. **Radar Laboral como beneficio adicional del Premium existente:**
- Copy: "Tu plan Premium ahora incluye Radar Laboral: búsquedas ilimitadas, alertas y salary estimates."
- Esto es upsell por valor, no por precio — más fácil de vender.

**Si se lanza tier separado en V1:**

| Tier | ARS/mes | USD/mes |
|---|---|---|
| Free | $0 | $0 |
| Premium Básico | ARS 4.900 | USD 4.90 |
| Premium Pro | ARS 8.900 | USD 8.90 |

Publicar en USD, cobrar en ARS al tipo de cambio del día (Mercado Pago lo maneja).

### Features de Retención (prioridad)

| Feature | Prioridad | Impacto | Complejidad |
|---|---|---|---|
| Alertas semanales email | MVP | 5/5 | 2/5 |
| Application probability score | MVP | 4/5 | 2/5 |
| Salary estimates | V1 | 5/5 | 2/5 |
| Skills gap tracker | V1 | 5/5 | 3/5 |
| Weekly career report email | V1 | 4/5 | 2/5 |
| Dream companies watchlist | V2 | 3/5 | 3/5 |

### Momentos de Referido Viral

1. **Salary Surprise:** "El Radar me dijo que debería ganar USD 2.500/mes y ganaba 1.800" → share en LinkedIn
2. **Match Score alto:** "Calificás para esto" → share card visual con % y nombre del puesto
3. **Skill Gap Revelation:** "Aprender X me abre 40 empleos más" → insight accionable que se comparte

**Programa de referidos:** Reutilizar el sistema de promo codes existente (OPTIMIZA30):
- Referidor: 30 días premium gratis por cada amigo registrado
- Referido: 15 días premium al registrarse con link

---

## 9. Costos Estimados Reales

### Gemini Flash Lite Pricing
- Input: $0.075/1M tokens
- Output: $0.30/1M tokens

### Costo por Sesión

| Etapa | Tokens input | Tokens output | Subtotal |
|---|---|---|---|
| Query generation | 500 | 200 | $0.000038 + $0.000060 |
| Batch matching (3 calls) | 2.700 | 900 | $0.000203 + $0.000270 |
| Gap analysis (lazy) | 700 | 300 | $0.000053 + $0.000090 |
| **Total frío** | **3.900** | **1.400** | **$0.000713** |

**Con caché (steady state):**
- Query generation (85% hit): $0.000006
- Batch matching (45% hit): $0.000260
- Gap analysis (60% hit): $0.000057
- **Total cacheado: $0.000323**

### Proyección de Escala

| Usuarios/día | Costo IA/día (frío) | Costo IA/mes | Costo con caché/mes |
|---|---|---|---|
| 100 | $0.07 | $2.14 | $0.97 |
| 1.000 | $0.71 | $21.40 | $9.70 |
| 10.000 | $7.13 | $213 | $97 |

### Costo Total de Infraestructura (MVP)

| Componente | Costo/mes |
|---|---|
| Gemini Flash Lite (100 users/día) | $2-3 |
| Cloudflare Workers (free tier) | $0 |
| Cloudflare KV (free tier) | $0 |
| Supabase (free tier) | $0 |
| JSearch Pro (Mes 2+) | $25 |
| **Total MVP** | **$2-28/mes** |

### Validación de la Sospecha Original

✅ **Confirmado:** Si la IA solo hace matching/ranking (no scraping, no navegación), el costo real de tokens es **MUY bajo** — $0.00071/sesión en frío, $0.00036 con caché. La IA no es el costo a preocupar; el costo a optimizar es el de las APIs de terceros (JSearch) si se escala.

---

## 10. Riesgos Técnicos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Resultados no relevantes — usuario decepcionado | Alta en MVP sin datos reales | Crítico | Comunicar "sugerencias de tipos de puestos" en MVP; feedback thumbs up/down desde día 1 |
| Workday jobs no disponibles | Baja (usando JSearch como proxy) | Bajo | JSearch captura Workday indirectamente |
| Jooble cambia rate limits sin aviso | Media | Medio | Aggressive backoff; fallback a GetOnBoard |
| JSearch sube precios | Baja-Media | Medio | Pre-indexar en Supabase; JSearch solo para fallos de caché |
| Gemini quota exceeded en pico | Baja | Alto | Fallback a resultados previos del usuario; alertas de quota monitoring existentes |
| Workday CXS se rompe (si se usa) | Alta (no documentado) | Alto | No usar en MVP; usar JSearch |
| Costo IA runaway | Baja | Alto | Rate limiting por usuario + alertas en admin dashboard existente |
| Bumeran/Computrabajo sin cobertura | Cierto (sin API) | Medio | Jooble como proxy; partnerships V2 |
| Datos LATAM sesgados en Gemini | Media | Medio | Forzar contexto local en prompts; salary estimates con disclaimer |

---

## 11. MVP Recomendado

### Alcance MVP (4 semanas, 1 developer)

**Incluir:**
- Fuentes: RemoteOK + Remotive + Jobicy (gratuitas, sin auth)
- IA: Query generation + Batch matching (Prompts A y B)
- UI: `JobRecommendationsScreen` con cards, score visual, filtros básicos
- Acciones: Guardar en Kanban, link a Adaptar CV, link a Interview Prep
- Rate limiting: 5 búsquedas/día free, ilimitado premium
- Monetización: Feature gate — free ve teaser 2 cards borrosas, premium ve todo
- Analytics: Tracking de búsquedas + saves a Kanban en GA4 + ai_usage_logs

**No incluir en MVP:**
- Worker de ingesta background (usar on-demand)
- Gap analysis detallado (solo en click — se lanza en V1)
- Salary estimates
- Job alerts email
- GetOnBoard, Greenhouse, Lever, Jooble (agregar en V1)
- JSearch (agregar en V1/V2)

### Validación del MVP

**El MVP funciona si a los 90 días:**
- ≥40% de usuarios nuevos abren Radar en los primeros 7 días
- ≥15% de las búsquedas terminan en "Guardar en Kanban"
- ≥5% de usuarios free intentan upgrade después de ver el teaser
- NPS de usuarios de Radar ≥ NPS baseline de OptimizaLK

**Si < 15% salvan al Kanban:** El matching no es suficientemente relevante — revisar prompts y pre-filtros.  
**Si < 5% intentan upgrade:** El teaser no muestra suficiente valor — cambiar qué se muestra vs. qué se oculta.

---

## 12. Roadmap de Implementación

### Semana 1-2: MVP Core
```
[ ] Migration: crear tablas job_cache, job_recommendations, job_searches en Supabase
[ ] Worker: acción ai_job_recommendations (on-demand fetch + AI match)
[ ] Worker: acción job_save_to_kanban
[ ] Worker: acción job_update_status
[ ] Frontend: JobRecommendationsScreen básica
[ ] Frontend: Job card component con score ring
[ ] Frontend: Trigger post-CV (CTA en CvScreen)
[ ] Analytics: tracking de eventos Radar en GA4
```

### Semana 3-4: MVP Polish + Gate
```
[ ] Frontend: Loading states (skeleton + progress messages)
[ ] Frontend: Empty states y error states
[ ] Frontend: Premium teaser (2 cards borrosas para free)
[ ] Frontend: Filtros básicos (remote, seniority)
[ ] Frontend: Trigger post-diagnóstico (CTA en ResultsScreen)
[ ] Worker: Rate limiting por usuario (5/día free, 30/día premium)
[ ] Testing: 5-10 perfiles de prueba distintos
```

### Mes 2: V1 — Fuentes Reales
```
[ ] Ingestion worker separado con Cron Triggers
[ ] Fuentes: GetOnBoard + Greenhouse(30 boards) + Lever(15 boards) + Jooble(AR+MX+CO)
[ ] Normalizers para todas las fuentes
[ ] Skill extractor (diccionario ~350 entries)
[ ] Deduplicación cross-source
[ ] Gap analysis detallado (Prompt C, lazy)
[ ] Salary estimates (en AI match prompt)
[ ] Weekly job alerts email (cron + Resend/EmailJS)
[ ] JSearch como fallback real-time
[ ] Frontend: Job detail view / bottom sheet
[ ] Frontend: Swipe gestures (mobile)
```

### Mes 3-4: V2 — Employment OS Completo
```
[ ] Dream companies watchlist
[ ] Weekly career report email completo
[ ] Integración directa: Radar → Interview Trainer con JD real pre-cargado
[ ] Skills roadmap ("Si aprendés X, matcheás 40 empleos más")
[ ] Share cards para LinkedIn (salary surprise, match score)
[ ] Onboarding rediseñado: Radar como primer feature visible
[ ] Páginas SEO: "Cuánto gana un [rol] en [país]"
[ ] Admin dashboard: panel de health de ingesta
[ ] Evaluación primer acuerdo B2B piloto
```

---

## 13. Configuración Manual Requerida

### Secretos de Cloudflare Workers (wrangler secret put)

```bash
# Necesarios para MVP (las fuentes gratuitas no requieren keys):
# Ninguno nuevo — solo las variables existentes de Gemini/Supabase

# Para V1:
wrangler secret put JOOBLE_KEY          # Registrar en jooble.org/api/about (gratis)
wrangler secret put ADZUNA_APP_ID       # Registrar en developer.adzuna.com (gratis)
wrangler secret put ADZUNA_APP_KEY      # Ídem

# Para V2:
wrangler secret put JSEARCH_API_KEY     # Registrar en RapidAPI, plan Pro ($25/mes)
```

### Variables de Entorno (wrangler.toml)

```toml
# Para el worker de ingesta (nuevo):
[vars]
GREENHOUSE_BOARDS_JSON = '["mercadolibre","globant","auth0","stripe","twilio","gitlab","cloudflare","hashicorp"]'
LEVER_BOARDS_JSON = '["etermax","despegar"]'
JOOBLE_LOCATIONS = '["Argentina","Mexico","Colombia","Chile"]'

# Cron triggers (agregar al wrangler.toml del worker de ingesta):
[triggers]
crons = ["*/30 * * * *", "0 * * * *", "0 */4 * * *", "0 2 * * *"]
```

### Supabase — Migraciones a Ejecutar

```
1. Ejecutar: supabase/job_recommendations.sql (tablas nuevas)
2. Verificar RLS policies en job_recommendations
3. Verificar que historial.tipo acepta 'job_recommendations' (puede requerir ALTER CHECK)
4. Crear índice GIN para full-text search en job_cache
```

### APIs a Registrar Manualmente

| API | URL | Tier | Costo | Cuándo |
|---|---|---|---|---|
| Jooble | jooble.org/api/about | Free | $0 | MVP |
| GetOnBoard | Sin registro necesario | Public | $0 | MVP |
| Greenhouse | Sin registro necesario | Public | $0 | MVP |
| Lever | Sin registro necesario | Public | $0 | MVP |
| Adzuna | developer.adzuna.com | Free | $0 | V1 opcional |
| JSearch (RapidAPI) | rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch | Pro | $25/mes | V1 |

### Archivos a Crear

```
worker/job_recommendations.js      — módulo principal (acciones)
worker/ingestion-worker.js         — worker de ingesta separado
worker/normalizers.js              — normalizers de todas las fuentes
worker/skill_synonyms.json         — diccionario de sinónimos (~200 entries)
worker/skills_dictionary.json      — diccionario de skills (~350 entries)
worker/greenhouse_boards.json      — lista curada de board tokens
worker/lever_boards.json           — lista curada de slugs
supabase/job_recommendations.sql   — migración de tablas
src/components/screens/JobRecommendationsScreen.jsx  — pantalla principal (ya existe)
```

### Boards de Greenhouse a Curar

Verificar manualmente los board tokens en `https://boards.greenhouse.io/{token}`:

```
mercadolibre, globant, auth0, stripe, twilio, gitlab, cloudflare,
hashicorp, hubspot, brex, figma, canva, notion, linear, vercel,
shopify, atlassian, datadog, snowflake, mongodb, elastic, fastly,
1password, duolingo, anthropic, openai, cursor, supabase, planetscale
```

### Integración: Allowlist de fetch_url

Actualmente `fetch_url` solo acepta `https://www.linkedin.com/in/`. Para que "Adaptar CV" funcione desde recomendaciones, agregar al allowlist:

```javascript
const JOB_URL_ALLOWLIST = [
  'https://remoteok.com/',
  'https://remotive.com/',
  'https://jobicy.com/',
  'https://greenhouse.io/',
  'https://boards.greenhouse.io/',
  'https://api.lever.co/',
  'https://jobs.lever.co/',
  'https://jobs.ashbyhq.com/',
  'https://www.getonbrd.com/',
]
```

---

## Apéndice A: Tabla de Decisiones Clave

| Decisión | Opción elegida | Alternativas | Razón |
|---|---|---|---|
| Ingesta | On-demand MVP, cron en V1 | Solo cron | Menor complejidad inicial, validar demanda primero |
| AI Matching | Hybrid (rules + AI top 15) | Full AI por job | Costo 10x menor, calidad 90%+ |
| Workday | Skip en MVP, JSearch en V1 | CXS directo | CXS muy frágil, JSearch lo captura |
| LinkedIn API | No usar | Partnership | Cerrada para startups en 2026 |
| Indeed API | No usar | Pagar | Deprecada para búsqueda |
| Storage | Supabase (jobs) + KV (caché) | Solo KV | KV no es queryable, Supabase necesario para filtros |
| Modelo free | Freemium con límites | Solo premium | LATAM necesita demo de valor antes de pagar |
| Gap analysis | Lazy (en click) | En cada búsqueda | Ahorra 30-40% de tokens |
| Cache TTL | 4h KV, 24-45 días Supabase | Más corto | Jobs cambian lento, caché larga = bajo costo |
| Monetización | Agregar a plan Premium existente | Tier nuevo | Menor fricción de venta |

---

## Apéndice B: North Star Metrics

```
Métrica primaria:  "Oportunidades laborales gestionadas desde OptimizaLK"
Definición:        Tarjetas de Kanban creadas desde una recomendación de Radar

Target 90 días:    1.000 oportunidades gestionadas
                   (~200 usuarios activos × 5 acciones c/u)

Dashboard semanal (para el founder):
  1. Búsquedas totales esa semana
  2. % que terminaron en "Guardar en Kanban" (target: ≥15%)
  3. Nuevos premium upgrades atribuidos a Radar
  4. Tasa de queries con 0 resultados (señal de calidad de fuentes)
  5. Costo total Gemini esa semana (alerta si >$10/semana sin justificación)
```

---

*Documento generado por investigación multi-agente paralela (6 agentes especializados).  
Próximo paso: implementar MVP según Semanas 1-2 del Roadmap.*

// ══════════════════════════════════════════════════════════════════════════════
// AI Job Recommendations — Integration Patch for worker/index.js
//
// HOW TO APPLY:
//   1. Copy the four handler imports at the top of this file into worker/index.js
//      (add after the existing constants block, before `export default`).
//   2. Add the RATE_LIMITS entries (copy-paste block below).
//   3. Insert the four action blocks (copy-paste blocks below) into the
//      main fetch() handler, BEFORE the `ai_*` catch-all block at line ~1996.
//
// The module at worker/job_recommendations.js is self-contained:
//   - No new npm deps required.
//   - Reuses existing env vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RATE_LIMIT_KV).
//   - Adds two optional env vars: ADZUNA_APP_ID, ADZUNA_APP_KEY.
//   - Reuses existing helpers: supabaseServiceFetch, verifyUserJwt, getUserIdFromToken.
// ══════════════════════════════════════════════════════════════════════════════

// ── STEP 1: Add these imports at the top of worker/index.js ──────────────────
/*
import {
  handleJobSearch,
  handleAiJobRecommendations,
  handleJobSaveToKanban,
  handleJobUpdateStatus,
} from './job_recommendations.js'
*/

// ── STEP 2: Add to RATE_LIMITS object (line ~318 in index.js) ────────────────
/*
  // Job recommendations — these are heavier calls (multi-source fetch + AI)
  // Free-tier limits are enforced separately in checkJobSearchRateLimit()
  // The entries below are the AI-only per-hour guards (prevent burst abuse).
  job_search:             10,   // 10 raw fetches/hour/IP (cached results don't count)
  job_recommendations:     5,   // 5 AI matching calls/hour/IP
  job_save_to_kanban:     20,   // 20 saves/hour/IP (lightweight DB write)
  job_update_status:      60,   // 60 status updates/hour/IP
*/

// ── STEP 3: Add these action blocks inside fetch(), before the `ai_*` block ──
// Insert at approximately line 1995, before:
//   if (typeof body.action === 'string' && body.action.startsWith('ai_')) {

/*

    // ── Job search (raw fetch, no AI) ─────────────────────────────────────────
    if (body.action === 'job_search') {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
      const rl = await checkRateLimit(env, ip, 'job_search')
      if (!rl.ok) {
        return new Response(
          JSON.stringify({ error: { message: `Límite de búsqueda alcanzado (${rl.limit}/hora). Intentá en 60 minutos.` } }),
          { status: 429, headers: corsHeaders }
        )
      }
      return handleJobSearch(body, request, env, ctx, corsHeaders)
    }

    // ── AI job recommendations (fetch + AI match) ─────────────────────────────
    if (body.action === 'ai_job_recommendations') {
      // APP_TOKEN check (same pattern as other ai_* actions)
      if (env.APP_TOKEN) {
        const appToken = request.headers.get('X-App-Token')
        if (appToken !== env.APP_TOKEN) {
          return new Response(JSON.stringify({ error: { message: 'Unauthorized' } }), { status: 401, headers: corsHeaders })
        }
      }
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
      const rl = await checkRateLimit(env, ip, 'job_recommendations')
      if (!rl.ok) {
        return new Response(
          JSON.stringify({ error: { message: `Límite de IA alcanzado (${rl.limit}/hora). Intentá en 60 minutos.` } }),
          { status: 429, headers: corsHeaders }
        )
      }
      // Pass callGeminiApi and logAiUsage by reference so the module can use them
      return handleAiJobRecommendations(body, request, env, ctx, corsHeaders, callGeminiApi, logAiUsage)
    }

    // ── Save recommended job to Kanban ────────────────────────────────────────
    if (body.action === 'job_save_to_kanban') {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
      const rl = await checkRateLimit(env, ip, 'job_save_to_kanban')
      if (!rl.ok) {
        return new Response(
          JSON.stringify({ error: { message: `Límite alcanzado. Intentá en 60 minutos.` } }),
          { status: 429, headers: corsHeaders }
        )
      }
      return handleJobSaveToKanban(body, request, env, ctx, corsHeaders, verifyUserJwt)
    }

    // ── Update recommendation status (seen / saved / applied / dismissed) ─────
    if (body.action === 'job_update_status') {
      return handleJobUpdateStatus(body, request, env, ctx, corsHeaders, verifyUserJwt)
    }

*/

// ── STEP 4: wrangler.toml — no new KV bindings needed ────────────────────────
// RATE_LIMIT_KV is reused (job keys use prefix "jrl:" and "jobs:" to avoid collisions).
// Add these secrets via `wrangler secret put` or the CF dashboard:
//   ADZUNA_APP_ID
//   ADZUNA_APP_KEY
// Both are optional — if missing, Adzuna source is skipped gracefully.

// ── STEP 5: AI_SYSTEM_PROMPTS — nothing to add ───────────────────────────────
// JOB_MATCHING_SYSTEM_PROMPT lives inside job_recommendations.js (not in
// AI_SYSTEM_PROMPTS) because it requires the job list as dynamic user content,
// not a static system_instruction template.  The callGeminiApi function is
// called directly from handleAiJobRecommendations.

// ── STEP 6: ai_usage_logs — feature values ───────────────────────────────────
// No schema change needed.  The existing ai_usage_logs table and logAiUsage()
// function already accept any string in the `feature` column.
// New feature values used:
//   'job_matching_batch'   — AI scoring call in ai_job_recommendations
// (job_search itself doesn't call Gemini, so it doesn't log to ai_usage_logs)

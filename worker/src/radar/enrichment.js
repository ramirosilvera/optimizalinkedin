// worker/src/radar/enrichment.js
// Phase 3: Job Enrichment — clean and enhance raw job data before AI matching
// Adds: HTML-cleaned descriptions, inferred industry, refined seniority, detected modality

import { stripHtml, normalizeSeniority } from '../utils/jobHelpers.js'

const INDUSTRY_SIGNALS = [
  { industry: 'Fintech',       signals: ['fintech', 'pagos', 'payments', 'crypto', 'banking', 'neobank', 'insurtech', 'blockchain'] },
  { industry: 'SaaS/Tech',     signals: ['saas', 'software as a service', 'cloud platform', 'b2b software', 'developer tools', 'api platform'] },
  { industry: 'E-commerce',    signals: ['ecommerce', 'e-commerce', 'marketplace', 'tienda online', 'commerce platform', 'retail tech'] },
  { industry: 'Salud',         signals: ['salud', 'health', 'medical', 'pharma', 'medicina', 'hospital', 'healthtech', 'biotech', 'clinica'] },
  { industry: 'Educación',     signals: ['educación', 'education', 'edtech', 'universidad', 'aprendizaje', 'learning platform', 'academia', 'capacitacion'] },
  { industry: 'Logística',     signals: ['logística', 'logistics', 'supply chain', 'transporte', 'delivery', 'courier', 'fulfillment', 'cadena de abastecimiento'] },
  { industry: 'Consultora',    signals: ['consulting', 'consultora', 'advisory', 'accenture', 'deloitte', 'kpmg', 'pwc', ' ey ', 'mckinsey', 'bcg', 'bain', 'ernst'] },
  { industry: 'Retail',        signals: ['retail', 'supermercado', 'tienda física', 'superstore', 'almacen', 'walmart', 'carrefour'] },
  { industry: 'Manufactura',   signals: ['manufactura', 'manufacturing', 'industrial', 'producción industrial', 'planta', 'fabrica', 'ensamblado'] },
  { industry: 'Telecom',       signals: ['telecom', 'telecomunicaciones', 'telco', 'internet provider', 'isp', 'carrier', 'claro', 'movistar', 'tigo'] },
  { industry: 'Agro',          signals: ['agro', 'campo', 'agricultura', 'ganadería', 'soja', 'agribusiness', 'farming', 'agrotech'] },
  { industry: 'Media',         signals: ['media', 'editorial', 'publicidad agency', 'broadcast', 'periodismo', 'journalism', 'publisher'] },
  { industry: 'Real Estate',   signals: ['real estate', 'inmobiliaria', 'proptech', 'property management', 'desarrollo inmobiliario'] },
  { industry: 'Gaming',        signals: ['gaming', 'videojuego', 'esports', 'mobile game', 'game studio', 'game developer'] },
  { industry: 'Turismo',       signals: ['turismo', 'travel', 'hotel', 'hospitality', 'airbnb', 'booking', 'turistica', 'viajes'] },
]

function inferIndustry(company, description) {
  const text = `${company || ''} ${description || ''}`.toLowerCase()
  for (const { industry, signals } of INDUSTRY_SIGNALS) {
    if (signals.some(sig => text.includes(sig))) return industry
  }
  return null
}

function detectJobModalidad(job) {
  const text = `${job.title || ''} ${job.description || ''} ${job.location || ''}`.toLowerCase()
  if (job.remote === true) return 'remoto'
  if (/100%\s*remoto|fully\s*remote|trabajo\s*remoto|work\s*from\s*home|\bwfh\b/.test(text)) return 'remoto'
  if (/h[íi]brido|hybrid|esquema\s*mixto/.test(text)) return 'hibrido'
  if (/presencial|on.?site|in.?office/.test(text)) return 'presencial'
  return 'no_especificado'
}

function refineSeniority(job) {
  if (job.seniority && job.seniority !== 'No especificado') return job.seniority
  const t = (job.title || '').toLowerCase()
  if (/\b(ceo|cto|cfo|coo|chief|vp\b|vice.?president)\b/.test(t)) return 'Lead'
  if (/\b(director\b|head\s+of\b|country\s+manager)\b/.test(t)) return 'Lead'
  if (/\b(gerente\b|manager\b|jefe\s+de\b|coordinador\b|\blead\b)\b/.test(t)) return 'Lead'
  if (/\bsenior\b|\bsr\.?\b|\bssr\b|semi.?senior/.test(t)) return 'Senior'
  if (/\bjunior\b|\bjr\.?\b|\btrainee\b|\bentry\b|\bpasante\b/.test(t)) return 'Junior'
  return normalizeSeniority(job.title)
}

export function enrichJob(job) {
  const rawDesc   = job.description || ''
  const cleanDesc = rawDesc ? stripHtml(rawDesc).replace(/\s+/g, ' ').trim() : null
  return {
    ...job,
    description: cleanDesc,
    seniority:   refineSeniority(job),
    modalidad:   detectJobModalidad({ ...job, description: cleanDesc }),
    industry:    job.industry || inferIndustry(job.company, cleanDesc),
  }
}

export function enrichJobs(jobs) {
  return jobs.map(enrichJob)
}

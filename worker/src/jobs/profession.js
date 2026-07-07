export function inferProfessionFamily(title) {
  const t = (title || '').toLowerCase()
  if (/\b(rrhh|hrbp|recursos humanos|talent|people ops|hr |learning|capacitac|relaciones laborales|compensaciones|beneficios|cultura organizacional)\b/.test(t)) return 'HR/Personas'
  if (/\b(financ|finanzas|contabilidad|contador|tesoreria|treasury|fp.a|controller|cfo|presupuesto|auditoria|impuestos|tax)\b/.test(t)) return 'Finanzas'
  if (/\b(developer|engineer|frontend|backend|full.?stack|devops|data |cloud|mobile|software|ios|android|qa |testing|sre|platform|machine learning|data scien|analytics engineer|mlops|infra)\b/.test(t)) return 'Tecnología'
  if (/\b(marketing|brand|growth|seo|sem|performance|social media|content|crm |digital|ecommerce|e-commerce|paid media|influencer|community)\b/.test(t)) return 'Marketing/Growth'
  if (/\b(operat|operaciones|supply chain|logistic|logística|procurement|compras|produccion|manufactura|lean|calidad|quality|warehouse|almacen|distribucion)\b/.test(t)) return 'Operaciones'
  if (/\b(sales|ventas|account executive|business development|comercial|key account|channel|revenue|inside sales|preventa)\b/.test(t)) return 'Ventas/BD'
  if (/\b(legal|counsel|abogado|compliance|regulatory|juridic|contrato|contratos|privacidad|gdpr)\b/.test(t)) return 'Legal/Compliance'
  if (/\b(country manager|general manager|director general|gm |ceo|coo|president|head of|vp |vice president|gerente general|managing director)\b/.test(t)) return 'Management General'
  return null
}

// ── Geo-contextual helpers ────────────────────────────────────────────────────
// Extracts the most specific location mentioned in the profile text.
// Used as geo context when scoring jobs — helps Gemini penalize inviable on-site roles.
export function extractCandidateLocation(profileText) {
  const t = (profileText || '').slice(0, 2000).toLowerCase()
  const PATTERNS = [
    { re: /\b(caba|capital federal|ciudad de buenos aires|ciudad aut[oó]noma)\b/, city: 'CABA' },
    { re: /\b(palermo|belgrano|villa crespo|san telmo|recoleta|microcentro|barracas|flores|villa urquiza)\b/, city: 'CABA' },
    { re: /\b(quilmes|mor[oó]n|tigre|lom[aá]s de zamora|avellaneda|bernal|vicente l[oó]pez)\b/, city: 'Gran Buenos Aires' },
    { re: /\b(gran buenos aires|gba)\b/, city: 'Gran Buenos Aires' },
    { re: /\b(buenos aires|provincia de buenos aires)\b/, city: 'Buenos Aires' },
    { re: /\b(c[oó]rdoba)\b/, city: 'Córdoba' },
    { re: /\b(rosario)\b/, city: 'Rosario' },
    { re: /\b(mendoza)\b/, city: 'Mendoza' },
    { re: /\b(tucum[aá]n)\b/, city: 'Tucumán' },
    { re: /\b(mar del plata)\b/, city: 'Mar del Plata' },
    { re: /\b(salta)\b/, city: 'Salta' },
    { re: /\b(santa fe)\b/, city: 'Santa Fe' },
    { re: /\b(la plata)\b/, city: 'La Plata' },
    { re: /\b(bah[ií]a blanca)\b/, city: 'Bahía Blanca' },
    { re: /\b(neuqu[eé]n)\b/, city: 'Neuquén' },
    { re: /\b(argentina)\b/, city: 'Argentina' },
    { re: /\b(venezuela|caracas|maracaibo|valencia|barquisimeto)\b/, city: 'Venezuela' },
    { re: /\b(colombia)\b/, city: 'Colombia' },
    { re: /\b(chile)\b/, city: 'Chile' },
    { re: /\b(m[eé]xico)\b/, city: 'México' },
    { re: /\b(per[uú])\b/, city: 'Perú' },
    { re: /\b(brasil|brazil)\b/, city: 'Brasil' },
    { re: /\b(uruguay)\b/, city: 'Uruguay' },
    { re: /\b(paraguay)\b/, city: 'Paraguay' },
    { re: /\b(bolivia)\b/, city: 'Bolivia' },
    { re: /\b(ecuador)\b/, city: 'Ecuador' },
  ]
  for (const { re, city } of PATTERNS) {
    if (re.test(t)) return city
  }
  return null
}

// Fast synchronous profession detection — no AI, pure regex heuristics.
// Returns { family, seniority_level, is_senior } or null if undetermined.
export function detectProfessionFamilySync(profileText) {
  const t = (profileText || '').slice(0, 2000).toLowerCase()

  let seniority_level = 3
  if (/\b(ceo|cto|coo|cfo|chief\s|c-level|vice\s*president|vp\s+de|vp\s+of|\bvp\b)\b/.test(t)) seniority_level = 6
  else if (/\b(director\s+general|director general|country\s*manager|head\s+of\s+\w+|director\s+de\s+\w+)\b/.test(t)) seniority_level = 5
  else if (/\bgerente\b|\bmanager\b|\bjefe\s+de\s+\w+\b/.test(t)) seniority_level = 5
  else if (/\b(team\s*lead|tech\s*lead|jefe\s+de|coordinador|líder\s+de|supervisor)\b/.test(t)) seniority_level = 4
  else if (/\b(sr\.|senior|especialista)\b/.test(t)) seniority_level = 3
  else if (/\b(semi.?senior|ssr|mid.?level|analista\s+sr)\b/.test(t)) seniority_level = 2
  else if (/\b(junior|jr\.|trainee|pasante|entry.?level|analista\s+jr)\b/.test(t)) seniority_level = 1

  if (/\b(rrhh|recursos\s+humanos|human\s+resources|hr\s+manager|hr\s+business\s+partner|hrbp|talent\s+manager|people\s+manager|gerente\s+de\s+rrhh|gerente\s+de\s+personas|capital\s+humano|nómina|payroll|talent\s+acquisition|onboarding|relaciones\s+laborales|hr\s+generalist|especialista\s+de\s+rrhh|analista\s+de\s+rrhh|especialista\s+en\s+recursos\s+humanos|analista\s+de\s+selecci[oó]n|analista\s+de\s+talento|people\s+business\s+partner|reclutamiento|headhunter\s+interno)\b/.test(t))
    return { family: 'HR/Personas', seniority_level, is_senior: seniority_level >= 4 }

  // Security/cybersecurity — checked BEFORE generic Tecnología so security roles get targeted queries
  if (/\b(seguridad\s+de\s+la\s+informaci[oó]n|information\s+security|ciberseguridad|cybersecurity|cyber\s+security|seguridad\s+inform[aá]tica|security\s+analyst|security\s+engineer|security\s+specialist|soc\s+analyst|soc\s+manager|pentest|penetration\s+test|ethical\s+hack|hacking\s+[eé]tico|ciso|chief\s+information\s+security|gobernanza\s+de\s+seguridad|governance.*risk.*compliance|\bgrc\b|siem|vulnerability\s+management|gesti[oó]n\s+de\s+riesgos\s+ti|riesgos\s+tecnol[oó]gicos|seguridad\s+corporativa|cumplimiento\s+y\s+seguridad)\b/.test(t))
    return { family: 'Tecnología', subfamilia: 'seguridad', seniority_level, is_senior: seniority_level >= 4 }

  if (/\b(software\s+engineer|desarrollador|developer|frontend|backend|fullstack|full.stack|devops|cloud\s+engineer|data\s+engineer|tech\s+lead|engineering\s+manager|ios\s+developer|android\s+dev|mobile\s+dev|arquitecto\s+de\s+software|qa\s+engineer|sre|platform\s+engineer|cto|analista\s+de\s+sistemas|programador|t[eé]cnico\s+en\s+sistemas|especialista\s+en\s+ti|infrastructure\s+engineer|data\s+analyst|ml\s+engineer|machine\s+learning)\b/.test(t))
    return { family: 'Tecnología', seniority_level, is_senior: seniority_level >= 4 }

  if (/\b(gerente\s+financiero|director\s+financiero|finance\s+manager|fp&a|controller|cfo|tesorer[ií]a|treasury|contabl|auditor|impuestos\s+corporativos|presupuesto\s+corporativo|cash\s+flow\s+model|analista\s+financiero|analista\s+contable|contador\s+p[uú]blico|finanzas\s+corporativas|presupuesto|planificaci[oó]n\s+financiera|an[aá]lisis\s+financiero)\b/.test(t))
    return { family: 'Finanzas', seniority_level, is_senior: seniority_level >= 4 }

  if (/\b(marketing\s+manager|brand\s+manager|growth\s+manager|performance\s+marketing|community\s+manager|content\s+manager|seo\s+manager|cmo|head\s+of\s+marketing|gerente\s+de\s+marketing|especialista\s+en\s+marketing|analista\s+de\s+marketing|social\s+media|content\s+creator|email\s+marketing|growth\s+hacking|digital\s+marketing|pauta\s+digital|advertising)\b/.test(t))
    return { family: 'Marketing/Growth', seniority_level, is_senior: seniority_level >= 4 }

  if (/\b(sales\s+manager|gerente\s+comercial|director\s+comercial|key\s+account|business\s+development\s+manager|head\s+of\s+sales|ejecutivo\s+comercial|revenue\s+manager|cro|ejecutivo\s+de\s+ventas|asesor\s+comercial|representante\s+comercial|account\s+executive|ventas|vendedor|sales\s+executive|desarrollo\s+de\s+negocios)\b/.test(t))
    return { family: 'Ventas/BD', seniority_level, is_senior: seniority_level >= 4 }

  if (/\b(operations\s+manager|supply\s+chain\s+manager|gerente\s+de\s+operaciones|director\s+de\s+operaciones|log[ií]stica|procurement\s+manager|coo|lean\s+six\s+sigma|analista\s+de\s+operaciones|coordinador\s+de\s+operaciones|especialista\s+en\s+operaciones|planner|demand\s+planning|inventory|almac[eé]n|distribuci[oó]n|cadena\s+de\s+abastecimiento)\b/.test(t))
    return { family: 'Operaciones', seniority_level, is_senior: seniority_level >= 4 }

  if (/\b(abogado|asesor\s+legal|analista\s+legal|paralegal|abogado\s+senior|abogado\s+corporativo|lawyer|legal\s+manager|compliance\s+manager|counsel|director\s+legal|gerente\s+legal|regulatory|normativa|due\s+diligence|contratos|litigios)\b/.test(t))
    return { family: 'Legal/Compliance', seniority_level, is_senior: seniority_level >= 4 }

  if (/\b(country\s+manager|general\s+manager|director\s+general|gerente\s+general|managing\s+director|regional\s+director|jefe\s+de\s+proyecto|project\s+lead|program\s+manager)\b/.test(t))
    return { family: 'Management General', seniority_level, is_senior: seniority_level >= 4 }

  return null
}

// Generate targeted headhunter search queries for premium users based on profession + seniority.
export function buildHeadhunterQueries(professionInfo, baseQueries, isPremium) {
  if (!professionInfo || !isPremium) return baseQueries.slice(0, 3)

  // Subfamilia-specific query maps — override the generic HEADHUNTER_MAP when detected
  const SUBFAMILIA_MAP = {
    'seguridad': {
      3: ['Analista de Seguridad de la Información', 'Information Security Analyst', 'Cybersecurity Specialist', 'Security Engineer', 'SOC Analyst'],
      4: ['Security Lead', 'Cybersecurity Lead', 'Information Security Lead', 'GRC Lead', 'SOC Lead'],
      5: ['Information Security Manager', 'Cybersecurity Manager', 'Security Manager', 'CISO', 'Head of Cybersecurity'],
      6: ['CISO', 'Chief Information Security Officer', 'VP Cybersecurity', 'Head of Information Security'],
    },
  }

  const HEADHUNTER_MAP = {
    'HR/Personas': {
      3: ['Analista de RRHH Sr', 'HR Generalist', 'Talent Acquisition Specialist', 'People Coordinator', 'HR Specialist'],
      4: ['Jefe de RRHH', 'HRBP', 'HR Lead', 'People Lead', 'Talent Lead'],
      5: ['Gerente de RRHH', 'Gerente de Recursos Humanos', 'Gerente Capital Humano', 'HR Manager', 'Head of People'],
      6: ['Director de RRHH', 'HR Director', 'Chief People Officer', 'VP of People', 'VP HR'],
    },
    'Finanzas': {
      3: ['Senior Financial Analyst', 'Analista Financiero Sr', 'FP&A Analyst', 'Treasury Analyst Sr', 'Controller Analyst'],
      4: ['Jefe de Finanzas', 'FP&A Lead', 'Controller Senior', 'Senior Finance Analyst'],
      5: ['Gerente de Finanzas', 'Finance Manager', 'CFO', 'Director Financiero', 'Head of Finance'],
      6: ['CFO', 'Chief Financial Officer', 'VP Finance', 'Finance Director'],
    },
    'Tecnología': {
      3: ['Senior Software Engineer', 'Senior Backend Developer', 'Senior Full Stack', 'Senior Frontend'],
      4: ['Tech Lead', 'Engineering Lead', 'Team Lead Backend', 'Senior Engineer'],
      5: ['Engineering Manager', 'Head of Engineering', 'VP Engineering', 'Director of Technology'],
      6: ['CTO', 'Chief Technology Officer', 'VP Engineering'],
    },
    'Marketing/Growth': {
      3: ['Senior Marketing Analyst', 'Growth Specialist', 'Performance Specialist', 'Brand Specialist Sr', 'SEO Specialist Sr'],
      4: ['Marketing Lead', 'Growth Lead', 'Brand Manager Senior', 'Performance Lead'],
      5: ['Marketing Manager', 'Head of Marketing', 'Growth Manager', 'Director de Marketing', 'CMO'],
      6: ['CMO', 'Chief Marketing Officer', 'VP Marketing', 'Head of Brand'],
    },
    'Operaciones': {
      3: ['Senior Operations Analyst', 'Supply Chain Specialist', 'Process Improvement Specialist', 'Analista de Operaciones Sr'],
      4: ['Operations Lead', 'Supply Chain Lead', 'Jefe de Operaciones'],
      5: ['Operations Manager', 'Head of Operations', 'Director de Operaciones', 'Supply Chain Manager'],
      6: ['COO', 'Chief Operating Officer', 'VP Operations', 'Operations Director'],
    },
    'Ventas/BD': {
      3: ['Senior Account Executive', 'Business Development Specialist', 'Key Account Sr', 'Sales Executive Sr', 'Ejecutivo Comercial Sr'],
      4: ['Sales Lead', 'Account Manager Senior', 'Jefe de Ventas'],
      5: ['Sales Manager', 'Head of Sales', 'Director Comercial', 'Gerente Comercial', 'VP Sales'],
      6: ['Chief Revenue Officer', 'VP Sales', 'Revenue Director', 'Commercial Director'],
    },
    'Legal/Compliance': {
      3: ['Senior Legal Analyst', 'Compliance Specialist', 'Abogado Sr', 'Regulatory Affairs Specialist'],
      4: ['Legal Counsel', 'Compliance Lead', 'Senior Legal Analyst'],
      5: ['Legal Manager', 'Head of Legal', 'Compliance Manager', 'Director Legal'],
      6: ['General Counsel', 'Chief Legal Officer', 'VP Legal'],
    },
    'Management General': {
      3: ['Senior Project Manager', 'Program Coordinator', 'Business Analyst Sr', 'Project Lead Sr'],
      4: ['Project Manager', 'Team Lead', 'Jefe de Área'],
      5: ['General Manager', 'Country Manager', 'Director General', 'Gerente General'],
      6: ['CEO', 'Managing Director', 'COO', 'Regional Director'],
    },
  }

  const { family, subfamilia, seniority_level } = professionInfo
  const lvl = Math.min(6, Math.max(1, seniority_level || 3))
  const subfamiliaMap = subfamilia ? SUBFAMILIA_MAP[subfamilia] : null
  const levelMap = subfamiliaMap || HEADHUNTER_MAP[family]
  if (!levelMap) return baseQueries.slice(0, 5)

  const availLevels = Object.keys(levelMap).map(Number).sort((a, b) => a - b)
  const bestLevel = availLevels.reduce((prev, cur) => Math.abs(cur - lvl) < Math.abs(prev - lvl) ? cur : prev, availLevels[0])
  const headhunterQueries = levelMap[bestLevel] || []

  const lowerBase = new Set(baseQueries.map(q => q.toLowerCase()))
  const fresh = headhunterQueries.filter(q => !lowerBase.has(q.toLowerCase()))
  // Base queries first so the user's original search terms are always sent to Serper,
  // then headhunter titles to expand coverage.
  return [...baseQueries, ...fresh].slice(0, 5)
}

// ATS hosting domains for boolean site: queries — leads with HiringRoom (dominant AR-local ATS)
export const ATS_SEARCH_DOMAINS = [
  'hiringroom.com', 'teamtailor.com', 'myworkdayjobs.com', 'greenhouse.io',
  'lever.co', 'ashbyhq.com', 'smartrecruiters.com', 'recruitee.com',
]

const AR_BOARD_SEARCH_DOMAINS = [
  'bumeran.com.ar', 'zonajobs.com.ar', 'ar.computrabajo.com',
  'trabajar.com', 'multitrabajos.com.ar', 'linkedin.com/jobs',
]

const siteOr = (domains) => '(' + domains.map(d => `site:${d}`).join(' OR ') + ')'

// Builds a Google boolean query targeting ATS career-page hosting domains.
// Must be sent to Serper /search (NOT /jobs) with autocorrect:false — /jobs strips site:/OR operators.
export function buildAtsBooleanQuery(jobTitle, country = 'Argentina') {
  return `"${jobTitle}" ${siteOr(ATS_SEARCH_DOMAINS)} ${country}`
}

// Builds a Google boolean query targeting high-volume Argentine job boards via site: operators.
export function buildJobBoardQuery(jobTitle, country = 'Argentina') {
  return `"${jobTitle}" ${siteOr(AR_BOARD_SEARCH_DOMAINS)} ${country}`
}

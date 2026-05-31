export function serperGeoConfig(candidateLocation) {
  if (!candidateLocation) return { gl: 'ar', location: 'Argentina', hl: 'es' }
  const loc = candidateLocation.toLowerCase()
  if (/argentina|caba|buenos aires|córdoba|cordoba|rosario|mendoza|tucumán|tucuman|santa fe|mar del plata/.test(loc)) {
    return { gl: 'ar', location: 'Argentina', hl: 'es' }
  }
  if (/colombia/.test(loc))           return { gl: 'co', location: 'Colombia', hl: 'es' }
  if (/chile/.test(loc))              return { gl: 'cl', location: 'Chile', hl: 'es' }
  if (/m[eé]xico|mexico/.test(loc))  return { gl: 'mx', location: 'México', hl: 'es' }
  if (/per[uú]/.test(loc))           return { gl: 'pe', location: 'Perú', hl: 'es' }
  if (/uruguay/.test(loc))           return { gl: 'uy', location: 'Uruguay', hl: 'es' }
  if (/venezuela/.test(loc))         return { gl: 've', location: 'Venezuela', hl: 'es' }
  if (/ecuador/.test(loc))           return { gl: 'ec', location: 'Ecuador', hl: 'es' }
  if (/bolivia/.test(loc))           return { gl: 'bo', location: 'Bolivia', hl: 'es' }
  if (/paraguay/.test(loc))          return { gl: 'py', location: 'Paraguay', hl: 'es' }
  if (/brasil|brazil/.test(loc))     return { gl: 'br', location: 'Brasil', hl: 'pt' }
  return { gl: 'ar', location: 'Argentina', hl: 'es' }
}

// Returns a 0.0–1.0 geo compatibility score for a job vs. the candidate's detected location.
// Only meaningful for on-site / hybrid jobs — remote jobs always score 1.0.
export function geoCompatibilityScore(jobLocation, jobRemote, candidateLocation) {
  if (jobRemote)          return 1.0
  if (!candidateLocation) return 0.55

  const jl = (jobLocation || '').toLowerCase()
  const cl = candidateLocation.toLowerCase()

  if (jl && (jl.includes(cl) || cl.includes(jl.split(',')[0].trim()))) return 1.0

  const BSAS = ['caba','capital federal','buenos aires','gran buenos aires','palermo','belgrano','quilmes','morón','tigre']
  const jlBA = BSAS.some(c => jl.includes(c))
  const clBA = BSAS.some(c => cl.includes(c))
  if (jlBA && clBA) return 0.95

  const AR = ['córdoba','rosario','mendoza','tucumán','mar del plata','salta','santa fe',
               'la plata','bahía blanca','neuquén','argentina']
  const jlAR = jlBA || AR.some(c => jl.includes(c))
  const clAR = clBA || AR.some(c => cl.includes(c))
  if (jlAR && clAR) return 0.60

  const LATAM = ['colombia','chile','méxico','perú','brasil','uruguay','paraguay','bolivia','ecuador']
  const jlLATAM = jlAR || LATAM.some(c => jl.includes(c))
  const clLATAM = clAR || LATAM.some(c => cl.includes(c))
  if (jlLATAM && clLATAM) return 0.45

  return 0.15
}

import { truncateDesc, normalizeSeniority, stripHtml, extractSkillsFromText } from '../utils/jobHelpers.js'

export function normalizeRemoteOK(raw) {
  if (!raw || raw.legal) return []
  return raw
    .filter(j => j && j.id && j.position)
    .map(j => ({
      source:          'remoteok',
      external_id:     String(j.id),
      title:           j.position || '',
      company:         j.company  || '',
      description:     truncateDesc(j.description),
      location:        j.location || 'Remote',
      remote:          true,
      url:             j.url || `https://remoteok.com/remote-jobs/${j.id}`,
      apply_url:       j.url || null,
      salary_min:      j.salary_min  ? parseInt(j.salary_min,  10) : null,
      salary_max:      j.salary_max  ? parseInt(j.salary_max,  10) : null,
      currency:        j.salary_min  ? 'USD' : null,
      skills_required: Array.isArray(j.tags) ? j.tags.slice(0, 15) : [],
      seniority:       normalizeSeniority(j.position),
      industry:        null,
      posted_at:       j.date ? new Date(j.date * 1000).toISOString() : null,
      company_slug:    null,
      ats_type:        null,
    }))
}

export function normalizeRemotive(raw) {
  if (!raw?.jobs) return []
  return raw.jobs.map(j => ({
    source:          'remotive',
    external_id:     String(j.id),
    title:           j.title        || '',
    company:         j.company_name || '',
    description:     truncateDesc(j.description),
    location:        j.candidate_required_location || 'Worldwide',
    remote:          true,
    url:             j.url || '',
    apply_url:       j.url || null,
    salary_min:      null, salary_max: null, currency: null,
    skills_required: Array.isArray(j.tags) ? j.tags.slice(0, 15) : [],
    seniority:       normalizeSeniority(j.title),
    industry:        j.category || null,
    posted_at:       j.publication_date || null,
    company_slug:    null, ats_type: null,
  }))
}

export function normalizeJobicy(raw) {
  if (!raw?.jobs) return []
  return raw.jobs.map(j => ({
    source:          'jobicy',
    external_id:     String(j.id || j.jobId || `${j.companyName||''}::${j.jobTitle||''}::${j.pubDate||''}`),
    title:           j.jobTitle       || '',
    company:         j.companyName    || '',
    description:     truncateDesc(j.jobDescription),
    location:        j.jobGeo         || 'Remote',
    remote:          true,
    url:             j.url            || '',
    apply_url:       j.url            || null,
    salary_min:      null, salary_max: null, currency: null,
    skills_required: Array.isArray(j.jobIndustry) ? j.jobIndustry.slice(0, 10) : [],
    seniority:       normalizeSeniority(j.jobTitle),
    industry:        Array.isArray(j.jobIndustry) ? j.jobIndustry[0] : null,
    posted_at:       j.pubDate || null,
    company_slug:    null, ats_type: null,
  }))
}

export function normalizeJooble(raw) {
  if (!raw?.jobs) return []
  return raw.jobs.map(j => ({
    source:          'jooble',
    external_id:     String(j.id),
    title:           (j.title   || '').trim(),
    company:         (j.company || '').trim(),
    description:     truncateDesc(j.snippet),
    location:        j.location || null,
    remote:          /remote|remoto/.test((j.location || j.title || '').toLowerCase()),
    url:             j.link || '',
    apply_url:       j.link || null,
    salary_min:      null, salary_max: null, currency: null,
    skills_required: [],
    seniority:       normalizeSeniority(j.title),
    industry:        null,
    posted_at:       j.updated || null,
    company_slug:    null, ats_type: null,
  }))
}

export function normalizeAdzuna(raw) {
  if (!raw?.results) return []
  return raw.results.map(j => ({
    source:          'adzuna',
    external_id:     String(j.id),
    title:           j.title || '',
    company:         j.company?.display_name || '',
    description:     truncateDesc(j.description),
    location:        j.location?.display_name || null,
    remote:          (j.title || j.description || '').toLowerCase().includes('remote'),
    url:             j.redirect_url || '',
    apply_url:       j.redirect_url || null,
    salary_min:      j.salary_min ? Math.round(j.salary_min) : null,
    salary_max:      j.salary_max ? Math.round(j.salary_max) : null,
    currency:        j.salary_min ? 'ARS' : null,
    skills_required: [],
    seniority:       normalizeSeniority(j.title),
    industry:        j.category?.label || null,
    posted_at:       j.created || null,
    company_slug:    null, ats_type: null,
  }))
}

export function normalizeGetOnBoard(raw) {
  if (!raw?.data) return []
  return raw.data.map(j => {
    const a = j.attributes || {}
    return {
      source:          'getonboard',
      external_id:     String(j.id || Math.random()),
      title:           a.title || '',
      company:         a.company?.data?.attributes?.name || a.company?.name || '',
      description:     truncateDesc(a.functions || a.description || ''),
      location:        a.country || null,
      remote:          !!(a.remote_friendly),
      url:             `https://www.getonbrd.com/jobs/${j.id}`,
      apply_url:       a.applications_url || null,
      salary_min:      null, salary_max: null, currency: null,
      skills_required: [],
      seniority:       normalizeSeniority(a.title || ''),
      industry:        null,
      posted_at:       a.published_at || null,
      company_slug:    null,
      ats_type:        null,
    }
  })
}

export function normalizeHimalayas(raw) {
  const jobs = raw?.jobs || []
  return jobs.map(j => ({
    source:          'himalayas',
    external_id:     String(j.id || Math.random()),
    title:           j.title || '',
    company:         j.company?.name || '',
    description:     truncateDesc(j.description || ''),
    location:        j.location || j.country || null,
    remote:          !!(j.remote ?? true),
    url:             j.url || `https://himalayas.app/jobs/${j.id}`,
    apply_url:       j.applyUrl || null,
    salary_min:      j.salary?.min || null,
    salary_max:      j.salary?.max || null,
    currency:        j.salary?.currency || null,
    skills_required: [],
    seniority:       normalizeSeniority(j.title || ''),
    industry:        j.category || null,
    posted_at:       j.publishedAt || null,
    company_slug:    j.company?.slug || null,
    ats_type:        null,
  }))
}

export function normalizeWorkable(raw, companyMeta) {
  const jobs = raw?.results || []
  return jobs.map(j => ({
    source:          'workable',
    external_id:     j.shortcode || String(Math.random()),
    title:           j.title || '',
    company:         companyMeta.name,
    description:     truncateDesc(j.description || ''),
    location:        [j.city, j.country].filter(Boolean).join(', ') || null,
    remote:          j.remote === true,
    url:             j.url || `https://apply.workable.com/${companyMeta.slug}/j/${j.shortcode}`,
    apply_url:       j.url || null,
    salary_min:      null, salary_max: null, currency: null,
    skills_required: [],
    seniority:       normalizeSeniority(j.title || ''),
    industry:        j.department || companyMeta.industries?.[0] || null,
    posted_at:       null,
    company_slug:    companyMeta.slug,
    ats_type:        'workable',
  }))
}

export function normalizeTeamtailor(raw, companyMeta) {
  const jobs = raw?.data || []
  return jobs.map(j => {
    const a = j.attributes || {}
    return {
      source:          'teamtailor',
      external_id:     String(j.id || Math.random()),
      title:           a.title || '',
      company:         companyMeta.name,
      description:     truncateDesc(a['body-text'] || a.pitch || ''),
      location:        a.city || a.country || null,
      remote:          ['fully', 'hybrid'].includes(a['remote-status']),
      url:             a['career-page-url'] || `https://${companyMeta.slug}.teamtailor.com/jobs/${j.id}`,
      apply_url:       a['apply-url'] || null,
      salary_min:      null, salary_max: null, currency: null,
      skills_required: [],
      seniority:       normalizeSeniority(a.title || ''),
      industry:        companyMeta.industries?.[0] || null,
      posted_at:       a['created-at'] || null,
      company_slug:    companyMeta.slug,
      ats_type:        'teamtailor',
    }
  })
}

export function normalizeRecruitee(raw, companyMeta) {
  const offers = raw?.offers || []
  return offers.map(j => {
    const descText = truncateDesc(stripHtml(j.description || ''))
    return {
      source:          'recruitee',
      external_id:     String(j.id || Math.random()),
      title:           j.title || '',
      company:         companyMeta.name,
      description:     descText,
      location:        j.city || j.location || null,
      remote:          j.remote === true,
      url:             j.careers_url || `https://${companyMeta.slug}.recruitee.com/o/${j.slug}`,
      apply_url:       j.careers_apply_url || null,
      salary_min:      null, salary_max: null, currency: null,
      skills_required: extractSkillsFromText(descText),
      seniority:       normalizeSeniority(j.title || ''),
      industry:        j.department || companyMeta.industries?.[0] || null,
      posted_at:       j.created_at || null,
      company_slug:    companyMeta.slug,
      ats_type:        'recruitee',
    }
  })
}

export function normalizePersonio(raw, companyMeta) {
  const positions = raw?.data?.positions || raw?.positions || raw?.jobs || []
  return positions.map(j => ({
    source:          'personio',
    external_id:     String(j.id || Math.random()),
    title:           j.name || j.title || '',
    company:         companyMeta.name,
    description:     truncateDesc(stripHtml(j.description || '')),
    location:        j.office?.name || j.location || null,
    remote:          /remot|teletrabajo/i.test(j.office?.name || j.location || ''),
    url:             j.url || j.application_url || `https://${companyMeta.slug}.jobs.personio.com/${j.id}`,
    apply_url:       j.application_url || null,
    salary_min:      null, salary_max: null, currency: null,
    skills_required: [],
    seniority:       normalizeSeniority(j.name || j.title || ''),
    industry:        j.department?.name || companyMeta.industries?.[0] || null,
    posted_at:       j.created_at || null,
    company_slug:    companyMeta.slug,
    ats_type:        'personio',
  }))
}

export function normalizeWorkday(raw, companyMeta) {
  const postings = raw?.jobPostings || []
  const boardBase = companyMeta.cxsUrl
    ? (() => { try { return new URL(companyMeta.cxsUrl).origin } catch { return '' } })()
    : ''
  return postings.map(j => {
    const extPath = j.externalPath || ''
    return {
      source:          'workday',
      external_id:     extPath.split('/').pop() || String(Math.random()),
      title:           j.title || '',
      company:         companyMeta.name,
      description:     truncateDesc(j.briefDescription || (j.bulletFields || []).join(' ')),
      location:        j.locationsText || null,
      remote:          /remot/i.test(j.locationsText || ''),
      url:             boardBase ? `${boardBase}${extPath}` : '',
      apply_url:       null,
      salary_min:      null, salary_max: null, currency: null,
      skills_required: [],
      seniority:       normalizeSeniority(j.title || ''),
      industry:        companyMeta.industries?.[0] || null,
      posted_at:       j.postedOn || null,
      company_slug:    companyMeta.slug,
      ats_type:        'workday',
    }
  })
}

export function normalizeSerper(raw) {
  const jobs = raw?.jobs || []
  return jobs.map(j => ({
    source:          'serper',
    external_id:     j.jobId || `${j.companyName||''}::${j.title||''}::${j.datePosted||''}`,
    title:           j.title || '',
    company:         j.companyName || '',
    description:     truncateDesc((j.highlights?.items || []).join(' ') || j.description || ''),
    location:        j.location || null,
    remote:          /remot/i.test(j.location || ''),
    url:             j.applyLink || j.link || '',
    apply_url:       j.applyLink || null,
    salary_min:      null, salary_max: null, currency: null,
    skills_required: [],
    seniority:       normalizeSeniority(j.title || ''),
    industry:        null,
    posted_at:       j.datePosted || null,
    company_slug:    null,
    ats_type:        null,
  }))
}

export function normalizeGreenhouse(rawJobs, companyMeta) {
  if (!Array.isArray(rawJobs)) return []
  return rawJobs.map(j => {
    const descText = truncateDesc(stripHtml(j.content))
    return {
      source:          'greenhouse',
      external_id:     String(j.id),
      title:           j.title || '',
      company:         companyMeta.name,
      description:     descText,
      location:        j.location?.name || j.offices?.[0]?.name || null,
      remote:          /remot|anywhere/i.test(j.location?.name || ''),
      url:             j.absolute_url || `https://boards.greenhouse.io/${companyMeta.slug}/jobs/${j.id}`,
      apply_url:       j.absolute_url || null,
      salary_min:      null, salary_max: null, currency: null,
      skills_required: extractSkillsFromText(descText),
      seniority:       normalizeSeniority(j.title),
      industry:        j.departments?.[0]?.name || companyMeta.industries?.[0] || null,
      posted_at:       j.updated_at || null,
      company_slug:    companyMeta.slug,
      ats_type:        'greenhouse',
    }
  })
}

export function normalizeLever(rawPostings, companyMeta) {
  if (!Array.isArray(rawPostings)) return []
  return rawPostings.map(j => {
    const descText = truncateDesc(
      j.descriptionPlain || stripHtml(j.description)
    )
    const fullText = [descText, ...(j.lists || []).map(l => stripHtml(l.content))].join('\n')
    return {
      source:          'lever',
      external_id:     j.id || String(Math.random()),
      title:           j.text || '',
      company:         companyMeta.name,
      description:     truncateDesc(fullText),
      location:        j.categories?.location || null,
      remote:          /remot|anywhere|worldwide/i.test(j.categories?.location || j.text || ''),
      url:             j.hostedUrl || `https://jobs.lever.co/${companyMeta.slug}/${j.id}`,
      apply_url:       j.applyUrl || j.hostedUrl || null,
      salary_min:      j.salaryRange?.min || null,
      salary_max:      j.salaryRange?.max || null,
      currency:        j.salaryRange?.currency || null,
      skills_required: extractSkillsFromText(fullText),
      seniority:       normalizeSeniority(j.text),
      industry:        j.categories?.team || j.categories?.department || companyMeta.industries?.[0] || null,
      posted_at:       j.createdAt ? new Date(j.createdAt).toISOString() : null,
      company_slug:    companyMeta.slug,
      ats_type:        'lever',
    }
  })
}

export function normalizeSmartRecruiters(raw, companyMeta) {
  const items = raw?.content || (Array.isArray(raw) ? raw : [])
  return items.map(j => {
    const locObj = j.location || {}
    const locationStr = [locObj.city, locObj.region, locObj.country].filter(Boolean).join(', ')
    return {
      source:          'smartrecruiters',
      external_id:     j.id || String(Math.random()),
      title:           j.name || '',
      company:         j.company?.name || companyMeta.name,
      description:     truncateDesc(j.jobAd?.sections?.description?.text || null),
      location:        locationStr || null,
      remote:          !!locObj.remote,
      url:             j.ref || `https://careers.smartrecruiters.com/${companyMeta.slug}/${j.id}`,
      apply_url:       j.ref || null,
      salary_min:      null, salary_max: null, currency: null,
      skills_required: extractSkillsFromText(j.name),
      seniority:       normalizeSeniority(j.experienceLevel?.label || j.name),
      industry:        j.department?.label || companyMeta.industries?.[0] || null,
      posted_at:       j.releasedDate || null,
      company_slug:    companyMeta.slug,
      ats_type:        'smartrecruiters',
    }
  })
}

export function normalizeAshby(raw, companyMeta) {
  const jobs = raw?.jobs || []
  return jobs.map(j => {
    const descText = truncateDesc(j.descriptionPlain || stripHtml(j.descriptionHtml))
    const comp = j.compensation?.summaryComponents?.[0]?.value || null
    return {
      source:          'ashby',
      external_id:     j.id || String(Math.random()),
      title:           j.title || '',
      company:         companyMeta.name,
      description:     descText,
      location:        j.locationName || j.location || null,
      remote:          !!j.isRemote,
      url:             j.jobUrl || '',
      apply_url:       j.applyUrl || j.jobUrl || null,
      salary_min:      null, salary_max: null,
      currency:        comp ? 'USD' : null,
      skills_required: extractSkillsFromText(descText),
      seniority:       normalizeSeniority(j.title),
      industry:        j.department || companyMeta.industries?.[0] || null,
      posted_at:       j.publishedAt || null,
      company_slug:    companyMeta.slug,
      ats_type:        'ashby',
    }
  })
}

export function normalizeJobs(source, rawData, companyMeta = null) {
  switch (source) {
    case 'remoteok':        return normalizeRemoteOK(rawData)
    case 'remotive':        return normalizeRemotive(rawData)
    case 'jobicy':          return normalizeJobicy(rawData)
    case 'jooble':          return normalizeJooble(rawData)
    case 'adzuna':          return normalizeAdzuna(rawData)
    case 'getonboard':      return normalizeGetOnBoard(rawData)
    case 'himalayas':       return normalizeHimalayas(rawData)
    case 'workable':        return normalizeWorkable(rawData, companyMeta)
    case 'teamtailor':      return normalizeTeamtailor(rawData, companyMeta)
    case 'recruitee':       return normalizeRecruitee(rawData, companyMeta)
    case 'personio':        return normalizePersonio(rawData, companyMeta)
    case 'workday':         return normalizeWorkday(rawData, companyMeta)
    case 'serper':          return normalizeSerper(rawData)
    case 'greenhouse':      return normalizeGreenhouse(rawData, companyMeta)
    case 'lever':           return normalizeLever(rawData, companyMeta)
    case 'smartrecruiters': return normalizeSmartRecruiters(rawData, companyMeta)
    case 'ashby':           return normalizeAshby(rawData, companyMeta)
    default:                return []
  }
}

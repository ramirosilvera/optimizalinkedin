export const STATIC_QUESTIONS = [
  {
    id: 'profesion',
    question: '¿A qué te dedicás?',
    type: 'text',
    placeholder: 'Ej: Desarrollador web freelance, Gerente de marketing en empresa de retail, Psicóloga clínica independiente...',
    hint: 'Escribí tu profesión o rol actual con el mayor detalle que puedas.',
  },
  {
    id: 'situacion',
    question: '¿Cuál es tu situación profesional actual?',
    options: [
      'Empleado/a buscando un nuevo trabajo',
      'Freelancer o consultor/a buscando más clientes',
      'Emprendedor/a o dueño/a de negocio buscando visibilidad',
      'Profesional buscando crecer o ascender en mi empresa',
      'En transición de carrera o reingresando al mercado',
    ],
  },
  {
    id: 'industria',
    question: '¿En qué industria o rubro trabajás?',
    options: [
      'Tecnología / Software / IT',
      'Marketing / Comunicación / Publicidad',
      'Finanzas / Contabilidad / Auditoría',
      'Recursos Humanos / Consultoría',
      'Salud / Medicina / Bienestar',
      'Educación / Capacitación',
      'Ventas / Comercial / Business Development',
      'Diseño / UX / Creatividad',
      'Otro rubro',
    ],
  },
  {
    id: 'seniority',
    question: '¿Cuál es tu nivel de experiencia?',
    options: [
      'Junior — menos de 2 años',
      'Semi-senior — entre 2 y 5 años',
      'Senior — entre 5 y 10 años',
      'Lead / Manager / Coordinador de equipo',
      'Director / Gerente / Head of',
      'C-Level / Fundador / Socio',
    ],
  },
  {
    id: 'audiencia',
    question: '¿A quién querés llegar principalmente con tu perfil?',
    options: [
      'Reclutadores de empresas medianas y grandes',
      'Startups y empresas de tecnología',
      'Clientes corporativos (B2B)',
      'Clientes individuales o pymes (freelance / consultoría)',
      'Inversores, socios o co-fundadores',
      'Comunidad y red de contactos profesionales',
    ],
  },
  {
    id: 'area_impacto',
    question: '¿En qué área generaste tu mayor impacto profesional?',
    options: [
      'Aumenté ventas, ingresos o captación de clientes',
      'Reduje costos, tiempos o mejoré la eficiencia operativa',
      'Lideré equipos o desarrollé personas',
      'Lancé productos, servicios o proyectos nuevos',
      'Implementé procesos, sistemas o transformaciones digitales',
      'Asesoría, estrategia o consultoría de alto nivel',
      'Estoy construyendo mi trayectoria, aún sin logros grandes',
    ],
  },
  {
    id: 'escala',
    question: '¿A qué escala trabajaste o trabajás habitualmente?',
    options: [
      'De forma individual, sin equipo a cargo',
      'Equipo pequeño (2 a 5 personas)',
      'Equipo mediano (6 a 15 personas)',
      'Equipos grandes o múltiples equipos (+15 personas)',
      'A nivel de área o empresa completa',
      'A nivel regional, multinacional o internacional',
    ],
  },
  {
    id: 'resultado',
    question: '¿Qué tipo de resultado describe mejor tus logros más importantes?',
    options: [
      'Aumenté ventas o contratos en un porcentaje concreto (ej: 30%, $X)',
      'Reduje costos, errores o tiempos en un % medible',
      'Crecí una base de usuarios, clientes o audiencia',
      'Entregué proyectos en tiempo y dentro del presupuesto',
      'Implementé algo que no existía antes en la empresa',
      'Mis logros son más cualitativos (cultura, relaciones, estrategia)',
      'Todavía no tengo métricas concretas para mostrar',
    ],
  },
  {
    id: 'reconocimiento',
    question: '¿Cuál de estas situaciones te representa mejor?',
    options: [
      'Me ascendieron o me dieron más responsabilidades recientemente',
      'Trabajé en empresas o proyectos de renombre en mi industria',
      'Tengo clientes que me recomiendan o vuelven a contratarme',
      'Fui reconocido/a formalmente (premio, mención, certificación)',
      'Participé en proyectos de alto impacto o visibilidad pública',
      'Estoy construyendo mi reputación, sin reconocimientos formales aún',
    ],
  },
  {
    id: 'diferenciador',
    question: '¿Qué es lo que más valoran de vos quienes trabajaron con vos?',
    options: [
      'Mi conocimiento técnico profundo y especializado',
      'Mi capacidad de liderar, motivar y desarrollar equipos',
      'Mi orientación a resultados y ejecución concreta',
      'Mi visión estratégica y pensamiento de negocio',
      'Mi creatividad, innovación o capacidad de resolver problemas',
      'Mi facilidad para comunicar, vender ideas y generar confianza',
      'Todavía estoy construyendo mi reputación profesional',
    ],
  },
  {
    id: 'contexto_adicional',
    question: '¿Hay algo más que quieras agregar sobre tu perfil o situación?',
    type: 'text',
    placeholder: 'Ej: Estoy cambiando de industria luego de 10 años en finanzas. Tengo un proyecto personal en IA. Quiero enfocarme en el mercado de EEUU...',
    hint: 'Opcional — cualquier detalle que las preguntas anteriores no hayan cubierto y que sea relevante para tu perfil.',
  },
]

export const INTERVIEW_QUESTIONS = [
  { pregunta: 'Hacé tu presentación profesional: quién sos, en qué destacás y qué buscás en este momento.', hint: 'Imaginá que tenés 2 minutos para causar una primera impresión.' },
  { pregunta: 'Contame sobre tu mayor logro profesional: ¿qué hiciste, cómo lo hiciste y qué resultado concreto obtuviste?', hint: 'Si podés, mencioná números o métricas.' },
  { pregunta: '¿Cuál es tu mayor área de mejora y qué estás haciendo para trabajarla?', hint: 'Los reclutadores valoran la autoconciencia — sé honesto/a.' },
  { pregunta: '¿Qué te motiva a buscar un nuevo desafío en este momento de tu carrera?', hint: 'Enfocate en lo que te atrae, no en lo que dejás atrás.' },
  { pregunta: '¿Qué te diferencia de otros profesionales con tu mismo perfil y experiencia?', hint: 'Pensá en tu propuesta de valor única.' },
]

export const STAR_QUESTIONS = [
  'Contame sobre un momento en que tuviste que resolver un problema complejo en el trabajo.',
  'Describí una situación en la que lideraste un proyecto o iniciativa desde cero.',
  'Contame sobre un logro profesional concreto del que estés orgulloso/a.',
  '¿Cuándo tuviste que manejar un conflicto en tu equipo? ¿Cómo lo resolviste?',
  'Describí una situación en la que tuviste que adaptarte rápidamente a un cambio inesperado.',
  'Contame sobre una vez que tuviste que influir o convencer a alguien sin tener autoridad directa.',
]

const CAREER_READINESS_MESSAGES = [
  'Calibrando tu perfil con criterio de headhunter...',
  'Evaluando tu posicionamiento profesional...',
  'Identificando gaps y ventajas competitivas...',
  'Analizando keywords ATS de tu industria...',
  'Construyendo tu diagnóstico de competitividad...',
  'Generando recomendaciones estratégicas...',
  'Preparando tu análisis personalizado...',
  'Validando tu propuesta de valor profesional...',
]

export const LOADING_MESSAGES_BY_SITUACION = {
  'Empleado/a buscando un nuevo trabajo': CAREER_READINESS_MESSAGES,
  'Freelancer o consultor/a buscando más clientes': CAREER_READINESS_MESSAGES,
  'Emprendedor/a o dueño/a de negocio buscando visibilidad': CAREER_READINESS_MESSAGES,
  'Profesional buscando crecer o ascender en mi empresa': CAREER_READINESS_MESSAGES,
  'En transición de carrera o reingresando al mercado': CAREER_READINESS_MESSAGES,
}

export const LOADING_MESSAGES_DEFAULT = CAREER_READINESS_MESSAGES

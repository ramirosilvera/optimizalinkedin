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

// Industry-specific interview question banks
// Each set has 5 questions calibrated to the industry context
export const INTERVIEW_QUESTIONS_BY_INDUSTRY = {
  'Tecnología / Software / IT': [
    { pregunta: 'Contame sobre un proyecto técnico complejo que lideraste o en el que tuviste un rol clave. ¿Cuál fue el mayor desafío y cómo lo resolviste?', hint: 'Mencioná el stack tecnológico y el impacto concreto del proyecto.' },
    { pregunta: 'Describí una situación en la que tuviste que aprender una tecnología nueva rápidamente bajo presión. ¿Cómo lo abordaste?', hint: 'Los reclutadores tech valoran la capacidad de aprendizaje autónomo.' },
    { pregunta: '¿Cuándo tuviste que tomar una decisión técnica difícil con información incompleta? ¿Qué criterios usaste?', hint: 'Mostrá tu proceso de razonamiento, no solo el resultado.' },
    { pregunta: 'Contame sobre una situación en la que detectaste un problema técnico antes de que impactara al usuario o al negocio.', hint: 'Énfasis en tu capacidad de anticipación y ownership.' },
    { pregunta: '¿Qué te diferencia como profesional de tecnología más allá de tus habilidades técnicas?', hint: 'Aquí buscan soft skills, comunicación, y visión de negocio.' },
  ],
  'Marketing / Comunicación / Publicidad': [
    { pregunta: 'Contame sobre una campaña o estrategia que diseñaste. ¿Qué resultados medibles lograste?', hint: 'Usá métricas concretas: reach, conversión, ROI, engagement.' },
    { pregunta: 'Describí una situación en la que una campaña no funcionó como esperabas. ¿Qué hiciste y qué aprendiste?', hint: 'Valoran la capacidad de análisis y adaptación, no solo los éxitos.' },
    { pregunta: '¿Cómo equilibrás la creatividad con los objetivos de negocio cuando hay presión por resultados?', hint: 'Mostrá que entendés el contexto estratégico detrás del marketing.' },
    { pregunta: 'Contame sobre un momento en que tuviste que convencer a stakeholders de una idea creativa poco convencional.', hint: 'Estructurá con STAR: situación, argumento, negociación, resultado.' },
    { pregunta: '¿Qué tendencia del mercado o cambio en comportamiento del consumidor te parece más relevante hoy para tu industria?', hint: 'Demostrá que estás actualizado y que pensás estratégicamente.' },
  ],
  'Finanzas / Contabilidad / Auditoría': [
    { pregunta: 'Describí una situación en la que identificaste un riesgo financiero o un error antes de que se convirtiera en un problema mayor.', hint: 'Destacá tu atención al detalle y tu orientación al control.' },
    { pregunta: 'Contame sobre un análisis complejo que realizaste. ¿Qué metodología usaste y qué decisión generó?', hint: 'Explicá el proceso analítico y el impacto en el negocio.' },
    { pregunta: '¿Cuándo tuviste que comunicar información financiera compleja a alguien no técnico? ¿Cómo lo hiciste?', hint: 'La capacidad de simplificar es muy valorada en roles financieros.' },
    { pregunta: 'Describí una situación en la que tuviste que trabajar bajo presión de cierre o auditoría con plazos ajustados.', hint: 'Mostrá tu capacidad de organización y trabajo bajo presión.' },
    { pregunta: '¿Cuál fue el mayor impacto financiero que lograste para una organización? ¿Cómo lo medirías?', hint: 'Cuantificá el impacto en pesos, porcentajes o eficiencia operativa.' },
  ],
  'Recursos Humanos / Consultoría': [
    { pregunta: 'Contame sobre una iniciativa de RR.HH. que diseñaste e implementaste. ¿Qué problema resolvió y cuál fue el resultado?', hint: 'Conectá el impacto de RR.HH. con métricas de negocio (retención, engagement, productividad).' },
    { pregunta: 'Describí una situación de conflicto entre personas o equipos que tuviste que gestionar. ¿Cómo lo abordaste?', hint: 'Mostrá empatía, proceso y resolución concreta.' },
    { pregunta: '¿Cómo convenciste a líderes de negocio de implementar un cambio cultural o de proceso que generaba resistencia?', hint: 'Valoran la influencia sin autoridad jerárquica.' },
    { pregunta: 'Contame sobre el proceso de selección más desafiante que condujiste. ¿Qué lo hizo difícil y cómo lo resolviste?', hint: 'Detallá el criterio de evaluación y la toma de decisión.' },
    { pregunta: '¿Cuál fue tu mayor logro medible en desarrollo de personas o cultura organizacional?', hint: 'Usá datos: tasa de retención, NPS interno, tiempo de onboarding, etc.' },
  ],
  'Salud / Medicina / Bienestar': [
    { pregunta: 'Describí una situación clínica o profesional de alta presión en la que tu decisión tuvo impacto directo en el paciente o cliente.', hint: 'Mostrá criterio clínico, calma bajo presión y responsabilidad.' },
    { pregunta: 'Contame sobre un caso complejo que requirió coordinación con otros profesionales o equipos. ¿Cómo lo gestionaste?', hint: 'El trabajo interdisciplinario es muy valorado en salud.' },
    { pregunta: '¿Cuándo tuviste que comunicar información difícil a un paciente o familiar? ¿Cómo lo manejaste?', hint: 'Empatía, claridad y protocolo son lo que buscan evaluar.' },
    { pregunta: 'Describí una mejora de proceso o protocolo que implementaste en tu equipo o institución.', hint: 'Mostrá iniciativa y orientación a la mejora continua.' },
    { pregunta: '¿Qué te diferencia como profesional de la salud más allá de tu formación técnica?', hint: 'Soft skills, enfoque en el paciente, y desarrollo continuo.' },
  ],
  'Educación / Capacitación': [
    { pregunta: 'Contame sobre un programa educativo o de capacitación que diseñaste. ¿Qué impacto mediste?', hint: 'Conectá el diseño pedagógico con resultados concretos de aprendizaje.' },
    { pregunta: 'Describí una situación en la que un grupo de alumnos o participantes presentó resistencia. ¿Cómo lo manejaste?', hint: 'Mostrá adaptabilidad y enfoque centrado en el aprendizaje.' },
    { pregunta: '¿Cómo medís que el aprendizaje realmente ocurrió y tuvo impacto en el desempeño?', hint: 'Valoran el pensamiento evaluativo y orientado a resultados.' },
    { pregunta: 'Contame sobre una innovación pedagógica que implementaste con éxito.', hint: 'Tecnología, metodología activa, gamificación — lo que sea con impacto real.' },
    { pregunta: '¿Qué te diferencia como docente o facilitador de otros con tu mismo perfil?', hint: 'Tu filosofía pedagógica y tu propuesta de valor única.' },
  ],
  'Ventas / Comercial / Business Development': [
    { pregunta: 'Contame sobre tu mayor logro de ventas. ¿Cuál fue el contexto, qué hiciste concretamente y cuál fue el resultado en números?', hint: 'Sé específico: monto, porcentaje de cuota, tiempo, industria del cliente.' },
    { pregunta: 'Describí una venta compleja con ciclo largo y múltiples stakeholders. ¿Cómo la navegaste?', hint: 'Mostrá estrategia, gestión de relaciones y cierre.' },
    { pregunta: '¿Cuándo perdiste una venta importante? ¿Qué aprendiste y cómo lo aplicaste después?', hint: 'Los mejores vendedores aprenden sistemáticamente de sus pérdidas.' },
    { pregunta: 'Contame sobre una situación en la que tuviste que crear una oportunidad desde cero, sin leads calificados.', hint: 'Prospecting, creatividad y resiliencia son lo que evalúan.' },
    { pregunta: '¿Cómo construís relaciones comerciales de largo plazo con clientes clave?', hint: 'Account management, valor agregado, y confianza sostenida en el tiempo.' },
  ],
  'Diseño / UX / Creatividad': [
    { pregunta: 'Contame sobre un proyecto de diseño complejo donde tuviste que equilibrar creatividad, usabilidad y restricciones técnicas.', hint: 'Mostrá tu proceso de diseño, no solo el resultado visual.' },
    { pregunta: 'Describí una situación en la que tu propuesta de diseño fue rechazada. ¿Cómo lo manejaste y qué hiciste después?', hint: 'Valoran la resiliencia, el feedback y la iteración.' },
    { pregunta: '¿Cómo validás que tu diseño realmente resuelve el problema del usuario?', hint: 'User research, testing, métricas — mostrá tu enfoque centrado en datos.' },
    { pregunta: 'Contame sobre un momento en que tuviste que defender una decisión de diseño ante stakeholders con criterios distintos.', hint: 'Argumentación basada en datos de usuario y objetivos de negocio.' },
    { pregunta: '¿Cuál fue el mayor impacto medible que logró uno de tus diseños en el producto o negocio?', hint: 'Conversión, tiempo en tarea, NPS, retención — conectá diseño con negocio.' },
  ],
  'Otro rubro': [
    { pregunta: 'Hacé tu presentación profesional: quién sos, en qué destacás y qué buscás en este momento de tu carrera.', hint: 'Imaginá que tenés 2 minutos para causar una primera impresión memorable.' },
    { pregunta: 'Contame sobre tu mayor logro profesional. ¿Qué hiciste, cómo lo hiciste y qué resultado concreto obtuviste?', hint: 'Si podés, mencioná números o métricas que demuestren el impacto.' },
    { pregunta: '¿Cuál es tu mayor área de mejora y qué estás haciendo concretamente para trabajarla?', hint: 'Los reclutadores valoran la autoconciencia — sé honesto/a y mostrá acción.' },
    { pregunta: '¿Qué te motiva a buscar un nuevo desafío en este momento de tu carrera?', hint: 'Enfocate en lo que te atrae hacia adelante, no en lo que dejás atrás.' },
    { pregunta: '¿Qué te diferencia de otros profesionales con tu mismo perfil y nivel de experiencia?', hint: 'Tu propuesta de valor única — lo que solo vos podés ofrecer.' },
  ],
}

---
title: "Cómo usamos agentes para enseñar gestión de proyectos de software"
platform: linkedin
status: draft
audience: software engineers / tech leads
length: ~700 words
---

Enseñar gestión de proyectos de software en una universidad tiene un problema estructural: los estudiantes aprenden conceptos —iteraciones, sprints, gestión de deuda técnica, especificaciones— pero rara vez los aplican bajo condiciones que se parezcan al trabajo real. Los proyectos de curso son demasiado pequeños, los equipos demasiado homogéneos, y el ciclo de feedback demasiado lento para que los errores de proceso tengan consecuencias visibles.

En el curso INF360 decidimos cambiar ese supuesto. En lugar de agregar más contenido teórico, integramos agentes de IA como parte del flujo de trabajo obligatorio del curso. No como atajo para escribir código más rápido —sino como una restricción adicional que fuerza a los estudiantes a especificar antes de implementar.

**El problema que queríamos resolver**

Los estudiantes de ingeniería suelen llegar al código antes de entender el problema. Es un hábito difícil de romper: el código da la sensación de progreso, la especificación se siente como trabajo administrativo. El resultado es que los proyectos de curso acumulan deuda desde la primera iteración y la gestión se vuelve reactiva: parchear bugs en lugar de construir features.

El otro problema es la visibilidad. En un proyecto de cuatro personas que dura doce semanas, el docente no puede revisar cada decisión de arquitectura, cada cambio de requisito, cada discusión de scope. La mayoría de los errores de proceso se hacen invisibles hasta la entrega final.

**Cómo funciona el flujo con agentes**

El flujo que adoptamos se llama Spec-Driven Development (SDD): la especificación va antes que el código, siempre. Los agentes son el mecanismo que hace esa restricción operativa.

Antes de que un equipo implemente cualquier feature, debe producir una especificación formal usando el skill `/spec`. El agente genera un documento estructurado con: descripción del problema, criterios de aceptación, casos de prueba esperados, y dependencias con otros módulos. Ese documento debe existir antes de que el agente de backend o frontend pueda trabajar.

El orquestador verifica que la especificación esté completa. Si un estudiante intenta saltarse el paso —"igual sé lo que tengo que hacer"— el agente devuelve la tarea al paso de especificación. La restricción no viene del docente: viene del sistema.

**Qué aprenden los estudiantes que antes no aprendían**

La primera semana hay resistencia. Los estudiantes que están acostumbrados a escribir código inmediatamente sienten que el proceso los frena. Esa frustración es parte del aprendizaje: es exactamente lo que sienten los equipos junior en entornos de producción cuando se les pide especificar antes de implementar.

Hacia la tercera semana, el patrón cambia. Los equipos que especificaron bien en las primeras iteraciones tienen menos retrabajo. Los que se saltaron la especificación están parando el sprint para aclarar decisiones que debieron tomar antes. La evidencia del valor del proceso es visible para ellos, no para el docente.

Los agentes también generan un log auditable de cada sesión de trabajo: qué se pidió, qué se produjo, qué reglas se aplicaron. Ese log reemplaza parte de la documentación de proceso que antes era manual y frecuentemente incompleta. El docente puede revisar el log de un equipo y ver exactamente dónde se tomaron decisiones de arquitectura y con qué información.

**Lo que no funciona todavía**

La calibración de los agentes para contextos académicos es un trabajo en progreso. Los agentes están optimizados para proyectos de producción con equipos que ya tienen criterio técnico. Con estudiantes de tercer año, hay casos donde el agente produce especificaciones demasiado complejas para el nivel del equipo, o donde las reglas de compliance son demasiado estrictas para proyectos de práctica.

También hay una tensión entre la autonomía pedagógica —dejar que los estudiantes cometan errores y aprendan de ellos— y la estructura del harness, que previene ciertos errores automáticamente. Estamos ajustando el modo `startup` del framework para que sea menos restrictivo en contextos de aprendizaje.

**El resultado más importante**

Al final del semestre, los estudiantes no solo saben usar agentes. Saben por qué un agente sin estructura produce resultados inconsistentes. Entienden qué es un harness y por qué importa. Pueden leer la configuración de un sistema agéntico y explicar qué hace cada parte.

Eso es más valioso que saber escribir prompts. Los prompts cambian cada seis meses. La comprensión de por qué los sistemas agénticos necesitan estructura es una habilidad que va a seguir siendo relevante independientemente de qué modelo use el equipo el año que viene.

---
*Publicado como parte de la serie [Desarrollo Agéntico] — seguí la serie para más contenido sobre ingeniería de software con IA.*

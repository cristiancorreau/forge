---
title: "Las cinco capas de un kit de desarrollo agéntico"
platform: linkedin
status: draft
audience: software engineers / tech leads
length: ~800 words
---

Cuando empezamos a usar agentes de IA en proyectos de software reales —no demos, proyectos reales con deadlines y deuda técnica— encontramos que las herramientas disponibles resolvían partes del problema, pero ninguna lo resolvía completo. Había buenos prompt templates, buenas colecciones de instrucciones para Claude, buenos guardrails aislados. Pero no había un modelo mental claro de qué capas necesita un sistema agéntico para funcionar de forma sostenible en producción.

Después de varios ciclos de iteración, llegamos a una arquitectura de cinco capas. Cada capa tiene una responsabilidad específica y depende de las anteriores. Acá las describo con ejemplos concretos.

---

**Capa 1 — Memory (Memoria)**

La primera capa responde a una pregunta simple: ¿cómo sabe el agente qué proyecto está mirando?

Sin memoria persistente, cada sesión empieza desde cero. El agente no sabe si el backend usa Hono o FastAPI, si la base de datos es PostgreSQL o SQLite, si hay un requisito de compliance activo o no. Tiene que inferirlo del contexto del repositorio, y esa inferencia es costosa y propensa a errores.

La solución es una fuente de verdad declarativa que el agente puede leer al inicio de cada sesión. En Forge, ese archivo es `project.yaml`: nombre del proyecto, stack tecnológico, agentes activos, skills habilitados, marcos de compliance. No es un prompt —es configuración estructurada que el sistema interpreta para generar las instrucciones correctas.

Además del estado del proyecto, la capa de Memory incluye una wiki del proyecto: decisiones de arquitectura, convenciones adoptadas, cambios de esquema. El agente puede consultar esta wiki antes de proponer cambios, en lugar de inventar decisiones que ya fueron tomadas.

**Ejemplo concreto:** un e-commerce con Next.js declara en `project.yaml` que usa Drizzle como ORM y que tiene compliance activo con GDPR. Cada agente que se inicializa recibe automáticamente esa información y ajusta su comportamiento: el backend engineer sabe que no puede concatenar queries, el compliance reviewer sabe qué verificar en cada PR.

---

**Capa 2 — Knowledge (Conocimiento)**

La segunda capa responde a: ¿qué sabe hacer cada agente, y qué tiene prohibido?

El conocimiento no es solo instrucciones genéricas —es conocimiento específico del stack, del rol, y del proyecto. Un agente de backend para Hono+TypeScript sabe cosas distintas a uno para Django+Python. Un orquestador que trabaja en modo startup tiene un comportamiento diferente al que opera en modo enterprise.

La capa de Knowledge se implementa con agentes especializados organizados en tiers. El Tier 1 incluye agentes universales (orchestrator, backend-engineer, test-engineer). El Tier 2 son agentes de stack (api-engineer para Hono, mobile-engineer para Expo). El Tier 3 son agentes de dominio propios del proyecto, que nadie puede sobreescribir excepto el equipo.

Cada agente tiene un scope declarado explícitamente: qué archivos puede tocar, qué decisiones puede tomar solo, cuándo debe escalar. Esta separación elimina la ambigüedad que genera conflictos entre agentes o entre agente y desarrollador.

**Ejemplo concreto:** en un SaaS multitenant, el agente de frontend tiene prohibido tocar la lógica de aislamiento de tenants. Esa regla está en el agente, no en el prompt de la sesión. Si el desarrollador le pide al agente de frontend que "arregle el bug de datos cruzados entre tenants", el agente escala al orquestador en lugar de hacer una modificación fuera de su scope.

---

**Capa 3 — Guardrail (Barreras)**

La tercera capa responde a: ¿cómo se previene que el sistema se degrade con el tiempo?

Los guardrails son los mecanismos que mantienen la calidad del sistema agéntico. Incluyen tres componentes: reglas no-negociables que van en el core (nunca hardcodear credenciales, siempre usar parámetros preparados en SQL, nunca exponer `error.message` al cliente), hooks de pre-commit que ejecutan verificaciones antes de cada commit, y un proceso de auditoría que detecta cuando los agentes se desactualizan respecto al estándar del equipo.

La auditoría es especialmente importante: un agente que estuvo bien configurado en enero puede estar desactualizado en marzo si el stack evolucionó. Sin un mecanismo de detección, esa deuda se acumula invisiblemente.

**Ejemplo concreto:** el script de auditoría detecta que el agente de seguridad de un proyecto lleva dos versiones de atraso respecto al estándar de forge. Muestra el gap específico (sección "## No hagas" faltante) y ofrece aplicar la corrección. El desarrollador revisa el diff y acepta o adapta.

---

**Capa 4 — Delegation (Delegación)**

La cuarta capa responde a: ¿cómo se descompone una tarea en trabajo paralelo?

Un orquestador que puede delegar a agentes especializados multiplica la capacidad del equipo. En lugar de un agente monolítico que hace todo, hay un sistema donde el orquestador analiza la tarea, identifica qué partes corresponden a qué agente, y coordina la ejecución.

La delegación requiere contratos claros entre agentes: qué entrega el backend-engineer para que el test-engineer pueda trabajar, qué produce el docs-writer para que el compliance-reviewer pueda verificar. Sin esos contratos, la delegación genera más coordinación manual que la que ahorra.

**Ejemplo concreto:** se pide implementar un nuevo endpoint de pagos. El orquestador descompone: backend-engineer define el contrato de la API, compliance-reviewer verifica que cumple PCI-DSS antes de que se escriba una línea de código, test-engineer prepara los casos de prueba, backend-engineer implementa. El flujo es reproducible y auditable.

---

**Capa 5 — Distribution (Distribución)**

La quinta capa responde a: ¿cómo se escala esto a un equipo y a múltiples herramientas?

Claude Code, OpenCode, Kiro y Codex CLI son runtimes distintos con formatos distintos. Un equipo que no usa todos el mismo runtime necesita una forma de mantener la configuración sincronizada sin duplicar trabajo.

La capa de Distribution genera la configuración correcta para cada runtime desde una única fuente de verdad. El mismo `project.yaml` produce el `CLAUDE.md` para Claude Code, el `AGENTS.md` para OpenCode, y los steering files para Kiro. El equipo no tiene que mantener cuatro archivos en sincronía manualmente.

**Ejemplo concreto:** un equipo de cinco personas donde tres usan Claude Code y dos usan Kiro. El proyecto.yaml es el mismo. Cada developer ejecuta `forge-init.py --tool <su-runtime>` y obtiene la configuración correcta para su herramienta, con los mismos agentes, las mismas reglas, y el mismo estado del proyecto.

---

Las cinco capas no son independientes. Memory alimenta Knowledge, Knowledge informa Guardrail, Guardrail protege Delegation, Delegation se escala con Distribution. Un sistema agéntico que tiene las cinco capas puede operar de forma sostenible. Uno que tiene solo algunas, eventualmente, deriva.

---
*Publicado como parte de la serie [Desarrollo Agéntico] — seguí la serie para más contenido sobre ingeniería de software con IA.*

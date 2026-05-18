---
title: "Por qué los agentes de IA necesitan un harness, no solo prompts"
platform: linkedin
status: draft
audience: software engineers / tech leads
length: ~700 words
---

Hay un patrón que se repite en todos los equipos que empiezan a trabajar seriamente con agentes de IA: las primeras dos semanas van bien. Los agentes parecen entender el proyecto, respetan las convenciones, generan código que se puede mergear. Después, hacia la tercera o cuarta semana, algo cambia. El agente empieza a inventar nombres de variables, ignora las reglas de estilo, o propone refactors que nadie pidió. El equipo frustra, el tech lead revisa todo manualmente, y la conversación termina en "los LLMs no sirven para producción real".

El problema no es el modelo. El problema es que nadie le dio al agente una estructura para no derivar.

**El problema de la deriva agéntica**

Los modelos de lenguaje no tienen memoria persistente entre sesiones. Cada vez que abrís Claude Code o cualquier otro runtime, el agente empieza desde cero. Si no hay un sistema que reconstruya el contexto relevante al inicio de cada sesión —qué proyecto es, qué stack usa, qué reglas son no-negociables, quién es responsable de qué— el agente opera en el vacío.

La deriva no es dramática. No es que el agente de repente empiece a escribir código en el lenguaje equivocado. Es sutil: un nombre de tabla que no respeta la convención, una validación que se salta porque el agente no sabía que era obligatoria, un commit que mezcla concerns porque nadie definió qué scope tiene cada agente. El daño se acumula lentamente hasta que el costo de revisión supera el ahorro del agente.

**Por qué un CLAUDE.md solo no alcanza**

La respuesta obvia es "agrego instrucciones al CLAUDE.md y listo". Es un buen primer paso, pero tiene límites claros.

Un archivo de instrucciones en texto plano no sabe qué agente está leyendo las instrucciones. Le dice lo mismo al orquestador que al agente de frontend, al que hace tests y al que revisa compliance. No hay separación de scope. No hay jerarquía. No hay mecanismo para detectar cuándo las instrucciones están desactualizadas.

Además, el CLAUDE.md se escribe una vez y se olvida. A medida que el proyecto evoluciona —nuevos endpoints, nuevo esquema de base de datos, nuevas reglas de negocio— el archivo queda desincronizado. El agente trabaja con contexto incorrecto y nadie lo sabe hasta que algo falla.

**Lo que hace un harness**

Un harness es la capa de infraestructura que rodea al agente y que garantiza que opere dentro de los límites correctos, con el contexto correcto, en cada sesión.

Un harness bien construido tiene al menos tres componentes:

*Reglas persistentes.* Instrucciones que sobreviven entre sesiones y que son específicas por agente. El backend engineer sabe que solo puede tocar la capa de API. El test engineer sabe que nunca debe modificar código de producción. El orquestador sabe que debe descomponer tareas antes de delegarlas. Estas reglas no viven en la cabeza del desarrollador —viven en el repositorio y se cargan automáticamente.

*Memoria del proyecto.* Un mecanismo para que el agente acceda a conocimiento acumulado: decisiones de arquitectura, convenciones adoptadas, cambios recientes en el esquema. No una lista de instrucciones estática, sino un sistema que se puede actualizar y consultar.

*Auditoría.* Un proceso que detecta cuando los agentes se desactualizan respecto a las reglas base del equipo. Si el agente de backend lleva tres semanas sin recibir actualizaciones y el stack cambió, el harness lo señala. Si hay gaps en las reglas obligatorias, los expone antes de que generen problemas en producción.

**El resultado práctico**

Los equipos que operan con un harness no tienen que revisar cada output del agente con desconfianza. Tienen un conjunto de invariantes que el sistema verifica automáticamente. El desarrollador puede confiar en que el agente se mueve dentro del scope correcto porque hay una estructura que lo garantiza, no una promesa en el prompt.

Los prompts son el input. El harness es la infraestructura que hace que ese input produzca outputs predecibles y auditables.

Un LLM sin harness es un desarrollador brillante sin onboarding. Puede hacer mucho, pero también puede destruir mucho sin querer. El harness es el onboarding que no expira.

---
*Publicado como parte de la serie [Desarrollo Agéntico] — seguí la serie para más contenido sobre ingeniería de software con IA.*

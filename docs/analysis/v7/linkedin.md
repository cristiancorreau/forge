# forge v7 — LinkedIn post

---

Siete ciclos de análisis dual-agent de forge. Primera vez que el veredicto no empieza por los bugs.

En v5, encontramos tres P0: Windows sin advertencia, URL del submodule incorrecta en el primer paso del README, y una extensión VS Code con 624 líneas de código que nadie podía instalar. En v7, los tres están cerrados. El log de commits lo confirma: cuatro fixes antes de dos features en el ciclo actual.

Lo que hace interesante a forge no es el checklist cerrado. Es el patrón de qué se priorizó: antes de agregar los profiles de Laravel y WordPress, el equipo corrigió la URL, agregó las instrucciones de `submodule update --init`, limpió las referencias al dominio anterior, agregó los tests del contrato JSON de audit, y documentó la extensión VS Code. Eso es disciplina de onboarding, no de features.

El profile más valioso de v7 es el migration-specialist de Laravel: cubre la ruta L6→L7→L8→L9→L10→L11→L12→L13 con breaking changes específicos por salto de versión. Para un equipo manteniendo una app Laravel de 5 años, ese agente codifica lo que de otra forma sería una semana de lectura de upgrade guides o una consultoría externa.

Lo que falta: GitHub Actions (el repositorio no tiene CI propio), releases semánticos (la versión 2.0.2 existe en el código pero no como tag git), y la extensión VS Code sin publicar en el Marketplace (el código está, el campo `publisher` no).

Score: **7.0/10** (v5: 5.7).

forge sigue siendo para equipos de 2-8 personas en macOS/Linux con stack cubierto. La diferencia con v5 es que en v7 ese equipo puede llegar al día uno sin encontrar un bug bloqueante.

---

Análisis completo: `docs/analysis/v7/` en el repositorio de forge.

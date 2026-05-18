# forge v8 — LinkedIn post

---

Ocho ciclos de análisis dual-agent de forge. El veredicto de este ciclo no empieza por los bugs ni por los profiles nuevos.

El cambio más importante de v0.2.2 es que forge pasó de ser un proyecto de calidad técnica verificable a ser una dependencia que un tech lead puede aprobar: GitHub Actions con matrix Python 3.9/3.11/3.12, tag semántico v0.2.2, CHANGELOG estructurado. Lo que estaba bien construido ahora es también visible externamente.

Las features del ciclo apuntan todas al mismo lugar: que el día 1 de un equipo adoptando forge tenga todo configurado sin intervención manual. forge-init genera ahora el CLAUDE.md con tabla de agentes y sus scopes, instala un .claude/settings.json con permisos por stack (TypeScript, Python, Ruby, PHP, Go), y deja tres slash commands disponibles desde el primer "/" en Claude Code: /new-feature, /deploy-check, /review.

El audit rediseñó su picker de oportunidades con un TUI de dos paneles: lista navegable a la izquierda, detalle del item a la derecha. Un dev que no sabe qué es security-audit lo descubre navegando. La interfaz enseña, no solo lista.

Lo que persiste: 0 tests nuevos para las 4 features nuevas. El código creció 18% sin que la suite creciera. No rompe nada hoy, pero es la señal más clara de lo que el próximo ciclo debería priorizar.

Score: **8.2/10** (v7: 7.0, v5: 5.7).

El salto de 1.2 puntos viene casi íntegramente del cierre de gobernanza. Si el próximo ciclo cierra el gap de tests y publica la extensión VS Code en el Marketplace, forge está en territorio de 9/10.

---

Análisis completo: `docs/analysis/v8/` en el repositorio de forge.

# review

Revisa el código indicado o los cambios recientes no commiteados.

Scope: $ARGUMENTS (ej: ruta de archivo, rama, o vacío para cambios uncommitted actuales).

Checklist:
- Seguridad: autenticación, autorización, SQL injection, XSS, secrets hardcodeados
- Performance: N+1 queries, índices faltantes, loops en caminos críticos
- Cobertura: ¿los cambios tienen tests que los verifiquen?
- Compliance: ¿hay cambios en manejo de PII, consentimientos o logs de auditoría?
- Calidad: naming, estructura, código muerto o duplicado, violaciones de scope de agente

# deploy-check

Verifica que el proyecto esté listo para deploy y ejecuta los checks previos al push.

Entorno target: $ARGUMENTS (ej: staging, production — vacío para checks generales).

1. Ejecutar lint y tests completos.
2. Verificar que no hay cambios no commiteados.
3. Revisar variables de entorno: ¿están todas documentadas en .env.example?
4. Buscar console.log / print de depuración en los cambios recientes.
5. Confirmar branch y proveedor de deploy desde project.yaml.
6. Si el target es production, confirmar que el entorno de staging fue validado primero.

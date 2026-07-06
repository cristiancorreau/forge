/**
 * Nombre canónico de sesión tmux: forge:{project}:{task}:{role}
 * (SPEC-076 § 4). Sanitización [a-z0-9-] por segmento. Es el contrato que
 * usa la reconciliación al boot.
 */
const sanitize = (segment: string): string =>
  segment
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function sessionName(project: string, task: string, role: string): string {
  return `forge:${sanitize(project)}:${sanitize(task)}:${sanitize(role)}`;
}

/**
 * North Star marker (issue #109).
 *
 * forge stamps a deterministic, unique comment at the top of every project.yaml
 * it generates. It enables PASSIVE, telemetry-free adoption measurement: the
 * North Star ("public repos with a forge-managed project.yaml") is countable via
 * GitHub code search for the marker string — forge never calls home.
 *
 * The marker is a YAML comment, so it is invisible to parsers and never affects
 * the document. `withForgeMarker` is idempotent (it won't stack on re-generation).
 */
import { VERSION } from '../version.js';

export const FORGE_MARKER_PREFIX = '# generated-by: forge';

/** The full marker line, e.g. `# generated-by: forge v3.3.1`. */
export function forgeMarker(): string {
  return `${FORGE_MARKER_PREFIX} v${VERSION}`;
}

/** Prepend the marker to freshly generated project.yaml content (idempotent). */
export function withForgeMarker(content: string): string {
  const head = content.split('\n', 3);
  if (head.some(l => l.startsWith(FORGE_MARKER_PREFIX))) return content;
  return `${forgeMarker()}\n${content}`;
}

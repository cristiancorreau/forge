/**
 * Fakes en memoria de los puertos (SPEC-076 § 6). Subpath export "./testing":
 * los reusan daemon, cli y futuros paquetes. Sin node:/bun:/sqlite/http.
 */
export { InMemoryRegistry } from './in-memory-registry.js';
export { FakeSessionPort } from './fake-session-port.js';
export { FakeRuntime, FakeRuntimeProvider } from './fake-runtime.js';
export { FakeVcs } from './fake-vcs.js';
export { FakeMemory } from './fake-memory.js';
export { FakeApprovals } from './fake-approvals.js';
export { InMemoryEventBus } from './in-memory-event-bus.js';
export { FakeClock } from './fake-clock.js';
export { SeqIds } from './seq-ids.js';

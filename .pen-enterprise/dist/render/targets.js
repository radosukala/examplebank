/**
 * The registry, in its own file so `target.ts` never has to import an adapter.
 *
 * A cycle between the contract and its one implementation would work — ESM would
 * resolve it — and it would also be the reason the second adapter is harder to add
 * than the first. Contract, implementations, registry: three files, one direction.
 *
 * Resolution is exact-match on `profile.runtime.target`. No aliasing and no nearest
 * guess: an enterprise that writes `liferay-7.4` and silently gets the 7.4 custom
 * element adapter has been handed a decision it did not make.
 */
import { LIFERAY_CUSTOM_ELEMENT } from "./liferay.js";
export const TARGETS = [LIFERAY_CUSTOM_ELEMENT];
export function targetFor(id) {
    return TARGETS.find((t) => t.id === id) ?? null;
}
//# sourceMappingURL=targets.js.map
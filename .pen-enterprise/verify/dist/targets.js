/**
 * FINDING THE ADAPTER — which is now a package this one does not depend on.
 *
 * A static import made "the export target is pluggable" a claim rather than a
 * fact: core could not build, ship or run without the one adapter, and the second
 * target would have arrived as a second static import into the same array. So the
 * adapter moved to `@pen-enterprise/target-liferay` and the import here became
 * dynamic. Nothing in `src/` names that package except the data below.
 *
 * Resolution, in order:
 *
 *   1. anything `registerTarget` was handed — a bank with an in-house shell
 *      imports this library and passes an object. Their runtime is not on npm and
 *      never will be, and a seam that only accepts published packages is useless
 *      to exactly the customer it is for.
 *   2. `KNOWN`, by exact id, loaded on demand.
 *
 * Exact match, no aliasing, no nearest guess: an enterprise that writes
 * `liferay-7.4` and silently gets the 7.4 custom element adapter has been handed a
 * decision it did not make.
 */
import { optionalModule } from "./optional.js";
export const KNOWN = [
    {
        id: "liferay-7.4-custom-element",
        what: "Liferay 7.4 client extension, as an ESM custom element",
        package: "@pen-enterprise/target-liferay",
    },
];
const registered = new Map();
/** Bring your own runtime. Returns the target so a caller can register inline. */
export function registerTarget(target) {
    registered.set(target.id, target);
    return target;
}
/** The preview is not selected by the profile: it applies to whatever target is. */
export const PREVIEW_PACKAGE = "@pen-enterprise/target-preview";
/**
 * Composed at resolution rather than in `pack.ts`, because a preview is a
 * property of the renderer, not a step in the sequence — see `BundlePreview` for
 * why it cannot be a peer. The next adapter gets a preview for free, and the
 * whole product's one caller of `targetFor` keeps its one line.
 */
function previewed(target, preview) {
    return {
        id: target.id,
        what: `${target.what} — plus ${preview.what}`,
        render: (input) => {
            const produced = target.render(input);
            return [...produced, ...preview.preview(input, produced)];
        },
    };
}
export async function targetFor(id) {
    if (!id)
        return null;
    const known = KNOWN.find((k) => k.id === id);
    let target = registered.get(id) ?? null;
    if (!target && known) {
        const mod = await optionalModule(known.package);
        // Whatever the package calls its export, the id is what identifies it — so a
        // package wired to the wrong entry point answers for nothing rather than for
        // a target the profile did not ask for.
        target =
            Object.values(mod ?? {}).find((v) => !!v && typeof v === "object" && v.id === id) ?? null;
    }
    if (!target)
        return null;
    const mod = await optionalModule(PREVIEW_PACKAGE);
    const preview = Object.values(mod ?? {}).find((v) => !!v && typeof v === "object" && typeof v.preview === "function");
    return preview ? previewed(target, preview) : target;
}
/** The sentence a transport prints when nothing answered. Names the package. */
export function noAdapter(id) {
    const known = KNOWN.find((k) => k.id === id);
    if (known) {
        return (`runtime target '${known.id}' is not installed. It ships separately as ` +
            `${known.package} — install it, or hand buildChangePack your own adapter.`);
    }
    return (`no adapter for runtime target '${id ?? "(none declared)"}'. enterprise/profile.json names ` +
        `the target; published adapters are: ${KNOWN.map((k) => `${k.id} (${k.package})`).join(", ")}`);
}
//# sourceMappingURL=targets.js.map
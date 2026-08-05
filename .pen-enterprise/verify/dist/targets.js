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
/**
 * Distinguishing "not installed" from "installed and broken" matters more than it
 * looks: swallowing every import failure would report a missing package for an
 * adapter that is present and throwing, and whoever read that would go install
 * something they already have. Only the specifier's own resolution failure counts.
 */
function notInstalled(err, specifier) {
    const e = err;
    return e?.code === "ERR_MODULE_NOT_FOUND" && (e.message ?? "").includes(specifier);
}
export async function targetFor(id) {
    if (!id)
        return null;
    const own = registered.get(id);
    if (own)
        return own;
    const known = KNOWN.find((k) => k.id === id);
    if (!known)
        return null;
    try {
        const mod = (await import(known.package));
        // Whatever the package calls its export, the id is what identifies it — so a
        // package wired to the wrong entry point answers for nothing rather than for
        // a target the profile did not ask for.
        return (Object.values(mod).find((v) => !!v && typeof v === "object" && v.id === id) ?? null);
    }
    catch (err) {
        if (notInstalled(err, known.package))
            return null;
        throw err;
    }
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
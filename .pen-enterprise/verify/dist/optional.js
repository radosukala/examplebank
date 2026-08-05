/**
 * LOADING A PACKAGE THIS ONE DOES NOT DEPEND ON.
 *
 * Three things now ship beside the resolver rather than inside it — a runtime
 * target, a preview, and the seam generator — and each is optional in the sense
 * that matters: the gate still gates when it is absent. That property is only
 * real if `src/` never imports them, so every one of them arrives through here.
 *
 * The distinction this file exists for is between "not installed" and "installed
 * and throwing". Swallowing every import failure would report a missing package
 * for one that is present and broken, and whoever read that would go install
 * something they already have. Only the specifier's own resolution failure counts;
 * anything else is somebody's bug and is rethrown.
 */
export function notInstalled(err, specifier) {
    const e = err;
    return e?.code === "ERR_MODULE_NOT_FOUND" && (e.message ?? "").includes(specifier);
}
export async function optionalModule(specifier) {
    try {
        return (await import(specifier));
    }
    catch (err) {
        if (notInstalled(err, specifier))
            return null;
        throw err;
    }
}
/** The sentence a transport prints when one is missing. Names it, so it is actionable. */
export function notInstalledMessage(specifier, what) {
    return `${what} ships separately as ${specifier}, and it is not installed here — \`npm i ${specifier}\`.`;
}
//# sourceMappingURL=optional.js.map
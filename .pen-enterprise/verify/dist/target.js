/**
 * A RUNTIME TARGET — the seam, and nothing that implements it.
 *
 * Liferay DXP mindshare fell 12.7% → 9.1% year on year. We build one adapter
 * because the demo needs a real one, and we put an interface in front of it so
 * that fact stays a demo choice rather than a product decision. AEM, a Spring
 * shop's in-house shell and a Next.js estate are the same shape of problem: take
 * a screen whose every binding is sanctioned, and emit something their platform
 * already knows how to deploy.
 *
 * The interface stays HERE while the adapter lives in `@pen-enterprise/target-liferay`,
 * because a contract owned by its only implementation is not a contract — the
 * side that has to keep it stable is the side that calls it. Which is also why
 * this file cannot leave: core must compile with every adapter absent.
 *
 * **What a target may see is deliberately narrow.** These input types are declared
 * here rather than imported from the gate or the receipt, and `test/boundary.test.ts`
 * enforces it: the moment output formatting can reach the verdict, the verdict stops
 * being auditable from its inputs alone. A `GateResult`'s bindings and a `Receipt`
 * satisfy these shapes structurally, so the CLI passes them straight through — but
 * nothing here can call back into the decision.
 *
 * Read-only, like everything else. A target returns bytes and their digests; who
 * writes them is the caller's problem, and usually their scaffolder's.
 */
import path from "node:path";
import { parse } from "yaml";
import { sha256 } from "./fs.js";
export function exported(path, contents, what) {
    return { path, contents, sha256: sha256(contents), what };
}
/** Required header names for one operation, following $refs into components. */
function requiredHeaders(spec, parameters) {
    const out = [];
    for (const raw of parameters) {
        const p = raw.$ref?.startsWith("#/components/parameters/")
            ? spec.components?.parameters?.[raw.$ref.split("/").pop()]
            : raw;
        if (p?.in === "header" && p.required && p.name)
            out.push(p.name);
    }
    return out;
}
const ROLE_SUFFIXES = ["-tile", "-panel", "-card", "-list", "-widget", "-block"];
function segmentOf(node) {
    for (const suffix of ROLE_SUFFIXES) {
        if (node.endsWith(suffix))
            return node.slice(0, -suffix.length);
    }
    return node;
}
/**
 * A catalog entry says *what* is sanctioned. A bundle has to call *something*, and
 * the something is in the spec the entry points at.
 *
 * One GET means one answer. Several means the node has to disambiguate, and the
 * only honest tiebreak is its own name: `cards-tile` picks the path with `cards` in
 * it. When neither rule fires we return nothing and the bundle says so, because a
 * generated `fetch` at a guessed URL is exactly the kind of plausible wrongness
 * that costs a room.
 */
export async function resolveOperations(root, catalog, bound, read) {
    if (!catalog.source)
        return {};
    const catalogDir = path.dirname(catalog.source);
    const specs = new Map();
    for (const cap of catalog.capabilities) {
        if (!cap.definition || cap.definition.includes("://"))
            continue;
        const rel = path.normalize(path.join(catalogDir, cap.definition));
        const text = await read(path.join(path.resolve(root), rel));
        if (!text)
            continue;
        try {
            specs.set(cap.ref, { rel, spec: parse(text) });
        }
        catch {
            /* an unparseable spec resolves to nothing, which the bundle will report */
        }
    }
    const out = {};
    for (const b of bound) {
        if (!b.ref)
            continue;
        const hit = specs.get(b.ref);
        if (!hit)
            continue;
        const gets = [];
        for (const [route, operations] of Object.entries(hit.spec.paths ?? {})) {
            for (const [method, op] of Object.entries(operations)) {
                if (method.toLowerCase() === "get") {
                    gets.push({ method: "GET", path: route, parameters: op?.parameters ?? [] });
                }
            }
        }
        const chosen = gets.length === 1 ? gets[0] : gets.find((g) => g.path.includes(segmentOf(b.node)));
        if (!chosen)
            continue;
        out[b.node] = {
            capability: b.ref,
            method: chosen.method,
            path: chosen.path,
            server: hit.spec.servers?.[0]?.url ?? null,
            required_headers: requiredHeaders(hit.spec, chosen.parameters),
            spec: hit.rel,
        };
    }
    return out;
}
//# sourceMappingURL=target.js.map
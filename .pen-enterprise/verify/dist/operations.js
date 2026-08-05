/**
 * WHICH OPERATION A CAPABILITY ACTUALLY MEANS.
 *
 * A catalog entry says *what* is sanctioned. A bundle has to call *something*, and
 * the something is in the spec the entry points at — so this is the one place that
 * reads the enterprise's OpenAPI documents, and everything a target learns about
 * their APIs comes through here.
 *
 * It sits beside the contract rather than inside it: `target.ts` is what an adapter
 * author reads to learn what they may see, and a spec parser in the middle of that
 * is a page they have to skip. It is not the decision core either — nothing here
 * reaches a verdict; the gate has already decided by the time any of this runs.
 */
import path from "node:path";
import { parse } from "yaml";
/** A JSON pointer inside the same document. External `$ref` resolves to nothing. */
function deref(spec, node) {
    let seen = 0;
    let current = node;
    while (current?.$ref) {
        if (!current.$ref.startsWith("#/") || ++seen > 8)
            return null;
        let target = spec;
        for (const key of current.$ref.slice(2).split("/")) {
            target = target?.[key.replace(/~1/g, "/").replace(/~0/g, "~")];
        }
        current = (target ?? null);
    }
    return current;
}
/**
 * A 200 body, assembled from what the schema DECLARES.
 *
 * Nothing here is invented, which is the same rule the seam generator follows and
 * the reason anyone believes either of them. A declared `example` is used, an
 * `enum` yields its first member, and a field the spec describes without saying
 * what it looks like comes out as `⟨fieldName⟩` — visibly a hole, so a reviewer
 * looking at a preview can tell at a glance which values are the bank's own and
 * which are the shape of an answer nobody has specified yet.
 *
 * One array item, not three. A list is a list at one row, and the second row
 * would be the first invented thing on the page.
 */
function sampleOf(spec, node, name, depth = 0) {
    const schema = node ? deref(spec, node) : null;
    if (!schema || depth > 6)
        return null;
    if (schema.example !== undefined)
        return schema.example;
    if (schema.enum?.length)
        return schema.enum[0];
    if (schema.type === "array")
        return [sampleOf(spec, schema.items, name, depth + 1)];
    if (schema.properties) {
        const out = {};
        for (const [key, value] of Object.entries(schema.properties)) {
            out[key] = sampleOf(spec, value, key, depth + 1);
        }
        return out;
    }
    return `⟨${name}⟩`;
}
function sampleFor(spec, operation) {
    const ok = Object.entries(operation.responses ?? {}).find(([status]) => status.startsWith("2"));
    const body = ok ? deref(spec, ok[1]) : null;
    const schema = body?.content?.["application/json"]?.schema;
    return schema ? sampleOf(spec, schema, "value") : null;
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
                    gets.push({ method: "GET", path: route, parameters: op?.parameters ?? [], op: op ?? {} });
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
            sample: sampleFor(hit.spec, chosen.op),
        };
    }
    return out;
}
//# sourceMappingURL=operations.js.map
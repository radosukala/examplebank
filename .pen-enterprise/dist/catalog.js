/**
 * THE CATALOG — the enterprise's own list of sanctioned capabilities, and the
 * question "is what stands behind this node on it?"
 *
 * Two things this module is deliberately NOT:
 *
 *  1. **Not runtime discovery.** It resolves DECLARED bindings against a catalog
 *     the customer exported. It does not observe network traffic and never
 *     claims to have found every call an application makes. That is API-security
 *     territory — Akamai, Salt, Noname — and the promise would not survive a
 *     pilot. The honest gap has a name here: UNDECLARED.
 *
 *  2. **Not a source of truth.** A catalog entry says what an organisation has
 *     SANCTIONED, not what an app actually calls. So the catalog is an input,
 *     pinned by content hash, and every verdict records which revision of it was
 *     applied. Catalogs move; a decision that cannot say which version of the
 *     rules it used is not auditable, and auditability is most of what is bought.
 *
 * Backstage's field names pass through unrenamed — kind, spec.type, spec.lifecycle,
 * spec.owner. The moment an architect sees an invented schema, this becomes a toy.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseAllDocuments } from "yaml";
import { sha256 } from "./fs.js";
import { NO_CAPABILITY } from "./profile.js";
export const EMPTY_CATALOG = {
    source: null,
    revision: null,
    format: null,
    capabilities: [],
    skipped: [],
};
/** Kinds a screen can stand on. A System or Group is a grouping, not a dependency. */
const BINDABLE_KINDS = new Set(["api", "component", "resource"]);
export const SUPERSEDED_BY = "pen.dev/superseded-by";
function str(v) {
    return typeof v === "string" && v.length > 0 ? v : null;
}
function toCapability(raw) {
    const e = (raw ?? {});
    const meta = (e.metadata ?? {});
    const spec = (e.spec ?? {});
    const kind = str(e.kind);
    const name = str(meta.name);
    if (!kind || !name)
        return { skip: "no kind or metadata.name", entity: name ?? "(unnamed)" };
    if (!BINDABLE_KINDS.has(kind.toLowerCase())) {
        return { skip: `kind ${kind} is not bindable`, entity: name };
    }
    const namespace = str(meta.namespace) ?? "default";
    // spec.owner is usually a string but may arrive as an entity object.
    const owner = str(spec.owner) ?? str(spec.owner?.name);
    const definition = str(spec.definition?.$text);
    return {
        ref: `${kind}:${namespace}/${name}`.toLowerCase(),
        kind: kind.toLowerCase(),
        name,
        namespace,
        type: str(spec.type),
        lifecycle: str(spec.lifecycle)?.toLowerCase() ?? null,
        owner,
        system: str(spec.system),
        tags: Array.isArray(meta.tags) ? meta.tags.filter((t) => typeof t === "string") : [],
        description: str(meta.description),
        annotations: Object.fromEntries(Object.entries((meta.annotations ?? {})).filter((kv) => typeof kv[1] === "string")),
        definition,
    };
}
/**
 * Read a catalog export. Both shapes an enterprise actually has:
 *
 *   - `catalog-info.yaml`, possibly multi-document — the file an architect
 *     recognises, committed beside their services.
 *   - a JSON array from `GET /api/catalog/entities` — usually the faster path
 *     through a security review, because it needs no repository access at all.
 */
export async function loadCatalog(root, rel) {
    let bytes;
    try {
        bytes = await readFile(path.resolve(root, rel));
    }
    catch {
        return { ...EMPTY_CATALOG, source: rel };
    }
    const revision = sha256(bytes);
    const text = bytes.toString("utf8");
    const isJson = rel.endsWith(".json");
    let docs;
    try {
        if (isJson) {
            const parsed = JSON.parse(text);
            const items = parsed.items;
            docs = Array.isArray(items) ? items : Array.isArray(parsed) ? parsed : [parsed];
        }
        else {
            docs = parseAllDocuments(text).map((d) => d.toJS({ maxAliasCount: 100 }));
        }
    }
    catch (err) {
        return {
            ...EMPTY_CATALOG,
            source: rel,
            revision,
            skipped: [{ entity: rel, reason: `unparseable: ${err.message}` }],
        };
    }
    const capabilities = [];
    const skipped = [];
    const seen = new Set();
    for (const doc of docs) {
        if (doc === null || doc === undefined)
            continue;
        const out = toCapability(doc);
        if ("skip" in out) {
            skipped.push({ entity: out.entity, reason: out.skip });
            continue;
        }
        if (seen.has(out.ref)) {
            skipped.push({ entity: out.ref, reason: "duplicate entity ref" });
            continue;
        }
        seen.add(out.ref);
        capabilities.push(out);
    }
    capabilities.sort((a, b) => a.ref.localeCompare(b.ref));
    return { source: rel, revision, format: isJson ? "backstage-json" : "backstage-yaml", capabilities, skipped };
}
export function verdictFor(ref, component, catalog, policy) {
    if (!ref) {
        // A node with an approved component but no declared capability is a real,
        // common state and it is NOT the same as an empty node.
        if (component) {
            return {
                verdict: "UNDECLARED",
                ref: null,
                capability: null,
                reason: `${component} does not declare which catalogued capability it consumes`,
            };
        }
        return { verdict: "UNBOUND", ref: null, capability: null, reason: "no component and no capability" };
    }
    if (ref === NO_CAPABILITY) {
        return {
            verdict: "SELF_CONTAINED",
            ref: NO_CAPABILITY,
            capability: null,
            reason: "declared to reach nothing outside itself",
        };
    }
    if (policy.deny.some((d) => d.toLowerCase() === ref)) {
        return { verdict: "OFF_MENU", ref, capability: null, reason: `${ref} is on the deny list` };
    }
    const cap = catalog.capabilities.find((c) => c.ref === ref) ?? null;
    if (!cap) {
        return {
            verdict: "OFF_MENU",
            ref,
            capability: null,
            reason: `${ref} is not in ${catalog.source ?? "the registered catalog"}`,
        };
    }
    if (cap.lifecycle && !policy.allowed_lifecycles.includes(cap.lifecycle)) {
        return {
            verdict: "DEPRECATED",
            ref,
            capability: cap,
            reason: `${ref} is lifecycle "${cap.lifecycle}"; this lane allows ${policy.allowed_lifecycles.join(", ")}`,
        };
    }
    return {
        verdict: "ON_MENU",
        ref,
        capability: cap,
        reason: `${ref} is sanctioned${cap.owner ? `, owned by ${cap.owner}` : ""}`,
    };
}
export function isBlocking(v, policy) {
    return policy.blocking.includes(v);
}
function tokens(ref) {
    const name = ref.split("/").pop() ?? ref;
    return new Set(name.split(/[-_.]/).filter((t) => t.length > 2));
}
function overlap(a, b) {
    let n = 0;
    for (const t of a)
        if (b.has(t))
            n++;
    return n;
}
/**
 * The sanctioned thing they probably meant.
 *
 * This is the difference between a linter and a workflow. A refusal that only
 * says no makes the tool an obstacle to route around; one that names the group
 * who can say yes, and the capability that would have been fine, is a step in
 * somebody's process.
 *
 * Three sources, strongest first, and the answer always reports which it used —
 * a heuristic presented as a fact is worse than no suggestion at all.
 */
export function suggestAlternative(ref, catalog, policy) {
    if (!ref || ref === NO_CAPABILITY)
        return null;
    const allowed = catalog.capabilities.filter((c) => c.ref !== ref && (!c.lifecycle || policy.allowed_lifecycles.includes(c.lifecycle)));
    if (allowed.length === 0)
        return null;
    // 1. The catalog said so itself.
    const refused = catalog.capabilities.find((c) => c.ref === ref);
    const declared = refused?.annotations[SUPERSEDED_BY]?.toLowerCase();
    if (declared) {
        const hit = allowed.find((c) => c.ref === declared);
        if (hit) {
            return { ref: hit.ref, name: hit.name, owner: hit.owner, basis: "declared-by-catalog", confidence: "stated" };
        }
    }
    const want = tokens(ref);
    const rank = (pool) => {
        let best = null;
        let bestScore = 0;
        for (const c of pool) {
            const score = overlap(want, tokens(c.ref));
            if (score > bestScore) {
                best = c;
                bestScore = score;
            }
        }
        return bestScore > 0 ? best : null;
    };
    // 2. Same system, closest name. 3. Failing that, closest name anywhere.
    if (refused?.system) {
        const hit = rank(allowed.filter((c) => c.system === refused.system));
        if (hit)
            return { ref: hit.ref, name: hit.name, owner: hit.owner, basis: "same-system", confidence: "inferred" };
    }
    const byName = rank(allowed);
    if (byName) {
        return { ref: byName.ref, name: byName.name, owner: byName.owner, basis: "same-name", confidence: "inferred" };
    }
    return null;
}
/**
 * Who can say yes. For a catalogued capability the owner is stated; for one that
 * is not, the only honest move is to name the group owning the nearest
 * catalogued sibling and label the answer inferred. An architect forgives a
 * guess that admits it, and never forgives one that does not.
 */
export function ownerToAsk(ref, catalog, policy) {
    if (!ref || ref === NO_CAPABILITY)
        return null;
    const exact = catalog.capabilities.find((c) => c.ref === ref);
    if (exact?.owner)
        return { group: exact.owner, confidence: "stated" };
    const near = suggestAlternative(ref, catalog, policy);
    return near?.owner ? { group: near.owner, confidence: "inferred" } : null;
}
//# sourceMappingURL=catalog.js.map
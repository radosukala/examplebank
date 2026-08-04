import { type BindingVerdict, type Policy } from "./profile.js";
export interface Capability {
    /** Backstage entity ref, lowercased: "api:default/deals-api". The stable key. */
    ref: string;
    kind: string;
    name: string;
    namespace: string;
    type: string | null;
    lifecycle: string | null;
    owner: string | null;
    system: string | null;
    tags: string[];
    description: string | null;
    /**
     * metadata.annotations, unrenamed.
     *
     * Backstage has no standard "this replaced that" field, so the catalog gets a
     * way to say it directly: `pen.dev/superseded-by`. Letting the catalog name
     * its own successor beats any similarity heuristic we could invent, and a
     * platform team corrects a bad suggestion by editing a file they already own.
     */
    annotations: Record<string, string>;
    /**
     * `spec.definition.$text` — where the entity's OpenAPI document lives, relative to
     * the catalog file. Backstage requires it on kind: API and resolves it itself.
     *
     * We carry it for one reason: a stub we propose has to match the house style of the
     * specs the enterprise already writes, and the only way to match a style is to read
     * it. Nothing in the gate looks at this.
     */
    definition: string | null;
}
export interface Catalog {
    source: string | null;
    /** sha256 of the source bytes. THE thing a receipt pins. */
    revision: string | null;
    format: "backstage-yaml" | "backstage-json" | null;
    capabilities: Capability[];
    /** Entities skipped, with the reason. An empty catalog must never be silent. */
    skipped: {
        entity: string;
        reason: string;
    }[];
}
export declare const EMPTY_CATALOG: Catalog;
export declare const SUPERSEDED_BY = "pen.dev/superseded-by";
/**
 * Read a catalog export. Both shapes an enterprise actually has:
 *
 *   - `catalog-info.yaml`, possibly multi-document — the file an architect
 *     recognises, committed beside their services.
 *   - a JSON array from `GET /api/catalog/entities` — usually the faster path
 *     through a security review, because it needs no repository access at all.
 */
export declare function loadCatalog(root: string, rel: string): Promise<Catalog>;
/**
 * Six states, and the fifth one is the point.
 *
 *   ON_MENU         declared, in the catalog, lifecycle allowed here
 *   SELF_CONTAINED  declared to reach nothing — a pure UI or formula element
 *   DEPRECATED      in the catalog, but its lifecycle is not allowed in this lane
 *   OFF_MENU        declared, and NOT in the catalog (or explicitly denied)
 *   UNDECLARED      the node has a subject, but nothing says what it consumes
 *   UNBOUND         no component and no capability — exploration, not a contract
 *
 * UNDECLARED is not a pass. SELF_CONTAINED exists so that UNDECLARED keeps
 * meaning something: without a way to say "this genuinely reaches nothing",
 * every UI-only element sits in the unknown pile forever and people stop reading
 * the number.
 */
export interface CapabilityVerdict {
    verdict: BindingVerdict;
    ref: string | null;
    capability: Capability | null;
    reason: string;
}
export declare function verdictFor(ref: string | null, component: string | null, catalog: Catalog, policy: Policy): CapabilityVerdict;
export declare function isBlocking(v: BindingVerdict, policy: Policy): boolean;
export interface Alternative {
    ref: string;
    name: string;
    owner: string | null;
    basis: "declared-by-catalog" | "same-system" | "same-name";
    confidence: "stated" | "inferred";
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
export declare function suggestAlternative(ref: string | null, catalog: Catalog, policy: Policy): Alternative | null;
/**
 * Who can say yes. For a catalogued capability the owner is stated; for one that
 * is not, the only honest move is to name the group owning the nearest
 * catalogued sibling and label the answer inferred. An architect forgives a
 * guess that admits it, and never forgives one that does not.
 */
export declare function ownerToAsk(ref: string | null, catalog: Catalog, policy: Policy): {
    group: string;
    confidence: "stated" | "inferred";
} | null;
//# sourceMappingURL=catalog.d.ts.map
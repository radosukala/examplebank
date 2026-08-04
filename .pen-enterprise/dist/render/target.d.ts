import type { Catalog } from "../catalog.js";
import type { Design } from "../seam.js";
export interface ExportedFile {
    path: string;
    contents: string;
    sha256: string;
    what: string;
}
/** One node the gate already judged. Structurally an `EvaluatedBinding`. */
export interface BoundNode {
    screen: string;
    node: string;
    label: string | null;
    component: string | null;
    ref: string | null;
    verdict: string;
    owner: string | null;
}
/** The HTTP operation a capability actually means, read out of their own spec. */
export interface ResolvedOperation {
    capability: string;
    method: string;
    path: string;
    server: string | null;
    /** Headers their spec marks required. Omitting them is a 400 at a real gateway. */
    required_headers: string[];
    spec: string;
}
/**
 * What the bundle embeds.
 *
 * Every field optional, and no index signature — a `Receipt` has to satisfy this
 * structurally, and an index signature would make it not. What is named here is
 * only what a generated file prints in a comment header; the WHOLE receipt is what
 * gets serialised, because a signature covers the whole body and a trimmed copy
 * would verify against nothing.
 */
export interface EmbeddedReceipt {
    issued_at?: string;
    organization?: string | null;
    runtime_target?: string | null;
    catalog?: {
        source?: string | null;
        revision?: string | null;
    };
    policy_hash?: string;
    capabilities?: unknown[];
    signature?: {
        alg?: string;
        key_id?: string;
    } | null;
    unsigned_reason?: string;
}
/** The approved component library, as much of it as a runtime adapter needs. */
export interface ApprovedComponent {
    id: string;
    runtime?: Record<string, {
        client_extension_id?: string;
        html_element_name?: string;
        workspace?: string;
    }>;
}
export interface ApprovedLibrary {
    tokens?: Record<string, string>;
    components?: ApprovedComponent[];
}
export interface ExportInput {
    /** `profile.runtime.target`, as the enterprise stated it. */
    target: string;
    organization: string | null;
    design: Design;
    library: ApprovedLibrary | null;
    bound: BoundNode[];
    /** node id → the operation it stands on. Absent means nothing to call. */
    operations: Record<string, ResolvedOperation>;
    receipt: EmbeddedReceipt | null;
}
export interface RuntimeTarget {
    /** Matches `profile.runtime.target` exactly. No aliasing, no fuzzy matching. */
    readonly id: string;
    readonly what: string;
    render(input: ExportInput): ExportedFile[];
}
export declare function exported(path: string, contents: string, what: string): ExportedFile;
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
export declare function resolveOperations(root: string, catalog: Catalog, bound: BoundNode[], read: (abs: string) => Promise<string | null>): Promise<Record<string, ResolvedOperation>>;
//# sourceMappingURL=target.d.ts.map
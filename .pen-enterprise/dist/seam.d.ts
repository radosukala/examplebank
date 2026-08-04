import { type Alternative, type Catalog } from "./catalog.js";
import type { GateResult } from "./export-gate.js";
import { type Policy } from "./profile.js";
/**
 * One field the screen displays.
 *
 * `layer` is the whole point. An architect asking "why is this field in my
 * contract?" gets a pixel as the answer, and that is a defensible reason where
 * "the model thought so" is not.
 */
export interface FieldEvidence {
    name: string;
    type: "string" | "integer" | "number" | "boolean";
    format?: string;
    enum?: string[];
    required: boolean;
    description?: string;
    layer: string;
}
export interface DataShape {
    fields: FieldEvidence[];
    /** The content already on the canvas. It becomes the fixture, unchanged. */
    sample: unknown;
}
export interface DesignNode {
    id: string;
    label?: string | null;
    role?: string;
    component?: string | null;
    data_props?: string[];
    data_shape?: Record<string, DataShape>;
    /** Literal values the designer set. They travel into the compiled bundle. */
    props?: Record<string, unknown>;
    placement?: {
        column?: number;
        span?: number;
        row?: number;
        row_span?: number;
    };
    /** The states actually drawn. A bundle that renders fewer is not the design. */
    states?: string[];
}
export interface Design {
    screen: string;
    name?: string;
    /** The group who owns the journey. The seam inherits it. */
    owner?: string | null;
    nodes: DesignNode[];
    /**
     * Layout, for whatever compiles this into a runtime. The seam generator ignores
     * it — a contract does not have a column count — but the export cannot.
     */
    canvas?: {
        base_width?: number;
        grid?: {
            columns?: number;
            gutter?: string;
            margin?: string;
        };
    };
    runtime_target?: string;
}
/**
 * Where designs come from. An interface for the same reason bindings have one:
 * today a committed JSON file, tomorrow a live pen.dev canvas read over MCP, and
 * the derivation must not be able to tell.
 */
export interface DesignSource {
    readonly name: string;
    load(): Promise<Design[]>;
}
export declare function designSource(root: string, rels: string[]): DesignSource;
interface LibraryProp {
    type?: string;
    required?: boolean;
}
interface LibraryComponent {
    id: string;
    props?: Record<string, LibraryProp> | null;
}
export interface ComponentLibrary {
    components?: LibraryComponent[];
}
/**
 * Everything a generated spec needs in order to look like the enterprise wrote it.
 *
 * Read, never assumed: the security scheme, the correlation header, the error
 * shape, the collection envelope and the server list are copied out of a spec they
 * already maintain. "It matches your house style" is then a checkable claim rather
 * than a compliment.
 */
export interface HouseStyle {
    /** Which of their specs this came from. Printed, because it is the evidence. */
    source: string;
    openapi: string;
    servers: unknown[];
    license: unknown;
    /** Their contact URL with the group slug replaced by `{group}`. */
    contact_url_template: string | null;
    security_scheme_name: string;
    security_scheme: Record<string, unknown> | null;
    correlation_parameter: Record<string, unknown> | null;
    correlation_parameter_name: string;
    problem_schema: unknown;
    /** components.responses, verbatim, so the refs below resolve. */
    responses: Record<string, unknown>;
    /** The non-2xx responses every operation declares, verbatim. */
    error_responses: Record<string, unknown>;
    /** Their collection envelope schema, with the item $ref left to be filled in. */
    collection_schema: Record<string, unknown> | null;
    collection_items_key: string;
    /** How they name a page of X — "CardSummaryPage" minus "CardSummary" is "Page". */
    collection_suffix: string;
    /** Where specs live and what they are called: "apis" + ".openapi.yaml". */
    spec_dir: string;
    spec_suffix: string;
    /** The exemplar entity's tags, so a draft entry is filed the way they file things. */
    tags: string[];
    /** Path prefixes already serving a journey, e.g. { dashboard: "/experience/dashboard" }. */
    journey_prefixes: Record<string, string>;
}
/**
 * Pick the exemplar and copy from it.
 *
 * The exemplar is the alphabetically first production API their own spec marks
 * channel-safe — deterministic, and the same tier the seam will serve. Falling
 * back to "any production API" is wrong here: copying a core-tier spec would hand
 * a customer channel a service-identity flow.
 */
export declare function readHouseStyle(root: string, catalog: Catalog, policy: Policy, readSpec: (abs: string) => Promise<string | null>): Promise<HouseStyle | null>;
export interface Gap {
    screen: string;
    node: string;
    label: string | null;
    component: string | null;
    verdict: "OFF_MENU" | "UNDECLARED";
    /** The ref the enterprise declared but never catalogued. */
    declared_ref: string | null;
    /** A sanctioned near-match nobody has confirmed. Build only after checking it. */
    unconfirmed_alternative: Alternative | null;
}
export interface NotASeam {
    screen: string;
    node: string;
    label: string | null;
    reason: string;
    route_to_yes: string | null;
}
/**
 * Which refusals are actually missing seams.
 *
 * A stated alternative means the capability exists and the fix is one line in a
 * binding. Generating a service for it would be the most expensive possible way to
 * answer a question the catalog already answered.
 */
export declare function gapsFor(gate: GateResult): {
    gaps: Gap[];
    not_seams: NotASeam[];
};
export interface SeamOperation {
    node: string;
    label: string | null;
    prop: string;
    operation_id: string;
    method: "get";
    path: string;
    scope: string;
    schema_name: string;
    collection: boolean;
    fields: FieldEvidence[];
    sample: unknown;
    /** Set when the design records nothing about what this node shows. */
    unknown_shape: string | null;
}
export interface SeamFile {
    path: string;
    contents: string;
    sha256: string;
    what: string;
}
export interface Seam {
    id: string;
    ref: string;
    screen: string;
    /** The screen as a slug — how their own specs tag operations. */
    journey: string;
    title: string;
    /** Whether the name came from their own binding or from the journey. */
    name_basis: "declared-by-binding" | "derived-from-journey";
    owner: {
        group: string | null;
        confidence: "stated" | "inferred" | "unresolved";
    };
    lifecycle: string;
    operations: SeamOperation[];
    /** What must change in the binding manifest for this seam to resolve the gap. */
    binding_changes: {
        node: string;
        from: string | null;
        to: string;
    }[];
    /** What a human must decide before this is merged. Each appears as TODO in a file. */
    decisions: string[];
    files: SeamFile[];
}
export interface SeamProposal {
    organization: string | null;
    /** The revision every verdict here was computed against. The receipt pins the next one. */
    catalog_revision_before: string | null;
    policy_hash: string;
    house_style: {
        source: string;
    } | null;
    seams: Seam[];
    not_seams: NotASeam[];
    headline: string;
    notes: string[];
}
export interface DeriveInputs {
    gate: GateResult;
    catalog: Catalog;
    designs: Design[];
    library: ComponentLibrary | null;
    house: HouseStyle | null;
    policy: Policy;
}
export declare function deriveSeams(inputs: DeriveInputs): SeamProposal;
export declare const DEFAULT_DESIGN = "design/dashboard.json";
export interface ProposeOptions {
    designs?: string[];
    source?: DesignSource;
}
/**
 * Read profile, catalog, designs and library from a directory, then derive.
 *
 * Reads only. The proposal carries every file's bytes and its sha256 so a caller
 * can write them, hand them to a scaffolder, or pin them in a receipt — but the
 * writing is never ours, which is what keeps "this tool has never had write access
 * to anything" true.
 */
export declare function proposeSeams(root: string, gate: GateResult, catalog: Catalog, opts?: ProposeOptions): Promise<SeamProposal>;
export {};
//# sourceMappingURL=seam.d.ts.map
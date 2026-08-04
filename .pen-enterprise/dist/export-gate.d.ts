/**
 * THE REFUSAL — may this leave the canvas?
 *
 * Everything else here reports. This decides, and a decision is a different kind
 * of object: it must name the offending node, the capability it reached for, the
 * group who owns that capability, the clause of the customer's own policy that
 * stopped it, and what would have been fine instead. A refusal nobody can act on
 * is an obstacle people learn to route around.
 *
 * Computed against a PINNED catalog revision and a PINNED policy hash.
 *
 * Still read-only. This blocks by ANSWERING — whatever holds the artifact is
 * what declines to hand it over. Keeping the decision and the enforcement in
 * separate processes is precisely what lets an enterprise put the enforcement
 * inside a trust boundary they already own, which is the thing the governed-app
 * platforms structurally cannot offer.
 */
import { type Alternative, type Catalog } from "./catalog.js";
import { type Binding, type BindingSource, type BindingVerdict, type LoadedProfile, type Policy } from "./profile.js";
export interface EvaluatedBinding extends Binding {
    verdict: BindingVerdict;
    ref: string | null;
    capability_name: string | null;
    owner: string | null;
    lifecycle: string | null;
    system: string | null;
    reason: string;
    blocking: boolean;
}
export interface Refusal {
    screen: string;
    node: string;
    label: string | null;
    component: string | null;
    ref: string | null;
    reason: string;
    /** The policy clause that stopped it — printed so it can be argued with. */
    clause: string;
    /** The group who can approve, stated by the catalog or inferred. */
    ask: {
        group: string;
        confidence: "stated" | "inferred";
    } | null;
    /** The sanctioned capability they probably meant, and how we got there. */
    alternative: Alternative | null;
    /** One line a human can act on without reading JSON. */
    route_to_yes: string;
}
export interface GateResult {
    allowed: boolean;
    /** One sentence, written to be pasted into Slack unedited. */
    headline: string;
    organization: string | null;
    runtime_target: string | null;
    catalog: {
        source: string | null;
        revision: string | null;
        format: string | null;
        entries: number;
        skipped: number;
    };
    policy: Policy & {
        policy_hash: string;
    };
    binding_source: string;
    counts: Record<BindingVerdict, number>;
    bindings: EvaluatedBinding[];
    refusals: Refusal[];
    notes: string[];
}
/** The pure decision. Everything it needs is an argument; it touches no disk. */
export declare function evaluate(bindings: Binding[], catalog: Catalog, loaded: LoadedProfile, sourceName: string): GateResult;
/** Assemble profile + catalog + bindings from a directory, then decide. */
export declare function checkExport(root: string, source?: BindingSource): Promise<GateResult>;
//# sourceMappingURL=export-gate.d.ts.map
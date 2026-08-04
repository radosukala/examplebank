/**
 * THE EVIDENCE A REVIEWER READS.
 *
 * A required check that fails is only half of it. The other half is that whoever
 * gets the red X — usually not the person who wrote the design, and never someone
 * who has heard of us — can tell in ten seconds what was refused, against whose
 * rules, and who can say yes. A check that blocks a merge without answering those
 * three is an outage with a logo.
 *
 * So everything here is written for a stranger: the catalog is named and its
 * revision quoted, the policy clause is printed so it can be argued with, and the
 * route to yes is a sentence rather than an error code.
 *
 * Three outputs, one decision behind all of them:
 *
 *   annotations  workflow commands GitHub renders inline on the changed line
 *   summary      markdown for the job summary — the page a reviewer actually opens
 *   evidence     JSON for whoever automates on top of this later
 *
 * The input types are declared here rather than imported from the gate, and
 * `test/boundary.test.ts` enforces that. A `GateResult` satisfies them
 * structurally, so nothing is converted — but a formatter that cannot call the
 * gate cannot change what it reports.
 */
export interface ReportBinding {
    screen: string;
    node: string;
    label: string | null;
    component: string | null;
    ref: string | null;
    verdict: string;
    owner: string | null;
}
export interface ReportRefusal {
    screen: string;
    node: string;
    label: string | null;
    component: string | null;
    ref: string | null;
    reason: string;
    clause: string;
    ask: {
        group: string;
        confidence: string;
    } | null;
    route_to_yes: string;
}
/** Structurally a `GateResult`. */
export interface ReportGate {
    allowed: boolean;
    headline: string;
    organization: string | null;
    catalog: {
        source: string | null;
        revision: string | null;
        entries: number;
    };
    policy: {
        allowed_lifecycles: string[];
        blocking: string[];
        policy_hash: string;
    };
    counts: Record<string, number>;
    bindings: ReportBinding[];
    refusals: ReportRefusal[];
    notes: string[];
}
export interface ReportInput {
    gate: ReportGate;
    /** node → the OPERATION it resolved to. Entities are not the unit a caller uses. */
    operations: Record<string, {
        method: string;
        path: string;
        capability: string;
        spec: string;
    }>;
    /** owner group → the CODEOWNERS handles that can approve it. */
    routes: Record<string, {
        handles: string[];
        source: string;
    } | null>;
    /** Where each node's binding is declared, so an annotation lands on the line. */
    locations: Record<string, {
        file: string;
        line: number;
    }>;
    /** Governed files this PR touched. Evidence, never the scope of the check. */
    changed: {
        path: string;
        owners: string[];
    }[];
    /** Present only when the change was allowed — a refusal has no Change Pack. */
    pack: {
        signed_by: string | null;
        expires: string | null;
        files: {
            path: string;
            sha256: string;
        }[];
    } | null;
    tool: string;
    checked_at: string;
}
export declare function annotations(input: ReportInput): string;
export declare function summary(input: ReportInput): string;
export declare function evidence(input: ReportInput): string;
//# sourceMappingURL=ci-report.d.ts.map
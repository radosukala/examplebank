#!/usr/bin/env node
import { type ReportInput } from "./render/ci-report.js";
/**
 * We do not invent an approvals model. Every enterprise on GitHub already has one
 * in `CODEOWNERS`, already argued over, already enforced on the same merge button
 * we are blocking — so an exception routes to the team that owns the thing, and
 * nobody has to learn a second concept.
 *
 * A deliberate subset of the pattern syntax: anchoring, directory patterns, `*`
 * within a segment and `**` across segments. Enough for the paths that appear in a
 * governed repository, and it reports what it read so a mismatch is visible rather
 * than silent.
 */
export interface Codeowners {
    source: string;
    rules: {
        pattern: string;
        owners: string[];
    }[];
}
export declare function readCodeowners(root: string): Promise<Codeowners | null>;
/** GitHub's rule: the LAST matching pattern wins, not the most specific. */
export declare function ownersOf(codeowners: Codeowners | null, file: string): string[];
/**
 * `group:cards-platform` in the catalog, `@examplebank/cards-platform` in
 * CODEOWNERS. Matching on the slug is the only join that exists — and when there
 * is no match the report says "no CODEOWNERS entry" rather than inventing a
 * plausible handle, because a refusal routed to the wrong team is worse than one
 * routed nowhere.
 */
export declare function routeFor(codeowners: Codeowners | null, group: string): {
    handles: string[];
    source: string;
} | null;
export declare function report(root: string, changedPaths: string[], now?: Date): Promise<ReportInput>;
//# sourceMappingURL=ci.d.ts.map
import { type Catalog } from "./catalog.js";
import { type GateResult } from "./export-gate.js";
import { type LoadedProfile } from "./profile.js";
import { type Receipt } from "./receipt.js";
import { type Design } from "./seam.js";
import { type ExportedFile, type ResolvedOperation } from "./render/target.js";
export interface PackOptions {
    designs?: string[];
    expiresDays?: number | null;
}
/** Loaded once and handed round, so no two steps can read a different catalog. */
export interface PackContext {
    root: string;
    loaded: LoadedProfile;
    catalog: Catalog;
    gate: GateResult;
}
export declare function readContext(root: string): Promise<PackContext>;
export interface ChangePack {
    target: string;
    /** One line naming what the bundle IS, from the adapter. */
    what: string;
    design: Design;
    receipt: Receipt;
    files: ExportedFile[];
    /** Which catalogued operation each bound node resolved to — for a caller's summary. */
    operations: Record<string, ResolvedOperation>;
}
/**
 * A refused export produces NO bundle — not a warned one, not a draft one.
 *
 * `issueReceipt` refuses in turn, and the two refusals agreeing is what makes a
 * bundle's existence mean something. There is no override, and adding one would
 * quietly convert this from a control into a linter.
 */
export declare class RefusedError extends Error {
    readonly gate: GateResult;
    constructor(gate: GateResult);
}
export declare function buildChangePack(ctx: PackContext, opts?: PackOptions): Promise<ChangePack>;
//# sourceMappingURL=pack.d.ts.map
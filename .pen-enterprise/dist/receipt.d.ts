import type { GateResult } from "./export-gate.js";
export declare const RECEIPT_VERSION = 1;
export interface ReceiptCapability {
    screen: string;
    node: string;
    label: string | null;
    component: string | null;
    ref: string | null;
    capability_name: string | null;
    owner: string | null;
    lifecycle: string | null;
    system: string | null;
}
export interface ReceiptArtifact {
    path: string;
    sha256: string | null;
}
export interface ReceiptSignature {
    alg: "ed25519";
    /** sha256 of the public key's DER, first 32 hex — "is this my key?" */
    key_id: string;
    value: string;
}
export interface Receipt {
    receipt_version: number;
    issued_at: string;
    expires: string | null;
    organization: string | null;
    runtime_target: string | null;
    catalog: GateResult["catalog"];
    policy_hash: string;
    binding_source: string;
    counts: GateResult["counts"];
    capabilities: ReceiptCapability[];
    artifacts: ReceiptArtifact[];
    /**
     * The bundle this receipt shipped with — every generated file except the
     * receipt itself, which cannot hash its own contents. Without these the
     * receipt attests to its INPUTS only, and a reviewer holding a bundle has no
     * way to tell whether these bytes are the ones that were judged.
     */
    outputs: ReceiptArtifact[];
    signature: ReceiptSignature | null;
    unsigned_reason?: string;
}
/**
 * Deterministic JSON: keys sorted at every level, arrays left in order.
 *
 * Two processes must agree byte-for-byte on what was signed, and `JSON.stringify`
 * preserves insertion order — which differs between the issuer's object literal
 * and a round-tripped parse. Sorting removes the whole class of problem, and
 * without it every receipt would break on its way to a reviewer.
 */
export declare function canonicalize(value: unknown): string;
/** The bytes a signature covers: everything except the signature block itself. */
export declare function signingBody(r: Receipt): string;
export declare function keyIdOf(publicKeyPem: string): string;
export interface IssueOptions {
    /** PEM of the CUSTOMER'S Ed25519 private key. Omit → an unsigned receipt. */
    privateKeyPem?: string | null;
    expiresDays?: number | null;
    /** Root-relative artifact paths to pin — the Change Pack's contents. */
    artifacts?: string[];
    /** Generated bundle digests, already computed by the caller. */
    outputs?: ReceiptArtifact[];
    root?: string;
}
/**
 * Issue a receipt for a CLEAN export.
 *
 * Refuses on a blocked gate rather than emitting one with a caveat. The whole
 * value of the artifact is that its existence means something; a receipt that
 * can say "shipped anyway" is a log line, not a control.
 */
export declare function issueReceipt(gate: GateResult, opts?: IssueOptions, now?: Date): Promise<Receipt>;
export interface Check {
    name: string;
    ok: boolean;
    detail: string;
}
export interface VerifyResult {
    ok: boolean;
    signed: boolean;
    checks: Check[];
    summary: string;
}
export interface VerifyOptions {
    publicKeyPem?: string | null;
    /** Directory to re-hash artifacts against — "is it still what it says". */
    root?: string | null;
    now?: Date;
}
/**
 * Verify with no network access whatsoever.
 *
 * Four checks reported separately rather than collapsed into one boolean,
 * because they fail for different reasons and a reviewer needs to know which:
 * a bad signature is tampering, an expired receipt is staleness, and a changed
 * artifact hash is drift since issue.
 */
export declare function verifyReceipt(receipt: Receipt, opts?: VerifyOptions): Promise<VerifyResult>;
/** Ed25519 keypair, for tests and for a customer who has no key yet. */
export declare function generateReceiptKeyPair(): {
    privateKeyPem: string;
    publicKeyPem: string;
};
/** The signing key from the environment — a path, or inline PEM. Never a default. */
export declare function signingKeyFromEnv(env?: NodeJS.ProcessEnv): Promise<string | null>;
//# sourceMappingURL=receipt.d.ts.map
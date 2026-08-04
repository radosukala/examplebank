/**
 * THE CHANGE PACK RECEIPT — what shipped, what it was allowed to touch, and who says so.
 *
 * One constraint shapes every decision here: **a receipt must be verifiable by
 * someone who does not trust us and cannot reach us.**
 *
 * That rules out the obvious version. A signature we issue, checked at a URL we
 * host, proves only that our server still says yes — it moves the trust root to
 * the vendor and it stops working inside an air-gapped review. So the signing key
 * is the CUSTOMER'S (Ed25519, held by their CI or workload identity; we never see
 * the private half), verification is a pure function of the receipt bytes plus
 * their public key with no network of any kind, and an unsigned receipt says so
 * in a field called `unsigned_reason` rather than quietly resembling a signed one.
 *
 * The signature is not the innovation — Sigstore, in-toto and SLSA are commodity
 * and any bank security engineer knows it. What is unusual is *where* this
 * verifies: outside the tool that produced it, in the estate where the app runs.
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { sha256File } from "./fs.js";
export const RECEIPT_VERSION = 1;
/* ── canonical bytes ────────────────────────────────────────────────────── */
/**
 * Deterministic JSON: keys sorted at every level, arrays left in order.
 *
 * Two processes must agree byte-for-byte on what was signed, and `JSON.stringify`
 * preserves insertion order — which differs between the issuer's object literal
 * and a round-tripped parse. Sorting removes the whole class of problem, and
 * without it every receipt would break on its way to a reviewer.
 */
export function canonicalize(value) {
    if (value === null || typeof value !== "object")
        return JSON.stringify(value ?? null);
    if (Array.isArray(value))
        return "[" + value.map(canonicalize).join(",") + "]";
    const obj = value;
    return "{" + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
}
/** The bytes a signature covers: everything except the signature block itself. */
export function signingBody(r) {
    const { signature: _s, unsigned_reason: _u, ...body } = r;
    return canonicalize(body);
}
export function keyIdOf(publicKeyPem) {
    const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
    return createHash("sha256").update(der).digest("hex").slice(0, 32);
}
/**
 * Issue a receipt for a CLEAN export.
 *
 * Refuses on a blocked gate rather than emitting one with a caveat. The whole
 * value of the artifact is that its existence means something; a receipt that
 * can say "shipped anyway" is a log line, not a control.
 */
export async function issueReceipt(gate, opts = {}, now = new Date()) {
    if (!gate.allowed) {
        throw new Error(`refusing to issue a receipt: the export gate blocked ${gate.refusals.length} binding(s). ` +
            `First: ${gate.refusals[0]?.reason ?? "(unknown)"}`);
    }
    const artifacts = [];
    for (const rel of (opts.artifacts ?? []).slice().sort()) {
        artifacts.push({ path: rel, sha256: opts.root ? await sha256File(path.join(opts.root, rel)) : null });
    }
    const receipt = {
        receipt_version: RECEIPT_VERSION,
        issued_at: now.toISOString(),
        expires: opts.expiresDays === null || opts.expiresDays === undefined
            ? null
            : new Date(now.getTime() + opts.expiresDays * 86_400_000).toISOString(),
        organization: gate.organization,
        runtime_target: gate.runtime_target,
        catalog: gate.catalog,
        policy_hash: gate.policy.policy_hash,
        binding_source: gate.binding_source,
        counts: gate.counts,
        capabilities: gate.bindings
            .filter((b) => b.verdict === "ON_MENU")
            .map((b) => ({
            screen: b.screen,
            node: b.node,
            label: b.label,
            component: b.component,
            ref: b.ref,
            capability_name: b.capability_name,
            owner: b.owner,
            lifecycle: b.lifecycle,
            system: b.system,
        })),
        artifacts,
        outputs: (opts.outputs ?? []).slice().sort((a, b) => a.path.localeCompare(b.path)),
        signature: null,
    };
    if (!opts.privateKeyPem) {
        receipt.unsigned_reason =
            "no customer signing key was provided (PEN_RECEIPT_KEY). This receipt pins the catalog revision, " +
                "the policy and the artifact hashes, so tampering is detectable — but it is not attributable to anyone.";
        return receipt;
    }
    const priv = createPrivateKey(opts.privateKeyPem);
    const pub = createPublicKey(priv).export({ type: "spki", format: "pem" }).toString();
    // Ed25519 signs the message directly — the algorithm argument must be null.
    receipt.signature = {
        alg: "ed25519",
        key_id: keyIdOf(pub),
        value: sign(null, Buffer.from(signingBody(receipt), "utf8"), priv).toString("base64"),
    };
    return receipt;
}
/**
 * Verify with no network access whatsoever.
 *
 * Four checks reported separately rather than collapsed into one boolean,
 * because they fail for different reasons and a reviewer needs to know which:
 * a bad signature is tampering, an expired receipt is staleness, and a changed
 * artifact hash is drift since issue.
 */
export async function verifyReceipt(receipt, opts = {}) {
    const now = opts.now ?? new Date();
    const checks = [];
    checks.push(receipt.receipt_version === RECEIPT_VERSION
        ? { name: "format", ok: true, detail: `receipt_version ${receipt.receipt_version}` }
        : {
            name: "format",
            ok: false,
            detail: `receipt_version ${receipt.receipt_version}, this verifier understands ${RECEIPT_VERSION}`,
        });
    const sig = receipt.signature;
    if (!sig) {
        checks.push({ name: "signature", ok: false, detail: receipt.unsigned_reason ?? "receipt carries no signature" });
    }
    else if (!opts.publicKeyPem) {
        checks.push({
            name: "signature",
            ok: false,
            detail: `signed by key ${sig.key_id} — supply that public key to check it`,
        });
    }
    else {
        const expected = keyIdOf(opts.publicKeyPem);
        if (expected !== sig.key_id) {
            checks.push({
                name: "signature",
                ok: false,
                detail: `receipt was signed by key ${sig.key_id}, you supplied ${expected}`,
            });
        }
        else {
            let good = false;
            try {
                good = verify(null, Buffer.from(signingBody(receipt), "utf8"), createPublicKey(opts.publicKeyPem), Buffer.from(sig.value, "base64"));
            }
            catch {
                good = false;
            }
            checks.push({
                name: "signature",
                ok: good,
                detail: good
                    ? `valid ed25519 signature by key ${sig.key_id}`
                    : "SIGNATURE DOES NOT MATCH — the receipt body was altered after signing",
            });
        }
    }
    if (receipt.expires) {
        const left = Math.floor((Date.parse(receipt.expires) - now.getTime()) / 86_400_000);
        checks.push({
            name: "freshness",
            ok: left >= 0,
            detail: left >= 0 ? `valid ${left} more day(s)` : `expired ${-left} day(s) ago`,
        });
    }
    else {
        checks.push({ name: "freshness", ok: true, detail: "no expiry asserted" });
    }
    // Inputs and outputs fail for different reasons and get reported separately:
    // a changed INPUT means the decision is stale, a changed OUTPUT means the
    // bundle is not the one that was judged. Collapsing them would tell a reviewer
    // that something is wrong without telling them which thing.
    if (opts.root && receipt.outputs.length > 0) {
        const bad = [];
        for (const o of receipt.outputs) {
            if ((await sha256File(path.join(opts.root, o.path))) !== o.sha256)
                bad.push(o.path);
        }
        checks.push({
            name: "bundle",
            ok: bad.length === 0,
            detail: bad.length === 0
                ? `${receipt.outputs.length} generated file(s) are the ones this receipt was issued for`
                : `${bad.length} generated file(s) differ from what was signed: ${bad.slice(0, 3).join(", ")}`,
        });
    }
    if (opts.root && receipt.artifacts.length > 0) {
        const bad = [];
        for (const a of receipt.artifacts) {
            if ((await sha256File(path.join(opts.root, a.path))) !== a.sha256)
                bad.push(a.path);
        }
        checks.push({
            name: "artifacts",
            ok: bad.length === 0,
            detail: bad.length === 0
                ? `${receipt.artifacts.length} artifact(s) still match the receipt`
                : `${bad.length} artifact(s) changed since issue: ${bad.slice(0, 3).join(", ")}`,
        });
    }
    const ok = checks.every((c) => c.ok);
    const n = receipt.capabilities.length;
    return {
        ok,
        signed: sig !== null,
        checks,
        summary: ok
            ? `VERIFIED — ${n} sanctioned capabilit${n === 1 ? "y" : "ies"} against ` +
                `${receipt.catalog.source ?? "a catalog"} @ ${receipt.catalog.revision?.slice(0, 14) ?? "?"}…`
            : `NOT VERIFIED — ${checks.filter((c) => !c.ok).map((c) => c.name).join(", ")}`,
    };
}
/** Ed25519 keypair, for tests and for a customer who has no key yet. */
export function generateReceiptKeyPair() {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    return {
        privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
        publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    };
}
/** The signing key from the environment — a path, or inline PEM. Never a default. */
export async function signingKeyFromEnv(env = process.env) {
    if (env.PEN_RECEIPT_KEY_PEM)
        return env.PEN_RECEIPT_KEY_PEM;
    if (env.PEN_RECEIPT_KEY) {
        try {
            return await readFile(env.PEN_RECEIPT_KEY, "utf8");
        }
        catch {
            return null;
        }
    }
    return null;
}
//# sourceMappingURL=receipt.js.map
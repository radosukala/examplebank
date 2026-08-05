/**
 * THE WHOLE PRODUCT, IN ONE FUNCTION.
 *
 * Every transport — the CLI, the MCP server, whatever comes next — calls this
 * and none of them re-implements it. That is not tidiness: the sequence below
 * contains the two refusals that agree with each other, and a second copy of it
 * would eventually disagree with the first. The moment a bundle can exist that
 * the gate would have refused, the artifact stops meaning anything.
 *
 * Layering, deliberately: transports call `pack`; `pack` composes the decision
 * core and a render target; render never reaches back to the gate or the
 * receipt. So output formatting can never influence a verdict.
 *
 * Writes nothing. Returns bytes and lets the caller decide where they land —
 * which is why "this tool has never had write access to anything" survives an
 * intake review.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { EMPTY_CATALOG, loadCatalog } from "./catalog.js";
import { checkExport } from "./export-gate.js";
import { readJson } from "./fs.js";
import { loadProfile } from "./profile.js";
import { issueReceipt, signingKeyFromEnv } from "./receipt.js";
import { DEFAULT_DESIGN, designSource } from "./seam.js";
import { resolveOperations } from "./operations.js";
import { noAdapter, targetFor } from "./targets.js";
export async function readContext(root) {
    const loaded = await loadProfile(root);
    const catalog = loaded.profile?.catalog?.source
        ? await loadCatalog(root, loaded.profile.catalog.source)
        : EMPTY_CATALOG;
    const gate = await checkExport(root);
    // Resolved here rather than inside `buildChangePack`, because which operation a
    // binding stands on is a fact about the enterprise's own OpenAPI documents. It
    // has nothing to do with rendering, and an estate that installed no runtime
    // target should not lose it from its evidence for want of a renderer.
    const operations = await resolveOperations(root, catalog, gate.bindings, (file) => readFile(file, "utf8").catch(() => null));
    return { root, loaded, catalog, gate, operations };
}
/**
 * A refused export produces NO bundle — not a warned one, not a draft one.
 *
 * `issueReceipt` refuses in turn, and the two refusals agreeing is what makes a
 * bundle's existence mean something. There is no override, and adding one would
 * quietly convert this from a control into a linter.
 */
export class RefusedError extends Error {
    gate;
    constructor(gate) {
        super(gate.headline);
        this.gate = gate;
        this.name = "RefusedError";
    }
}
/**
 * No adapter answered — which is a MISSING BUNDLE, never a missing verdict.
 *
 * Its own class so a transport can tell it apart from a real failure. The
 * required check must still block on a bad binding in an estate that has
 * installed no target at all: the gate is the control, and a bundle is what a
 * passing gate additionally earns you. Crashing the check because nobody
 * installed a renderer would take the control offline for a formatting problem.
 */
export class NoAdapterError extends Error {
    target;
    constructor(target) {
        super(noAdapter(target));
        this.target = target;
        this.name = "NoAdapterError";
    }
}
export async function buildChangePack(ctx, opts = {}) {
    const { root, loaded, gate, operations } = ctx;
    if (!gate.allowed)
        throw new RefusedError(gate);
    const target = opts.target ?? (await targetFor(loaded.runtimeTarget));
    if (!target)
        throw new NoAdapterError(loaded.runtimeTarget ?? null);
    const designs = await designSource(root, opts.designs ?? [DEFAULT_DESIGN]).load();
    const design = designs.find((d) => gate.bindings.some((b) => b.screen === d.screen)) ?? designs[0];
    if (!design)
        throw new Error("no design was readable — pass an explicit design path");
    const library = loaded.profile?.components?.source
        ? await readJson(path.join(root, loaded.profile.components.source))
        : null;
    /**
     * EVERY input, not the two that were easy to reach.
     *
     * A receipt that pins the catalog and the component library but not the design,
     * the binding manifest or the API specs it resolved against is attesting to a
     * fraction of what produced the bundle — and the fraction it omits is the half
     * a reviewer would most want fixed in place. Anything the decision depended on
     * is pinned, or the pin means less than it appears to.
     */
    const inputs = [
        loaded.profile?.catalog?.source,
        loaded.profile?.components?.source,
        loaded.profile?.bindings?.source ?? "enterprise/bindings.json",
        ...(opts.designs ?? [DEFAULT_DESIGN]),
        // The OpenAPI documents the bound operations were actually read out of. A
        // spec can be edited without touching the catalog entry that points at it.
        ...Object.values(operations)
            .map((op) => op.spec)
            .filter((s) => !!s),
    ].filter((a) => !!a);
    // Two nodes bound to the same API resolve to the same spec file; pinning it
    // twice would put the same digest in the receipt under two identical entries.
    const pinned = [...new Set(inputs)];
    /**
     * Output digests, in two passes, because the receipt ships INSIDE the bundle.
     *
     * Render once with a placeholder to learn the bytes, hash everything that is
     * not the receipt itself, then issue the real receipt carrying those digests
     * and render again. Only the receipt asset can differ between the passes —
     * `renderedOnlyReceiptDiffers` in the tests holds that, because if any other
     * file varied with receipt contents the digests would be attesting to bytes
     * nobody ever shipped.
     */
    const renderWith = (r) => target.render({
        target: target.id,
        organization: gate.organization,
        design,
        library,
        bound: gate.bindings,
        operations,
        receipt: r,
    });
    const provisional = await issueReceipt(gate, { expiresDays: opts.expiresDays ?? 90, root, artifacts: pinned });
    const outputs = renderWith(provisional)
        .filter((f) => !RECEIPT_ASSET.test(f.path))
        .map((f) => ({ path: f.path, sha256: f.sha256 }));
    const receipt = await issueReceipt(gate, {
        privateKeyPem: await signingKeyFromEnv(),
        expiresDays: opts.expiresDays ?? 90,
        root,
        artifacts: pinned,
        outputs,
    });
    return {
        target: target.id,
        what: target.what,
        design,
        receipt,
        operations,
        files: renderWith(receipt),
    };
}
/** The receipt cannot hash itself; everything else in the bundle is covered. */
const RECEIPT_ASSET = /(^|\/)receipt\.json$/;
//# sourceMappingURL=pack.js.map
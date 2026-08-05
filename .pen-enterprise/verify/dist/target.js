/**
 * A RUNTIME TARGET — the seam, and nothing that implements it.
 *
 * Liferay DXP mindshare fell 12.7% → 9.1% year on year. We build one adapter
 * because the demo needs a real one, and we put an interface in front of it so
 * that fact stays a demo choice rather than a product decision. AEM, a Spring
 * shop's in-house shell and a Next.js estate are the same shape of problem: take
 * a screen whose every binding is sanctioned, and emit something their platform
 * already knows how to deploy.
 *
 * The interface stays HERE while the adapter lives in `@pen-enterprise/target-liferay`,
 * because a contract owned by its only implementation is not a contract — the
 * side that has to keep it stable is the side that calls it. Which is also why
 * this file cannot leave: core must compile with every adapter absent.
 *
 * **What a target may see is deliberately narrow.** These input types are declared
 * here rather than imported from the gate or the receipt, and `test/boundary.test.ts`
 * enforces it: the moment output formatting can reach the verdict, the verdict stops
 * being auditable from its inputs alone. A `GateResult`'s bindings and a `Receipt`
 * satisfy these shapes structurally, so the CLI passes them straight through — but
 * nothing here can call back into the decision.
 *
 * Read-only, like everything else. A target returns bytes and their digests; who
 * writes them is the caller's problem, and usually their scaffolder's.
 *
 * The contract ONLY. `operations.ts` reads the enterprise's OpenAPI documents to
 * fill `ExportInput.operations`, and it lives next door rather than here because
 * an adapter author reading this file to learn what they may see should not have
 * to page through a spec parser to find out.
 */
import { sha256 } from "./fs.js";
export function exported(path, contents, what) {
    return { path, contents, sha256: sha256(contents), what };
}
//# sourceMappingURL=target.js.map
/**
 * pen.dev Enterprise — refuse what nobody sanctioned, prove what shipped.
 *
 * Read-only by construction. Nothing in this package writes, and the gate
 * refuses by ANSWERING: whatever holds the artifact is what declines to hand it
 * over. That separation is the point — it lets an enterprise put the enforcement
 * inside a trust boundary they already own, which is precisely what the governed
 * app platforms cannot offer, because their enforcement lives in their runtime.
 *
 * See docs/PLAN.md for what this is for and who buys it.
 */
export { EMPTY_CATALOG, SUPERSEDED_BY, isBlocking, loadCatalog, ownerToAsk, suggestAlternative, verdictFor, } from "./catalog.js";
export { checkExport, evaluate, } from "./export-gate.js";
export { DEFAULT_POLICY, NO_CAPABILITY, PROFILE_FILE, hashPolicy, inlineSource, loadProfile, manifestSource, policyOf, } from "./profile.js";
export { RECEIPT_VERSION, canonicalize, generateReceiptKeyPair, issueReceipt, keyIdOf, signingBody, signingKeyFromEnv, verifyReceipt, } from "./receipt.js";
export { DEFAULT_DESIGN, deriveSeams, designSource, gapsFor, proposeSeams, readHouseStyle, } from "./seam.js";
export { renderSeamFiles } from "./render/seam-artifacts.js";
export { exported, } from "./target.js";
export { resolveOperations } from "./operations.js";
export { BUILDER_ID, BUILD_TYPE, SLSA_PREDICATE_TYPE, provenanceFor } from "./attest.js";
export { slackMessage } from "./render/slack.js";
// The adapters themselves are packages of their own — `@pen-enterprise/target-liferay`
// is the one we publish. This library names them and loads them on demand; it does
// not depend on them, which is what makes the seam real rather than aspirational.
export { KNOWN, noAdapter, registerTarget, targetFor } from "./targets.js";
export { daysUntil, exists, readJson, sha256, sha256File, walkFiles } from "./fs.js";
//# sourceMappingURL=index.js.map
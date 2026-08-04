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
export { type Alternative, type Capability, type CapabilityVerdict, type Catalog, EMPTY_CATALOG, SUPERSEDED_BY, isBlocking, loadCatalog, ownerToAsk, suggestAlternative, verdictFor, } from "./catalog.js";
export { type EvaluatedBinding, type GateResult, type Refusal, checkExport, evaluate, } from "./export-gate.js";
export { type Binding, type BindingManifest, type BindingSource, type BindingVerdict, type EnterpriseProfile, type LoadedProfile, type Policy, DEFAULT_POLICY, NO_CAPABILITY, PROFILE_FILE, hashPolicy, inlineSource, loadProfile, manifestSource, policyOf, } from "./profile.js";
export { type Check, type Receipt, type ReceiptArtifact, type ReceiptCapability, type VerifyResult, RECEIPT_VERSION, canonicalize, generateReceiptKeyPair, issueReceipt, keyIdOf, signingBody, signingKeyFromEnv, verifyReceipt, } from "./receipt.js";
export { type ComponentLibrary, type DataShape, type DeriveInputs, type Design, type DesignNode, type DesignSource, type FieldEvidence, type Gap, type HouseStyle, type NotASeam, type ProposeOptions, type Seam, type SeamFile, type SeamOperation, type SeamProposal, DEFAULT_DESIGN, deriveSeams, designSource, gapsFor, proposeSeams, readHouseStyle, } from "./seam.js";
export { type RenderContext, renderSeamFiles } from "./render/seam-artifacts.js";
export { type ApprovedComponent, type ApprovedLibrary, type BoundNode, type EmbeddedReceipt, type ExportInput, type ExportedFile, type ResolvedOperation, type RuntimeTarget, exported, resolveOperations, } from "./render/target.js";
export { type SlackMessage, type SlackWhere, slackMessage } from "./render/slack.js";
export { TARGETS, targetFor } from "./render/targets.js";
export { LIFERAY_CUSTOM_ELEMENT } from "./render/liferay.js";
export { daysUntil, exists, readJson, sha256, sha256File, walkFiles } from "./fs.js";
//# sourceMappingURL=index.d.ts.map
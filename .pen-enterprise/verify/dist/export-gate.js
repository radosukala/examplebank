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
import { EMPTY_CATALOG, isBlocking, loadCatalog, ownerToAsk, suggestAlternative, verdictFor, } from "./catalog.js";
import { loadProfile, manifestSource, } from "./profile.js";
const ZERO = {
    ON_MENU: 0,
    SELF_CONTAINED: 0,
    DEPRECATED: 0,
    OFF_MENU: 0,
    UNDECLARED: 0,
    UNBOUND: 0,
};
function clauseFor(verdict, ref, catalog, policy) {
    switch (verdict) {
        case "OFF_MENU":
            return ref && policy.deny.some((d) => d.toLowerCase() === ref)
                ? "policy.deny"
                : `not present in ${catalog.source ?? "the registered catalog"}`;
        case "DEPRECATED":
            return `policy.allowed_lifecycles = [${policy.allowed_lifecycles.join(", ")}]`;
        case "UNDECLARED":
            return "no declared capability for this node";
        case "UNBOUND":
            return "node carries no component and no capability";
        case "SELF_CONTAINED":
            return "declared to reach nothing";
        default:
            return "—";
    }
}
/**
 * Deliberately hedged where the answer is a guess. An architect forgives a
 * suggestion that admits it is one, and never forgives a heuristic dressed as
 * a fact.
 */
function routeToYes(verdict, who, component, ask, alt) {
    // UNDECLARED is a different question from OFF_MENU and deserves a different
    // answer. The node HAS an approved component; nobody has said what data stands
    // behind it. Telling that person to catalogue a new capability sends them to
    // the wrong team for the wrong thing.
    if (verdict === "UNDECLARED") {
        return (`Declare what ${component ?? `${who}`} consumes — a catalogued capability, or "none" if it ` +
            `genuinely reaches nothing. Unknown is not the same as safe, so it does not ship by default.`);
    }
    if (alt && alt.confidence === "stated") {
        return `Bind “${who}” to ${alt.ref} instead — the catalog names it as the replacement${alt.owner ? ` (owned by ${alt.owner})` : ""}.`;
    }
    if (alt) {
        return (`Closest sanctioned match is ${alt.ref}${alt.owner ? ` (${alt.owner})` : ""} — inferred from ` +
            `${alt.basis === "same-system" ? "the same system" : "the name"}, so confirm it before you rely on it.` +
            (ask ? ` ${ask.group} can approve.` : ""));
    }
    if (ask) {
        return `Nothing sanctioned covers this. Ask ${ask.group}${ask.confidence === "inferred" ? " (inferred owner — check it)" : ""} to catalogue a capability for “${who}”.`;
    }
    return `Nothing in the catalog covers “${who}”, and no owner could be identified — this needs a human to route it.`;
}
/** The pure decision. Everything it needs is an argument; it touches no disk. */
export function evaluate(bindings, catalog, loaded, sourceName) {
    const policy = loaded.policy;
    const registered = loaded.profile !== null && catalog.source !== null;
    const evaluated = [];
    const counts = { ...ZERO };
    const refusals = [];
    for (const b of bindings) {
        const v = verdictFor(b.capability, b.component, catalog, policy);
        // With no catalog registered there is nothing to be off, so a declared
        // binding is reported rather than dressed up as sanctioned.
        const blocking = registered && isBlocking(v.verdict, policy);
        counts[v.verdict]++;
        evaluated.push({
            ...b,
            verdict: v.verdict,
            ref: v.ref,
            capability_name: v.capability?.name ?? null,
            owner: v.capability?.owner ?? null,
            lifecycle: v.capability?.lifecycle ?? null,
            system: v.capability?.system ?? null,
            reason: v.reason,
            blocking,
        });
        if (blocking) {
            const ask = ownerToAsk(v.ref, catalog, policy);
            const alternative = suggestAlternative(v.ref, catalog, policy);
            const who = b.label ?? b.node;
            refusals.push({
                screen: b.screen,
                node: b.node,
                label: b.label,
                component: b.component,
                ref: v.ref,
                reason: v.reason,
                clause: clauseFor(v.verdict, v.ref, catalog, policy),
                ask,
                alternative,
                route_to_yes: routeToYes(v.verdict, who, b.component, ask, alternative),
            });
        }
    }
    const notes = [];
    if (!loaded.profile) {
        notes.push(`no ${"enterprise/profile.json"} — no enterprise profile is registered, so nothing can be judged ` +
            "against one and this gate cannot refuse anything. Register a profile to turn it on.");
    }
    else if (catalog.capabilities.length === 0) {
        notes.push(`the registered catalog (${catalog.source ?? "none"}) yielded no bindable capabilities — every ` +
            "declared binding will read OFF_MENU. Check the export before reading anything into that number.");
    }
    if (catalog.skipped.length > 0) {
        notes.push(`${catalog.skipped.length} catalog entries were skipped (non-bindable kinds or duplicates).`);
    }
    if (counts.UNDECLARED > 0) {
        notes.push(`${counts.UNDECLARED} binding(s) are UNDECLARED. This resolves DECLARED bindings; it does not observe ` +
            "network traffic, so UNDECLARED means unknown, not safe.");
    }
    if (bindings.length === 0) {
        notes.push(`${sourceName} produced no bindings — there is nothing to judge, which is not the same as a pass.`);
    }
    /**
     * Most actionable first.
     *
     * A Slack card shows one line. Leading with a refusal whose route to yes the
     * catalog STATED gives the reader something to do in seconds; leading with one
     * that needs a human to route it gives them a shrug. Ordering is not cosmetics
     * here — it decides which sentence most people will ever read.
     */
    const rank = (r) => r.alternative?.confidence === "stated" ? 0 : r.alternative ? 1 : r.ask ? 2 : 3;
    refusals.sort((a, b) => rank(a) - rank(b));
    const first = refusals[0];
    let headline;
    if (!registered) {
        headline = "No enterprise profile registered — the export gate is off.";
    }
    else if (first === undefined) {
        headline =
            `Export clean — ${counts.ON_MENU} of ${bindings.length} bindings sanctioned against ` +
                `${catalog.source} @ ${catalog.revision?.slice(0, 14) ?? "?"}…`;
    }
    else {
        headline =
            `Export refused — “${first.label ?? first.node}” reaches ${first.ref ?? "an undeclared capability"}, ` +
                `${first.reason}.` +
                (first.ask ? ` ${first.ask.group} can approve.` : "") +
                (refusals.length > 1 ? ` (+${refusals.length - 1} more)` : "");
    }
    return {
        allowed: first === undefined,
        headline,
        organization: loaded.organization,
        runtime_target: loaded.runtimeTarget,
        catalog: {
            source: catalog.source,
            revision: catalog.revision,
            format: catalog.format,
            entries: catalog.capabilities.length,
            skipped: catalog.skipped.length,
        },
        policy: { ...policy, policy_hash: loaded.policyHash },
        binding_source: sourceName,
        counts,
        bindings: evaluated,
        refusals,
        notes,
    };
}
/** Assemble profile + catalog + bindings from a directory, then decide. */
export async function checkExport(root, source) {
    const loaded = await loadProfile(root);
    const catalog = loaded.profile?.catalog?.source
        ? await loadCatalog(root, loaded.profile.catalog.source)
        : EMPTY_CATALOG;
    const src = source ?? manifestSource(root, loaded.profile?.bindings?.source ?? "enterprise/bindings.json");
    return evaluate(await src.load(), catalog, loaded, src.name);
}
//# sourceMappingURL=export-gate.js.map
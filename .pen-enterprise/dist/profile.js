/**
 * THE ENTERPRISE PROFILE — the customer's own truth, in the customer's own words.
 *
 * This file exists to cut one coupling, and it is the reason this repository was
 * split out of PartKit at all.
 *
 * The prototype took its bindings from `parts.lock` + `pen.lock` + committed
 * projections — a vendored-backend-parts model. **An enterprise has no PartKit
 * parts.** A bank has its own component library, its own service catalog and its
 * own runtime, and any tool that asks it to adopt a competing parts catalog
 * reframes the vendor as a backend supplier and loses the architect in the first
 * meeting. So bindings arrive through an interface with several possible
 * implementations, and nothing downstream knows or cares which one produced them.
 *
 * Read-only throughout.
 */
import path from "node:path";
import { readJson, sha256 } from "./fs.js";
/**
 * UNDECLARED blocks by default, and that is a correction rather than a preference.
 *
 * The documentation said "unknown, not safe" while the default quietly let
 * unknowns ship. A governance tool whose default passes the things it cannot
 * explain is not a governance tool, and an architect who notices the gap stops
 * believing the parts that ARE true.
 *
 * UNBOUND deliberately does not block. A node with no component and no
 * capability is decoration or exploration — refusing it would make the tool
 * absurd on day one and teach people to disable it. The distinction is the
 * point: UNDECLARED is a real component whose data source nobody has stated;
 * UNBOUND is a box with nothing behind it because nothing belongs behind it.
 *
 * A pilot ramping up relaxes this in `policy.blocking` explicitly, in a file
 * their own team owns. Safe by default, relaxable on purpose — never the reverse.
 */
export const DEFAULT_POLICY = {
    allowed_lifecycles: ["production"],
    deny: [],
    blocking: ["OFF_MENU", "DEPRECATED", "UNDECLARED"],
};
export const PROFILE_FILE = "enterprise/profile.json";
export function policyOf(profile) {
    return {
        allowed_lifecycles: profile?.policy?.allowed_lifecycles ?? DEFAULT_POLICY.allowed_lifecycles,
        deny: profile?.policy?.deny ?? DEFAULT_POLICY.deny,
        blocking: profile?.policy?.blocking ?? DEFAULT_POLICY.blocking,
    };
}
/** Sorted, so a reordered file is the same policy and does not invalidate a receipt. */
export function hashPolicy(policy) {
    return sha256(JSON.stringify({
        allowed_lifecycles: [...policy.allowed_lifecycles].sort(),
        blocking: [...policy.blocking].sort(),
        deny: [...policy.deny].sort(),
    }));
}
export async function loadProfile(root, rel = PROFILE_FILE) {
    const abs = path.resolve(root);
    const profile = await readJson(path.join(abs, rel));
    const policy = policyOf(profile);
    return {
        root: abs,
        profile,
        policy,
        policyHash: hashPolicy(policy),
        organization: profile?.organization ?? null,
        runtimeTarget: profile?.runtime?.target ?? null,
    };
}
/** The declaration meaning "this element reaches nothing outside itself". */
export const NO_CAPABILITY = "none";
/**
 * Bindings from a manifest the enterprise commits beside its profile.
 *
 * This is the honest v1: the enterprise states what each node stands on, and we
 * resolve those DECLARED statements. It is not runtime discovery, and the
 * distinction is load-bearing — see the UNDECLARED verdict, which is this
 * system saying "I do not know" out loud where a scanner would have quietly
 * claimed to know.
 */
export function manifestSource(root, rel = "enterprise/bindings.json") {
    return {
        name: rel,
        async load() {
            const doc = await readJson(path.join(path.resolve(root), rel));
            const out = [];
            for (const [screen, s] of Object.entries(doc?.screens ?? {})) {
                for (const [node, n] of Object.entries(s?.nodes ?? {})) {
                    out.push({
                        screen,
                        node,
                        label: n.label ?? null,
                        role: n.role ?? "element",
                        component: n.component ?? null,
                        capability: n.capability ? n.capability.toLowerCase() : null,
                    });
                }
            }
            return out.sort((a, b) => a.screen.localeCompare(b.screen) || a.node.localeCompare(b.node));
        },
    };
}
/** Bindings supplied in memory — what an MCP caller or a canvas hands us. */
export function inlineSource(bindings, name = "inline") {
    return { name, load: async () => bindings };
}
//# sourceMappingURL=profile.js.map
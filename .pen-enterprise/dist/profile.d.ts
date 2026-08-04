export type BindingVerdict = "ON_MENU" | "SELF_CONTAINED" | "DEPRECATED" | "OFF_MENU" | "UNDECLARED" | "UNBOUND";
export interface Policy {
    /** Lifecycles permitted in a customer-facing lane. Default: production only. */
    allowed_lifecycles: string[];
    /** Entity refs refused regardless of lifecycle. */
    deny: string[];
    /** Verdicts that BLOCK an export rather than merely warn. */
    blocking: BindingVerdict[];
}
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
export declare const DEFAULT_POLICY: Policy;
export interface EnterpriseProfile {
    profile_version?: number;
    organization?: string;
    /** Where the service catalog export lives, relative to the profile's root. */
    catalog?: {
        source: string;
    };
    /** Where the approved component library manifest lives. */
    components?: {
        source: string;
    };
    /** What this change is being compiled FOR, e.g. "liferay-7.4-custom-element". */
    runtime?: {
        target: string;
    };
    /** Where the node→component→capability manifest lives. */
    bindings?: {
        source: string;
    };
    policy?: Partial<Policy>;
}
export interface LoadedProfile {
    root: string;
    /** Null when no profile is registered — a state, not an error. */
    profile: EnterpriseProfile | null;
    policy: Policy;
    /** sha256 over the effective policy, pinned in the receipt beside the catalog. */
    policyHash: string;
    organization: string | null;
    runtimeTarget: string | null;
}
export declare const PROFILE_FILE = "enterprise/profile.json";
export declare function policyOf(profile: EnterpriseProfile | null): Policy;
/** Sorted, so a reordered file is the same policy and does not invalidate a receipt. */
export declare function hashPolicy(policy: Policy): string;
export declare function loadProfile(root: string, rel?: string): Promise<LoadedProfile>;
/**
 * One element on a screen that stands on something.
 *
 * `component` and `capability` are separate on purpose: the agency↔IT mismatch
 * has two halves, and a screen can be built from the right components while
 * reaching a service nobody approved — or the reverse.
 */
export interface Binding {
    /** Route or surface identifier the reader will recognise. */
    screen: string;
    /** Design node id. Must survive a rename, which is why it is an id not a name. */
    node: string;
    /** The layer name, when the source knows it. For humans, never for matching. */
    label: string | null;
    role: string;
    /** Approved component this instantiates, e.g. "@bank/ui/CreditCard@4.2". */
    component: string | null;
    /** Declared catalog entity ref, e.g. "api:default/cards-valid-for-user". */
    capability: string | null;
}
/**
 * A source of bindings.
 *
 * Deliberately an interface with no filesystem assumptions baked in: today it is
 * a manifest committed beside the profile; tomorrow it is a live pen.dev canvas
 * read over MCP. The gate must not be able to tell the difference.
 */
export interface BindingSource {
    readonly name: string;
    load(): Promise<Binding[]>;
}
/** The declaration meaning "this element reaches nothing outside itself". */
export declare const NO_CAPABILITY = "none";
interface ManifestNode {
    label?: string;
    role?: string;
    component?: string | null;
    capability?: string | null;
}
export interface BindingManifest {
    manifest_version?: number;
    screens?: Record<string, {
        nodes?: Record<string, ManifestNode>;
    }>;
}
/**
 * Bindings from a manifest the enterprise commits beside its profile.
 *
 * This is the honest v1: the enterprise states what each node stands on, and we
 * resolve those DECLARED statements. It is not runtime discovery, and the
 * distinction is load-bearing — see the UNDECLARED verdict, which is this
 * system saying "I do not know" out loud where a scanner would have quietly
 * claimed to know.
 */
export declare function manifestSource(root: string, rel?: string): BindingSource;
/** Bindings supplied in memory — what an MCP caller or a canvas hands us. */
export declare function inlineSource(bindings: Binding[], name?: string): BindingSource;
export {};
//# sourceMappingURL=profile.d.ts.map
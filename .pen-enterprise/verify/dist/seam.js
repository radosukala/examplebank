/**
 * THE MISSING SEAM — what to build, derived from what the screen already shows.
 *
 * A refusal that only says no makes this an obstacle. The step after no is the one
 * that changes the conversation: *here is the contract for the thing you are
 * missing, and every field in it is traceable to a layer somebody drew.*
 *
 * Three decisions shape this module, and each rejects an easier version:
 *
 *  1. **We derive, we do not execute.** Backstage's own MCP server exposes
 *     `scaffolder_execute_template`, so the enterprise already has the half that
 *     writes files into their golden path. Nothing here touches disk, and that is
 *     not a limitation to apologise for — a tool that never needed write access to
 *     the customer's repository is a shorter security review. The CLI prints; a
 *     shell redirect or their scaffolder does the writing.
 *
 *  2. **One seam per journey, not per component.** Microsoft's own BFF guidance
 *     warns against service sprawl, and a stub per tile is exactly that. Every gap
 *     on one screen becomes one API entity with one operation each.
 *
 *  3. **Nothing is invented.** The response schema comes from the fields the design
 *     actually displays; the fixture is the sample already on the canvas; the house
 *     style is read out of the enterprise's own specs. Where the derivation runs
 *     out — a data classification, a numeric constraint — the artifact says `TODO`
 *     loudly rather than guessing. A guess dressed as a contract is the failure
 *     mode this whole product exists to end.
 *
 * And the discrimination that matters most: **when the catalog already names a
 * sanctioned replacement, there is no seam.** The route to yes is a rebind, and
 * proposing a new service instead would create the sprawl we were hired to prevent.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { ownerToAsk } from "./catalog.js";
import { readJson } from "./fs.js";
import { loadProfile } from "./profile.js";
import { renderSeamFiles } from "./render/seam-artifacts.js";
export function designSource(root, rels) {
    return {
        name: rels.join(", "),
        async load() {
            const out = [];
            for (const rel of rels) {
                const design = await readJson(path.join(path.resolve(root), rel));
                if (design?.screen)
                    out.push(design);
            }
            return out;
        },
    };
}
/** "@bank/ui/CardList@4.2" → "@bank/ui/CardList". The scope's @ is not the separator. */
function componentId(ref) {
    const at = ref.lastIndexOf("@");
    return at > 0 ? ref.slice(0, at) : ref;
}
function groupName(owner) {
    return owner ? (owner.split(":").pop() ?? owner) : null;
}
/**
 * Their envelope for a list: an object of exactly one array and one integer.
 *
 * The suffix comes out of the naming — "CardSummaryPage" wrapping "CardSummary" says
 * their word for a page is "Page". Guessing it would be a small, avoidable tell.
 */
function findCollectionSchema(spec) {
    for (const [name, schema] of Object.entries(spec.components?.schemas ?? {})) {
        const props = (schema.properties ?? {});
        const entries = Object.entries(props);
        if (entries.length !== 2)
            continue;
        const array = entries.find(([, v]) => v.type === "array");
        const count = entries.find(([, v]) => v.type === "integer");
        if (!array || !count)
            continue;
        const item = array[1].items?.$ref
            ?.split("/")
            .pop();
        const suffix = item && name.startsWith(item) ? name.slice(item.length) : "Page";
        return { schema, itemsKey: array[0], suffix };
    }
    return null;
}
function firstOperation(spec) {
    for (const operations of Object.values(spec.paths ?? {})) {
        for (const op of Object.values(operations)) {
            if (op && typeof op === "object")
                return op;
        }
    }
    return null;
}
/**
 * Pick the exemplar and copy from it.
 *
 * The exemplar is the alphabetically first production API their own spec marks
 * channel-safe — deterministic, and the same tier the seam will serve. Falling
 * back to "any production API" is wrong here: copying a core-tier spec would hand
 * a customer channel a service-identity flow.
 */
export async function readHouseStyle(root, catalog, policy, readSpec) {
    if (!catalog.source)
        return null;
    const catalogDir = path.dirname(catalog.source);
    const parsed = [];
    for (const cap of catalog.capabilities) {
        if (!cap.definition || cap.definition.includes("://"))
            continue;
        const rel = path.normalize(path.join(catalogDir, cap.definition));
        const text = await readSpec(path.join(path.resolve(root), rel));
        if (!text)
            continue;
        try {
            parsed.push({ cap, rel, spec: parse(text) });
        }
        catch {
            /* a spec we cannot parse is not a style we can copy */
        }
    }
    if (parsed.length === 0)
        return null;
    const usable = parsed.filter((p) => !p.cap.lifecycle || policy.allowed_lifecycles.includes(p.cap.lifecycle));
    const exemplar = usable.find((p) => p.spec.info?.["x-channel-safe"] === true) ?? usable[0] ?? parsed[0];
    const { spec, cap, rel } = exemplar;
    const schemeName = Object.keys(spec.components?.securitySchemes ?? {})[0] ?? "customerSession";
    const correlation = Object.entries(spec.components?.parameters ?? {}).find(([, p]) => p.in === "header") ?? null;
    const contactUrl = spec.info?.contact?.url;
    const slug = groupName(cap.owner);
    const template = typeof contactUrl === "string" && slug && contactUrl.endsWith(`/${slug}`)
        ? contactUrl.slice(0, -slug.length) + "{group}"
        : null;
    const op = firstOperation(spec);
    const errors = Object.fromEntries(Object.entries((op?.responses ?? {})).filter(([status]) => !status.startsWith("2")));
    // The envelope may live in any of their specs — the exemplar need not have a list.
    let collection = null;
    for (const p of [exemplar, ...parsed]) {
        collection = findCollectionSchema(p.spec);
        if (collection)
            break;
    }
    // Which path prefix already serves each journey. Used so new operations land
    // beside the ones already there instead of inventing a parallel tree.
    const prefixes = {};
    for (const p of usable) {
        for (const route of Object.keys(p.spec.paths ?? {})) {
            const parts = route.split("/").filter(Boolean);
            if (parts.length >= 3 && parts[1])
                prefixes[parts[1]] = `/${parts[0]}/${parts[1]}`;
        }
    }
    const base = path.basename(rel);
    const dot = base.indexOf(".");
    return {
        source: rel,
        openapi: spec.openapi ?? "3.0.1",
        servers: spec.servers ?? [],
        license: spec.info?.license ?? null,
        contact_url_template: template,
        security_scheme_name: schemeName,
        security_scheme: spec.components?.securitySchemes?.[schemeName] ?? null,
        correlation_parameter: correlation?.[1] ?? null,
        correlation_parameter_name: correlation?.[0] ?? "CorrelationId",
        problem_schema: spec.components?.schemas?.Problem ?? null,
        responses: (spec.components?.responses ?? {}),
        error_responses: errors,
        collection_schema: collection?.schema ?? null,
        collection_items_key: collection?.itemsKey ?? "items",
        collection_suffix: collection?.suffix ?? "Page",
        spec_dir: path.dirname(rel),
        spec_suffix: dot > 0 ? base.slice(dot) : ".openapi.yaml",
        tags: cap.tags,
        journey_prefixes: prefixes,
    };
}
/**
 * Which refusals are actually missing seams.
 *
 * A stated alternative means the capability exists and the fix is one line in a
 * binding. Generating a service for it would be the most expensive possible way to
 * answer a question the catalog already answered.
 */
export function gapsFor(gate) {
    const gaps = [];
    const not_seams = [];
    const refusalFor = new Map(gate.refusals.map((r) => [r.node, r]));
    for (const b of gate.bindings) {
        const refusal = refusalFor.get(b.node);
        const stated = refusal?.alternative?.confidence === "stated";
        if (stated) {
            not_seams.push({
                screen: b.screen,
                node: b.node,
                label: b.label,
                reason: `the catalog names ${refusal.alternative.ref} as the sanctioned replacement — rebind, do not build`,
                route_to_yes: refusal.route_to_yes,
            });
            continue;
        }
        if (b.verdict === "OFF_MENU") {
            gaps.push({
                screen: b.screen,
                node: b.node,
                label: b.label,
                component: b.component,
                verdict: "OFF_MENU",
                declared_ref: b.ref,
                unconfirmed_alternative: refusal?.alternative ?? null,
            });
        }
        else if (b.verdict === "UNDECLARED") {
            gaps.push({
                screen: b.screen,
                node: b.node,
                label: b.label,
                component: b.component,
                verdict: "UNDECLARED",
                declared_ref: null,
                unconfirmed_alternative: null,
            });
        }
        else if (b.verdict === "DEPRECATED") {
            // Catalogued, refused, and no successor named. That is a conversation with
            // the owning group, not a service to derive — they may simply promote it.
            not_seams.push({
                screen: b.screen,
                node: b.node,
                label: b.label,
                reason: `${b.ref} is catalogued but ${b.lifecycle}; its owner has not named a successor`,
                route_to_yes: refusal?.route_to_yes ?? null,
            });
        }
    }
    return { gaps, not_seams };
}
const ROLE_SUFFIXES = ["-tile", "-panel", "-card", "-list", "-widget", "-block"];
function journeyOf(screen) {
    const slug = screen.replace(/^\/+|\/+$/g, "").replace(/\//g, "-").toLowerCase();
    return slug === "" ? "home" : slug;
}
function segmentOf(node) {
    for (const suffix of ROLE_SUFFIXES) {
        if (node.endsWith(suffix))
            return node.slice(0, -suffix.length);
    }
    return node;
}
function pascal(value) {
    return value
        .split(/[-_]/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("");
}
/** "ActivityEntry[]" → { name: "ActivityEntry", collection: true }. */
function schemaOf(type, prop) {
    if (!type)
        return { name: pascal(prop), collection: false };
    const collection = type.trim().endsWith("[]");
    const bare = collection ? type.trim().slice(0, -2) : type.trim();
    return { name: /^[A-Z][A-Za-z0-9]*$/.test(bare) ? bare : pascal(prop), collection };
}
export function deriveSeams(inputs) {
    const { gate, catalog, designs, library, house, policy } = inputs;
    const { gaps, not_seams } = gapsFor(gate);
    const notes = [];
    const designFor = new Map(designs.map((d) => [d.screen, d]));
    const componentProps = new Map((library?.components ?? []).map((c) => [c.id, c.props ?? {}]));
    const byScreen = new Map();
    for (const gap of gaps) {
        const list = byScreen.get(gap.screen) ?? [];
        list.push(gap);
        byScreen.set(gap.screen, list);
    }
    const seams = [];
    for (const [screen, screenGaps] of [...byScreen.entries()].sort()) {
        const journey = journeyOf(screen);
        const design = designFor.get(screen) ?? null;
        if (!design) {
            notes.push(`${screen} has ${screenGaps.length} gap(s) but no design was supplied, so nothing can be ` +
                "derived for it — the fields a screen shows are the only evidence there is.");
            continue;
        }
        const nodeById = new Map(design.nodes.map((n) => [n.id, n]));
        // One entity for the journey. When the enterprise already named the thing it was
        // reaching for, adopt that name: the entry then resolves the existing binding
        // without a second change, and a rename stays their decision to make.
        const declared = [...new Set(screenGaps.map((g) => g.declared_ref).filter((r) => !!r))];
        const adopt = declared.length === 1 ? declared[0] : null;
        const id = adopt ? (adopt.split("/").pop() ?? `${journey}-experience`) : `${journey}-experience`;
        const ref = adopt ?? `api:default/${id}`;
        const decisions = [];
        const operations = [];
        const used = new Set();
        for (const gap of screenGaps) {
            const node = nodeById.get(gap.node);
            const props = gap.component ? componentProps.get(componentId(gap.component)) : undefined;
            const dataProps = node?.data_props ?? [];
            if (dataProps.length === 0) {
                notes.push(`${gap.node} declares no data_props, so there is nothing for an operation to return.`);
                continue;
            }
            for (const prop of dataProps) {
                const shape = node?.data_shape?.[prop];
                const { name, collection } = schemaOf(props?.[prop]?.type, prop);
                let segment = segmentOf(gap.node);
                if (used.has(segment))
                    segment = `${segment}-${prop}`;
                used.add(segment);
                const prefix = house?.journey_prefixes[journey] ?? `/experience/${journey}`;
                operations.push({
                    node: gap.node,
                    label: gap.label,
                    prop,
                    operation_id: `get${pascal(journey)}${pascal(segment)}`,
                    method: "get",
                    path: `${prefix}/${segment}`,
                    scope: `${segment.replace(/-/g, ".")}.read`,
                    schema_name: name,
                    collection,
                    fields: shape?.fields ?? [],
                    sample: shape?.sample ?? null,
                    unknown_shape: shape
                        ? null
                        : `the design records no data_shape for ${gap.node}.${prop}, so this operation has no ` +
                            "derivable response body. Draw the state, or write the schema by hand.",
                });
                if (!shape)
                    decisions.push(`${gap.node}.${prop}: no data_shape in the design — the schema is empty`);
            }
        }
        if (operations.length === 0)
            continue;
        const stated = design.owner ?? null;
        const inferred = stated ? null : ownerToAsk(adopt, catalog, policy);
        const owner = stated
            ? { group: stated, confidence: "stated" }
            : inferred
                ? { group: inferred.group, confidence: "inferred" }
                : { group: null, confidence: "unresolved" };
        if (owner.confidence !== "stated") {
            decisions.push(owner.confidence === "inferred"
                ? `owner is inferred from the nearest catalogued sibling — confirm ${owner.group} owns this`
                : "no owner could be identified; a human has to route this before it can be catalogued");
        }
        const lifecycle = policy.allowed_lifecycles[0] ?? "experimental";
        decisions.push(`lifecycle is prefilled ${lifecycle} because the policy allows only [${policy.allowed_lifecycles.join(", ")}] ` +
            "in this lane — do not merge the catalog entry until the operations below actually respond");
        decisions.push("classify the data this returns; the spec carries x-data-classification: TODO");
        decisions.push("types and requiredness are derived from the design; constraints (patterns, ranges, limits) are not — tighten them");
        const binding_changes = screenGaps
            .filter((g) => g.declared_ref !== ref)
            .map((g) => ({ node: g.node, from: g.declared_ref, to: ref }));
        const seam = {
            id,
            ref,
            screen,
            journey,
            title: `${design.name ?? journey} experience`,
            name_basis: adopt ? "declared-by-binding" : "derived-from-journey",
            owner,
            lifecycle,
            operations,
            binding_changes,
            decisions,
            files: [],
        };
        seam.files = renderSeamFiles(seam, { house, catalog, design, organization: gate.organization });
        seams.push(seam);
    }
    if (house === null) {
        notes.push("no readable spec was found behind the catalog, so the stub falls back to defaults instead of " +
            "copying the enterprise's own conventions. Link specs with spec.definition to fix that.");
    }
    if (gate.counts.UNDECLARED > 0) {
        notes.push("an UNDECLARED node needs a binding change as well as a catalog entry — nothing in the catalog can " +
            "resolve a node that declares no capability at all.");
    }
    const operations = seams.reduce((n, s) => n + s.operations.length, 0);
    const headline = seams.length === 0
        ? not_seams.length > 0
            ? `No seam needed — ${not_seams.length} refusal(s) already have a sanctioned route.`
            : "No seam needed — nothing on these screens reaches an uncatalogued capability."
        : `${seams.length} seam(s), ${operations} operation(s), derived from ${gaps.length} gap(s) on ` +
            `${seams.map((s) => s.screen).join(", ")}.`;
    return {
        organization: gate.organization,
        catalog_revision_before: catalog.revision,
        policy_hash: gate.policy.policy_hash,
        house_style: house ? { source: house.source } : null,
        seams,
        not_seams,
        headline,
        notes,
    };
}
/* ── assembly from a directory ──────────────────────────────────────────── */
export const DEFAULT_DESIGN = "design/dashboard.json";
/**
 * Read profile, catalog, designs and library from a directory, then derive.
 *
 * Reads only. The proposal carries every file's bytes and its sha256 so a caller
 * can write them, hand them to a scaffolder, or pin them in a receipt — but the
 * writing is never ours, which is what keeps "this tool has never had write access
 * to anything" true.
 */
export async function proposeSeams(root, gate, catalog, opts = {}) {
    const abs = path.resolve(root);
    const loaded = await loadProfile(abs);
    const designs = await (opts.source ?? designSource(abs, opts.designs ?? [DEFAULT_DESIGN])).load();
    const library = loaded.profile?.components?.source
        ? await readJson(path.join(abs, loaded.profile.components.source))
        : null;
    const house = await readHouseStyle(abs, catalog, loaded.policy, (file) => readFile(file, "utf8").catch(() => null));
    return deriveSeams({ gate, catalog, designs, library, house, policy: loaded.policy });
}
//# sourceMappingURL=seam.js.map
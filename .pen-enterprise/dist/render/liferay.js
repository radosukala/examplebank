/**
 * LIFERAY 7.4 CUSTOM ELEMENT — the one adapter, built for the demo.
 *
 * **Do not let this become a Liferay product.** It exists because a Change Pack has
 * to land *somewhere* real, and because externally built front-end code is a
 * first-class custom element on 7.4 and the only customization path Liferay SaaS
 * accepts at all. That is a good demo, not a market.
 *
 * The whole file is written against one acceptance question: **would this team
 * recognise it as their own work?** `fixtures/bank/liferay-workspace/client-extensions/`
 * `examplebank-repayment-estimate` is in the repository precisely so that question has
 * an answer a diff can give — the file shapes, the yaml key order, the tab-indented
 * ESM, the guarded `customElements.define`, the light DOM and the token comments
 * beside every colour are all copied from it rather than chosen by us.
 * `test/liferay.test.ts` compares the two structurally.
 *
 * Two things this deliberately does NOT do:
 *
 *  - **Reimplement `@bank/ui`.** The bank owns its components; offering our own is
 *    the move that reframes pen.dev as a supplier. Where the library declares a
 *    runtime for an approved component, the bundle MOUNTS it — the dashboard's
 *    calculator becomes the bank's own already-shipped client extension. Where it
 *    declares none, the region is a host shell that says so.
 *  - **Call anything that was not sanctioned.** Every request is fixed at build
 *    time from bindings the gate found ON_MENU, and the path comes out of the
 *    enterprise's own OpenAPI document, never from a guess.
 *
 * The receipt travels beside the code as `receipt.json`, served at
 * `/o/<extension-id>/receipt.json`. That is the point of the whole sequence: the
 * bundle carries the proof of what it was allowed to touch, and the proof checks on
 * a stranger's laptop with no account and no network.
 */
import path from "node:path";
import { exported } from "./target.js";
const TARGET_ID = "liferay-7.4-custom-element";
/* ── naming and layout, read from what they already have ────────────────── */
function journeyOf(screen) {
    const slug = screen.replace(/^\/+|\/+$/g, "").replace(/\//g, "-").toLowerCase();
    return slug === "" ? "home" : slug;
}
function slugify(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
/** camelCase → kebab-case, because HTML attributes are not camelCase. */
function kebab(value) {
    return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
/**
 * A JavaScript literal, not JSON.
 *
 * `JSON.stringify` would emit `"node": "greeting"` into a file whose neighbours all
 * write `node: 'greeting'`. Same data, and the difference is the first thing a
 * reviewer's eye catches. Keys sorted, because theirs are.
 */
function js(value, indent = "\t") {
    if (value === null || value === undefined)
        return "null";
    if (typeof value === "string")
        return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
    if (typeof value === "number" || typeof value === "boolean")
        return String(value);
    const inner = indent + "\t";
    if (Array.isArray(value)) {
        if (value.length === 0)
            return "[]";
        return `[\n${value.map((v) => inner + js(v, inner)).join(",\n")},\n${indent}]`;
    }
    const entries = Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0)
        return "{}";
    return `{\n${entries
        .map(([k, v]) => `${inner}${IDENTIFIER.test(k) ? k : `'${k}'`}: ${js(v, inner)}`)
        .join(",\n")},\n${indent}}`;
}
/**
 * Everything about where this lands is derived from a client extension they already
 * wrote: the workspace path, and the `examplebank-` prefix their ids carry. Inventing
 * either would put our output in a folder their build does not look at.
 */
function placementFor(input) {
    const journey = journeyOf(input.design.screen);
    let dir = "client-extensions";
    let prefix = slugify(input.organization ?? "app");
    for (const component of input.library?.components ?? []) {
        const runtime = component.runtime?.[TARGET_ID];
        if (!runtime)
            continue;
        if (runtime.workspace)
            dir = path.dirname(runtime.workspace);
        const existing = runtime.client_extension_id;
        if (existing?.includes("-"))
            prefix = existing.split("-")[0];
        break;
    }
    const id = `${prefix}-${journey}`;
    return { id, htmlElementName: id, dir, slug: journey, name: input.design.name ?? `${journey} screen` };
}
/** The custom element an approved component already ships as, if it ships as one. */
function elementFor(library, component) {
    if (!component)
        return null;
    const at = component.lastIndexOf("@");
    const id = at > 0 ? component.slice(0, at) : component;
    return library?.components?.find((c) => c.id === id)?.runtime?.[TARGET_ID]?.html_element_name ?? null;
}
function token(library, name, fallback) {
    return (name ? library?.tokens?.[name] : undefined) ?? fallback;
}
function regionsFor(input) {
    const bound = new Map(input.bound.map((b) => [b.node, b]));
    return input.design.nodes.map((node) => {
        const binding = bound.get(node.id);
        const operation = input.operations[node.id];
        const element = elementFor(input.library, node.component);
        // Only scalars become attributes. An array prop has no HTML representation and
        // silently stringifying one would hand the element "50000,2000000".
        const attributes = {};
        for (const [key, value] of Object.entries(node.props ?? {})) {
            if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
                attributes[kebab(key)] = String(value);
            }
        }
        // Node-specific only. "This component declares no runtime" is true of several
        // regions at once, so it is said once in the summary rather than repeated into
        // every entry — a generated file that repeats itself reads as a template.
        let note = null;
        if (binding?.verdict === "UNDECLARED") {
            note = `${node.id} declares no capability, so there is nothing to call. UNDECLARED is unknown, not safe.`;
        }
        else if (binding?.ref && !operation) {
            note = `${binding.ref} is sanctioned, but its spec does not resolve to a single GET for this node — the operation was left out rather than guessed.`;
        }
        return {
            node: node.id,
            label: node.label ?? null,
            role: node.role ?? "element",
            component: node.component ?? null,
            element,
            attributes,
            capability: binding?.ref ?? null,
            owner: binding?.owner ?? null,
            operation: operation
                ? { method: operation.method, path: operation.path, headers: operation.required_headers }
                : null,
            note,
            placement: {
                column: node.placement?.column ?? 1,
                span: node.placement?.span ?? 12,
                row: node.placement?.row ?? 1,
                row_span: node.placement?.row_span ?? 1,
            },
        };
    });
}
/* ── client-extension.yaml ──────────────────────────────────────────────── */
/**
 * Hand-written rather than serialised, and that is the point: a YAML emitter would
 * produce `- from:` where every file in their workspace has `-   from:`, and the
 * first thing a reviewer does with a generated file is look for the tell.
 *
 * `assemble` is a TOP-LEVEL key, a sibling of the extension id — verified against
 * liferay-portal's own liferay-sample-custom-element-1 and -6, and the single detail
 * hand-written examples get wrong most often.
 */
function clientExtensionYaml(place, input) {
    return `# Generated by pen.dev from ${input.design.screen}. Nothing here was written by hand.
#
# Shaped after ${place.dir}/${input.library?.components?.find((c) => c.runtime?.[TARGET_ID])?.runtime?.[TARGET_ID]?.client_extension_id ?? "your own client extensions"},
# down to the key order and the assemble block — if this does not diff cleanly
# against one of yours, treat that as the bug.
#
# The receipt for this bundle ships as a static asset: /o/${place.id}/receipt.json
assemble:
    -   from: assets
        into: static

${place.id}:
    cssURLs:
        -   ${place.slug}.css
    htmlElementName: ${place.htmlElementName}
    instanceable: false
    name: ${place.name}
    portletCategoryName: category.client-extensions
    type: customElement
    urls:
        -   ${place.slug}.js
    useESM: true
`;
}
/* ── the custom element ─────────────────────────────────────────────────── */
function className(id) {
    return id.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}
function header(place, input) {
    const receipt = input.receipt;
    const revision = receipt?.catalog?.revision ?? "(no receipt)";
    const policy = receipt?.policy_hash ?? "(no receipt)";
    const signed = receipt?.signature?.key_id
        ? `signed with the customer key ${receipt.signature.key_id}`
        : "UNSIGNED — tamper-evident, but not attributable to anyone until PEN_RECEIPT_KEY is set";
    return `/**
 * ${input.organization ?? "Generated"} — ${place.name}.
 *
 * Generated by pen.dev from ${input.design.screen}. Not written by hand, and not a
 * rewrite of anything: each region below either mounts one of ${input.organization ?? "the enterprise"}'s
 * own approved components or says plainly that the library declares no runtime for it.
 *
 * **What this bundle may call is fixed here, at build time.** Every entry in REGIONS
 * was ON_MENU against ${receipt?.catalog?.source ?? "the registered catalog"} at
 *   ${revision}
 * under policy ${policy}.
 * There are no other requests in this file, and adding one is what the export gate
 * refuses.
 *
 * The proof travels with the code. receipt.json sits beside this file, served at
 * ${"/o/" + place.id}/receipt.json, ${signed}. It verifies on a laptop
 * with no account and no network:
 *
 *   pen-enterprise verify receipt.json --key <your public key>
 *
 * Rendered into the light DOM on purpose: cssURLs puts ${place.slug}.css in the
 * document head, so a shadow root would cut every region off from the stylesheet
 * this extension ships — and from the portal theme the design system is built on.
 */`;
}
function elementJs(place, input, regions) {
    const server = Object.values(input.operations)[0]?.server ?? "";
    const shells = regions.filter((r) => r.component && !r.element).map((r) => r.component);
    const lines = [
        header(place, input),
        "",
        `const RECEIPT_URL = '/o/${place.id}/receipt.json';`,
        `const API_BASE = '${server}';`,
        "",
        "/** Every region on the screen, and the one operation each is allowed to call. */",
        `const REGIONS = ${js(regions, "")};`,
        "",
        "const HUMANISE = (key) =>",
        "\tkey.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());",
        "",
        "/** Values arrive from a service. They are never trusted as markup. */",
        "function escape(value) {",
        "\treturn String(value).replace(",
        "\t\t/[&<>\"']/g,",
        "\t\t(c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;'})[c]",
        "\t);",
        "}",
        "",
        "function fields(value) {",
        "\treturn (",
        "\t\t'<dl class=\"eb-screen__fields\">' +",
        "\t\tObject.entries(value)",
        "\t\t\t.map(",
        "\t\t\t\t([key, v]) =>",
        "\t\t\t\t\t`<dt>${escape(HUMANISE(key))}</dt><dd>${escape(",
        "\t\t\t\t\t\ttypeof v === 'object' && v !== null ? JSON.stringify(v) : v",
        "\t\t\t\t\t)}</dd>`",
        "\t\t\t)",
        "\t\t\t.join('') +",
        "\t\t'</dl>'",
        "\t);",
        "}",
        "",
        "/** A page envelope renders as rows; anything else renders as one record. */",
        "function payload(body) {",
        "\tif (body && Array.isArray(body.items)) {",
        "\t\tif (body.items.length === 0) {",
        "\t\t\treturn '<p class=\"eb-screen__empty\">Nothing to show yet.</p>';",
        "\t\t}",
        "",
        "\t\treturn (",
        "\t\t\t'<ol class=\"eb-screen__rows\">' +",
        "\t\t\tbody.items.map((item) => `<li>${fields(item)}</li>`).join('') +",
        "\t\t\t'</ol>'",
        "\t\t);",
        "\t}",
        "",
        "\treturn fields(body ?? {});",
        "}",
        "",
        "function region(r) {",
        "\tif (r.role === 'decoration') {",
        "\t\treturn `<div class=\"eb-screen__art\" data-node=\"${r.node}\" aria-hidden=\"true\"></div>`;",
        "\t}",
        "",
        "\t// An approved component that already ships as a client extension is MOUNTED.",
        "\t// We do not reimplement anything the bank owns.",
        "\tif (r.element) {",
        "\t\tconst attributes = Object.entries(r.attributes)",
        "\t\t\t.map(([name, value]) => `${name}=\"${escape(value)}\"`)",
        "\t\t\t.join(' ');",
        "",
        "\t\treturn (",
        "\t\t\t`<section class=\"eb-screen__region\" data-node=\"${r.node}\" data-component=\"${r.component}\">` +",
        "\t\t\t`<${r.element} ${attributes}></${r.element}>` +",
        "\t\t\t'</section>'",
        "\t\t);",
        "\t}",
        "",
        "\treturn (",
        "\t\t`<section class=\"eb-screen__region\" data-node=\"${r.node}\" data-component=\"${",
        "\t\t\tr.component ?? ''",
        "\t\t}\" data-pen-host=\"shell\">` +",
        "\t\t(r.label ? `<h2 class=\"eb-screen__label\">${escape(r.label)}</h2>` : '') +",
        "\t\t`<div class=\"eb-screen__body\" data-body=\"${r.node}\" data-state=\"${",
        "\t\t\tr.operation ? 'loading' : 'empty'",
        "\t\t}\">${r.operation ? 'Loading…' : escape(r.note ?? '')}</div>` +",
        "\t\t(r.capability",
        "\t\t\t? `<p class=\"eb-screen__provenance\">${escape(r.capability)}${",
        "\t\t\t\t\tr.owner ? ' · ' + escape(r.owner) : ''",
        "\t\t\t\t}</p>`",
        "\t\t\t: '') +",
        "\t\t'</section>'",
        "\t);",
        "}",
        "",
        `class ${className(place.id)} extends HTMLElement {`,
        "\tconnectedCallback() {",
        "\t\t// Overridable so the same bundle works behind a gateway on another host.",
        "\t\tthis.base = this.getAttribute('api-base') ?? API_BASE;",
        "",
        "\t\t// Discoverable at runtime: whatever inspects this page can find the proof.",
        "\t\tthis.setAttribute('data-pen-receipt', RECEIPT_URL);",
        "",
        "\t\tthis.innerHTML =",
        "\t\t\t`<div class=\"eb-screen\">${REGIONS.map(region).join('')}</div>` +",
        `\t\t\t${JSON.stringify(shellNote(shells))};`,
        "",
        "\t\tthis.load();",
        "\t}",
        "",
        "\tload() {",
        "\t\tfor (const r of REGIONS) {",
        "\t\t\tif (r.operation) {",
        "\t\t\t\tthis.fill(r);",
        "\t\t\t}",
        "\t\t}",
        "\t}",
        "",
        "\tasync fill(r) {",
        "\t\tconst body = this.querySelector(`[data-body=\"${r.node}\"]`);",
        "\t\tconst headers = {};",
        "",
        "\t\t// The headers their own spec marks required. Without them a real gateway",
        "\t\t// answers 400 and the bundle looks broken for the wrong reason.",
        "\t\tfor (const name of r.operation.headers) {",
        "\t\t\theaders[name] = crypto.randomUUID();",
        "\t\t}",
        "",
        "\t\ttry {",
        "\t\t\tconst response = await fetch(this.base + r.operation.path, {",
        "\t\t\t\tcredentials: 'same-origin',",
        "\t\t\t\theaders,",
        "\t\t\t});",
        "",
        "\t\t\tif (!response.ok) {",
        "\t\t\t\tthrow new Error(`${response.status} ${response.statusText}`);",
        "\t\t\t}",
        "",
        "\t\t\tbody.dataset.state = 'default';",
        "\t\t\tbody.innerHTML = payload(await response.json());",
        "\t\t} catch (error) {",
        "\t\t\t// Named, not swallowed. A region that fails silently is how a prototype",
        "\t\t\t// ends up showing data nobody can account for.",
        "\t\t\tbody.dataset.state = 'error';",
        "\t\t\tbody.textContent = `${r.operation.method} ${r.operation.path} did not answer — ${error.message}`;",
        "\t\t}",
        "\t}",
        "}",
        "",
        `if (!customElements.get('${place.htmlElementName}')) {`,
        `\tcustomElements.define('${place.htmlElementName}', ${className(place.id)});`,
        "}",
        "",
    ];
    return lines.join("\n");
}
function shellNote(shells) {
    if (shells.length === 0)
        return "";
    return (`<p class="eb-screen__note">${shells.length} approved component(s) declare no runtime for ` +
        `${TARGET_ID}, so their regions are host shells: ${shells.join(", ")}. ` +
        `Declare a runtime in components/library.json and this bundle mounts them instead.</p>`);
}
/* ── the stylesheet ─────────────────────────────────────────────────────── */
function stylesheet(place, input, regions) {
    const library = input.library;
    const grid = input.design.canvas?.grid;
    const columns = grid?.columns ?? 12;
    const gutterToken = grid?.gutter;
    const marginToken = grid?.margin;
    const lines = [
        `/*`,
        ` * ${input.organization ?? "Generated"} — ${place.name}. Generated by pen.dev from ${input.design.screen}.`,
        ` *`,
        ` * Values come from the token set in components/library.json — the token name is in`,
        ` * a comment beside each one, exactly as your own client extensions do it, because a`,
        ` * stylesheet that silently forks the design system is how a component library stops`,
        ` * being the source of truth.`,
        ` *`,
        ` * cssURLs puts this file in the document head, so every selector is prefixed.`,
        ` */`,
        ``,
        `.eb-screen {`,
        `\tdisplay: grid;`,
        `\tgap: ${token(library, gutterToken, "24px")};${gutterToken ? ` /* ${gutterToken} */` : ""}`,
        `\tgrid-template-columns: repeat(${columns}, 1fr);`,
        `\tpadding: ${token(library, marginToken, "24px")};${marginToken ? ` /* ${marginToken} */` : ""}`,
        `}`,
        ``,
        `.eb-screen__region {`,
        `\tbackground: ${token(library, "color.surface.raised", "#ffffff")}; /* color.surface.raised */`,
        `\tborder-radius: ${token(library, "radius.card", "12px")}; /* radius.card */`,
        `\tcolor: ${token(library, "color.text.primary", "#12171f")}; /* color.text.primary */`,
        `\tdisplay: grid;`,
        `\tfont: ${token(library, "type.body", "400 15px/1.5 system-ui, sans-serif")}; /* type.body */`,
        `\tgap: ${token(library, "space.2", "8px")}; /* space.2 */`,
        `\talign-content: start;`,
        `\tpadding: ${token(library, "space.4", "16px")}; /* space.4 */`,
        `}`,
        ``,
        `.eb-screen__label {`,
        `\tfont: ${token(library, "type.display", "600 28px/1.2 system-ui, sans-serif")}; /* type.display */`,
        `\tmargin: 0;`,
        `}`,
        ``,
        `.eb-screen__fields {`,
        `\tdisplay: grid;`,
        `\tgap: ${token(library, "space.2", "8px")}; /* space.2 */`,
        `\tgrid-template-columns: auto 1fr;`,
        `\tmargin: 0;`,
        `}`,
        ``,
        `.eb-screen__fields dt {`,
        `\tcolor: ${token(library, "color.text.muted", "#5b6472")}; /* color.text.muted */`,
        `}`,
        ``,
        `.eb-screen__fields dd {`,
        `\tfont: ${token(library, "type.mono", "500 14px/1.4 ui-monospace, monospace")}; /* type.mono */`,
        `\tmargin: 0;`,
        `\ttext-align: right;`,
        `}`,
        ``,
        `.eb-screen__rows {`,
        `\tdisplay: grid;`,
        `\tgap: ${token(library, "space.4", "16px")}; /* space.4 */`,
        `\tlist-style: none;`,
        `\tmargin: 0;`,
        `\tpadding: 0;`,
        `}`,
        ``,
        `.eb-screen__provenance,`,
        `.eb-screen__note,`,
        `.eb-screen__empty {`,
        `\tcolor: ${token(library, "color.text.muted", "#5b6472")}; /* color.text.muted */`,
        `\tfont-size: 13px;`,
        `\tmargin: 0;`,
        `}`,
        ``,
        `/* The error state is drawn in the design, so the bundle renders it. */`,
        `.eb-screen__body[data-state='error'] {`,
        `\tcolor: ${token(library, "color.state.negative", "#b3261e")}; /* color.state.negative */`,
        `}`,
        ``,
        `.eb-screen__body[data-state='loading'] {`,
        `\tcolor: ${token(library, "color.text.muted", "#5b6472")}; /* color.text.muted */`,
        `}`,
        ``,
        `.eb-screen__art {`,
        `\tbackground: ${token(library, "color.surface.sunken", "#f4f6fa")}; /* color.surface.sunken */`,
        `\tborder-radius: ${token(library, "radius.card", "12px")}; /* radius.card */`,
        `\tmin-height: 120px;`,
        `}`,
        ``,
        `/* Placement, straight from the canvas. */`,
    ];
    for (const r of regions) {
        const rows = r.placement.row_span > 1 ? ` / span ${r.placement.row_span}` : "";
        lines.push(``, `[data-node='${r.node}'] {`, `\tgrid-column: ${r.placement.column} / span ${r.placement.span};`, `\tgrid-row: ${r.placement.row}${rows};`, `}`);
    }
    return lines.join("\n") + "\n";
}
/* ── the adapter ────────────────────────────────────────────────────────── */
export const LIFERAY_CUSTOM_ELEMENT = {
    id: TARGET_ID,
    what: "a Liferay client extension project: client-extension.yaml, an ESM custom element, its stylesheet, and the receipt",
    render(input) {
        const place = placementFor(input);
        const regions = regionsFor(input);
        const root = path.join(place.dir, place.id);
        const files = [
            exported(path.join(root, "client-extension.yaml"), clientExtensionYaml(place, input), "the client extension, shaped after the ones already in this workspace"),
            exported(path.join(root, "assets", `${place.slug}.js`), elementJs(place, input, regions), "the custom element — one fetch per sanctioned binding, and no others"),
            exported(path.join(root, "assets", `${place.slug}.css`), stylesheet(place, input, regions), "the stylesheet, spending only tokens the component library defines"),
        ];
        if (input.receipt) {
            files.push(exported(path.join(root, "assets", "receipt.json"), JSON.stringify(input.receipt, null, 2) + "\n", "the Change Pack receipt, verbatim — served at /o/" + place.id + "/receipt.json"));
        }
        return files;
    },
};
//# sourceMappingURL=liferay.js.map
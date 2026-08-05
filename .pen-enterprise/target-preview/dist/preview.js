import { exported } from "@pen-enterprise/verify";
const PREVIEW_FILE = "preview.html";
/* ── the two things that make inlining dishonest or impossible ──────────── */
/**
 * A module with imports cannot run inline from `file://`, and a module carrying
 * `</script` cannot be inlined without editing its bytes. Either one ends the
 * preview: we say which, in the page, rather than shipping something subtly
 * wrong. Detection is deliberately conservative — a false positive costs a
 * preview, a false negative costs the claim.
 */
function unpreviewable(source) {
    if (/<\/script/i.test(source)) {
        return "the bundle contains a script-close sequence, so it cannot be inlined without editing its bytes — and editing them would break the guarantee this page exists to make";
    }
    const statement = /^[ \t]*(import[ \t{('"*]|export[ \t{*])/m;
    if (statement.test(source)) {
        return "the bundle has runtime imports. A fetched module is blocked by CORS on file://, so this page would open to a blank screen on the reviewer's laptop rather than here";
    }
    return null;
}
/**
 * Every field the design already shows a value for, by name.
 *
 * `data_shape[prop].sample` is the content on the canvas, and the seam generator
 * already treats it as the fixture of record — so it is the truest data this
 * page can show. It is collected per node, never globally: two tiles can both
 * display a `description`, and borrowing one screen region's text for another is
 * the kind of small lie that makes a reviewer stop trusting the whole page.
 */
function canvasValues(input, node) {
    const found = new Map();
    const collect = (value) => {
        if (Array.isArray(value))
            return value.forEach(collect);
        if (value && typeof value === "object") {
            for (const [key, v] of Object.entries(value))
                if (!found.has(key))
                    found.set(key, v);
        }
    };
    for (const shape of Object.values(input.design.nodes.find((n) => n.id === node)?.data_shape ?? {})) {
        collect(shape.sample);
    }
    return found;
}
/**
 * The SHAPE comes from their spec; the VALUES come from wherever they were said.
 *
 * Substituting whole bodies would be wrong in both directions: the canvas sample
 * for a list is a bare array while the operation returns a page envelope, so
 * handing one over would render a tile the service could never produce. Instead
 * the spec's own structure is kept and each hole the resolver marked is filled
 * from the canvas by field name. Anything still `⟨marked⟩` is a field nobody has
 * described anywhere, and it stays visible — a preview that quietly invents a
 * plausible balance is the demo that ends a pilot.
 */
function fill(value, canvas) {
    if (Array.isArray(value))
        return value.map((v) => fill(v, canvas));
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, canvas)]));
    }
    const hole = typeof value === "string" ? /^⟨(.+)⟩$/.exec(value) : null;
    return hole && canvas.has(hole[1]) ? canvas.get(hole[1]) : value;
}
function answers(input) {
    const out = [];
    for (const bound of input.bound) {
        const operation = input.operations[bound.node];
        if (!operation)
            continue;
        const canvas = canvasValues(input, bound.node);
        out.push({
            path: operation.path,
            node: bound.node,
            label: bound.label ?? bound.node,
            capability: operation.capability,
            method: operation.method,
            body: fill(operation.sample, canvas),
            from: operation.spec,
        });
    }
    return out;
}
/* ── the page ───────────────────────────────────────────────────────────── */
const esc = (value) => value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
/**
 * JSON that is safe to sit inside a `<script>` element.
 *
 * Only the data is escaped this way, never the bundle: `<` in a string would
 * otherwise let a service's example close the script tag. The bundle itself is
 * copied byte for byte and refused instead — see `unpreviewable`.
 */
const json = (value) => JSON.stringify(value ?? null).replace(/</g, "\\u003c");
const CHROME = `
:root { color-scheme: light dark; }
body { margin: 0; font: 400 15px/1.5 'Inter', system-ui, sans-serif; background: #f4f6f9; color: #12171f; }
.pen-bar { background: #12171f; color: #f4f6f9; padding: 16px 24px; }
.pen-bar h1 { font: 600 17px/1.3 inherit; margin: 0 0 4px; }
.pen-bar p { margin: 0; font-size: 13px; color: #aab3c0; }
.pen-bar code { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px; color: #dfe5ee; }
.pen-facts { display: flex; flex-wrap: wrap; gap: 4px 24px; padding: 12px 24px; background: #1d2530; color: #aab3c0; font-size: 12px; }
.pen-facts b { color: #f4f6f9; font-weight: 500; }
.pen-stage { background: #fff; margin: 0; }
.pen-side { padding: 16px 24px 32px; font-size: 13px; color: #3a4453; }
.pen-side h2 { font: 600 13px/1.3 inherit; letter-spacing: .06em; text-transform: uppercase; color: #5b6472; margin: 24px 0 8px; }
.pen-calls { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.pen-calls li { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px; display: flex; gap: 8px; align-items: baseline; }
.pen-ok::before { content: "answered"; color: #1f7a4d; }
.pen-no::before { content: "REFUSED"; color: #b3261e; font-weight: 700; }
.pen-hole { background: #fff4d6; border-radius: 3px; padding: 0 3px; }
.pen-missing { border: 1px dashed #aab3c0; border-radius: 12px; padding: 12px; color: #5b6472; font-size: 13px; }
@media (prefers-color-scheme: dark) {
  body { background: #0d1117; color: #e6edf3; }
  .pen-stage { background: #161b22; }
  .pen-side { color: #aab3c0; }
}
`;
/** The one element the bundle mounts but does not contain, made visible. */
function placeholders(library) {
    const named = (library?.components ?? [])
        .flatMap((c) => Object.values(c.runtime ?? {}).map((r) => r.html_element_name))
        .filter((name) => !!name);
    if (named.length === 0)
        return "";
    return named
        .map((name) => `if (!customElements.get(${json(name)})) {
\tcustomElements.define(${json(name)}, class extends HTMLElement {
\t\tconnectedCallback() {
\t\t\tthis.innerHTML = '<div class="pen-missing">' + ${json(name)} +
\t\t\t\t' — Example Bank ships this as its own client extension. It is mounted, not reimplemented, so it is not in this bundle and not in this page.</div>';
\t\t}
\t});
}`)
        .join("\n");
}
function page(input, element, styles, calls) {
    const screen = input.design.name ?? input.design.screen;
    const tag = /customElements\.define\(\s*'([^']+)'/.exec(element.contents)?.[1] ?? null;
    const holes = calls.filter((a) => JSON.stringify(a.body ?? null).includes("⟨")).length;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Preview — ${esc(input.organization ?? "")} ${esc(screen)}</title>
<!--
  Generated by pen.dev. Nothing in this file is fetched: the stylesheet, the
  bundle and every answer below are inlined, so it opens from a download with no
  server and no network. What it inlines is stated in pen-preview-of, and the
  same digest is pinned in the Change Pack receipt beside this file.
-->
<meta name="pen-preview-of" content="${esc(element.path)}@${esc(element.sha256)}">
<style>${CHROME}</style>
<style>${styles}</style>
</head>
<body>
<div class="pen-bar">
<h1>${esc(screen)} — preview, not a deployment</h1>
<p>This page inlines <code>${esc(element.path)}</code> verbatim, <code>${esc(element.sha256)}</code> — the same bytes the receipt in this Change Pack pins. Nothing here was fetched and nothing was written.</p>
</div>
<div class="pen-facts">
<span><b>target</b> ${esc(input.target)}</span>
<span><b>catalog</b> ${esc(input.receipt?.catalog?.revision?.slice(0, 23) ?? "—")}…</span>
<span><b>policy</b> ${esc(input.receipt?.policy_hash?.slice(0, 23) ?? "—")}…</span>
<span><b>calls</b> ${calls.length} sanctioned operation${calls.length === 1 ? "" : "s"}</span>
</div>
<main class="pen-stage">${tag ? `<${tag}></${tag}>` : ""}</main>
<div class="pen-side">
<h2>What it asked for</h2>
<ol class="pen-calls" id="pen-calls"></ol>
<h2>Where the data came from</h2>
<p>Every answer above is data ${esc(input.organization ?? "the enterprise")} already declared${holes > 0
        ? `. Fields their specs describe without an example arrive as <span class="pen-hole">⟨fieldName⟩</span> rather than as an invented value — ${holes} response${holes === 1 ? " has" : "s have"} at least one`
        : ""}. No request left this page: a stub installed before the bundle ran answers the operations the gate sanctioned and <b>refuses everything else</b>, which is the same rule the receipt states.</p>
</div>
<script>
(() => {
\tconst ANSWERS = ${json(Object.fromEntries(calls.map((a) => [a.path, a.body ?? null])))};
\tconst LABELS = ${json(Object.fromEntries(calls.map((a) => [a.path, `${a.method} ${a.path} · ${a.label}`])))};

\t// crypto.randomUUID is a secure-context API, and a file:// page is not one in
\t// every browser. The bundle uses it for the correlation header their specs
\t// require, so without this the tile fails for a reason that has nothing to do
\t// with what is being reviewed.
\tif (!globalThis.crypto || typeof globalThis.crypto.randomUUID !== 'function') {
\t\tglobalThis.crypto = Object.assign(globalThis.crypto ?? {}, {
\t\t\trandomUUID: () => '00000000-0000-4000-8000-000000000000',
\t\t});
\t}

\tconst log = (ok, text) => {
\t\tconst li = document.createElement('li');
\t\tli.className = ok ? 'pen-ok' : 'pen-no';
\t\tli.append(' ' + text);
\t\tdocument.getElementById('pen-calls')?.append(li);
\t};

\twindow.fetch = async (resource) => {
\t\tconst raw = typeof resource === 'string' ? resource : resource.url;
\t\tconst path = raw.startsWith('http') ? new URL(raw).pathname : raw;
\t\tif (Object.prototype.hasOwnProperty.call(ANSWERS, path)) {
\t\t\tlog(true, LABELS[path]);
\t\t\treturn new Response(JSON.stringify(ANSWERS[path]), {
\t\t\t\theaders: {'content-type': 'application/json'},
\t\t\t\tstatus: 200,
\t\t\t});
\t\t}
\t\t// The gate says this cannot happen. If it ever does, the reviewer sees it
\t\t// rather than the request leaving the laptop.
\t\tlog(false, path + ' — not in the sanctioned set, nothing was sent');
\t\treturn new Response(null, {status: 403, statusText: 'not sanctioned'});
\t};

${placeholders(input.library)}
})();
</script>
<script type="module">
${element.contents}
</script>
</body>
</html>
`;
}
function refusal(reason, screen) {
    return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>No preview — ${esc(screen)}</title><style>${CHROME}</style></head>
<body>
<div class="pen-bar"><h1>${esc(screen)} — no preview was produced</h1>
<p>${esc(reason)}.</p></div>
<div class="pen-side"><p>The Change Pack beside this file is unaffected: the gate passed, the bundle was rendered and the receipt was issued. Only the offline preview is missing, and saying so is better than shipping a page that shows something other than what deploys.</p></div>
</body>
</html>
`;
}
export const OFFLINE_PREVIEW = {
    what: "preview.html, which opens in a browser with no server",
    preview(input, produced) {
        // Whatever the target emits, a browser needs a module and a stylesheet. A
        // target that emits neither cannot be previewed in one, and says nothing
        // rather than guessing what its output was for.
        const element = produced.find((f) => /\.m?js$/.test(f.path));
        if (!element)
            return [];
        const styles = produced.filter((f) => f.path.endsWith(".css")).map((f) => f.contents).join("\n");
        const screen = input.design.name ?? input.design.screen;
        const blocked = unpreviewable(element.contents);
        return [
            exported(PREVIEW_FILE, blocked ? refusal(blocked, screen) : page(input, element, styles, answers(input)), blocked ? "why this bundle cannot be previewed offline" : `${screen}, as a reviewer sees it — one file, no server`),
        ];
    },
};
//# sourceMappingURL=preview.js.map
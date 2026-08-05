#!/usr/bin/env node
/**
 * THE REQUIRED CHECK — the same resolver, delivered where it cannot be skipped.
 *
 * Everything else in this repository is a linter, and the distinction is the
 * product. A CLI refusal is bypassed by not running the CLI; a required status
 * check is not bypassable, because the merge button is disabled by the forge and
 * not by us. Nothing about the decision changes here — `readContext` and
 * `buildChangePack` are the same functions the CLI calls — only where the answer
 * lands.
 *
 *   pen-enterprise-ci [--root <dir>] [--changed-from <file>] [--changed <path>…]
 *       Resolve, print GitHub annotations, exit 1 if the merge must be blocked.
 *   pen-enterprise-ci --summary     markdown for $GITHUB_STEP_SUMMARY. Always exits 0.
 *   pen-enterprise-ci --evidence    the manifest, as JSON. Always exits 0.
 *   pen-enterprise-ci --slack       a Block Kit payload to curl at THEIR webhook.
 *
 * The reporting modes always exit 0 on purpose: a workflow renders them with
 * `if: always()`, and a reporting step that fails would mask which step is the
 * gate. Exactly one invocation carries the verdict.
 *
 * **The check does not scope itself to the diff.** A pull request that edits the
 * catalog and touches no design can still break a binding, and a diff-scoped check
 * would wave it through. Changed files are evidence attached to the report, never
 * the boundary of what gets resolved.
 *
 * Writes nothing, here as everywhere. The workflow redirects.
 */
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { NoAdapterError, RefusedError, buildChangePack, readContext } from "./pack.js";
import { annotations, evidence, summary } from "./render/ci-report.js";
import { slackMessage } from "./render/slack.js";
const TOOL = "pen-enterprise-ci";
const LOCATIONS = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"];
export async function readCodeowners(root) {
    for (const rel of LOCATIONS) {
        const text = await readFile(path.join(root, rel), "utf8").catch(() => null);
        if (text === null)
            continue;
        const rules = [];
        for (const raw of text.split("\n")) {
            const line = raw.replace(/#.*$/, "").trim();
            if (!line)
                continue;
            const [pattern, ...owners] = line.split(/\s+/);
            if (pattern && owners.length > 0)
                rules.push({ pattern, owners });
        }
        return { source: rel, rules };
    }
    return null;
}
function toRegExp(pattern) {
    const anchored = pattern.startsWith("/");
    let body = anchored ? pattern.slice(1) : pattern;
    const directory = body.endsWith("/");
    if (directory)
        body = body.slice(0, -1);
    const source = body
        .split("/")
        .map((segment) => segment === "**"
        ? "§§"
        : segment.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]"))
        .join("/")
        .replace(/§§\//g, "(?:.*/)?")
        .replace(/§§/g, ".*");
    return new RegExp(`^${anchored ? "" : "(?:.*/)?"}${source}${directory ? "/" : "(?:/|$)"}`);
}
/** GitHub's rule: the LAST matching pattern wins, not the most specific. */
export function ownersOf(codeowners, file) {
    let owners = [];
    for (const rule of codeowners?.rules ?? []) {
        if (toRegExp(rule.pattern).test(file))
            owners = rule.owners;
    }
    return owners;
}
/**
 * `group:cards-platform` in the catalog, `@examplebank/cards-platform` in
 * CODEOWNERS. Matching on the slug is the only join that exists — and when there
 * is no match the report says "no CODEOWNERS entry" rather than inventing a
 * plausible handle, because a refusal routed to the wrong team is worse than one
 * routed nowhere.
 */
export function routeFor(codeowners, group) {
    if (!codeowners)
        return null;
    const slug = (group.split(":").pop() ?? group).toLowerCase();
    const handles = new Set();
    for (const rule of codeowners.rules) {
        for (const owner of rule.owners) {
            const tail = owner.split("/").pop()?.replace(/^@/, "").toLowerCase();
            if (tail === slug)
                handles.add(owner);
        }
    }
    return handles.size > 0 ? { handles: [...handles], source: codeowners.source } : null;
}
/* ── where a binding is declared, so the annotation lands on the line ───── */
async function locate(root, rel, nodes) {
    const out = {};
    const text = await readFile(path.join(root, rel), "utf8").catch(() => null);
    if (text === null)
        return out;
    const file = path.relative(process.cwd(), path.join(root, rel)) || rel;
    const lines = text.split("\n");
    for (const node of nodes) {
        const index = lines.findIndex((line) => line.includes(`"${node}"`));
        if (index >= 0)
            out[node] = { file, line: index + 1 };
    }
    return out;
}
/* ── assembly ───────────────────────────────────────────────────────────── */
export async function report(root, changedPaths, now = new Date()) {
    const ctx = await readContext(root);
    const { gate, loaded, operations } = ctx;
    // A refused change has no pack, and that is the invariant, not a limitation:
    // the two refusals agree, so evidence of a blocked merge can never carry a
    // receipt that says something shipped.
    let pack = null;
    try {
        const built = await buildChangePack(ctx);
        pack = {
            signed_by: built.receipt.signature?.key_id ?? null,
            expires: built.receipt.expires,
            files: built.files.map((f) => ({ path: f.path, sha256: f.sha256 })),
        };
    }
    catch (err) {
        // A missing render target is also no pack — the check still blocks or passes
        // on the gate alone. Said on stderr rather than swallowed, because "no bundle
        // because nobody installed an adapter" and "no bundle because we refused" are
        // different facts and a reviewer must not have to guess which one happened.
        if (err instanceof NoAdapterError)
            process.stderr.write(`  note: ${err.message}\n`);
        else if (!(err instanceof RefusedError))
            throw err;
    }
    const codeowners = await readCodeowners(root);
    const routes = {};
    for (const r of gate.refusals) {
        if (r.ask?.group)
            routes[r.ask.group] = routeFor(codeowners, r.ask.group);
    }
    for (const b of gate.bindings) {
        if (b.owner && !(b.owner in routes))
            routes[b.owner] = routeFor(codeowners, b.owner);
    }
    return {
        gate,
        operations,
        routes,
        locations: await locate(root, loaded.profile?.bindings?.source ?? "enterprise/bindings.json", gate.bindings.map((b) => b.node)),
        changed: changedPaths.map((p) => ({ path: p, owners: ownersOf(codeowners, p) })),
        pack,
        tool: TOOL,
        checked_at: now.toISOString(),
    };
}
async function main() {
    const { values } = parseArgs({
        options: {
            root: { type: "string" },
            changed: { type: "string", multiple: true },
            "changed-from": { type: "string" },
            summary: { type: "boolean" },
            evidence: { type: "boolean" },
            slack: { type: "boolean" },
        },
    });
    const root = path.resolve(values.root ?? ".");
    const changed = [...(values.changed ?? [])];
    if (values["changed-from"]) {
        const text = await readFile(values["changed-from"], "utf8").catch(() => "");
        changed.push(...text.split("\n").map((l) => l.trim()).filter(Boolean));
    }
    const input = await report(root, changed);
    if (values.summary) {
        process.stdout.write(summary(input));
        return;
    }
    if (values.evidence) {
        process.stdout.write(evidence(input));
        return;
    }
    if (values.slack) {
        // We render it; their webhook posts it. Nothing here holds a token or opens
        // a socket — the workflow curls this at a URL kept in their own secret.
        const env = process.env;
        process.stdout.write(JSON.stringify(slackMessage(input, {
            repo: env.GITHUB_REPOSITORY ?? null,
            run_url: env.GITHUB_RUN_ID
                ? `${env.GITHUB_SERVER_URL ?? "https://github.com"}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
                : null,
        }), null, 2) + "\n");
        return;
    }
    process.stdout.write(annotations(input));
    process.stdout.write(input.gate.allowed
        ? `\n${input.gate.headline}\n\nEvery element resolves to a sanctioned operation. See the job summary for the Change Pack.\n`
        : `\n${input.gate.headline}\n\n` +
            `This merge is blocked. ${input.gate.refusals.length} element(s) reach a capability nobody sanctioned; ` +
            `the job summary names who can approve each one.\n`);
    process.exit(input.gate.allowed ? 0 : 1);
}
/**
 * Importable for tests without running the CLI half — through the REAL path.
 *
 * `argv[1]` is whatever the shell was handed, and npm's bin entries are symlinks,
 * so under the documented `npx @pen-enterprise/verify pen-enterprise-ci` form
 * this compared a link against its own target, took itself for an import, and
 * exited 0 having resolved nothing. A required check that silently passes is the
 * worst failure in this file: every merge it was guarding sails through green.
 * Found by `test/without-adapter.test.ts`, whose sandbox sits under a symlinked
 * tmpdir; `test/ci.test.ts` now invokes the binary through a link on purpose.
 */
const invoked = process.argv[1] ? realpathSync(process.argv[1]) : null;
if (invoked && import.meta.url === pathToFileURL(invoked).href) {
    main().catch((err) => {
        process.stderr.write(`${TOOL}: ${err.message}\n`);
        process.exit(2);
    });
}
//# sourceMappingURL=ci.js.map
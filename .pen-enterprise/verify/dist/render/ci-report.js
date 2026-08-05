/**
 * THE EVIDENCE A REVIEWER READS.
 *
 * A required check that fails is only half of it. The other half is that whoever
 * gets the red X — usually not the person who wrote the design, and never someone
 * who has heard of us — can tell in ten seconds what was refused, against whose
 * rules, and who can say yes. A check that blocks a merge without answering those
 * three is an outage with a logo.
 *
 * So everything here is written for a stranger: the catalog is named and its
 * revision quoted, the policy clause is printed so it can be argued with, and the
 * route to yes is a sentence rather than an error code.
 *
 * Three outputs, one decision behind all of them:
 *
 *   annotations  workflow commands GitHub renders inline on the changed line
 *   summary      markdown for the job summary — the page a reviewer actually opens
 *   evidence     JSON for whoever automates on top of this later
 *
 * The input types are declared here rather than imported from the gate, and
 * `test/boundary.test.ts` enforces that. A `GateResult` satisfies them
 * structurally, so nothing is converted — but a formatter that cannot call the
 * gate cannot change what it reports.
 */
const short = (hash, n = 16) => (hash ? hash.slice(0, n + 7) + "…" : "—");
const who = (input, group) => {
    if (!group)
        return "_nobody identified_";
    const route = input.routes[group];
    if (!route || route.handles.length === 0)
        return `\`${group}\` — **no CODEOWNERS entry**`;
    return route.handles.join(" ");
};
/* ── inline annotations ─────────────────────────────────────────────────── */
/** GitHub reads these off stdout. Newlines have to survive as %0A or the rest is lost. */
function escape(value) {
    return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
export function annotations(input) {
    const out = [];
    const refused = new Set(input.gate.refusals.map((r) => r.node));
    for (const r of input.gate.refusals) {
        const at = input.locations[r.node];
        const where = at ? `file=${at.file},line=${at.line},` : "";
        const route = who(input, r.ask?.group).replace(/[_*`]/g, "");
        out.push(`::error ${where}title=${escape(r.ref ? `${r.ref} is not sanctioned here` : "No declared capability")}::` +
            escape(`${r.label ?? r.node} on ${r.screen} — ${r.reason}. ` +
                `Rule: ${r.clause}. ${r.route_to_yes} Approver: ${route}.`));
    }
    // Only where the policy does NOT block on it. Whether UNDECLARED stops a merge
    // is the customer's call in `policy.blocking`, and annotating the same line
    // twice — once as an error, once as a warning — would make the report look like
    // it disagreed with itself.
    for (const b of input.gate.bindings) {
        if (b.verdict !== "UNDECLARED" || refused.has(b.node))
            continue;
        const at = input.locations[b.node];
        out.push(`::warning ${at ? `file=${at.file},line=${at.line},` : ""}title=${escape("Undeclared capability")}::` +
            escape(`${b.label ?? b.node} carries ${b.component ?? "a component"} but declares no capability. ` +
                `This check resolves declared bindings and does not observe traffic, so this is unknown, not safe.`));
    }
    // A waived binding is annotated on the exact line that declares it. Silence
    // here would be the check agreeing that the exception has become the rule —
    // and the line in the diff is the one place a reviewer cannot miss it.
    for (const b of input.gate.bindings) {
        if (!b.waiver)
            continue;
        const at = input.locations[b.node];
        out.push(`::notice ${at ? `file=${at.file},line=${at.line},` : ""}title=${escape(`Waived until ${b.waiver.expires}`)}::` +
            escape(`${b.label ?? b.node} on ${b.screen} — ${b.ref ?? "no declared capability"} is ${b.verdict}, not ` +
                `sanctioned. Excepted by ${b.waiver.source}: ${b.waiver.reason} ` +
                `This check refuses again after ${b.waiver.expires}.`));
    }
    return out.join("\n") + (out.length ? "\n" : "");
}
/* ── the job summary ────────────────────────────────────────────────────── */
function refusedSummary(input) {
    const { gate } = input;
    const rows = gate.refusals.map((r) => `| \`${r.screen}\` · **${r.label ?? r.node}** | \`${r.ref ?? "—"}\` | ${r.reason.replace(/^.*? is /, "")} | ${who(input, r.ask?.group)} |`);
    const detail = gate.refusals.flatMap((r) => [
        ``,
        `#### ${r.label ?? r.node}`,
        ``,
        `- **Rule applied:** \`${r.clause}\``,
        `- **Route to yes:** ${r.route_to_yes}`,
        `- **Who can approve:** ${who(input, r.ask?.group)}${r.ask?.confidence === "inferred" ? " _(inferred from the nearest catalogued sibling — confirm it)_" : ""}`,
    ]);
    return [
        `## ❌ Merge blocked — ${gate.refusals.length} element(s) reach a capability nobody sanctioned`,
        ``,
        `| Element | Declared | Why | Who can approve |`,
        `|---|---|---|---|`,
        ...rows,
        ...detail,
        ...(input.gate.expired_waivers ?? []).flatMap((w) => [
            ``,
            `> **\`${w.node}\` was waived until ${w.expires}, and that waiver has expired.** Nothing about this`,
            `> change broke it — the exception in \`${w.source}\` ran out, which is what an expiry is for.`,
            `> Renew it with a new date and a new review, or fix the binding.`,
        ]),
        ``,
        `> This check is **not** an opinion about your code. Every rule above came out of files in`,
        `> this repository: the catalog below, and the policy in the Enterprise Profile.`,
    ];
}
function allowedSummary(input) {
    const pack = input.pack;
    const called = Object.entries(input.operations)
        .filter(([node]) => input.gate.bindings.some((b) => b.node === node && b.verdict === "ON_MENU"))
        .sort(([a], [b]) => a.localeCompare(b));
    const waived = input.gate.bindings.filter((b) => b.waiver);
    const lines = waived.length
        ? [
            `## ⚠️ Approved with ${waived.length} waived binding(s)`,
            ``,
            `Not a clean pass. Each of these reaches something the catalog does not sanction, and is`,
            `here because somebody with the authority to say so accepted it **until a date**.`,
            ``,
            `| Element | Reaches | Verdict | Waived until | Why | Recorded in |`,
            `|---|---|---|---|---|---|`,
            ...waived.map((b) => `| **${b.label ?? b.node}** | \`${b.ref ?? "—"}\` | \`${b.verdict}\` | **${b.waiver.expires}** | ` +
                `${b.waiver.reason}${b.waiver.ticket ? ` (${b.waiver.ticket})` : ""} | \`${b.waiver.source}\` |`),
            ``,
            `On ${waived[0].waiver.expires} this check starts refusing again, with no action from anyone.`,
            `That is what an expiry is for: an exception that never runs out is a policy change nobody voted for.`,
            ``,
            `### The rest of the screen`,
            ``,
        ]
        : [
            `## ✅ Approved — every element resolves to a sanctioned operation`,
            ``,
        ];
    lines.push(`| Element | Operation | Sanctioned as | Owner |`, `|---|---|---|---|`, ...called.map(([node, op]) => {
        const b = input.gate.bindings.find((x) => x.node === node);
        return `| **${b.label ?? node}** | \`${op.method} ${op.path}\` | \`${op.capability}\` | ${b.owner ?? "—"} |`;
    }));
    if (pack) {
        lines.push(``, `### Change Pack`, ``, pack.signed_by
            ? `Signed with the customer key \`${pack.signed_by}\`${pack.expires ? `, valid until ${pack.expires.slice(0, 10)}` : ""}. **We never see the private half.**`
            : `**Unsigned** — tamper-evident but not attributable. Set \`PEN_RECEIPT_KEY\` in this repository's secrets to sign it.`, ``, `| File | sha256 |`, `|---|---|`, ...pack.files.map((f) => `| \`${f.path}\` | \`${short(f.sha256, 12)}\` |`), ``, `<details><summary>Verify this without trusting us, or GitHub, or the network</summary>`, ``, `Download the run's \`pen-enterprise-evidence\` artifact and, on any laptop:`, ``, "```bash", `npx @pen-enterprise/verify verify receipt.json --key your-public-key.pem`, "```", ``, `That command makes no outbound connection of any kind. It re-derives the digests and`, `checks the signature against **your** key — the same answer six months from now, offline,`, `on a machine that has never heard of this repository.`, ``, `</details>`);
    }
    return lines;
}
export function summary(input) {
    const { gate } = input;
    const lines = gate.allowed ? allowedSummary(input) : refusedSummary(input);
    lines.push(``, `### What was checked`, ``, `| | |`, `|---|---|`, `| Catalog | \`${gate.catalog.source ?? "—"}\` · ${gate.catalog.entries} capabilities · \`${short(gate.catalog.revision)}\` |`, `| Policy | lifecycles [${gate.policy.allowed_lifecycles.join(", ")}] · blocking [${gate.policy.blocking.join(", ")}] · \`${short(gate.policy.policy_hash)}\` |`, `| Elements | ${Object.entries(gate.counts)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k} ${n}`)
        .join(" · ")} |`, `| Checked | ${input.checked_at} by \`${input.tool}\` |`);
    if (input.changed.length > 0) {
        lines.push(``, `<details><summary>Governed files this pull request touches (${input.changed.length})</summary>`, ``, ...input.changed.map((c) => `- \`${c.path}\`${c.owners.length ? ` — ${c.owners.join(" ")}` : ""}`), ``, `The check does not scope itself to the diff. A pull request that edits the catalog and`, `touches no design can still break a binding, and a diff-scoped check would miss it.`, ``, `</details>`);
    }
    lines.push(``, `### What this check is, and is not`, ``, `- It resolves **declared** bindings against your catalog. It does **not** observe network`, `  traffic and never claims to have found every call an application makes — that is`, `  API-security territory. \`UNDECLARED\` means unknown, not safe, and it stays visible.`, `- The catalog, the components and the policy are **yours**. Nothing here ships a competing`, `  catalog, and no rule above originated outside this repository.`, `- It **wrote nothing**. This process cannot create, modify or delete a file.`);
    for (const note of gate.notes)
        lines.push(`- ${note}`);
    return lines.join("\n") + "\n";
}
/* ── the manifest ───────────────────────────────────────────────────────── */
export function evidence(input) {
    const { gate } = input;
    return (JSON.stringify({
        tool: input.tool,
        checked_at: input.checked_at,
        allowed: gate.allowed,
        headline: gate.headline,
        organization: gate.organization,
        catalog: gate.catalog,
        policy: gate.policy,
        counts: gate.counts,
        resolved: gate.bindings.map((b) => ({
            screen: b.screen,
            node: b.node,
            label: b.label,
            component: b.component,
            verdict: b.verdict,
            capability: b.ref,
            owner: b.owner,
            // An entity is not what a caller uses. Naming the operation is what makes
            // this reviewable against an API governance standard rather than a list.
            operation: input.operations[b.node]
                ? `${input.operations[b.node].method} ${input.operations[b.node].path}`
                : null,
            specification: input.operations[b.node]?.spec ?? null,
        })),
        refusals: gate.refusals.map((r) => ({
            screen: r.screen,
            node: r.node,
            capability: r.ref,
            reason: r.reason,
            clause: r.clause,
            owner: r.ask?.group ?? null,
            owner_confidence: r.ask?.confidence ?? null,
            approvers: r.ask?.group ? (input.routes[r.ask.group]?.handles ?? []) : [],
            route_to_yes: r.route_to_yes,
        })),
        codeowners: Object.fromEntries(Object.entries(input.routes).map(([group, route]) => [group, route?.handles ?? null])),
        changed_files: input.changed,
        change_pack: input.pack,
        notes: gate.notes,
    }, null, 2) + "\n");
}
//# sourceMappingURL=ci-report.js.map
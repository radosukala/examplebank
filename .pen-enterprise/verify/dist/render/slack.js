const LIMIT = { header: 150, section: 3000, context: 10, blocks: 50 };
/** Leaves room for the trailer that says how many were dropped. */
const MAX_REFUSALS = 15;
const esc = (v) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clamp = (v, n) => (v.length <= n ? v : `${v.slice(0, n - 1)}…`);
const link = (url, label) => url ? `<${url}|${esc(label)}>` : `*${esc(label)}*`;
const header = (text) => ({ type: "header", text: { type: "plain_text", text: clamp(text, LIMIT.header) } });
const section = (mrkdwn) => ({ type: "section", text: { type: "mrkdwn", text: clamp(mrkdwn, LIMIT.section) } });
const fields = (values) => ({
    type: "section",
    fields: values.slice(0, 10).map((text) => ({ type: "mrkdwn", text: clamp(text, 2000) })),
});
const context = (...lines) => ({
    type: "context",
    elements: lines.slice(0, LIMIT.context).map((text) => ({ type: "mrkdwn", text: clamp(text, 2000) })),
});
/** `catalog/catalog-info.yaml @ sha256:… · policy sha256:…` — what it was judged against. */
function judgedAgainst(input) {
    const g = input.gate;
    return (`Resolved against \`${esc(g.catalog.source ?? "the catalog")}\` @ \`${esc((g.catalog.revision ?? "—").slice(0, 23))}…\`` +
        ` · policy \`${esc(g.policy.policy_hash.slice(0, 23))}…\` · declared bindings only, never observed traffic`);
}
function refused(input, where) {
    const g = input.gate;
    const shown = g.refusals.slice(0, MAX_REFUSALS);
    const blocks = [
        header(`❌ Merge blocked — ${g.organization ?? "this repository"}`),
        section(`*${g.refusals.length} element${g.refusals.length === 1 ? "" : "s"} on ${esc(shown[0]?.screen ?? "a governed screen")} ` +
            `reach a capability nobody sanctioned.*\n` +
            `${link(where.run_url, "Bindings resolve against the catalog")}` +
            `${where.repo ? ` · \`${esc(where.repo)}\`` : ""}`),
        { type: "divider" },
    ];
    for (const r of shown) {
        blocks.push(section(`*${esc(r.label ?? r.node)}* · \`${esc(r.ref ?? "nothing declared")}\`\n${esc(r.reason)}`), 
        // The route to yes is the difference between a control and an obstacle, so
        // it is never omitted — a refusal nobody can act on gets routed around.
        context(`→ ${esc(r.route_to_yes)}`, r.ask?.group
            ? `*Approve:* ${(input.routes[r.ask.group]?.handles ?? []).map(esc).join(" ") || `\`${esc(r.ask.group)}\` — no CODEOWNERS entry`}`
            : `*Approve:* needs a human to route it`));
    }
    if (g.refusals.length > shown.length) {
        blocks.push(section(`_…and ${g.refusals.length - shown.length} more. The run has all of them._`));
    }
    return blocks;
}
function approved(input, where) {
    const g = input.gate;
    const passed = g.bindings.filter((b) => b.verdict === "ON_MENU");
    const waived = g.bindings.filter((b) => b.waiver);
    const pack = input.pack;
    // Deliberately not the refusal card with a green tick. Different shape, different
    // content, and it answers a different question — what shipped, and how to check
    // it — because a check that always says the same thing is the one people mute.
    //
    // And a WAIVED binding gets its own block above the pass, because a channel
    // scrolling past a green tick is exactly where an exception would disappear.
    return [
        header(waived.length
            ? `⚠️ Approved with ${waived.length} waived — ${g.organization ?? "this repository"}`
            : `✅ Approved — ${g.organization ?? "this repository"}`),
        ...(waived.length
            ? [
                section(`*${waived.length} binding${waived.length === 1 ? " reaches" : "s reach"} something nobody sanctioned, ` +
                    `excepted until a date:*\n` +
                    waived
                        .map((b) => `• *${esc(b.label ?? b.node)}* → \`${esc(b.ref ?? "—")}\` · ${esc(b.verdict)} · ` +
                        `until *${esc(b.waiver.expires)}* — ${esc(b.waiver.reason)}`)
                        .join("\n")),
                { type: "divider" },
            ]
            : []),
        section(`*${passed.length} element${passed.length === 1 ? "" : "s"} resolve to sanctioned operations.*` +
            `${pack ? ` A Change Pack of ${pack.files.length} file${pack.files.length === 1 ? "" : "s"} was issued.` : ""}\n` +
            `${link(where.run_url, "Bindings resolve against the catalog")}${where.repo ? ` · \`${esc(where.repo)}\`` : ""}`),
        fields(passed.map((b) => {
            const op = input.operations[b.node];
            return `*${esc(b.label ?? b.node)}*\n\`${esc(op ? `${op.method} ${op.path}` : (b.ref ?? "—"))}\``;
        })),
        context(pack?.signed_by
            ? `Receipt signed with the customer key \`${esc(pack.signed_by)}\` — verifies offline, no account and no network.`
            : `Receipt is *unsigned*: tamper-evident, but not attributable until \`PEN_RECEIPT_KEY\` is set.`),
    ];
}
/**
 * One decision, two genuinely different messages.
 *
 * Everything here comes from the same `ReportInput` the CI annotations and the
 * job summary are built from, so Slack cannot say something the check did not.
 */
export function slackMessage(input, where = {}) {
    const blocks = (input.gate.allowed ? approved : refused)(input, where);
    blocks.push({ type: "divider" }, context(judgedAgainst(input)));
    return {
        text: clamp(esc(input.gate.headline), LIMIT.section),
        blocks: blocks.slice(0, LIMIT.blocks),
    };
}
//# sourceMappingURL=slack.js.map
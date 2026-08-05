/**
 * THE FILE THEY COMMIT, AND THE ONE LINE THAT MAKES IT AN APPROVAL.
 *
 * A refusal already knows everything a waiver needs — which screen, which node,
 * which capability, which group can say yes — so the developer should never have
 * to assemble one. They get it ready to commit, and committing it is the whole
 * request: the path routes the review to the group the refusal named, and their
 * branch protection does the rest.
 *
 * Two things this deliberately does NOT do.
 *
 * **It does not write to their CODEOWNERS.** We print the line they need and say
 * where it goes. CODEOWNERS is the file that decides who can approve anything in
 * their repository; a tool that edits it has quietly granted itself the power to
 * choose its own reviewers, which is the exact property the design depends on not
 * having. It is also the one file where an unreviewed change is invisible.
 *
 * **It does not fill in the expiry.** A date the tool picks is a date nobody
 * argued about, and the whole value of an expiry is that somebody chose it. The
 * generated file carries a suggestion and a TODO, and the reason field is empty
 * on purpose: a waiver whose justification was autocompleted is not a decision.
 */
import { WAIVER_DIR, waiverId } from "../waiver.js";
const yaml = (value) => JSON.stringify(value);
/**
 * `group:cards-platform` in the catalog, `@examplebank/cards-platform` in
 * CODEOWNERS. The slug is the only join that exists, and where the refusal could
 * not identify an owner we say so rather than inventing a handle — a waiver
 * routed to the wrong team is worse than one that stops and asks.
 */
function handleFor(refusal, org) {
    if (!refusal.ask)
        return null;
    const slug = refusal.ask.group.split(":").pop() ?? refusal.ask.group;
    return org ? `@${org}/${slug}` : `@${slug}`;
}
/** Ninety days, offered rather than chosen. The developer edits it or argues. */
function suggestedExpiry(now) {
    return new Date(now.getTime() + 90 * 86_400_000).toISOString().slice(0, 10);
}
export function waiverDraft(refusal, org, now = new Date()) {
    const id = waiverId(refusal.screen, refusal.node);
    const handle = handleFor(refusal, org);
    const contents = `# An exception to the export gate, for one binding, until a date.
#
# ${refusal.screen} · ${refusal.label ?? refusal.node}
# ${refusal.reason}
# Rule: ${refusal.clause}
#
# Committing this file IS the request. In CODEOWNERS this path is owned by
# ${handle ?? "a group your CODEOWNERS must name — see the command's output"}, so the pull request cannot
# merge until they approve it. Nothing is sent anywhere and nothing is stored
# outside this repository.
#
# The check starts refusing again on the expiry date, with no action from anyone.
# That is the point of it: an exception that never expires is a policy change
# nobody voted for.
screen: ${yaml(refusal.screen)}
node: ${yaml(refusal.node)}
capability: ${refusal.ref ? yaml(refusal.ref) : "null   # this node declares none — the waiver covers the node"}

# WHY. Not "temporary" and not "TODO" — the sentence the approver is agreeing to,
# and the one somebody reads in six months wondering what this was for.
reason: ""

# TODO: choose this date. Ninety days is offered, not decided.
expires: ${suggestedExpiry(now)}

# Optional: your own change record, so this waiver joins the trail it belongs to.
ticket: null

# Recorded in the receipt beside what shipped. It is not proof of approval —
# the approval is the review on this file, in your forge's log.
approver: ${refusal.ask ? yaml(refusal.ask.group) : "null"}
`;
    return {
        id,
        node: refusal.node,
        path: `${WAIVER_DIR}/${id}.yaml`,
        contents,
        codeowners: handle
            ? `/${WAIVER_DIR}/${id}.yaml ${handle}`
            : `/${WAIVER_DIR}/${id}.yaml @your-org/<nobody owns this capability in the catalog — a human has to route it>`,
        approver: refusal.ask?.group ?? null,
    };
}
/**
 * What to do with the draft, in the order it has to happen.
 *
 * The CODEOWNERS line comes first and it is not optional: without it the waiver
 * file is a note in a directory, and the merge is blocked by nothing. Said out
 * loud because "commit this and it works" would be a lie in a repository that
 * has never routed the path.
 */
export function waiverInstructions(draft, root) {
    return [
        "",
        `  ${draft.path}`,
        "",
        "  1. Your CODEOWNERS must route this waiver to the group that approves it, or",
        "     committing one changes nothing:",
        "",
        `         ${draft.codeowners}`,
        "",
        `     ${draft.approver ? "That group is who the catalog says owns this capability." : "The catalog names no owner for this — a human has to route it."}`,
        "     It goes BELOW any broader `.pen/waivers/**` line: GitHub takes the last",
        "     matching pattern, not the most specific one, so a catch-all underneath",
        "     this would quietly take the approval back off them.",
        "",
        "  2. Write the reason and choose the expiry. Both are blank on purpose.",
        "",
        "  3. Commit it on the same pull request. The review IS the approval, and it",
        "     is recorded in your forge, not in anything of ours.",
        "",
        "  Nothing was written. This process cannot write. To materialise it:",
        `    pen-enterprise waive --root ${root} --node ${draft.node} --file ${draft.path} > ${draft.path}`,
        "",
    ];
}
//# sourceMappingURL=waiver-artifacts.js.map
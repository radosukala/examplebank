/**
 * THE EXCEPTION — approved without us becoming an approval system.
 *
 * Every gate needs a way to say yes to something it would otherwise refuse, and
 * the obvious build is the wrong one: a waiver UI, a waiver API, a waiver
 * database, a login. That makes the vendor a system of record for a bank's
 * governance decisions, which is a compliance surface nobody wants to buy and a
 * liability nobody wants to hold.
 *
 * So the exception is a FILE THEY COMMIT. `.pen/waivers/<id>.yaml` names the
 * binding, the reason, the group that must agree and the date it stops working.
 * Because CODEOWNERS assigns `.pen/waivers/**` to that group — and the refusal
 * already resolved which group that is — their existing branch protection now
 * requires that group's review before the pull request can merge. **The approval
 * is a code review**: the one workflow every enterprise already operates, already
 * audits, and already trusts. We hold no token, run no listener, and store
 * nothing.
 *
 * Four properties, and each is somebody else's infrastructure doing the work:
 *
 *  1. **The approver is named before the request exists.** CODEOWNERS is written
 *     ahead of time by the platform team; a developer cannot pick who reviews
 *     their own exception, because the path decides and they do not own the path.
 *  2. **The approval is a signed git event.** Their forge records who approved,
 *     when, on what commit, immutably, in a log they already retain.
 *  3. **It expires.** The check goes red on its own on the date in the file, so
 *     an exception cannot quietly calcify into policy. That is the property that
 *     makes waivers safe to grant at all.
 *  4. **The receipt records which waiver covered which binding**, so what shipped
 *     carries its own exceptions rather than pointing at a system to ask.
 *
 * **This is policy, not decision.** What may be excepted, by whom, until when —
 * profile.ts's neighbourhood. `export-gate.ts` applies it and stays the one place
 * that decides.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
/** Where they live. Fixed, because a configurable path is one more thing to audit. */
export const WAIVER_DIR = ".pen/waivers";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/**
 * The id is derived from what it covers, and that is a control rather than a
 * convenience: two waivers for the same binding collide on the same filename, so
 * a second one is an edit somebody reviews and not a duplicate nobody notices.
 */
export function waiverId(screen, node) {
    return `${screen.replace(/^\/+|\/+$/g, "").replace(/\//g, "-") || "root"}-${node}`.toLowerCase();
}
function asWaiver(raw, source) {
    const w = raw;
    const text = (key) => (typeof w?.[key] === "string" ? w[key] : null);
    const screen = text("screen");
    const node = text("node");
    const reason = text("reason");
    const expires = text("expires");
    // A waiver missing any of these is not a lenient waiver, it is not a waiver.
    // Refusing to read it means the gate refuses the binding, which is the safe way
    // for this to fail.
    if (!screen || !node || !reason || !expires || !ISO_DATE.test(expires))
        return null;
    return {
        id: text("id") ?? waiverId(screen, node),
        screen,
        node,
        capability: text("capability"),
        reason,
        expires,
        ticket: text("ticket"),
        approver: text("approver"),
        source,
    };
}
export async function loadWaivers(root) {
    const dir = path.join(path.resolve(root), WAIVER_DIR);
    const names = await readdir(dir).catch(() => []);
    const out = [];
    for (const name of names.sort()) {
        if (!/\.ya?ml$/.test(name))
            continue;
        const text = await readFile(path.join(dir, name), "utf8").catch(() => null);
        if (text === null)
            continue;
        try {
            const waiver = asWaiver(parse(text), path.join(WAIVER_DIR, name));
            if (waiver)
                out.push(waiver);
        }
        catch {
            /* an unparseable waiver covers nothing, and the binding stays refused */
        }
    }
    return out;
}
/**
 * EXACTLY WHAT IT NAMES, AND NOTHING ELSE.
 *
 * Same screen, same node, same capability ref. No wildcards, no prefixes, no
 * "this whole file", no "this whole screen". A waiver that can be written to
 * cover a class of things is how a gate becomes decorative: the first one is
 * written for a real exception and the tenth is written to make the check quiet.
 *
 * A waiver whose `capability` is absent covers the node whatever it reaches,
 * which is the one loosening allowed and only because UNDECLARED bindings have
 * no ref to name. It still names one node on one screen.
 */
export function covers(waiver, screen, node, ref) {
    if (waiver.screen !== screen || waiver.node !== node)
        return false;
    return waiver.capability === null || waiver.capability === ref;
}
export function expired(waiver, now) {
    // End of the stated day, in UTC. A waiver that says 2026-09-30 works on the
    // 30th; a bank's change window does not end at midnight because we said so.
    return now.getTime() > Date.parse(`${waiver.expires}T23:59:59.999Z`);
}
export const applied = (waiver) => ({
    id: waiver.id,
    reason: waiver.reason,
    expires: waiver.expires,
    ticket: waiver.ticket,
    approver: waiver.approver,
    source: waiver.source,
});
export function daysLeft(waiver, now) {
    return Math.ceil((Date.parse(`${waiver.expires}T23:59:59.999Z`) - now.getTime()) / 86_400_000);
}
//# sourceMappingURL=waiver.js.map
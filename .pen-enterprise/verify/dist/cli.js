#!/usr/bin/env node
/**
 * `pen-enterprise` — the gate, and the verifier a stranger runs.
 *
 * The `verify` command exists to be run by someone in a bank's security review
 * who is handed a JSON file and their own public key. One command establishes
 * that the artifact shipped against a specific catalog revision under a specific
 * policy, and has not moved since. No login, no vendor endpoint, no telemetry —
 * **the process makes no outbound connection at all.**
 *
 *   pen-enterprise check   [--root .] [--json]
 *   pen-enterprise seam    [--root .] [--design d.json] [--file p] [--json]
 *   pen-enterprise verify  <receipt.json> [--key pub.pem] [--root .]
 *   pen-enterprise keygen  [--out ./receipt-key]
 *
 * Exit codes: 0 clean/verified · 1 refused/not verified · 2 usage error.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { EMPTY_CATALOG, loadCatalog } from "./catalog.js";
import { checkExport } from "./export-gate.js";
import { loadProfile } from "./profile.js";
import { generateReceiptKeyPair, keyIdOf, verifyReceipt } from "./receipt.js";
import { DEFAULT_DESIGN } from "./design.js";
import { optionalModule, notInstalledMessage } from "./optional.js";
import { seamSummary } from "./render/seam-summary.js";
import { waiverDraft, waiverInstructions } from "./render/waiver-artifacts.js";
import { provenanceFor } from "./attest.js";
import { RefusedError, buildChangePack, readContext } from "./pack.js";
const SEAM_PACKAGE = "@pen-enterprise/seam";
const USAGE = `pen-enterprise — refuse what nobody sanctioned, prove what shipped.

  pen-enterprise check  [--root <dir>] [--json]
      Resolve every declared binding against the registered catalog.
      Exits 1 if the export would be refused.

  pen-enterprise seam   [--root <dir>] [--design <file>] [--file <path>] [--json]
      Derive the missing seam behind every refusal that has no sanctioned route:
      an OpenAPI stub in your house style, the fixture, a contract test, and a
      draft catalog entry. Prints. **Writes nothing** — pipe --file, or hand the
      JSON to your own scaffolder.

  pen-enterprise waive  [--root <dir>] [--node <id>] [--file] [--json]
      Draft the waiver a refusal needs: the exact binding, the reason to fill in,
      an expiry to choose, and the CODEOWNERS line that routes its approval to the
      group the refusal already named. Committing the file IS the request — the
      code review is the approval. Prints. **Writes nothing**, and never touches
      your CODEOWNERS.

  pen-enterprise export [--root <dir>] [--design <file>] [--file <path>] [--json]
      Compile the screen into a change package for the runtime the profile names.
      Refuses outright if the gate refuses — a bundle only exists for an export
      that was allowed. Embeds the Change Pack receipt, signed with
      PEN_RECEIPT_KEY when it is set. Prints. **Writes nothing.**

  pen-enterprise attest [--root <dir>] [--design <file>]
      Print a SLSA v1 provenance predicate for the Change Pack, for
      \`cosign attest-blob --predicate - --type slsaprovenance1\`. Alongside the
      receipt, never replacing it — the offline path needs nothing installed.

  pen-enterprise verify <receipt.json> [--key <public.pem>] [--root <dir>]
      Check a Change Pack receipt. Offline — makes no network requests.
      --key   the customer's Ed25519 PUBLIC key. Without it, structure and
              freshness are checked but the signature is not.
      --root  re-hash the receipt's artifacts against this directory.

  pen-enterprise keygen [--out <prefix>]
      Generate a customer signing keypair. The private half belongs in your CI
      secret store; we never see it.`;
function fail(msg, code = 2) {
    process.stderr.write(`pen-enterprise: ${msg}\n`);
    process.exit(code);
}
async function main() {
    const { values, positionals } = parseArgs({
        allowPositionals: true,
        options: {
            root: { type: "string" },
            key: { type: "string" },
            out: { type: "string" },
            design: { type: "string", multiple: true },
            file: { type: "string" },
            node: { type: "string" },
            json: { type: "boolean" },
            help: { type: "boolean", short: "h" },
        },
    });
    const cmd = positionals[0];
    if (values.help || !cmd) {
        process.stdout.write(USAGE + "\n");
        process.exit(cmd ? 0 : 2);
    }
    const root = path.resolve(values.root ?? ".");
    if (cmd === "keygen") {
        const prefix = values.out ?? "pen-receipt-key";
        const { privateKeyPem, publicKeyPem } = generateReceiptKeyPair();
        await writeFile(`${prefix}.pem`, privateKeyPem, { mode: 0o600 });
        await writeFile(`${prefix}.pub.pem`, publicKeyPem);
        process.stdout.write(`wrote ${prefix}.pem      PRIVATE — put it in your CI secret store, never in a repo\n` +
            `wrote ${prefix}.pub.pem  public — hand this to anyone who verifies your receipts\n` +
            `key id: ${keyIdOf(publicKeyPem)}\n\nexport PEN_RECEIPT_KEY=${path.resolve(prefix + ".pem")}\n`);
        return;
    }
    if (cmd === "check") {
        const gate = await checkExport(root);
        if (values.json) {
            process.stdout.write(JSON.stringify(gate, null, 2) + "\n");
            process.exit(gate.allowed ? 0 : 1);
        }
        const lines = [
            "",
            `  ${gate.allowed ? "✓" : "✗"} ${gate.headline}`,
            "",
            `  catalog   ${gate.catalog.source ?? "—"} · ${gate.catalog.entries} capabilities · ${gate.catalog.revision?.slice(0, 22) ?? "—"}…`,
            `  policy    lifecycles [${gate.policy.allowed_lifecycles.join(", ")}] · ${gate.policy.policy_hash.slice(0, 22)}…`,
            `  bindings  ${gate.binding_source}`,
            "",
            "  " +
                Object.entries(gate.counts)
                    .filter(([, n]) => n > 0)
                    .map(([k, n]) => `${k} ${n}`)
                    .join("   "),
            "",
        ];
        for (const r of gate.refusals) {
            lines.push(`  ✗ ${r.screen} · ${r.label ?? r.node}`, `      declared  ${r.ref ?? "—"}`, `      rule      ${r.clause}`, `      ask       ${r.ask ? `${r.ask.group} (${r.ask.confidence})` : "nobody identified"}`, `      → ${r.route_to_yes}`, "");
        }
        // Waived is its OWN state, never folded into the clean count. A reader who
        // cannot see the exception on the screen that reports the decision has been
        // handed a pass, which is the failure this whole file exists to avoid.
        for (const b of gate.bindings.filter((x) => x.waiver)) {
            lines.push(`  ! ${b.screen} · ${b.label ?? b.node}   WAIVED`, `      verdict   ${b.verdict} — still not sanctioned, excepted until ${b.waiver.expires}`, `      reason    ${b.waiver.reason}`, `      approved  ${b.waiver.approver ?? "no group recorded"} · ${b.waiver.source}${b.waiver.ticket ? ` · ${b.waiver.ticket}` : ""}`, "");
        }
        for (const n of gate.notes)
            lines.push(`  · ${n}`);
        process.stdout.write(lines.join("\n") + "\n");
        process.exit(gate.allowed ? 0 : 1);
    }
    if (cmd === "waive") {
        /**
         * The refusal already knows everything the waiver needs, so this assembles
         * nothing new — it prints what the gate already decided, in the shape their
         * CODEOWNERS can route. Printed, never written: the redirect is the write,
         * here as everywhere.
         */
        const gate = await checkExport(root);
        if (gate.refusals.length === 0)
            fail("nothing is refused — there is nothing to waive.", 0);
        const node = values.node;
        const refusal = node ? gate.refusals.find((r) => r.node === node) : gate.refusals[0];
        if (!refusal) {
            fail(`no refusal for node '${node}'. Refused right now:\n  ` +
                gate.refusals.map((r) => `${r.node}   ${r.screen}   ${r.ref ?? "(declares nothing)"}`).join("\n  "));
        }
        const draft = waiverDraft(refusal, gate.organization?.toLowerCase().replace(/[^a-z0-9]+/g, "") ?? null);
        if (values.json) {
            process.stdout.write(JSON.stringify(draft, null, 2) + "\n");
            return;
        }
        // `--file <path>`, the same shape as `seam` and `export`: name what you want
        // and redirect it. A draft has exactly one file, so this is mostly a spelling
        // of "just the yaml please" — but the spelling matches everything else.
        if (values.file) {
            if (values.file !== draft.path)
                fail(`this draft has one file: ${draft.path}`);
            process.stdout.write(draft.contents);
            return;
        }
        process.stdout.write(`\n  ${refusal.screen} · ${refusal.label ?? refusal.node} — ${refusal.reason}\n` +
            `${waiverInstructions(draft, values.root ?? ".").join("\n")}\n${draft.contents}\n`);
        return;
    }
    if (cmd === "seam") {
        const loaded = await loadProfile(root);
        const catalog = loaded.profile?.catalog?.source
            ? await loadCatalog(root, loaded.profile.catalog.source)
            : EMPTY_CATALOG;
        const gate = await checkExport(root);
        /**
         * Deriving the API a refused screen is missing is the one GENERATIVE thing
         * this product does, and it ships as its own package. The refusal above does
         * not need it: where the catalog names a sanctioned replacement the route to
         * yes is a rebind, which is core. This command is for the other case.
         */
        const mod = await optionalModule(SEAM_PACKAGE);
        if (!mod)
            fail(notInstalledMessage(SEAM_PACKAGE, "the seam generator"));
        const proposal = await mod.proposeSeams(root, gate, catalog, {
            designs: values.design ?? [DEFAULT_DESIGN],
        });
        const files = proposal.seams.flatMap((s) => s.files);
        // The redirect is the write. Nothing in this process creates a file, which is
        // most of why it survives a bank's intake review.
        if (values.file) {
            const hit = files.find((f) => f.path === values.file);
            if (!hit) {
                fail(`no generated file at '${values.file}'. This proposal has:\n  ${files.map((f) => f.path).join("\n  ")}`);
            }
            process.stdout.write(hit.contents);
            return;
        }
        if (values.json) {
            process.stdout.write(JSON.stringify(proposal, null, 2) + "\n");
            return;
        }
        const lines = seamSummary(proposal, catalog.source, values.root ?? ".");
        process.stdout.write(lines.join("\n") + "\n");
        return;
    }
    if (cmd === "export") {
        // The whole product lives in buildChangePack, which every transport calls and
        // none re-implements — a second copy of that sequence would eventually
        // disagree with the first, and a bundle the gate would have refused is a
        // bundle that means nothing.
        const ctx = await readContext(root);
        const { loaded, catalog, gate } = ctx;
        let pack;
        try {
            pack = await buildChangePack(ctx, { designs: values.design });
        }
        catch (err) {
            if (err instanceof RefusedError) {
                process.stderr.write(`\n  ✗ ${gate.headline}\n\n` +
                    gate.refusals.map((r) => `      ${r.screen} · ${r.label ?? r.node} → ${r.route_to_yes}\n`).join("") +
                    `\n  No bundle was produced. Run 'seam' for what is missing, or 'check' for the full refusal.\n\n`);
                process.exit(1);
            }
            fail(err.message);
        }
        const { design, receipt, files, operations } = pack;
        if (values.file) {
            const hit = files.find((f) => f.path === values.file);
            if (!hit) {
                fail(`no generated file at '${values.file}'. This bundle has:\n  ${files.map((f) => f.path).join("\n  ")}`);
            }
            process.stdout.write(hit.contents);
            return;
        }
        if (values.json) {
            process.stdout.write(JSON.stringify({ target: pack.target, receipt, files }, null, 2) + "\n");
            return;
        }
        const called = Object.entries(operations).filter(([node]) => design.nodes.some((n) => n.id === node));
        const lines = [
            "",
            `  ▸ ${design.name ?? design.screen} → ${pack.target}`,
            `      ${pack.what}`,
            "",
            `  catalog    ${catalog.source ?? "—"} @ ${catalog.revision?.slice(0, 22) ?? "—"}…`,
            `  policy     ${gate.policy.policy_hash.slice(0, 22)}…`,
            `  receipt    ${receipt.signature ? `signed · key ${receipt.signature.key_id}` : "UNSIGNED — set PEN_RECEIPT_KEY"}`,
            "",
            "  calls, and nothing else:",
            ...called.map(([node, op]) => `      ${op.method.padEnd(4)} ${op.path.padEnd(34)} ${node} · ${op.capability}`),
            "",
            "  files",
            ...files.map((f) => `      ${f.path.padEnd(64)} ${f.sha256.slice(0, 21)}…`),
            "",
            "  Nothing was written. To materialise one file:",
            `    pen-enterprise export --root ${values.root ?? "."} --file ${files[0].path} > ${files[0].path}`,
            "",
        ];
        process.stdout.write(lines.join("\n") + "\n");
        return;
    }
    if (cmd === "attest") {
        // The predicate only. cosign builds the in-toto Statement around it, hashes
        // the blob into the subject, and signs — so the blob to hand it is the
        // receipt this describes. Printed, never written: the redirect is the write.
        const ctx = await readContext(root);
        let pack;
        try {
            pack = await buildChangePack(ctx, { designs: values.design });
        }
        catch (err) {
            if (err instanceof RefusedError)
                fail(`refused: ${ctx.gate.headline}`, 1);
            fail(err.message);
        }
        process.stdout.write(JSON.stringify(provenanceFor(pack.receipt), null, 2) + "\n");
        return;
    }
    if (cmd !== "verify")
        fail(`unknown command '${cmd}'.\n\n${USAGE}`);
    const file = positionals[1];
    if (!file)
        fail(`verify needs a receipt file.\n\n${USAGE}`);
    let receipt;
    try {
        receipt = JSON.parse(await readFile(file, "utf8"));
    }
    catch (err) {
        fail(`cannot read ${file}: ${err.message}`);
    }
    const publicKeyPem = values.key ? await readFile(values.key, "utf8").catch(() => null) : null;
    if (values.key && !publicKeyPem)
        fail(`cannot read key ${values.key}`);
    const result = await verifyReceipt(receipt, { publicKeyPem, root: values.root ? root : null });
    if (values.json) {
        process.stdout.write(JSON.stringify({ receipt: file, ...result }, null, 2) + "\n");
        process.exit(result.ok ? 0 : 1);
    }
    const lines = [
        "",
        `  ${result.ok ? "✓ VERIFIED" : "✗ NOT VERIFIED"}  ${path.basename(file)}`,
        "",
        `  organization ${receipt.organization ?? "—"}`,
        `  runtime      ${receipt.runtime_target ?? "—"}`,
        `  issued       ${receipt.issued_at}`,
        `  catalog      ${receipt.catalog.source ?? "—"} @ ${receipt.catalog.revision?.slice(0, 22) ?? "—"}…`,
        `  policy       ${receipt.policy_hash.slice(0, 22)}…`,
        `  sanctioned   ${receipt.capabilities.length}`,
        "",
        ...result.checks.map((c) => `  ${c.ok ? "✓" : "✗"} ${c.name.padEnd(10)} ${c.detail}`),
        "",
    ];
    if (receipt.capabilities.length > 0) {
        lines.push("  capabilities bound:");
        for (const c of receipt.capabilities) {
            lines.push(`    ${(c.ref ?? "—").padEnd(36)} ${c.screen} · ${c.label ?? c.node}${c.owner ? ` · ${c.owner}` : ""}`);
        }
        lines.push("");
    }
    lines.push("  Checked locally. This command made no network requests.", "");
    process.stdout.write(lines.join("\n"));
    process.exit(result.ok ? 0 : 1);
}
main().catch((err) => fail(err.message));
//# sourceMappingURL=cli.js.map
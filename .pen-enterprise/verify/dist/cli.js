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
import { DEFAULT_DESIGN, proposeSeams } from "./seam.js";
import { provenanceFor } from "./attest.js";
import { RefusedError, buildChangePack, readContext } from "./pack.js";
const USAGE = `pen-enterprise — refuse what nobody sanctioned, prove what shipped.

  pen-enterprise check  [--root <dir>] [--json]
      Resolve every declared binding against the registered catalog.
      Exits 1 if the export would be refused.

  pen-enterprise seam   [--root <dir>] [--design <file>] [--file <path>] [--json]
      Derive the missing seam behind every refusal that has no sanctioned route:
      an OpenAPI stub in your house style, the fixture, a contract test, and a
      draft catalog entry. Prints. **Writes nothing** — pipe --file, or hand the
      JSON to your own scaffolder.

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
        for (const n of gate.notes)
            lines.push(`  · ${n}`);
        process.stdout.write(lines.join("\n") + "\n");
        process.exit(gate.allowed ? 0 : 1);
    }
    if (cmd === "seam") {
        const loaded = await loadProfile(root);
        const catalog = loaded.profile?.catalog?.source
            ? await loadCatalog(root, loaded.profile.catalog.source)
            : EMPTY_CATALOG;
        const gate = await checkExport(root);
        const proposal = await proposeSeams(root, gate, catalog, {
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
        const lines = [
            "",
            `  ${proposal.seams.length > 0 ? "▸" : "·"} ${proposal.headline}`,
            "",
            `  house style  ${proposal.house_style?.source ?? "— none readable, using defaults"}`,
            `  catalog      ${catalog.source ?? "—"} @ ${proposal.catalog_revision_before?.slice(0, 22) ?? "—"}…`,
            "",
        ];
        for (const seam of proposal.seams) {
            lines.push(`  ${seam.ref}   ${seam.title}   ${seam.screen}`, `      owner      ${seam.owner.group ?? "unresolved"} (${seam.owner.confidence})`, `      lifecycle  ${seam.lifecycle}`, `      named      ${seam.name_basis === "declared-by-binding"
                ? "from the ref the binding already declared, so no second change is needed"
                : "from the journey — the binding has to be pointed at it"}`, "");
            for (const op of seam.operations) {
                lines.push(`      ${op.method.toUpperCase()} ${op.path}`, `          ← ${op.node} · ${op.prop}   ${op.schema_name}${op.collection ? "[]" : ""}   ` +
                    `${op.fields.length} field(s) from the design`);
            }
            lines.push("");
            if (seam.binding_changes.length > 0) {
                lines.push("      binding changes");
                for (const c of seam.binding_changes) {
                    lines.push(`        ${c.node}: ${c.from ?? "(declares nothing)"} → ${c.to}`);
                }
                lines.push("");
            }
            lines.push("      decide before merging");
            for (const d of seam.decisions)
                lines.push(`        · ${d}`);
            lines.push("", "      files");
            for (const f of seam.files)
                lines.push(`        ${f.path.padEnd(46)} ${f.sha256.slice(0, 21)}…`);
            lines.push("");
        }
        for (const n of proposal.not_seams) {
            lines.push(`  no seam for ${n.screen} · ${n.label ?? n.node}`, `      ${n.reason}`, "");
        }
        for (const n of proposal.notes)
            lines.push(`  · ${n}`);
        if (files.length > 0) {
            lines.push("", "  Nothing was written. This process cannot write. To materialise one file:", `    pen-enterprise seam --root ${values.root ?? "."} --file ${files[0].path} > ${files[0].path}`, "");
        }
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
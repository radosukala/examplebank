/**
 * A SEAM PROPOSAL, FOR SOMEBODY TO READ.
 *
 * The derivation lives in `@pen-enterprise/seam`, which is a package this library
 * does not depend on — so the shape it returns is declared here structurally,
 * exactly as `ci-report.ts` declares the gate's. The `seam` command must compile
 * and run with the generator absent; if the shape ever drifts, this file is what
 * breaks, and it breaks loudly rather than printing something wrong.
 *
 * It is a report and not a transport for the ordinary reason: it turns a decision
 * into something a human reads, and it grows when what we can say about a
 * proposal grows — never when the CLI gains a flag.
 */
/** The `seam` command's own output, line by line. */
export function seamSummary(proposal, catalogSource, root) {
    const files = proposal.seams.flatMap((s) => s.files);
    const lines = [
        "",
        `  ${proposal.seams.length > 0 ? "▸" : "·"} ${proposal.headline}`,
        "",
        `  house style  ${proposal.house_style?.source ?? "— none readable, using defaults"}`,
        `  catalog      ${catalogSource ?? "—"} @ ${proposal.catalog_revision_before?.slice(0, 22) ?? "—"}…`,
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
        lines.push("", "  Nothing was written. This process cannot write. To materialise one file:", `    pen-enterprise seam --root ${root} --file ${files[0].path} > ${files[0].path}`, "");
    }
    return lines;
}
//# sourceMappingURL=seam-summary.js.map
/**
 * File primitives. Read-only, and that is a product guarantee rather than an
 * implementation detail: nothing in this package creates, modifies, moves or
 * deletes a file. Pointing it at a repository cannot change that repository.
 *
 * A missing file is INFORMATION, not an exception — an enterprise that has not
 * registered a catalog yet is a state we report, not an error we throw.
 */
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
export async function readJson(abs) {
    try {
        return JSON.parse(await readFile(abs, "utf8"));
    }
    catch {
        return null;
    }
}
export function sha256(value) {
    return "sha256:" + createHash("sha256").update(value).digest("hex");
}
export async function sha256File(abs) {
    try {
        return sha256(await readFile(abs));
    }
    catch {
        return null;
    }
}
export async function exists(abs) {
    try {
        await stat(abs);
        return true;
    }
    catch {
        return false;
    }
}
/** Files under a directory, recursively, root-relative and sorted. Missing dir → []. */
export async function walkFiles(root, rel = "", out = []) {
    let entries;
    try {
        entries = await readdir(path.join(root, rel), { withFileTypes: true });
    }
    catch {
        return out;
    }
    for (const e of entries) {
        if (e.name === "node_modules" || e.name === ".git" || e.name === "dist")
            continue;
        const child = rel ? path.join(rel, e.name) : e.name;
        if (e.isDirectory())
            await walkFiles(root, child, out);
        else
            out.push(child);
    }
    return out.sort();
}
/** Whole days until an ISO timestamp; negative once it has passed. */
export function daysUntil(iso, now) {
    if (!iso)
        return null;
    const then = Date.parse(iso);
    if (Number.isNaN(then))
        return null;
    return Math.floor((then - now.getTime()) / 86_400_000);
}
//# sourceMappingURL=fs.js.map
/**
 * THE DESIGN — what the screen says it shows, and where it comes from.
 *
 * Core reads this the way it reads the catalog and the profile: it is the
 * enterprise's own statement of what is on the canvas, and the gate, the export
 * and every renderer resolve against it. Deriving a missing API *from* it is a
 * different job with a different appetite for change, and it lives in
 * `@pen-enterprise/seam`.
 */
import path from "node:path";
import { readJson } from "./fs.js";
/** The design a Change Pack is compiled from unless one is named. */
export const DEFAULT_DESIGN = "design/dashboard.json";
export function designSource(root, rels) {
    return {
        name: rels.join(", "),
        async load() {
            const out = [];
            for (const rel of rels) {
                const design = await readJson(path.join(path.resolve(root), rel));
                if (design?.screen)
                    out.push(design);
            }
            return out;
        },
    };
}
//# sourceMappingURL=design.js.map
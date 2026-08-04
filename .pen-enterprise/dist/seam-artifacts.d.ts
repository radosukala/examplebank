import type { Catalog } from "./catalog.js";
import type { Design, HouseStyle, Seam, SeamFile } from "./seam.js";
export interface RenderContext {
    house: HouseStyle | null;
    catalog: Catalog;
    design: Design;
    organization: string | null;
}
export declare function renderSeamFiles(seam: Seam, ctx: RenderContext): SeamFile[];
//# sourceMappingURL=seam-artifacts.d.ts.map
#!/usr/bin/env node
/**
 * The MCP server — pen.dev's own agent, holding this.
 *
 * Their homepage invites exactly this: *"plug in the whole world of MCPs… bring
 * in data from databases, APIs — you're in charge."* This is the plug. A
 * designer adds one block to their MCP config, points `root` at a repository,
 * and the agent inside the canvas can ask what a node is allowed to stand on,
 * why an export was refused, what the missing API would have to look like, and
 * whether a receipt is real.
 *
 * FIVE TOOLS, ZERO WRITES — including `export_change_pack`, which returns bytes
 * and a hash per file and leaves the writing to whatever called it. An agent
 * pointed at somebody's repository through this server cannot change it, and
 * that sentence is worth more at a bank's intake review than any convenience we
 * would buy by relaxing it.
 *
 * The gate refuses by ANSWERING. Nothing here can be overridden, because there
 * is nothing here to override: `buildChangePack` throws on a refused gate and
 * this server reports the refusal instead of inventing a bundle.
 */
import process from "node:process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { checkExport } from "./export-gate.js";
import { RefusedError, buildChangePack, readContext } from "./pack.js";
import { verifyReceipt } from "./receipt.js";
import { proposeSeams } from "./seam.js";
/** Compact JSON — an agent rereads these every session, and tokens are product cost. */
function json(value) {
    return { content: [{ type: "text", text: JSON.stringify(value) }] };
}
function failure(e) {
    return {
        content: [{ type: "text", text: JSON.stringify({ error: e instanceof Error ? e.message : String(e) }) }],
        isError: true,
    };
}
const ROOT_DESC = "the directory holding enterprise/profile.json — the Enterprise Profile, its catalog and its " +
    "binding manifest. Default: PEN_ENTERPRISE_ROOT, then the server's working directory.";
const RootInput = z.object({ root: z.string().optional().describe(ROOT_DESC) });
const ExportInput = z.object({
    root: z.string().optional().describe(ROOT_DESC),
    file: z.string().optional().describe("return only this one generated file's contents, by path"),
});
const VerifyInput = z.object({
    receipt: z.string().describe("the receipt, as JSON text"),
    public_key_pem: z.string().optional().describe("the customer's ed25519 PUBLIC key, PEM"),
});
function rootOf(value) {
    return value ?? process.env.PEN_ENTERPRISE_ROOT ?? process.cwd();
}
async function main() {
    const server = new McpServer({ name: "pen-enterprise", version: "0.1.0" });
    /**
     * Registration shim: the SDK's generic inference over zod shapes is a
     * type-instantiation bomb. Hand the SDK the shapes for protocol-schema
     * generation and keep TypeScript out of it; handlers re-validate with the
     * explicit schemas above, so nothing is actually unchecked.
     */
    const register = server.registerTool.bind(server);
    register("check_export", {
        description: "May this design leave the canvas? Resolves every DECLARED binding against the enterprise's own " +
            "service catalog (a Backstage export, pinned by content hash) and returns {allowed, headline, " +
            "refusals[], counts, bindings[]}. Six verdicts: ON_MENU, SELF_CONTAINED, DEPRECATED (catalogued but " +
            "not sanctioned for this lane), OFF_MENU, UNDECLARED (nothing says what it consumes — UNKNOWN, not " +
            "safe), UNBOUND. Every refusal names the node, the entity ref, the owning group, the policy clause " +
            "and route_to_yes — the sanctioned capability they probably meant. Does NOT observe network traffic " +
            "and never claims to have found every call an app makes. Read-only.",
        inputSchema: RootInput.shape,
    }, async (args) => {
        try {
            const { root } = RootInput.parse(args);
            return json(await checkExport(rootOf(root)));
        }
        catch (e) {
            return failure(e);
        }
    });
    register("propose_seams", {
        description: "What API would have made this legal? For every refusal with no sanctioned route, derives the missing " +
            "seam: an OpenAPI stub in the enterprise's own house style, fixtures, a contract test, a draft " +
            "catalog-info.yaml with owner and lifecycle prefilled, and a PR body. Every schema property carries " +
            "x-pen-evidence naming the design layer that shows it; types are derived, constraints are NOT. " +
            "Refuses to propose where the catalog already names a replacement — rebind, do not build. One entity " +
            "per journey, not one per component. Returns file bytes plus a sha256 each; writes nothing.",
        inputSchema: RootInput.shape,
    }, async (args) => {
        try {
            const { root } = RootInput.parse(args);
            const dir = rootOf(root);
            const ctx = await readContext(dir);
            return json(await proposeSeams(dir, ctx.gate, ctx.catalog));
        }
        catch (e) {
            return failure(e);
        }
    });
    register("export_change_pack", {
        description: "Compile the design into a Change Pack for the runtime the Enterprise Profile names — for Liferay, a " +
            "client extension project plus the receipt as a served asset. Every request in the generated element " +
            "is fixed at compile time from an ON_MENU binding, with the path read out of the catalogued OpenAPI " +
            "document. A REFUSED export produces no bundle at all — no draft, no warning, no override — so the " +
            "bundle's existence means the gate passed. Returns bytes and a hash per file; writes nothing.",
        inputSchema: ExportInput.shape,
    }, async (args) => {
        try {
            const { root, file } = ExportInput.parse(args);
            const ctx = await readContext(rootOf(root));
            const pack = await buildChangePack(ctx);
            if (file) {
                const hit = pack.files.find((f) => f.path === file);
                if (!hit)
                    throw new Error(`no generated file at '${file}'. Bundle: ${pack.files.map((f) => f.path).join(", ")}`);
                return json(hit);
            }
            return json(pack);
        }
        catch (e) {
            if (e instanceof RefusedError) {
                return json({
                    allowed: false,
                    headline: e.gate.headline,
                    refusals: e.gate.refusals,
                    note: "No bundle was produced. Call propose_seams for what is missing, or check_export for the full refusal.",
                });
            }
            return failure(e);
        }
    });
    register("verify_receipt", {
        description: "Is this Change Pack receipt real? Checks format, the ed25519 signature against the CUSTOMER'S public " +
            "key, and freshness — with no network access of any kind. The private half never leaves the customer, " +
            "so a valid signature is not something we could have produced. Returns each check separately, because " +
            "a bad signature is tampering, an expired receipt is staleness, and they need different answers.",
        inputSchema: VerifyInput.shape,
    }, async (args) => {
        try {
            const { receipt, public_key_pem } = VerifyInput.parse(args);
            return json(await verifyReceipt(JSON.parse(receipt), { publicKeyPem: public_key_pem }));
        }
        catch (e) {
            return failure(e);
        }
    });
    register("explain_verdict", {
        description: "Why is this node the colour it is? The one-screen answer for a canvas badge or a Slack card: per " +
            "binding, the verdict, what it declared, the owning group, and the single sentence a human can act " +
            "on. Use this to paint a canvas; use check_export when you need the whole refusal with its policy " +
            "clauses and pinned catalog revision.",
        inputSchema: RootInput.shape,
    }, async (args) => {
        try {
            const { root } = RootInput.parse(args);
            const gate = await checkExport(rootOf(root));
            return json({
                allowed: gate.allowed,
                catalog_revision: gate.catalog.revision,
                nodes: gate.bindings.map((b) => ({
                    screen: b.screen,
                    node: b.node,
                    label: b.label,
                    verdict: b.verdict,
                    declared: b.capability,
                    owner: b.owner,
                    blocking: b.blocking,
                    say: gate.refusals.find((r) => r.node === b.node)?.route_to_yes ?? b.reason,
                })),
            });
        }
        catch (e) {
            return failure(e);
        }
    });
    await server.connect(new StdioServerTransport());
}
main().catch((e) => {
    console.error(`✖ ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
});
//# sourceMappingURL=mcp.js.map
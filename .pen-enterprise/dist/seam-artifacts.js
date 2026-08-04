/**
 * THE ARTIFACTS — the five files a missing seam becomes.
 *
 * Today a prototype fakes the data and IT finds out at integration. The whole point
 * of this file is that the fake data stops being a lie: the sample already on the
 * canvas becomes the fixture, the fields it shows become the schema, and a contract
 * test locks the two together so the prototype cannot quietly display a field
 * nobody promised.
 *
 *   apis/<id>.openapi.yaml            the contract, in the enterprise's own house style
 *   catalog/<id>.catalog-info.yaml    the draft entry, owner and lifecycle prefilled
 *   seams/<id>/fixtures/*.json        the canvas sample, unchanged
 *   seams/<id>/contract.test.mjs      node --test, no dependencies, no service needed
 *   seams/<id>/PULL_REQUEST.md        what a reviewer has to decide
 *
 * Everything reusable — the security scheme, the correlation header, the error
 * shape, the collection envelope, the server list, the tags — is copied out of a
 * spec the enterprise already maintains, so "it matches your house style" is a claim
 * they can check rather than a compliment we pay ourselves. Where the derivation
 * genuinely runs out, the file says `TODO` where a reviewer will trip over it.
 *
 * Strings, not files. Nothing here writes.
 */
import path from "node:path";
import { stringify } from "yaml";
import { sha256 } from "./fs.js";
/**
 * Used only when no spec could be read behind the catalog. It is deliberately plain:
 * inventing a richer "house style" out of nothing would produce a file that looks
 * authoritative and matches nobody's conventions.
 */
const FALLBACK = {
    source: "(no spec was readable behind the catalog — these are defaults, not your conventions)",
    openapi: "3.0.1",
    servers: [],
    license: null,
    contact_url_template: null,
    security_scheme_name: "customerSession",
    security_scheme: null,
    correlation_parameter: null,
    correlation_parameter_name: "CorrelationId",
    problem_schema: null,
    responses: {},
    error_responses: {},
    collection_schema: null,
    collection_items_key: "items",
    collection_suffix: "Page",
    spec_dir: "apis",
    spec_suffix: ".openapi.yaml",
    tags: [],
    journey_prefixes: {},
};
/**
 * `aliasDuplicateObjects` off, and it is not cosmetic. The four error responses are
 * the same object in every operation, so the serialiser would emit `&a1` once and
 * `*a1` after — valid YAML that no hand-written spec in this catalog contains. The
 * first thing an architect does with a generated file is look for the tell.
 */
const YAML = { aliasDuplicateObjects: false, lineWidth: 100 };
function titleCase(group) {
    const slug = group?.split(":").pop();
    if (!slug)
        return null;
    return slug.split(/[-_]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}
function namespaceOf(ref) {
    return ref.split(":")[1]?.split("/")[0] ?? "default";
}
function evidence(seam, op, field) {
    return `${seam.screen} · ${op.node} · ${field.layer}`;
}
function property(seam, op, field) {
    return {
        type: field.type,
        ...(field.format ? { format: field.format } : {}),
        ...(field.enum ? { enum: field.enum } : {}),
        ...(field.description ? { description: field.description } : {}),
        // Provenance, not decoration. "Why is this field here?" has to have an answer
        // that is not "the model thought so".
        "x-pen-evidence": evidence(seam, op, field),
    };
}
/* ── the contract ───────────────────────────────────────────────────────── */
function specPath(seam, house) {
    return path.join(house.spec_dir, `${seam.id}${house.spec_suffix}`);
}
function renderSpec(seam, ctx) {
    const house = ctx.house ?? FALLBACK;
    const scopes = {};
    for (const op of seam.operations) {
        scopes[op.scope] = `Read what ${op.path} returns for the ${seam.screen} journey.`;
    }
    // Their scheme, their flows, their URLs — our scopes.
    let scheme = null;
    if (house.security_scheme) {
        scheme = JSON.parse(JSON.stringify(house.security_scheme));
        const flows = scheme.flows;
        for (const flow of Object.values(flows ?? {}))
            flow.scopes = scopes;
    }
    const contactGroup = seam.owner.group?.split(":").pop() ?? null;
    const contact = contactGroup && house.contact_url_template
        ? { name: titleCase(seam.owner.group), url: house.contact_url_template.replace("{group}", contactGroup) }
        : contactGroup
            ? { name: titleCase(seam.owner.group) }
            : null;
    const schemas = {};
    const paths = {};
    for (const op of seam.operations) {
        const required = op.fields.filter((f) => f.required).map((f) => f.name);
        const properties = {};
        for (const field of op.fields)
            properties[field.name] = property(seam, op, field);
        schemas[op.schema_name] = op.fields.length
            ? {
                description: `Derived from what ${seam.screen} shows in ${op.node}. Every property carries ` +
                    "x-pen-evidence naming the layer it came from; none of them was invented.",
                type: "object",
                ...(required.length ? { required } : {}),
                properties,
            }
            : {
                description: op.unknown_shape ?? "No shape could be derived.",
                type: "object",
                properties: {},
                "x-pen-todo": "the design records nothing about this node — write this schema by hand",
            };
        let responseSchema = op.schema_name;
        if (op.collection) {
            responseSchema = `${op.schema_name}${house.collection_suffix}`;
            const envelope = house.collection_schema
                ? JSON.parse(JSON.stringify(house.collection_schema))
                : {
                    type: "object",
                    required: [house.collection_items_key, "totalCount"],
                    properties: {
                        [house.collection_items_key]: { type: "array", items: {} },
                        totalCount: { type: "integer", format: "int32", minimum: 0 },
                    },
                };
            const props = envelope.properties;
            const items = props[house.collection_items_key];
            if (items)
                items.items = { $ref: `#/components/schemas/${op.schema_name}` };
            schemas[responseSchema] = envelope;
        }
        paths[op.path] = {
            get: {
                operationId: op.operation_id,
                summary: `${op.label ?? op.node} on ${seam.screen}`,
                tags: [seam.journey],
                security: [{ [house.security_scheme_name]: [op.scope] }],
                parameters: house.correlation_parameter
                    ? [{ $ref: `#/components/parameters/${house.correlation_parameter_name}` }]
                    : [],
                responses: {
                    "200": {
                        description: `What ${op.node} displays.`,
                        content: { "application/json": { schema: { $ref: `#/components/schemas/${responseSchema}` } } },
                    },
                    ...house.error_responses,
                },
            },
        };
    }
    const doc = {
        openapi: house.openapi,
        info: {
            title: seam.title,
            version: "0.1.0",
            description: `DRAFT. Experience API for the ${seam.screen} journey of ${ctx.organization ?? "the enterprise"}, ` +
                `proposed because ${seam.operations.length} element(s) on that screen reach nothing the catalog ` +
                "sanctions. Derived from the design, not written by hand — see x-pen-evidence on every property.",
            ...(contact ? { contact } : {}),
            ...(house.license ? { license: house.license } : {}),
            "x-catalog-ref": seam.ref,
            "x-data-classification": "TODO",
            "x-channel-safe": true,
            "x-pen-derived-from": {
                screen: seam.screen,
                nodes: [...new Set(seam.operations.map((o) => o.node))],
                catalog_revision: ctx.catalog.revision,
            },
        },
        ...(house.servers.length ? { servers: house.servers } : {}),
        security: [{ [house.security_scheme_name]: Object.keys(scopes) }],
        paths,
        components: {
            ...(scheme ? { securitySchemes: { [house.security_scheme_name]: scheme } } : {}),
            ...(house.correlation_parameter
                ? { parameters: { [house.correlation_parameter_name]: house.correlation_parameter } }
                : {}),
            schemas: { ...schemas, ...(house.problem_schema ? { Problem: house.problem_schema } : {}) },
            ...(Object.keys(house.responses).length ? { responses: house.responses } : {}),
        },
    };
    return (`# DRAFT — generated by pen.dev from ${seam.screen}. Nothing here was written by hand.\n` +
        `#\n` +
        `# House style read from ${house.source}: the security scheme, the correlation header, the\n` +
        `# error shape, the collection envelope and the server list are that file's, copied.\n` +
        `#\n` +
        `# Every property carries x-pen-evidence naming the layer that shows it. Types and\n` +
        `# requiredness are derived; constraints are NOT — a reviewer still has to tighten them.\n` +
        `# Search for TODO before merging.\n` +
        stringify(doc, YAML));
}
/* ── the draft catalog entry ────────────────────────────────────────────── */
function renderCatalogDraft(seam, ctx, specRel) {
    const house = ctx.house ?? FALLBACK;
    const catalogDir = path.dirname(ctx.catalog.source ?? "catalog");
    let definition = path.relative(catalogDir, specRel);
    if (!definition.startsWith("."))
        definition = `./${definition}`;
    const doc = {
        apiVersion: "backstage.io/v1alpha1",
        kind: "API",
        metadata: {
            name: seam.id,
            namespace: namespaceOf(seam.ref),
            description: `DRAFT. ${seam.title} — the operations ${seam.screen} needs and the catalog does not have.`,
            ...(house.tags.length ? { tags: house.tags } : {}),
            annotations: {
                "pen.dev/derived-from": `${seam.screen} · ${[...new Set(seam.operations.map((o) => o.node))].join(", ")}`,
                "pen.dev/catalog-revision": ctx.catalog.revision ?? "unknown",
            },
        },
        spec: {
            type: "openapi",
            lifecycle: seam.lifecycle,
            owner: seam.owner.group ?? "group:TODO-unassigned",
            definition: { $text: definition },
        },
    };
    return (`# DRAFT catalog entry — generated by pen.dev. Do not merge this yet.\n` +
        `#\n` +
        `# lifecycle is ${seam.lifecycle} because enterprise/profile.json allows only that in this lane.\n` +
        `# It is a claim that the operations below RESPOND. Merge it when they do, not before —\n` +
        `# the moment this lands, the export gate stops refusing the nodes that reach it.\n` +
        (seam.name_basis === "declared-by-binding"
            ? `#\n# Named ${seam.id} because that is what ${seam.screen} already declared it was reaching for,\n` +
                `# so this entry resolves the existing binding with no second change. Rename it freely —\n` +
                `# if you do, the binding has to follow.\n`
            : "") +
        (seam.owner.confidence === "stated"
            ? ""
            : `#\n# OWNER IS ${seam.owner.confidence.toUpperCase()} — check it before merging.\n`) +
        stringify(doc, YAML));
}
/* ── the fixture and the test that locks it to the contract ─────────────── */
function fixtureBody(op, house) {
    if (!op.collection)
        return op.sample;
    const items = Array.isArray(op.sample) ? op.sample : [];
    return { [house.collection_items_key]: items, totalCount: items.length };
}
function assertions(op, field, indent) {
    const at = `\${at}.${field.name}`;
    const value = `value.${field.name}`;
    const lines = [];
    const typeCheck = field.type === "integer"
        ? `assert.ok(Number.isInteger(${value}), \`${at} must be an integer\`);`
        : `assert.equal(typeof ${value}, '${field.type}', \`${at} must be a ${field.type}\`);`;
    lines.push(typeCheck);
    if (field.enum) {
        lines.push(`assert.ok(${JSON.stringify(field.enum)}.includes(${value}), \`${at} must be one of ${field.enum.join(", ")}\`);`);
    }
    if (field.format === "date-time" || field.format === "date") {
        lines.push(`assert.ok(!Number.isNaN(Date.parse(${value})), \`${at} must be a ${field.format}\`);`);
    }
    if (field.format === "uri") {
        lines.push(`assert.doesNotThrow(() => new URL(${value}), \`${at} must be a URI\`);`);
    }
    if (field.required)
        return lines.map((l) => indent + l);
    return [
        `${indent}if (${value} !== undefined) {`,
        ...lines.map((l) => `${indent}\t${l}`),
        `${indent}}`,
    ];
}
function renderContractTest(seam, ctx) {
    const house = ctx.house ?? FALLBACK;
    const checkers = [];
    const declared = [];
    const tests = [];
    const seen = new Set();
    for (const op of seam.operations) {
        if (!seen.has(op.schema_name)) {
            seen.add(op.schema_name);
            declared.push(`\t${op.schema_name}: new Set(${JSON.stringify(op.fields.map((f) => f.name))}),`);
            const body = [
                `\tassert.equal(typeof value, 'object', \`\${at} must be an object\`);`,
                `\tassert.notEqual(value, null, \`\${at} must not be null\`);`,
                ``,
                `\t// The assertion that makes a prototype honest: it may not display a field the`,
                `\t// contract does not promise. Extra keys here are the integration surprise, early.`,
                `\tfor (const key of Object.keys(value)) {`,
                `\t\tassert.ok(`,
                `\t\t\tDECLARED.${op.schema_name}.has(key),`,
                `\t\t\t\`\${at} carries "\${key}" — ${seam.ref} does not declare it\``,
                `\t\t);`,
                `\t}`,
            ];
            for (const field of op.fields) {
                body.push(``, ...assertions(op, field, "\t"));
            }
            checkers.push(`function check${op.schema_name}(value, at) {\n${body.join("\n")}\n}`);
        }
        const title = `${op.operation_id} — ${op.method.toUpperCase()} ${op.path}`;
        tests.push(op.collection
            ? [
                `test('${title}', () => {`,
                `\tconst body = load('${op.operation_id}');`,
                ``,
                `\tassert.ok(Array.isArray(body.${house.collection_items_key}), 'response must carry ${house.collection_items_key}[]');`,
                `\tassert.ok(Number.isInteger(body.totalCount), 'response must carry an integer totalCount');`,
                `\tassert.ok(`,
                `\t\tbody.totalCount >= body.${house.collection_items_key}.length,`,
                `\t\t'totalCount cannot be smaller than the page it came with'`,
                `\t);`,
                ``,
                `\tbody.${house.collection_items_key}.forEach((item, i) =>`,
                `\t\tcheck${op.schema_name}(item, \`${house.collection_items_key}[\${i}]\`)`,
                `\t);`,
                `});`,
            ].join("\n")
            : [
                `test('${title}', () => {`,
                `\tcheck${op.schema_name}(load('${op.operation_id}'), '${op.schema_name}');`,
                `});`,
            ].join("\n"));
    }
    return `/**
 * Contract test for ${seam.ref} — generated by pen.dev from ${seam.screen}.
 *
 * It checks the FIXTURE against the CONTRACT, so it runs before the service exists:
 * the prototype's data and the API IT approved cannot drift apart without this going
 * red. That is the whole trick — today the prototype fakes the data and nobody finds
 * out until integration.
 *
 * No dependencies, no network, no running service.
 *
 *   node --test seams/${seam.id}/contract.test.mjs
 *
 * The file path, not the directory: \`node --test <dir>\` loads the path as a module
 * on current Node and fails with MODULE_NOT_FOUND.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const load = (name) =>
\tJSON.parse(readFileSync(new URL(\`./fixtures/\${name}.json\`, import.meta.url), 'utf8'));

/** Exactly the properties ${seam.ref} declares. Anything else is undeclared data. */
const DECLARED = {
${declared.join("\n")}
};

${checkers.join("\n\n")}

${tests.join("\n\n")}
`;
}
/* ── what a reviewer has to decide ──────────────────────────────────────── */
function renderPullRequest(seam, ctx, files) {
    const house = ctx.house ?? FALLBACK;
    const nodes = [...new Set(seam.operations.map((o) => o.node))];
    const rows = seam.operations.map((op) => {
        const fields = op.fields.length;
        return `| \`${op.method.toUpperCase()} ${op.path}\` | ${op.label ?? op.node} | ${op.collection ? `${op.schema_name}[]` : op.schema_name} | ${fields} field(s), every one traced to a layer in \`${op.node}\` |`;
    });
    return `# Add \`${seam.ref}\` — ${seam.operations.length} operation(s) ${seam.screen} needs and the catalog does not have

The export of \`${seam.screen}\` was refused: ${nodes.length} element(s) reach a capability nothing
in \`${ctx.catalog.source ?? "the catalog"}\` sanctions. This is the seam, declared instead of faked.

**One API for the whole journey, not one per tile.** ${seam.operations.length} operations, one entity.

## What was derived, and from what

| Operation | Serves | Returns | Evidence |
|---|---|---|---|
${rows.join("\n")}

The response schemas come from the fields \`${seam.screen}\` actually displays — every property in
the spec carries \`x-pen-evidence\` naming the layer it came from. The fixtures are the sample data
already on the canvas, unchanged. Nothing was invented, and where the derivation ran out the files
say \`TODO\`.

House style — the security scheme, the correlation header, the error shape, the collection
envelope, the servers and the tags — was copied from \`${house.source}\`, so this reads like the
specs you already maintain.

## Decide before merging

${seam.decisions.map((d) => `- [ ] ${d}`).join("\n")}
${seam.binding_changes.length
        ? `\n## Binding changes this needs\n\nA catalog entry alone will not clear these — the design has to point at it:\n\n${seam.binding_changes
            .map((c) => `- \`${c.node}\`: ${c.from ? `\`${c.from}\`` : "*(declares nothing)*"} → \`${c.to}\``)
            .join("\n")}\n`
        : ""}
## Files

${files.map((f) => `- \`${f.path}\` — ${f.what}`).join("\n")}

## How to check it without trusting us

\`\`\`bash
npx @redocly/cli lint ${files[0]?.path ?? ""}
node --test seams/${seam.id}/contract.test.mjs
\`\`\`

The catalog entry pins the revision it was derived against:
\`${ctx.catalog.revision ?? "unknown"}\`. Once it lands, the catalog is at a **new** revision and the
refused nodes go green — both revisions belong in the Change Pack receipt, which is what makes
"this was approved against those rules" checkable a year from now.
`;
}
/* ── assembly ───────────────────────────────────────────────────────────── */
export function renderSeamFiles(seam, ctx) {
    const house = ctx.house ?? FALLBACK;
    // Every file carries its own digest: a receipt pins exactly these bytes, and the
    // caller who writes them can prove they wrote what was proposed.
    const file = (p, contents, what) => ({
        path: p,
        contents,
        sha256: sha256(contents),
        what,
    });
    const specRel = specPath(seam, house);
    const files = [
        file(specRel, renderSpec(seam, ctx), "the contract, in your house style"),
        file(path.join(path.dirname(ctx.catalog.source ?? "catalog"), `${seam.id}.catalog-info.yaml`), renderCatalogDraft(seam, ctx, specRel), "the draft catalog entry — owner and lifecycle prefilled, not merged"),
    ];
    for (const op of seam.operations) {
        files.push(file(path.join("seams", seam.id, "fixtures", `${op.operation_id}.json`), JSON.stringify(fixtureBody(op, house), null, 2) + "\n", `the sample already on the canvas for ${op.node}`));
    }
    files.push(file(path.join("seams", seam.id, "contract.test.mjs"), renderContractTest(seam, ctx), "locks the fixture to the contract — runs before the service exists"));
    files.push(file(path.join("seams", seam.id, "PULL_REQUEST.md"), renderPullRequest(seam, ctx, files), "what a reviewer has to decide"));
    return files;
}
//# sourceMappingURL=seam-artifacts.js.map
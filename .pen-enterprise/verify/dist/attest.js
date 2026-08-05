export const SLSA_PREDICATE_TYPE = "https://slsa.dev/provenance/v1";
export const BUILD_TYPE = "https://pen.dev/buildtypes/change-pack/v1";
export const BUILDER_ID = "https://pen.dev/pen-enterprise";
/**
 * in-toto's digest sets are bare lowercase hex keyed by algorithm, not our
 * `sha256:`-prefixed form. A ResourceDescriptor must carry at least one of
 * `uri`, `digest` or `content`, so an artifact we could not hash is dropped
 * rather than emitted as a name with nothing behind it.
 */
function descriptor(a) {
    return a.sha256 ? { name: a.path, digest: { sha256: a.sha256.replace(/^sha256:/, "") } } : null;
}
const described = (list) => list.map(descriptor).filter((d) => d !== null);
export function provenanceFor(receipt, invocationId) {
    return {
        buildDefinition: {
            buildType: BUILD_TYPE,
            // What the caller asked for, then what the resolver pinned against. The
            // second pair is the one a reviewer argues with.
            externalParameters: {
                catalog: receipt.catalog.source,
                bindingSource: receipt.binding_source,
                runtimeTarget: receipt.runtime_target,
            },
            internalParameters: {
                catalogRevision: receipt.catalog.revision,
                policyHash: receipt.policy_hash,
            },
            resolvedDependencies: described(receipt.artifacts),
        },
        runDetails: {
            builder: { id: BUILDER_ID },
            metadata: { ...(invocationId ? { invocationId } : {}), startedOn: receipt.issued_at },
            byproducts: described(receipt.outputs),
        },
    };
}
//# sourceMappingURL=attest.js.map
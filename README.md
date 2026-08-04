# Example Bank

A synthetic bank's frontend repository, with a **required check that blocks a merge when an element
on a screen reaches a service nobody sanctioned.**

Nothing here is a real institution's data. That is deliberate rather than a limitation: a governance
demo built on a real bank's artifacts could never be shown to anyone, so this one was built from
scratch to be shared, forked and argued with.

## What is here

```
catalog/catalog-info.yaml     the service catalog — a Backstage export, unmodified in shape
apis/*.openapi.yaml           the OpenAPI documents behind the catalogued APIs
components/library.json       the approved component library: versions, props, states, tokens
design/dashboard.json         the screen, and the fields it shows where nothing else defines them
enterprise/profile.json       what this organisation approves, and what blocks a release
enterprise/bindings.json      what each element on the screen stands on
liferay-workspace/            the runtime a compiled change package lands in
.github/CODEOWNERS            who can approve what — the routing the check reuses
```

## The check

Every element on `/dashboard` is resolved against **this repository's own catalog**, under **this
repository's own policy**, and each one has to land on a sanctioned API *operation* — not merely on
a service that exists somewhere.

Six verdicts, and the interesting ones are neither the pass nor the fail:

| | |
|---|---|
| `ON_MENU` | declared, in the catalog, lifecycle allowed in this lane |
| `SELF_CONTAINED` | declared to reach nothing — a pure UI or formula element |
| `DEPRECATED` | in the catalog, and not sanctioned for *this* lane |
| `OFF_MENU` | declared, and not in the catalog |
| `UNDECLARED` | has a component, nothing says what it consumes — **unknown, not safe** |
| `UNBOUND` | no component, no capability — exploration, not a contract |

`UNDECLARED` is where a runtime scanner would quietly claim to know. This resolves **declared**
bindings and does not observe network traffic; it never claims to have found every call an
application makes. `SELF_CONTAINED` exists so `UNDECLARED` keeps meaning something.

When the check refuses it names the rule it applied, quotes the catalog revision it applied it at,
and routes the exception through `.github/CODEOWNERS` — `group:cards-platform` in the catalog finds
`@examplebank/cards-platform` there. When no handle matches it says *no CODEOWNERS entry* rather
than inventing a plausible one, because a refusal routed to the wrong team is worse than one routed
nowhere.

> The `@examplebank/*` teams do not exist — this is a synthetic organisation, so GitHub flags them
> as unknown owners. The check parses the file itself and never calls GitHub's API, so the routing
> in the report is real even where the teams are not.

## Run it yourself

No account, no signup, nothing to install beyond Node 22.

```bash
git clone https://github.com/radosukala/examplebank && cd examplebank
npm install --prefix .pen-enterprise --omit=dev

node .pen-enterprise/dist/ci.js --root .            # the gate — exit 0 on main, 1 on the PR branch
node .pen-enterprise/dist/ci.js --root . --summary  # the report a reviewer reads
node .pen-enterprise/dist/ci.js --root . --evidence # the manifest, as JSON
```

The tool **writes nothing** — it cannot create, modify or delete a file. Every artifact the workflow
produces comes from a redirect in [the workflow](.github/workflows/pen-enterprise.yml), where you can
read it.

## What ships carries a receipt

A change that passes compiles into a Liferay client extension with a **Change Pack receipt** beside
it. Pull that one file out of the bundle and it verifies on a laptop with no account and no network:

```bash
node .pen-enterprise/dist/cli.js verify receipt.json --key your-public-key.pem
```

The signing key is the customer's; nobody else ever holds the private half. Verification is a pure
function of the receipt bytes plus a public key — no vendor endpoint, no telemetry, and the same
answer six months from now on a machine that has never heard of this repository.

## Vendored, for now

`.pen-enterprise/` is a compiled snapshot of the resolver, checked in because the package is not
published yet. Once it is, the workflow's three invocations collapse to one `npx` line against a
pinned tag.

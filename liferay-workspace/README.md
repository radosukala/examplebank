# Example Bank — Liferay workspace

The runtime target named in [`../enterprise/profile.json`](../enterprise/profile.json)
(`liferay-7.4-custom-element`), as a workspace the bank would actually have.

It holds one client extension, `examplebank-repayment-estimate`, written as if by the bank's own
channel team. **It is not our output.** It is here so that what we generate in build order step 4
has a house style to match, and so "matches their style" is a claim someone can check.

```
settings.gradle                                        applies the workspace plugin
gradle.properties                                      one property: the product version
docker-compose.yaml                                    optional, for anyone who wants to see it deploy
liferay/deploy/                                        bind-mounted to /mnt/liferay/deploy
client-extensions/
  examplebank-repayment-estimate/
    client-extension.yaml                              assemble + one customElement
    assets/repayment-estimate.js                       the custom element
    assets/repayment-estimate.css                      loaded into the document head
```

Not committed, because they are generated: `gradlew`, `gradlew.bat`, `gradle/wrapper/` (run
`gradle wrapper`, or create the workspace with `blade init`), and `build/` and `dist/`.

## Building and deploying

```bash
../../gradlew clean deploy -Ddeploy.docker.container.id=examplebank-liferay
```

`assembleClientExtension` runs as part of `build`/`deploy`, stages files into
`build/liferay-client-extension-build/`, and packages them into a **LUFFA** — a Liferay Universal
File Format Archive, `dist/examplebank-repayment-estimate.zip`. Once deployed the widget appears
under *Widgets → Client Extensions → Repayment estimate*, and its static assets are served from
`/o/examplebank-repayment-estimate/`.

## What was checked, and where

Everything in this folder was verified against Liferay's own documentation or their shipped code
before it was written. Sources are separated on purpose: prose can lag, shipped files cannot.

| Claim | Source |
|---|---|
| Client extensions live in `[workspace-root]/client-extensions/<project>/`, with `client-extension.yaml` at the project root | [Working with Client Extensions](https://learn.liferay.com/w/dxp/development/client-extensions/working-with-client-extensions) |
| `assemble` is a **top-level** key — a sibling of the extension id, not a child — taking `from` / `into` (also `include`, `fromTask`) | Same page, and read directly from [`liferay-sample-custom-element-1/client-extension.yaml`](https://github.com/liferay/liferay-portal/blob/master/workspaces/liferay-sample-workspace/client-extensions/liferay-sample-custom-element-1/client-extension.yaml) and `-6` |
| A build produces a LUFFA zip in `dist/`, staged through `build/liferay-client-extension-build/` | [Working with Client Extensions](https://learn.liferay.com/w/dxp/development/client-extensions/working-with-client-extensions) |
| `customElement` keys and defaults: `htmlElementName` and `urls` required; `instanceable` false; `portletCategoryName` defaults to `category.client-extensions`; `cssURLs` go in the HTML head; `useESM` loads the script as `type="module"` | [Custom Element YAML Configuration Reference](https://learn.liferay.com/w/dxp/development/integrating-external-applications/creating-a-basic-custom-element/custom-element-yaml-configuration-reference) |
| The JS contract: a class extending `HTMLElement`, work in `connectedCallback`, `customElements.define` guarded by `customElements.get` | [Creating a Basic Custom Element](https://learn.liferay.com/w/dxp/development/integrating-external-applications/creating-a-basic-custom-element), and [`liferay-sample-custom-element-6/src/main.tsx`](https://github.com/liferay/liferay-portal/blob/master/workspaces/liferay-sample-workspace/client-extensions/liferay-sample-custom-element-6/src/main.tsx) |
| Static assets are served at `/o/<client-extension-id>/<file>` | Read from `liferay-sample-custom-element-6/vite.config.ts`, whose `renderBuiltUrl` returns `/o/liferay-sample-custom-element-6/${filename}` |
| Workspace plugin applied from `settings.gradle` via `com.liferay:com.liferay.gradle.plugins.workspace:17.1.10` | Read from [`liferay-sample-workspace/settings.gradle`](https://github.com/liferay/liferay-portal/blob/master/workspaces/liferay-sample-workspace/settings.gradle) |
| `liferay.workspace.product` takes a `releaseKey` from `releases.liferay.com/releases.json` and sets `app.server.tomcat.version`, `liferay.workspace.bundle.url`, `liferay.workspace.docker.image.liferay` and `liferay.workspace.target.platform.version` | [Liferay Workspace Configuration Reference](https://learn.liferay.com/w/dxp/development/tooling/liferay-workspace/liferay-workspace-configuration-reference) |
| `portal-7.4-ga132` is a real release key — newest 7.4 GA, tagged `recommended`, target platform `7.4.3.132` | Fetched `https://releases.liferay.com/releases.json` and matched on `releaseKey` |
| Public image `liferay/portal:7.4.3.132-ga132`, port 8080, `test@liferay.com` / `test` | [Using Liferay Docker Images](https://learn.liferay.com/w/dxp/self-hosted-installation-and-upgrades/using-liferay-docker-images) |
| The entry point symlinks `/mnt/liferay/deploy` to `[Liferay Home]/deploy`, and artifacts placed there are auto-deployed | [Installing Apps and Other Artifacts to Containers](https://learn.liferay.com/w/dxp/self-hosted-installation-and-upgrades/using-liferay-docker-images/installing-apps-and-other-artifacts-to-containers) |

### Deliberately not used

- **`properties:`** — the reference table documents it as a `String[]`; the shipped
  `liferay-sample-custom-element-6` writes it as a map (`foo: bar`). Two sources, two shapes, and
  this extension does not need it. The element reads the same values from HTML attributes instead,
  so turning `properties` on later changes nothing in the script.
- **`hashify`** in `assemble` — used by `liferay-sample-custom-element-1`, which then has to glob
  its `urls` as `index.*.js`. Real, and worth revisiting when cache-busting matters; fixed filenames
  read better in a diff today.
- **`friendlyURLMapping`** — optional, and only meaningful for an element that owns routes. A
  calculator does not.
- **A bundler.** React via Vite is a first-class option and Liferay ships samples for it, but this
  extension imports nothing, so a build step would add `node_modules` and a lockfile to a fixture
  whose whole value is that a stranger can read it. The custom element contract is identical either
  way, which is the point worth demonstrating.

### Two traps, recorded so nobody re-walks into them

- `https://releases.liferay.com/tools/workspace/.product_info.json` — and its `releases-cdn` twin —
  is **stale**. It stops at `portal-7.4-ga112` and does not contain `dxp-2024.q2.8`, a key Liferay's
  own sample workspace uses. `releases.json` is the list to check against; `blade init -l` prints it.
- `portal-7.4-*` rather than a `dxp-*` product: the DXP image needs a licence after 30 days, and
  Example Bank has to be runnable by a prospect who has signed nothing. The client extension
  contract is the same on DXP.

### Not verified

This workspace has **not** been booted against a live Liferay from this repo. The contract above is
verified against documentation and shipped code; deployment is not, and `docker compose up` is
offered for whoever wants to close that gap. Per the delivery plan
§6, no recorded demo may depend on a portal booting on camera.

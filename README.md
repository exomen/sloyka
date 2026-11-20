# Sloyka

**3D solution-architecture diagrams, layer by layer.**

Sloyka (слойка, a layered pastry; from слой, "layer") turns a YAML model of a system into an interactive
3D diagram. Each feature adds a dimension that a flat box-and-line diagram lacks:

- **Nesting.** Boundaries, systems and containers are translucent boxes, and everything they contain sits inside them.
- **3D wires.** Connections are animated tubes, coloured by type (sync, async, replication, deploy, webhook and others).
- **Layers.** Tag elements with layers such as edge, app, data or security, then focus or hide a whole layer at once.
- **Flows.** Sequences over time, like "a user places an order". A step-by-step player highlights each hop and shows its note.
- **Focus and isolate.** Narrow the view to one element, wire or flow, or isolate that subset into a compact diagram of its own.
- **Docs in context.** Attach documentation links to elements, connections, flows, steps, layers or the whole model.

The whole app builds into **one self-contained HTML file**. There's no server and no runtime network calls,
so it opens straight from disk.

## Quick start

```bash
npm install
npm run build        # bundles src/ into sloyka.html
open sloyka.html     # or double-click it
```

Edit the YAML in the **Model** tab and the scene updates as you type. Your diagram is saved in the browser's
`localStorage`. **Open…** loads a YAML file, **Copy YAML** copies the current model and **PNG** saves a snapshot.

## Examples

Pick one from **Examples…** in the toolbar:

| Example | What it shows |
|---|---|
| **AWS three-tier web app** | CloudFront, WAF, ALB, ECS on Fargate, Aurora and ElastiCache across two Availability Zones, plus a CodePipeline release. Flows: page load, write path, release, AZ failover. |
| **AWS serverless orders** | API Gateway with a Cognito JWT authorizer, Lambda, DynamoDB Streams, EventBridge Pipes, SQS with a DLQ, Step Functions and SES. Flows: sign-in, place order, payment webhook, poison message. |
| **AWS data lake** | Kinesis and Firehose, DMS change data capture over VPN, S3 raw, curated and analytics zones, Glue crawler and ETL, Lake Formation, Athena, Redshift and QuickSight. Flows: ingest, CDC, nightly ETL, analyst query. |
| **Simple AWS app** | A small starting point to edit. |

## Controls

| Action | How |
|---|---|
| Orbit / pan / zoom | Drag / right-drag or two fingers / scroll |
| Select | Click an element or a wire. Shift-click adds it to the current view. |
| Fly in / focus | Double-click, or `F` |
| Select parent | `P` |
| Move elements | `G` (positions are written back into the YAML) |
| Label size | `+` / `−` (only focused labels grow) |
| Side panel | `\` |
| Step through a flow | `←` / `→`; `Esc` stops |
| Clear selection | `Esc` |

The **Layers**, **Flows** and **Links** tabs show or hide layers, flows and connections, individually or by type.
The **Key** button (top right) shows the colour key.

## Model

```yaml
version: 1
docs: [url]                                   # optional, diagram-level
layers:
  - { id, name, color, docs }
elements:                                     # nest with children
  - { id, name, type, layer, description, pos: [x, y, z], color, docs, children: [...] }
connections:
  - { from, to, type, label, description, docs }
flows:
  - { id, name, description, color, docs, steps: [{ from, to, label, note, type, docs }] }
```

- **Element types:** `boundary`, `system`, `container`, `component`, `datastore`, `queue`, `actor`.
  A boundary can contain anything. A system can contain systems, containers, components, datastores and queues.
  A container can contain components, datastores and queues. Breaking these rules gives a warning, not an error.
- **Connection types:** `sync`, `async`, `replication`, `deploy`, `depends`, `webhook`, `api`, `network`,
  `auth`, `data`, `lifecycle`. A flow step can also use `flow` for a hop that isn't a modelled connection.
- **Layers** are inherited: a child without a `layer` uses its parent's.
- **Positions** are optional. Without `pos`, children are laid out on a grid inside their parent.
  `pos` is relative to the parent.
- **Docs** can be a URL, `{ title, url }`, or a list of either. Without a title, the link text comes from the URL.

## Project layout

```
src/main.js            the app: model parsing and validation, scene, visuals, picking, flows, views, panels
src/shell.html         markup and CSS; the bundle is injected at /*BUNDLE*/
src/aws-*.js           built-in AWS example models
src/sample.js          the simple example
build.mjs              esbuild bundle -> sloyka.html
```

Built with [three.js](https://threejs.org/) and [js-yaml](https://github.com/nodeca/js-yaml), bundled with [esbuild](https://esbuild.github.io/).

## Versioning

Every user-visible change bumps `APP_VERSION` in `src/main.js`, adds a row to [CHANGELOG.md](CHANGELOG.md)
and is tagged `vX.Y`.

## License

[MIT](LICENSE)

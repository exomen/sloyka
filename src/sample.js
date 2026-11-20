export const SAMPLE = `# Sloyka model (v1). Edit me: the scene updates live.
# Element types: boundary, system, container, component, datastore, queue, actor
# Connection types: sync, async, replication, deploy, depends
version: 1

layers:
  - { id: users,    name: Users & channels, color: "#f59e0b" }
  - { id: services, name: Services,         color: "#3b82f6" }
  - { id: data,     name: Data,             color: "#10b981" }
  - { id: infra,    name: Infrastructure,   color: "#8b5cf6" }

elements:
  - id: customer
    name: Customer
    type: actor
    layer: users
    pos: [0, 7, -12]

  - id: partner
    name: Partner API client
    type: actor
    layer: users
    pos: [9, 7, -12]

  - id: aws
    name: AWS ap-southeast-2
    type: boundary
    layer: infra
    children:
      - id: edge
        name: Edge
        type: system
        layer: infra
        pos: [0, 6, -4]
        children:
          - { id: cdn, name: CloudFront CDN, type: component, layer: services }
          - { id: waf, name: WAF, type: component, layer: infra }

      - id: vpc
        name: Production VPC
        type: boundary
        layer: infra
        pos: [0, 0, 4]
        children:
          - id: eks
            name: EKS cluster
            type: system
            layer: infra
            pos: [-4, 0, 0]
            children:
              - id: web
                name: Web app
                type: container
                layer: services
                children:
                  - { id: ui,  name: UI server, type: component, layer: services }
                  - { id: bff, name: BFF,       type: component, layer: services }
              - id: orders
                name: Orders service
                type: container
                layer: services
                children:
                  - { id: orders-api, name: Orders API, type: component, layer: services }
                  - { id: orders-worker, name: Worker, type: component, layer: services }
          - id: data-tier
            name: Data tier
            type: system
            layer: data
            pos: [7, -3, 0]
            children:
              - { id: pg,    name: Postgres,   type: datastore, layer: data }
              - { id: redis, name: Redis,      type: datastore, layer: data }
              - { id: queue, name: Order events, type: queue,   layer: data }

  - id: payments
    name: Stripe
    type: system
    layer: services
    pos: [-14, 0, 4]

connections:
  - { from: customer, to: cdn, type: sync, label: HTTPS }
  - { from: partner, to: waf, type: sync, label: REST }
  - { from: cdn, to: ui, type: sync }
  - { from: waf, to: orders-api, type: sync }
  - { from: ui, to: bff, type: sync }
  - { from: bff, to: orders-api, type: sync, label: gRPC }
  - { from: bff, to: redis, type: sync, label: cache }
  - { from: orders-api, to: pg, type: sync, label: SQL }
  - { from: orders-api, to: queue, type: async, label: OrderPlaced }
  - { from: queue, to: orders-worker, type: async }
  - { from: orders-worker, to: payments, type: sync, label: charge }
  - { from: pg, to: redis, type: replication }

flows:
  - id: place-order
    name: Place an order
    steps:
      - { from: customer, to: cdn, note: Customer opens the shop. }
      - { from: cdn, to: ui }
      - { from: ui, to: bff }
      - { from: bff, to: orders-api, note: BFF calls the Orders API over gRPC. }
      - { from: orders-api, to: pg, note: The order is written to Postgres. }
      - { from: orders-api, to: queue, note: An OrderPlaced event is published. }
      - { from: queue, to: orders-worker }
      - { from: orders-worker, to: payments, note: The worker charges the card. }
`;

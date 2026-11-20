export const AWS_SERVERLESS = `# AWS serverless order processing: API Gateway + Lambda + DynamoDB, with EventBridge, SQS and Step Functions.
# Tip: Flows tab -> play "Payment authorised" to follow one order from a webhook to the confirmation email.
version: 1
docs:
  - { title: Serverless Applications Lens, url: "https://docs.aws.amazon.com/wellarchitected/latest/serverless-applications-lens/welcome.html" }

layers:
  - { id: clients,  name: Clients & partners,   color: "#f59e0b" }
  - { id: edge,     name: Front end,            color: "#06b6d4", docs: { title: Amazon CloudFront, url: "https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Introduction.html" } }
  - { id: identity, name: Identity,             color: "#eab308", docs: { title: Amazon Cognito, url: "https://docs.aws.amazon.com/cognito/latest/developerguide/what-is-amazon-cognito.html" } }
  - { id: api,      name: API & functions,      color: "#3b82f6", docs: [{ title: Amazon API Gateway, url: "https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html" }, { title: AWS Lambda, url: "https://docs.aws.amazon.com/lambda/latest/dg/welcome.html" }] }
  - { id: events,   name: Events & workflows,   color: "#ec4899", docs: { title: Amazon EventBridge, url: "https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html" } }
  - { id: data,     name: Data,                 color: "#10b981", docs: { title: Amazon DynamoDB, url: "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html" } }
  - { id: ops,      name: Observability,        color: "#94a3b8", docs: { title: Amazon CloudWatch, url: "https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html" } }

elements:
  - id: shopper
    name: Shopper (web / mobile)
    type: actor
    layer: clients
    description: Signs in, places orders and gets a confirmation email.
    pos: [-30, 5, -6]

  - id: psp
    name: Payment provider
    type: system
    layer: clients
    description: "Third-party payments. Takes the card details itself, then calls our webhook when a payment is authorised."
    pos: [-30, 0, 14]

  - id: aws
    name: "AWS account: shop-prod"
    type: boundary
    layer: api
    description: Fully serverless. There are no servers or VPC to manage, and every part scales to zero.
    pos: [0, 0, 0]
    children:
      - id: frontend
        name: Web front end
        type: system
        layer: edge
        children:
          - { id: cloudfront, name: CloudFront, type: component, description: "Serves the single-page app over HTTPS.", docs: { title: Amazon CloudFront, url: "https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Introduction.html" } }
          - { id: site-bucket, name: S3 site bucket, type: datastore, description: "The built SPA (HTML, JS, CSS). Private, read through Origin Access Control.", docs: { title: Amazon S3, url: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html" } }

      - id: cognito
        name: Cognito user pool
        type: system
        layer: identity
        description: Sign-up, sign-in and tokens for shoppers.
        docs: { title: Cognito user pools, url: "https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools.html" }
        children:
          - { id: login, name: Managed login, type: component, description: "Hosted sign-in pages. Returns ID and access tokens (JWTs) to the app with OAuth 2.0." }
          - { id: users, name: User directory, type: datastore, description: "Shopper profiles and credentials, with MFA." }

      - id: http-api
        name: HTTP API (API Gateway)
        type: system
        layer: api
        description: "The single public API. /orders needs a shopper's JWT, and /webhooks/payments is checked with the provider's signature instead."
        docs: { title: Amazon API Gateway, url: "https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html" }
        children:
          - { id: routes, name: Routes, type: component, description: "POST /orders, GET /orders/{id}, POST /webhooks/payments" }
          - { id: jwt-auth, name: JWT authorizer, type: component, layer: identity, description: "Checks the Cognito access token on /orders routes before Lambda is called.", docs: { title: JWT authorizers, url: "https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html" } }

      - id: fns
        name: Lambda functions
        type: container
        layer: api
        description: One small function per job. Each has its own IAM role with only the permissions it needs.
        docs: { title: AWS Lambda, url: "https://docs.aws.amazon.com/lambda/latest/dg/welcome.html" }
        children:
          - { id: fn-create, name: createOrder, type: component, description: "Validates the basket and writes a PENDING order." }
          - { id: fn-get, name: getOrder, type: component, description: "Reads one order for the signed-in shopper." }
          - { id: fn-webhook, name: paymentWebhook, type: component, description: "Verifies the provider's signature and marks the order AUTHORISED." }
          - { id: fn-inventory, name: updateInventory, type: component, description: "Reads batches from SQS and reserves stock.", docs: { title: Lambda with SQS, url: "https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html" } }

      - id: tables
        name: DynamoDB
        type: system
        layer: data
        docs: { title: Amazon DynamoDB, url: "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html" }
        children:
          - { id: orders-table, name: Orders table, type: datastore, description: "On-demand capacity. Partition key: orderId." }
          - { id: inventory-table, name: Inventory table, type: datastore, description: "Stock per SKU, updated with conditional writes so stock never goes negative." }
          - { id: ddb-stream, name: Orders stream, type: queue, layer: events, description: "DynamoDB Streams: an ordered change record for every write to the Orders table.", docs: { title: DynamoDB Streams, url: "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.html" } }

      - id: eventing
        name: Event routing
        type: system
        layer: events
        children:
          - { id: pipe, name: EventBridge Pipe, type: component, description: "Reads the stream, filters to status changes and turns them into OrderCreated and OrderAuthorised events.", docs: { title: EventBridge Pipes, url: "https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-pipes.html" } }
          - { id: bus, name: "Event bus: orders", type: queue, description: "Rules route each event type to its consumers. New consumers can subscribe without touching the producers.", docs: { title: Amazon EventBridge, url: "https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html" } }
          - { id: inv-queue, name: "SQS: inventory-updates", type: queue, description: "Buffers OrderCreated events so stock updates can be retried and batched.", docs: { title: Amazon SQS, url: "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html" } }
          - { id: dlq, name: "SQS: inventory-dlq", type: queue, description: "Dead-letter queue for messages that failed five times.", docs: { title: Dead-letter queues, url: "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html" } }
          - { id: sns, name: "SNS: order-status", type: queue, description: "Fans status changes out to mobile push.", docs: { title: Amazon SNS, url: "https://docs.aws.amazon.com/sns/latest/dg/welcome.html" } }

      - id: sfn
        name: "Step Functions: fulfilOrder"
        type: container
        layer: events
        description: A workflow for each authorised order. Every state retries on its own, and a failed charge goes down a compensation path.
        docs: { title: AWS Step Functions, url: "https://docs.aws.amazon.com/step-functions/latest/dg/welcome.html" }
        children:
          - { id: st-reserve, name: ReserveStock, type: component, description: "Confirms the stock that was reserved for the order." }
          - { id: st-capture, name: CapturePayment, type: component, description: "Captures the authorised payment with the provider." }
          - { id: st-ship, name: CreateShipment, type: component, description: "Books the courier and stores the tracking number." }
          - { id: st-notify, name: NotifyCustomer, type: component, description: "Sends the confirmation email and a push notification." }

      - id: ses
        name: Amazon SES
        type: component
        layer: events
        description: Sends transactional email.
        docs: { title: Amazon SES, url: "https://docs.aws.amazon.com/ses/latest/dg/Welcome.html" }

      - id: observability
        name: Observability
        type: system
        layer: ops
        children:
          - { id: cloudwatch, name: CloudWatch, type: component, description: "Function logs and metrics, plus an alarm when the DLQ isn't empty.", docs: { title: Amazon CloudWatch, url: "https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html" } }
          - { id: xray, name: X-Ray, type: component, description: "Traces requests from API Gateway through Lambda and Step Functions.", docs: { title: AWS X-Ray, url: "https://docs.aws.amazon.com/xray/latest/devguide/aws-xray.html" } }

connections:
  - { from: shopper, to: cloudfront, type: sync, label: HTTPS }
  - { from: cloudfront, to: site-bucket, type: sync }
  - { from: shopper, to: login, type: auth, label: sign in }
  - { from: login, to: users, type: sync, label: verify }
  - { from: shopper, to: routes, type: api, label: /orders + JWT }
  - { from: routes, to: jwt-auth, type: auth, label: check token }
  - { from: jwt-auth, to: cognito, type: depends, label: signing keys }
  - { from: routes, to: fn-create, type: sync, label: POST }
  - { from: routes, to: fn-get, type: sync, label: GET }
  - { from: psp, to: routes, type: webhook, label: payment.authorized }
  - { from: routes, to: fn-webhook, type: sync }
  - { from: fn-create, to: orders-table, type: sync, label: PutItem }
  - { from: fn-get, to: orders-table, type: sync, label: GetItem }
  - { from: fn-webhook, to: orders-table, type: sync, label: UpdateItem }
  - { from: orders-table, to: ddb-stream, type: async, label: change records }
  - { from: ddb-stream, to: pipe, type: async, docs: { title: Lambda and DynamoDB Streams, url: "https://docs.aws.amazon.com/lambda/latest/dg/with-ddb.html" } }
  - { from: pipe, to: bus, type: async, label: OrderCreated / OrderAuthorised }
  - { from: bus, to: inv-queue, type: async, label: OrderCreated }
  - { from: bus, to: sfn, type: async, label: OrderAuthorised }
  - { from: inv-queue, to: fn-inventory, type: async, label: batches of 10 }
  - { from: inv-queue, to: dlq, type: async, label: after 5 failures }
  - { from: fn-inventory, to: inventory-table, type: sync, label: conditional write }
  - { from: st-reserve, to: st-capture, type: lifecycle }
  - { from: st-capture, to: st-ship, type: lifecycle }
  - { from: st-ship, to: st-notify, type: lifecycle }
  - { from: st-reserve, to: inventory-table, type: sync }
  - { from: st-capture, to: psp, type: api, label: capture }
  - { from: st-notify, to: ses, type: api, label: SendEmail }
  - { from: st-notify, to: sns, type: async, label: status }
  - { from: ses, to: shopper, type: data, label: confirmation email }
  - { from: sns, to: shopper, type: async, label: push }
  - { from: fns, to: cloudwatch, type: async, label: logs + metrics }
  - { from: fns, to: xray, type: async, label: traces }
  - { from: sfn, to: xray, type: async, label: traces }
  - { from: dlq, to: cloudwatch, type: depends, label: alarm }

flows:
  - id: sign-in
    name: Sign in
    color: "#eab308"
    steps:
      - { from: shopper, to: cloudfront, note: The browser loads the single-page app. }
      - { from: cloudfront, to: site-bucket }
      - { from: shopper, to: login, note: "The app redirects to the Cognito managed login." }
      - { from: login, to: users, note: "Cognito checks the password and MFA, then returns tokens to the app." }

  - id: place-order
    name: Place an order
    color: "#38bdf8"
    steps:
      - { from: shopper, to: routes, note: POST /orders with the access token. }
      - { from: routes, to: jwt-auth, note: "API Gateway checks the JWT. A bad token gets a 401 and Lambda never runs." }
      - { from: routes, to: fn-create }
      - { from: fn-create, to: orders-table, note: "The order is saved as PENDING and the API returns 201." }
      - { from: orders-table, to: ddb-stream, note: Everything from here on runs asynchronously. }
      - { from: ddb-stream, to: pipe }
      - { from: pipe, to: bus, note: The pipe publishes OrderCreated. }
      - { from: bus, to: inv-queue }
      - { from: inv-queue, to: fn-inventory }
      - { from: fn-inventory, to: inventory-table, note: Stock is reserved with a conditional write. }

  - id: payment
    name: Payment authorised
    color: "#f97316"
    steps:
      - { from: psp, to: routes, note: "The provider calls the webhook after the shopper confirms payment on its hosted page." }
      - { from: routes, to: fn-webhook, note: "The function checks the signature. Repeat deliveries are ignored." }
      - { from: fn-webhook, to: orders-table, note: "The order is set to AUTHORISED." }
      - { from: orders-table, to: ddb-stream }
      - { from: ddb-stream, to: pipe }
      - { from: pipe, to: bus, note: The pipe publishes OrderAuthorised. }
      - { from: bus, to: sfn, note: An EventBridge rule starts a fulfilOrder execution. }
      - { from: st-reserve, to: st-capture }
      - { from: st-capture, to: psp, note: The payment is captured. }
      - { from: st-capture, to: st-ship }
      - { from: st-ship, to: st-notify }
      - { from: st-notify, to: ses }
      - { from: ses, to: shopper, note: The confirmation email arrives. }

  - id: poison-message
    name: A stock update keeps failing
    color: "#ef4444"
    docs: { title: Dead-letter queues, url: "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html" }
    steps:
      - { from: inv-queue, to: fn-inventory, note: "The function throws, for example on an unknown SKU, and the message goes back on the queue." }
      - { from: inv-queue, to: fn-inventory, note: "It's retried until maxReceiveCount (5) is reached." }
      - { from: inv-queue, to: dlq, note: "SQS moves the message to the dead-letter queue, so it stops blocking the others." }
      - { from: dlq, to: cloudwatch, note: "The alarm fires. Once the bug is fixed, the message can be sent back to the main queue." }
`;

export const AWS_WEB = `# AWS three-tier web app: CloudFront + ALB + ECS on Fargate + Aurora, across two Availability Zones.
# Tip: Layers tab -> tap a layer to focus it. Flows tab -> play "AZ a goes down" to see the failover path.
version: 1
docs:
  - { title: AWS Well-Architected Framework, url: "https://docs.aws.amazon.com/wellarchitected/latest/framework/framework.html" }
  - { title: Regions and Availability Zones, url: "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-regions-availability-zones.html" }

layers:
  - { id: users,    name: Users & operators,     color: "#f59e0b" }
  - { id: edge,     name: Edge & DNS,            color: "#06b6d4", docs: { title: Amazon CloudFront, url: "https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Introduction.html" } }
  - { id: network,  name: Network (VPC),         color: "#8b5cf6", docs: { title: Amazon VPC, url: "https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html" } }
  - { id: app,      name: Application tier,      color: "#3b82f6", docs: { title: Amazon ECS, url: "https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html" } }
  - { id: data,     name: Data tier,             color: "#10b981", docs: { title: Amazon Aurora, url: "https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/CHAP_AuroraOverview.html" } }
  - { id: security, name: Identity & encryption, color: "#eab308", docs: { title: AWS Secrets Manager, url: "https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html" } }
  - { id: ops,      name: Delivery & operations, color: "#ec4899", docs: { title: AWS CodePipeline, url: "https://docs.aws.amazon.com/codepipeline/latest/userguide/welcome.html" } }

elements:
  - id: customer
    name: Customer
    type: actor
    layer: users
    description: Uses the shop in a browser. Everything they load comes through CloudFront.
    pos: [-30, 5, 0]

  - id: operator
    name: On-call engineer
    type: actor
    layer: users
    description: Watches dashboards and gets paged by CloudWatch alarms.
    pos: [30, 5, 16]

  - id: github
    name: GitHub repository
    type: system
    layer: ops
    description: Application source and Dockerfile. A push to main starts the release pipeline through an AWS CodeConnections connection.
    docs: { title: AWS CodeConnections, url: "https://docs.aws.amazon.com/dtconsole/latest/userguide/welcome-connections.html" }
    pos: [30, 0, -16]

  - id: aws
    name: "AWS account: prod (us-east-1)"
    type: boundary
    layer: network
    description: Production account in one Region. The VPC spans two Availability Zones so that losing one AZ doesn't take the site down.
    pos: [0, 0, 0]
    children:
      - id: edge-svcs
        pos: [-17, 0.85, 13]
        name: Global edge
        type: system
        layer: edge
        description: Global AWS services that sit in front of the Region.
        children:
          - { id: route53, name: Route 53 hosted zone, type: component, description: "Public DNS for shop.example.com. An alias record points at the CloudFront distribution.", docs: { title: Amazon Route 53, url: "https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/Welcome.html" } }
          - { id: cloudfront, name: CloudFront distribution, type: component, description: "CDN and TLS termination. Serves /static/* from S3 (cached at the edge) and forwards everything else to the ALB.", docs: { title: Amazon CloudFront, url: "https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Introduction.html" } }
          - { id: waf, name: AWS WAF web ACL, type: component, layer: security, description: "Managed rule groups (common exploits, bad bots) and rate limiting, attached to the distribution.", docs: { title: AWS WAF, url: "https://docs.aws.amazon.com/waf/latest/developerguide/waf-chapter.html" } }
          - { id: acm, name: ACM certificate, type: component, layer: security, description: "Public TLS certificate for shop.example.com. Issued and renewed automatically by AWS Certificate Manager.", docs: { title: AWS Certificate Manager, url: "https://docs.aws.amazon.com/acm/latest/userguide/acm-overview.html" } }

      - id: static-assets
        pos: [-9, 0.8, 13]
        name: S3 static assets
        type: datastore
        layer: edge
        description: Built JS, CSS and images. Private bucket, readable only by CloudFront through Origin Access Control.
        docs: { title: Amazon S3, url: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html" }

      - id: vpc
        pos: [0, 0.85, -5]
        name: VPC 10.0.0.0/16
        type: boundary
        description: One VPC with public, private app and private data subnets in each Availability Zone.
        docs: { title: Subnets, url: "https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html" }
        children:
          - { id: igw, name: Internet gateway, type: component, pos: [-6, 0.55, -7.5], description: "The VPC's route to the internet. Only the public subnets route to it directly.", docs: { title: Internet gateways, url: "https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html" } }
          - { id: alb, name: Application Load Balancer, type: component, pos: [6, 0.55, -7.5], layer: app, description: "Internet-facing ALB in both public subnets. Health-checks the Fargate tasks and only routes to healthy ones.", docs: { title: Application Load Balancers, url: "https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html" } }

          - id: az-a
            pos: [-12.3, 0.85, 2]
            name: Availability Zone us-east-1a
            type: boundary
            description: One isolated data centre group. Everything here has a twin in AZ b.
            docs: { title: Regions and Availability Zones, url: "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-regions-availability-zones.html" }
            children:
              - id: pub-a
                name: Public subnet 10.0.0.0/24
                type: system
                children:
                  - { id: nat-a, name: NAT gateway, type: component, description: "Lets tasks in the private subnets make outbound calls without being reachable from the internet.", docs: { title: NAT gateways, url: "https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html" } }
              - id: app-a
                name: App subnet 10.0.10.0/24
                type: system
                layer: app
                children:
                  - id: task-a
                    name: Fargate task
                    type: container
                    description: One copy of the web service. Fargate runs it without any EC2 instances to manage.
                    docs: { title: AWS Fargate, url: "https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html" }
                    children:
                      - { id: web-a, name: web container, type: component, description: "The Node.js app. Renders pages and serves the JSON API on port 8080." }
                      - { id: logr-a, name: FireLens log router, type: component, layer: ops, description: "Sidecar that ships the app's stdout to CloudWatch Logs." }
              - id: data-a
                name: Data subnet 10.0.20.0/24
                type: system
                layer: data
                children:
                  - { id: aurora-writer, name: Aurora writer, type: datastore, description: "Aurora PostgreSQL primary instance. Takes all writes. Storage is shared with the reader and copied six ways across three AZs.", docs: { title: Amazon Aurora, url: "https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/CHAP_AuroraOverview.html" } }
                  - { id: redis-primary, name: ElastiCache primary, type: datastore, description: "Session and page-fragment cache. Multi-AZ with automatic failover.", docs: { title: Amazon ElastiCache, url: "https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/WhatIs.html" } }

          - id: az-b
            pos: [10.7, 0.85, 2]
            name: Availability Zone us-east-1b
            type: boundary
            description: The twin of AZ a. It can carry all traffic on its own if AZ a fails.
            children:
              - id: pub-b
                name: Public subnet 10.0.1.0/24
                type: system
                children:
                  - { id: nat-b, name: NAT gateway, type: component, description: "A NAT gateway per AZ, so outbound traffic doesn't depend on the other AZ.", docs: { title: NAT gateways, url: "https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html" } }
              - id: app-b
                name: App subnet 10.0.11.0/24
                type: system
                layer: app
                children:
                  - id: task-b
                    name: Fargate task
                    type: container
                    description: The second copy of the web service.
                    children:
                      - { id: web-b, name: web container, type: component, description: "Same image as web-a." }
                      - { id: logr-b, name: FireLens log router, type: component, layer: ops, description: "Ships the app's stdout to CloudWatch Logs." }
              - id: data-b
                name: Data subnet 10.0.21.0/24
                type: system
                layer: data
                children:
                  - { id: aurora-reader, name: Aurora reader, type: datastore, description: "Aurora Replica. Serves read queries and is first in line to be promoted to writer.", docs: { title: Aurora replication, url: "https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Replication.html" } }
                  - { id: redis-replica, name: ElastiCache replica, type: datastore, description: "Read replica of the cache. Promoted automatically if the primary fails." }

      - id: regional
        pos: [3, 0.9, 13]
        name: Regional services
        type: system
        layer: ops
        description: Managed services the app uses that live outside the VPC.
        children:
          - { id: ecs-svc, name: ECS service (desired 2), type: component, layer: app, description: "Keeps two tasks running, one per AZ, registers them with the ALB and does rolling deployments.", docs: { title: Rolling deployments, url: "https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-ecs.html" } }
          - { id: ecr, name: ECR repository, type: datastore, description: "Private registry for the web image. Tasks pull from it at start-up.", docs: { title: Amazon ECR, url: "https://docs.aws.amazon.com/AmazonECR/latest/userguide/what-is-ecr.html" } }
          - { id: secrets, name: Secrets Manager, type: datastore, layer: security, description: "Database credentials, rotated automatically. Injected into the task at start-up.", docs: { title: AWS Secrets Manager, url: "https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html" } }
          - { id: kms, name: KMS key, type: component, layer: security, description: "Customer managed key that encrypts the secrets and the Aurora storage.", docs: { title: AWS KMS, url: "https://docs.aws.amazon.com/kms/latest/developerguide/overview.html" } }
          - { id: cloudwatch, name: CloudWatch, type: component, description: "Logs, metrics, dashboards and alarms for the ALB, tasks and database.", docs: [{ title: Amazon CloudWatch, url: "https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html" }, { title: CloudWatch Logs, url: "https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/WhatIsCloudWatchLogs.html" }] }

      - id: cicd
        pos: [16, 0.85, 13]
        name: Release pipeline
        type: system
        layer: ops
        description: Builds the image on every push to main and rolls it out to ECS.
        children:
          - { id: codepipeline, name: CodePipeline, type: component, description: "Source, Build and Deploy stages.", docs: { title: AWS CodePipeline, url: "https://docs.aws.amazon.com/codepipeline/latest/userguide/welcome.html" } }
          - { id: codebuild, name: CodeBuild project, type: component, description: "Runs the tests, builds the Docker image and pushes it to ECR.", docs: { title: AWS CodeBuild, url: "https://docs.aws.amazon.com/codebuild/latest/userguide/welcome.html" } }

connections:
  - { from: customer, to: route53, type: sync, label: DNS }
  - { from: customer, to: cloudfront, type: sync, label: HTTPS }
  - { from: acm, to: cloudfront, type: auth, label: TLS certificate }
  - { from: cloudfront, to: waf, type: depends, label: inspected by }
  - { from: cloudfront, to: static-assets, type: sync, label: "/static/*" }
  - { from: cloudfront, to: alb, type: sync, label: "pages + /api/*" }
  - { from: alb, to: web-a, type: sync }
  - { from: alb, to: web-b, type: sync }
  - { from: web-a, to: redis-primary, type: sync, label: cache }
  - { from: web-b, to: redis-primary, type: sync, label: cache }
  - { from: web-a, to: aurora-writer, type: sync, label: writes }
  - { from: web-b, to: aurora-writer, type: sync, label: writes }
  - { from: web-a, to: aurora-reader, type: sync, label: reads }
  - { from: web-b, to: aurora-reader, type: sync, label: reads }
  - { from: aurora-writer, to: aurora-reader, type: replication, label: shared storage, description: "Aurora Replicas read the same cluster volume, so replica lag is usually well under a second." }
  - { from: redis-primary, to: redis-replica, type: replication }
  - { from: web-a, to: nat-a, type: network, label: outbound HTTPS }
  - { from: web-b, to: nat-b, type: network, label: outbound HTTPS }
  - { from: nat-a, to: igw, type: network }
  - { from: nat-b, to: igw, type: network }
  - { from: task-a, to: secrets, type: auth, label: task role, docs: { title: ECS task IAM roles, url: "https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html" } }
  - { from: task-b, to: secrets, type: auth, label: task role }
  - { from: secrets, to: kms, type: depends, label: encrypted with }
  - { from: aurora-writer, to: kms, type: depends, label: encrypted with }
  - { from: web-a, to: logr-a, type: async, label: stdout }
  - { from: web-b, to: logr-b, type: async, label: stdout }
  - { from: logr-a, to: cloudwatch, type: async, label: logs }
  - { from: logr-b, to: cloudwatch, type: async, label: logs }
  - { from: cloudwatch, to: operator, type: async, label: alarm page }
  - { from: operator, to: cloudwatch, type: sync, label: dashboards }
  - { from: github, to: codepipeline, type: webhook, label: push to main }
  - { from: codepipeline, to: codebuild, type: lifecycle, label: Build stage }
  - { from: codebuild, to: ecr, type: data, label: docker push }
  - { from: codepipeline, to: ecs-svc, type: lifecycle, label: Deploy stage }
  - { from: ecs-svc, to: task-a, type: deploy, label: runs }
  - { from: ecs-svc, to: task-b, type: deploy, label: runs }
  - { from: ecs-svc, to: alb, type: depends, label: registers targets }
  - { from: task-a, to: ecr, type: depends, label: pulls image }
  - { from: task-b, to: ecr, type: depends, label: pulls image }

flows:
  - id: page-load
    name: Load a product page
    color: "#38bdf8"
    description: A read request, from DNS to the database.
    steps:
      - { from: customer, to: route53, note: The browser looks up shop.example.com and gets the CloudFront address. }
      - { from: customer, to: cloudfront, note: "HTTPS to the nearest edge location. WAF rules run first." }
      - { from: cloudfront, to: static-assets, note: "JS, CSS and images come from the edge cache, or from S3 on a miss." }
      - { from: cloudfront, to: alb, note: The page itself isn't cached and goes to the ALB. }
      - { from: alb, to: web-a, note: The ALB picks a healthy task. This time it's the one in AZ a. }
      - { from: web-a, to: redis-primary, note: "Cache lookup for the product fragment. It's a miss." }
      - { from: web-a, to: aurora-reader, note: The product is read from the Aurora Replica. }
      - { from: web-a, to: logr-a, note: The request log goes to stdout. }
      - { from: logr-a, to: cloudwatch, note: FireLens ships it to CloudWatch Logs. }

  - id: place-order
    name: Place an order (write path)
    color: "#f97316"
    steps:
      - { from: customer, to: cloudfront, label: POST /api/orders }
      - { from: cloudfront, to: alb }
      - { from: alb, to: web-b, note: This request lands on the task in AZ b. }
      - { from: web-b, to: aurora-writer, note: "The order is written to the writer, which may be in the other AZ." }
      - { from: aurora-writer, to: aurora-reader, note: The replica sees the new row within milliseconds. }
      - { from: web-b, to: redis-primary, label: invalidate, note: The cached basket is cleared. }

  - id: release
    name: Ship a release
    color: "#ec4899"
    docs: { title: Rolling deployments, url: "https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-ecs.html" }
    steps:
      - { from: github, to: codepipeline, note: A merge to main starts the pipeline. }
      - { from: codepipeline, to: codebuild, note: CodeBuild runs the tests and builds the image. }
      - { from: codebuild, to: ecr, note: "The image is pushed with the commit SHA as its tag." }
      - { from: codepipeline, to: ecs-svc, note: The Deploy stage registers a new task definition revision. }
      - { from: ecs-svc, to: task-a, note: "A new task starts in AZ a and pulls the image from ECR." }
      - { from: ecs-svc, to: alb, note: "Once it passes ALB health checks, the old task is drained and stopped." }
      - { from: ecs-svc, to: task-b, note: Then the same happens in AZ b. No downtime. }

  - id: az-failover
    name: AZ a goes down
    color: "#ef4444"
    description: What keeps the site up when one Availability Zone fails.
    docs: { title: Aurora high availability, url: "https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Concepts.AuroraHighAvailability.html" }
    steps:
      - { from: alb, to: web-b, note: "Health checks to AZ a fail, so the ALB sends all traffic to AZ b." }
      - { from: aurora-reader, to: aurora-writer, type: flow, label: promote, note: "Aurora fails over: the replica in AZ b becomes the new writer and the cluster endpoint moves to it." }
      - { from: redis-replica, to: redis-primary, type: flow, label: promote, note: "ElastiCache promotes the replica in AZ b to primary." }
      - { from: ecs-svc, to: task-b, note: "ECS starts replacement tasks in the healthy AZ to get back to two." }
      - { from: cloudwatch, to: operator, note: "Alarms page on-call, but nobody has to act for the site to stay up." }
`;

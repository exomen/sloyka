export const AWS_DATA = `# AWS data lake and analytics: Kinesis + DMS into S3, Glue for the catalog and ETL, Athena, Redshift and QuickSight.
# Tip: focus the "Catalog & governance" layer to see what every query depends on.
version: 1
docs:
  - { title: Analytics Lens, url: "https://docs.aws.amazon.com/wellarchitected/latest/analytics-lens/analytics-lens.html" }

layers:
  - { id: sources,    name: Sources,                color: "#f59e0b" }
  - { id: ingest,     name: Ingestion,              color: "#ec4899", docs: { title: Amazon Kinesis Data Streams, url: "https://docs.aws.amazon.com/streams/latest/dev/introduction.html" } }
  - { id: storage,    name: S3 data lake,           color: "#10b981", docs: { title: Amazon S3, url: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html" } }
  - { id: catalog,    name: Catalog & governance,   color: "#eab308", docs: { title: AWS Lake Formation, url: "https://docs.aws.amazon.com/lake-formation/latest/dg/what-is-lake-formation.html" } }
  - { id: processing, name: Processing,             color: "#3b82f6", docs: { title: AWS Glue, url: "https://docs.aws.amazon.com/glue/latest/dg/what-is-glue.html" } }
  - { id: consume,    name: Analytics & BI,         color: "#06b6d4", docs: { title: Amazon Athena, url: "https://docs.aws.amazon.com/athena/latest/ug/what-is.html" } }

elements:
  - id: apps
    name: Web & mobile apps
    type: system
    layer: sources
    description: Send clickstream events (page views, add-to-basket, checkout) as they happen.
    pos: [-32, 0, -10]

  - id: onprem
    name: On-premises data centre
    type: boundary
    layer: sources
    description: The legacy orders system still runs here.
    pos: [-32, 0, 12]
    children:
      - { id: orders-db, name: Orders DB (PostgreSQL), type: datastore, description: "System of record for orders. Logical replication is turned on so DMS can read changes." }
      - { id: cgw, name: Customer gateway, type: component, description: "The on-premises end of the VPN." }

  - id: analyst
    name: Business analyst
    type: actor
    layer: consume
    description: Builds dashboards and runs ad-hoc SQL.
    pos: [32, 5, 10]

  - id: engineer
    name: Data engineer
    type: actor
    layer: processing
    description: Owns the pipelines and the table definitions.
    pos: [32, 5, -12]

  - id: aws
    name: "AWS account: analytics"
    type: boundary
    layer: storage
    description: A dedicated analytics account. Producers write in, and consumers get read access through Lake Formation.
    pos: [0, 0, 0]
    children:
      - id: ingestion
        name: Ingestion
        type: system
        layer: ingest
        children:
          - { id: kds, name: "Kinesis Data Streams: clickstream", type: queue, description: "Takes in events in real time. On-demand capacity, with 24 hours of retention for replay.", docs: { title: Kinesis Data Streams, url: "https://docs.aws.amazon.com/streams/latest/dev/introduction.html" } }
          - { id: firehose, name: Amazon Data Firehose, type: component, description: "Buffers events, converts them to Parquet and writes them to S3 partitioned by date.", docs: { title: Amazon Data Firehose, url: "https://docs.aws.amazon.com/firehose/latest/dev/what-is-this-service.html" } }
          - { id: vpn, name: Site-to-Site VPN, type: component, description: "Encrypted IPsec tunnel to the data centre.", docs: { title: AWS Site-to-Site VPN, url: "https://docs.aws.amazon.com/vpn/latest/s2svpn/VPC_VPN.html" } }
          - { id: dms, name: DMS replication task, type: component, description: "A full load first, then ongoing change data capture (CDC) from the Orders DB.", docs: [{ title: AWS DMS, url: "https://docs.aws.amazon.com/dms/latest/userguide/Welcome.html" }, { title: DMS change data capture, url: "https://docs.aws.amazon.com/dms/latest/userguide/CHAP_Task.CDC.html" }] }

      - id: lake
        name: S3 data lake
        type: system
        layer: storage
        description: "Three zones, each in its own bucket prefix. Every zone is encrypted with KMS."
        children:
          - { id: raw, name: Raw zone, type: datastore, description: "Data exactly as it arrived. Never edited, so anything downstream can be rebuilt from it." }
          - { id: curated, name: Curated zone, type: datastore, description: "Cleaned, de-duplicated Parquet tables, partitioned by date." }
          - { id: analytics-zone, name: Analytics zone, type: datastore, description: "Business-level aggregates: daily sales, funnels, cohorts." }
          - { id: archive, name: Glacier archive, type: datastore, description: "Raw data older than 90 days. Cheap to keep, slower to read back.", docs: { title: S3 Lifecycle, url: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html" } }

      - id: governance
        name: Catalog & governance
        type: system
        layer: catalog
        children:
          - { id: glue-catalog, name: Glue Data Catalog, type: datastore, description: "Table schemas and partitions. Athena, Redshift and the Glue jobs all read it.", docs: { title: Glue Data Catalog, url: "https://docs.aws.amazon.com/glue/latest/dg/components-overview.html" } }
          - { id: crawler, name: Glue crawler, type: component, description: "Finds new partitions and schema changes in the raw zone.", docs: { title: Glue crawlers, url: "https://docs.aws.amazon.com/glue/latest/dg/add-crawler.html" } }
          - { id: lakeformation, name: Lake Formation, type: component, description: "Central permissions: who can see which databases, tables, columns and rows.", docs: { title: AWS Lake Formation, url: "https://docs.aws.amazon.com/lake-formation/latest/dg/what-is-lake-formation.html" } }
          - { id: kms, name: KMS key, type: component, description: "Encrypts every bucket in the lake.", docs: { title: AWS KMS, url: "https://docs.aws.amazon.com/kms/latest/developerguide/overview.html" } }

      - id: etl
        name: Processing
        type: system
        layer: processing
        children:
          - { id: scheduler, name: EventBridge Scheduler, type: component, description: "Starts the nightly run at 02:00 UTC.", docs: { title: EventBridge Scheduler, url: "https://docs.aws.amazon.com/scheduler/latest/UserGuide/what-is-scheduler.html" } }
          - { id: workflow, name: Glue workflow, type: component, description: "Runs the crawler and both jobs in order, and stops if a step fails.", docs: { title: Glue workflows, url: "https://docs.aws.amazon.com/glue/latest/dg/workflows_overview.html" } }
          - { id: job-clean, name: "Glue job: raw to curated", type: component, description: "Spark job. Applies the latest CDC changes, removes duplicates and fixes types." }
          - { id: job-agg, name: "Glue job: curated to analytics", type: component, description: "Spark job that builds the business aggregates." }

      - id: bi
        name: Analytics & BI
        type: system
        layer: consume
        children:
          - { id: athena, name: Athena, type: component, description: "Serverless SQL straight on S3. You pay for the data each query scans.", docs: { title: Amazon Athena, url: "https://docs.aws.amazon.com/athena/latest/ug/what-is.html" } }
          - { id: redshift, name: Redshift Serverless, type: datastore, description: "Warehouse for heavy BI workloads. Also queries the lake in place with Redshift Spectrum.", docs: [{ title: Redshift Serverless, url: "https://docs.aws.amazon.com/redshift/latest/mgmt/working-with-serverless.html" }, { title: Redshift Spectrum, url: "https://docs.aws.amazon.com/redshift/latest/dg/c-using-spectrum.html" }] }
          - { id: quicksight, name: QuickSight, type: component, description: "Dashboards for the business, on Athena and Redshift.", docs: { title: Amazon Quick user guide, url: "https://docs.aws.amazon.com/quick/latest/userguide/what-is.html" } }

connections:
  - { from: apps, to: kds, type: data, label: PutRecords }
  - { from: kds, to: firehose, type: async }
  - { from: firehose, to: raw, type: data, label: Parquet every 5 min }
  - { from: cgw, to: vpn, type: network, label: IPsec tunnel }
  - { from: orders-db, to: dms, type: replication, label: full load + CDC }
  - { from: dms, to: raw, type: data, label: change files }
  - { from: raw, to: archive, type: lifecycle, label: after 90 days }
  - { from: raw, to: kms, type: depends, label: SSE-KMS }
  - { from: scheduler, to: workflow, type: lifecycle, label: nightly }
  - { from: workflow, to: crawler, type: lifecycle, label: 1. crawl }
  - { from: workflow, to: job-clean, type: lifecycle, label: 2. clean }
  - { from: workflow, to: job-agg, type: lifecycle, label: 3. aggregate }
  - { from: crawler, to: raw, type: depends, label: scans }
  - { from: crawler, to: glue-catalog, type: data, label: tables + partitions }
  - { from: raw, to: job-clean, type: data }
  - { from: job-clean, to: curated, type: data }
  - { from: curated, to: job-agg, type: data }
  - { from: job-agg, to: analytics-zone, type: data }
  - { from: job-agg, to: redshift, type: data, label: COPY }
  - { from: lakeformation, to: glue-catalog, type: auth, label: governs }
  - { from: lakeformation, to: athena, type: auth, label: column + row grants }
  - { from: lakeformation, to: redshift, type: auth }
  - { from: athena, to: glue-catalog, type: depends, label: schemas }
  - { from: athena, to: curated, type: sync, label: scan }
  - { from: athena, to: analytics-zone, type: sync, label: scan }
  - { from: redshift, to: glue-catalog, type: depends, label: Spectrum schema }
  - { from: quicksight, to: athena, type: sync, label: SQL }
  - { from: quicksight, to: redshift, type: sync, label: SQL }
  - { from: analyst, to: quicksight, type: sync, label: dashboards }
  - { from: analyst, to: athena, type: sync, label: ad-hoc SQL }
  - { from: engineer, to: workflow, type: sync, label: monitor + rerun }

flows:
  - id: clickstream
    name: Clickstream into the lake
    color: "#ec4899"
    steps:
      - { from: apps, to: kds, note: Apps send events as they happen. }
      - { from: kds, to: firehose, note: "Firehose reads the stream and buffers up to 5 minutes or 128 MB." }
      - { from: firehose, to: raw, note: "It converts the events to Parquet and writes them under dt=YYYY-MM-DD/." }

  - id: cdc
    name: Orders change data capture
    color: "#f59e0b"
    steps:
      - { from: cgw, to: vpn, note: "The data centre connects to the VPC over the VPN." }
      - { from: orders-db, to: dms, note: "DMS does a full load once, then streams every insert, update and delete." }
      - { from: dms, to: raw, note: "Changes land as files with an operation column (I, U or D)." }

  - id: nightly
    name: Nightly ETL run
    color: "#3b82f6"
    docs: { title: Glue workflows, url: "https://docs.aws.amazon.com/glue/latest/dg/workflows_overview.html" }
    steps:
      - { from: scheduler, to: workflow, note: "02:00 UTC: the workflow starts." }
      - { from: workflow, to: crawler }
      - { from: crawler, to: glue-catalog, note: New partitions are added to the catalog. }
      - { from: workflow, to: job-clean }
      - { from: raw, to: job-clean, note: "Reads the new raw files and the CDC changes." }
      - { from: job-clean, to: curated, note: Writes de-duplicated Parquet tables. }
      - { from: workflow, to: job-agg }
      - { from: curated, to: job-agg }
      - { from: job-agg, to: analytics-zone, note: Writes the daily aggregates to the analytics zone. }
      - { from: job-agg, to: redshift, note: "Loads the same aggregates into Redshift for the dashboards." }
      - { from: raw, to: archive, note: "Separately, S3 Lifecycle moves raw objects older than 90 days to Glacier." }

  - id: query
    name: Analyst runs a query
    color: "#06b6d4"
    steps:
      - { from: analyst, to: quicksight, note: The analyst opens the sales dashboard. }
      - { from: quicksight, to: athena, note: QuickSight sends the SQL to Athena. }
      - { from: lakeformation, to: athena, note: "Lake Formation checks the analyst's grants. PII columns are hidden." }
      - { from: athena, to: glue-catalog, note: Athena looks up the table schema and partitions. }
      - { from: athena, to: analytics-zone, note: "It scans only the partitions it needs, and the result goes back to the dashboard." }
`;

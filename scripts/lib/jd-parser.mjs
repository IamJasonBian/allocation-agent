/**
 * Job description tech stack parser.
 * Uses compiled RegExp objects with word boundaries for accurate detection.
 */

/* ------------------------------------------------------------------ */
/*  HTML stripper                                                      */
/* ------------------------------------------------------------------ */

function stripHtml(html) {
  if (!html) return "";
  let text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|li|tr|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, "");
  return text;
}

/* ------------------------------------------------------------------ */
/*  Core tech dictionary                                               */
/* ------------------------------------------------------------------ */

const TECH = {
  languages: [
    { pattern: /\bpython\b/i, canonical: "Python" },
    { pattern: /\bjava(?!script)\b/i, canonical: "Java" },
    { pattern: /\bjavascript\b/i, canonical: "JavaScript" },
    { pattern: /\btypescript\b/i, canonical: "TypeScript" },
    { pattern: /\bc\+\+\b/i, canonical: "C++" },
    { pattern: /\bc#\b/i, canonical: "C#" },
    { pattern: /\bgolang\b|\bgo\b(?=\s*(?:,|\band\b|\/|\blang|programming|developer|engineer|backend|microservice|concurren))/i, canonical: "Go" },
    { pattern: /\brust\b/i, canonical: "Rust" },
    { pattern: /\bscala\b/i, canonical: "Scala" },
    { pattern: /\bkotlin\b/i, canonical: "Kotlin" },
    { pattern: /\bruby\b/i, canonical: "Ruby" },
    { pattern: /\bR\b(?=\s*(?:programming|,|\band\b|\/|\bstatistic|\bshiny|\bggplot|\btidyverse|\bdplyr))/i, canonical: "R" },
    { pattern: /\bswift\b/i, canonical: "Swift" },
    { pattern: /\bperl\b/i, canonical: "Perl" },
    { pattern: /\bsql\b/i, canonical: "SQL" },
    { pattern: /\bbash\b|\bshell\s*script/i, canonical: "Bash/Shell" },
    { pattern: /\bhaskell\b/i, canonical: "Haskell" },
    { pattern: /\berlang\b/i, canonical: "Erlang" },
    { pattern: /\belixir\b/i, canonical: "Elixir" },
    { pattern: /\bphp\b/i, canonical: "PHP" },
    { pattern: /\blua\b/i, canonical: "Lua" },
    { pattern: /\bmatlab\b/i, canonical: "MATLAB" },
    { pattern: /\bjulia\b(?=\s*(?:lang|programming|,|\band\b|\/))/i, canonical: "Julia" },
    { pattern: /\bclojure\b/i, canonical: "Clojure" },
  ],

  frameworks: [
    { pattern: /\breact\b/i, canonical: "React" },
    { pattern: /\bangular\b/i, canonical: "Angular" },
    { pattern: /\bvue(?:\.?js)?\b/i, canonical: "Vue" },
    { pattern: /\bdjango\b/i, canonical: "Django" },
    { pattern: /\bflask\b/i, canonical: "Flask" },
    { pattern: /\bfastapi\b/i, canonical: "FastAPI" },
    { pattern: /\bspring\s*boot\b/i, canonical: "Spring Boot" },
    { pattern: /\bspring\b(?!\s*boot)/i, canonical: "Spring" },
    { pattern: /\bexpress(?:\.?js)?\b/i, canonical: "Express" },
    { pattern: /\bnext\.?js\b/i, canonical: "Next.js" },
    { pattern: /\brails\b/i, canonical: "Rails" },
    { pattern: /\bpytorch\b/i, canonical: "PyTorch" },
    { pattern: /\btensorflow\b/i, canonical: "TensorFlow" },
    { pattern: /\bkeras\b/i, canonical: "Keras" },
    { pattern: /\bscikit[\s-]?learn\b|\bsklearn\b/i, canonical: "scikit-learn" },
    { pattern: /\bpandas\b/i, canonical: "Pandas" },
    { pattern: /\bnumpy\b/i, canonical: "NumPy" },
    { pattern: /\bscipy\b/i, canonical: "SciPy" },
    { pattern: /\bspark\b/i, canonical: "Spark" },
    { pattern: /\bflink\b/i, canonical: "Flink" },
    { pattern: /\bbeam\b/i, canonical: "Beam" },
    { pattern: /\bpresto\b/i, canonical: "Presto" },
    { pattern: /\btrino\b/i, canonical: "Trino" },
    { pattern: /\bdbt\b/i, canonical: "dbt" },
    { pattern: /\bairflow\b/i, canonical: "Airflow" },
    { pattern: /\bdagster\b/i, canonical: "Dagster" },
    { pattern: /\bprefect\b/i, canonical: "Prefect" },
    { pattern: /\bgraphql\b/i, canonical: "GraphQL" },
    { pattern: /\bgrpc\b/i, canonical: "gRPC" },
    { pattern: /\bprotobuf\b|\bprotocol\s*buffers?\b/i, canonical: "Protobuf" },
  ],

  databases: [
    { pattern: /\bpostgres(?:ql)?\b/i, canonical: "PostgreSQL" },
    { pattern: /\bmysql\b/i, canonical: "MySQL" },
    { pattern: /\bmongodb\b|\bmongo\b/i, canonical: "MongoDB" },
    { pattern: /\bredis\b/i, canonical: "Redis" },
    { pattern: /\belasticsearch\b/i, canonical: "Elasticsearch" },
    { pattern: /\bcassandra\b/i, canonical: "Cassandra" },
    { pattern: /\bdynamodb\b/i, canonical: "DynamoDB" },
    { pattern: /\bredshift\b/i, canonical: "Redshift" },
    { pattern: /\bbigquery\b/i, canonical: "BigQuery" },
    { pattern: /\bsnowflake\b/i, canonical: "Snowflake" },
    { pattern: /\bclickhouse\b/i, canonical: "ClickHouse" },
    { pattern: /\bdruid\b/i, canonical: "Druid" },
    { pattern: /\bpinot\b/i, canonical: "Pinot" },
    { pattern: /\bhbase\b/i, canonical: "HBase" },
    { pattern: /\bneo4j\b/i, canonical: "Neo4j" },
    { pattern: /\bdelta\s*lake\b/i, canonical: "Delta Lake" },
    { pattern: /\biceberg\b/i, canonical: "Iceberg" },
    { pattern: /\bparquet\b/i, canonical: "Parquet" },
    { pattern: /\bavro\b/i, canonical: "Avro" },
    { pattern: /\bsql\s*server\b|\bmssql\b/i, canonical: "SQL Server" },
  ],

  cloud: [
    { pattern: /\baws\b/i, canonical: "AWS" },
    { pattern: /\bgcp\b|\bgoogle\s*cloud\b/i, canonical: "GCP" },
    { pattern: /\bazure\b/i, canonical: "Azure" },
    { pattern: /\bs3\b/i, canonical: "S3" },
    { pattern: /\bec2\b/i, canonical: "EC2" },
    { pattern: /\blambda\b/i, canonical: "Lambda" },
    { pattern: /\becs\b|\bfargate\b/i, canonical: "ECS/Fargate" },
    { pattern: /\beks\b/i, canonical: "EKS" },
    { pattern: /\bsagemaker\b/i, canonical: "SageMaker" },
    { pattern: /\bglue\b/i, canonical: "Glue" },
    { pattern: /\bemr\b/i, canonical: "EMR" },
    { pattern: /\bkinesis\b/i, canonical: "Kinesis" },
    { pattern: /\bcloudformation\b/i, canonical: "CloudFormation" },
    { pattern: /\bcdk\b/i, canonical: "CDK" },
    { pattern: /\bterraform\b/i, canonical: "Terraform" },
    { pattern: /\bpulumi\b/i, canonical: "Pulumi" },
    { pattern: /\bdatabricks\b/i, canonical: "Databricks" },
  ],

  tools: [
    { pattern: /\bkafka\b/i, canonical: "Kafka" },
    { pattern: /\brabbitmq\b/i, canonical: "RabbitMQ" },
    { pattern: /\bdocker\b/i, canonical: "Docker" },
    { pattern: /\bkubernetes\b|\bk8s\b/i, canonical: "Kubernetes" },
    { pattern: /\bhelm\b/i, canonical: "Helm" },
    { pattern: /\bistio\b/i, canonical: "Istio" },
    { pattern: /\bjenkins\b/i, canonical: "Jenkins" },
    { pattern: /\bgithub\s*actions\b/i, canonical: "GitHub Actions" },
    { pattern: /\bcircleci\b/i, canonical: "CircleCI" },
    { pattern: /\bargo\b/i, canonical: "Argo" },
    { pattern: /\bprometheus\b/i, canonical: "Prometheus" },
    { pattern: /\bgrafana\b/i, canonical: "Grafana" },
    { pattern: /\bdatadog\b/i, canonical: "Datadog" },
    { pattern: /\bsplunk\b/i, canonical: "Splunk" },
    { pattern: /\bnginx\b/i, canonical: "Nginx" },
    { pattern: /\bmlflow\b/i, canonical: "MLflow" },
    { pattern: /\bkubeflow\b/i, canonical: "Kubeflow" },
    { pattern: /\bwandb\b|\bweights\s*(?:&|and)\s*biases\b/i, canonical: "W&B" },
  ],
};

/* ------------------------------------------------------------------ */
/*  Niche / specialized tech dictionary                                */
/*  Catches domain-specific technologies not in the core dictionary.   */
/* ------------------------------------------------------------------ */

const NICHE_TECH = [
  // Low-latency networking & messaging
  { pattern: /\baeron\b/i, canonical: "Aeron" },
  { pattern: /\bebpf\b/i, canonical: "eBPF" },
  { pattern: /\bdpdk\b/i, canonical: "DPDK" },
  { pattern: /\bxdp\b/i, canonical: "XDP" },
  { pattern: /\bbgp\b/i, canonical: "BGP" },
  { pattern: /\bmpls\b/i, canonical: "MPLS" },
  { pattern: /\bvxlan\b/i, canonical: "VXLAN" },
  { pattern: /\bquic\b/i, canonical: "QUIC" },
  { pattern: /\bzeromq\b|\bzmq\b|\b0mq\b/i, canonical: "ZeroMQ" },
  { pattern: /\bnats\b(?=\s*(?:,|\.|messaging|stream|jet|server|cluster|io))/i, canonical: "NATS" },
  { pattern: /\bpulsar\b/i, canonical: "Pulsar" },
  { pattern: /\bkernel\s*bypass/i, canonical: "Kernel Bypass Networking" },
  { pattern: /\bio_uring\b/i, canonical: "io_uring" },
  { pattern: /\brdma\b/i, canonical: "RDMA" },
  { pattern: /\binfiniband\b/i, canonical: "InfiniBand" },
  { pattern: /\bspdk\b/i, canonical: "SPDK" },

  // Systems & HPC
  { pattern: /\bnuma\b/i, canonical: "NUMA" },
  { pattern: /\bcuda\b/i, canonical: "CUDA" },
  { pattern: /\bcudnn\b/i, canonical: "cuDNN" },
  { pattern: /\bopencl\b/i, canonical: "OpenCL" },
  { pattern: /\bmpi\b(?=\s*(?:,|\.|protocol|message|parallel|cluster|implementation))/i, canonical: "MPI" },
  { pattern: /\bfpga\b/i, canonical: "FPGA" },
  { pattern: /\bverilog\b/i, canonical: "Verilog" },
  { pattern: /\bvhdl\b/i, canonical: "VHDL" },
  { pattern: /\bwebassembly\b|\bwasm\b/i, canonical: "WebAssembly" },

  // Financial tech protocols
  { pattern: /\bfix\s*protocol\b|\bfix\s*engine\b|\bfix\s*gateway\b|\bfix\s*(?:4\.[0-4]|5\.0)\b/i, canonical: "FIX Protocol" },
  { pattern: /\border\s*book\b/i, canonical: "Order Book" },
  { pattern: /\bmarket\s*data\s*feed/i, canonical: "Market Data Feed" },
  { pattern: /\blow[- ]latency\b/i, canonical: "Low-Latency Systems" },
  { pattern: /\btick\s*data\b/i, canonical: "Tick Data" },
  { pattern: /\bsbe\b(?=\s*(?:,|\.|encoding|protocol|message))/i, canonical: "SBE (Simple Binary Encoding)" },
  { pattern: /\bitch\b(?=\s*(?:,|\.|protocol|feed|nasdaq))/i, canonical: "ITCH Protocol" },

  // Distributed systems internals
  { pattern: /\braft\b(?=\s*(?:,|\.|consensus|protocol|algorithm|leader|replication))/i, canonical: "Raft Consensus" },
  { pattern: /\bpaxos\b/i, canonical: "Paxos" },
  { pattern: /\bzookeeper\b/i, canonical: "ZooKeeper" },
  { pattern: /\betcd\b/i, canonical: "etcd" },
  { pattern: /\bconsul\b/i, canonical: "Consul" },

  // ML inference & serving
  { pattern: /\bonnx\b/i, canonical: "ONNX" },
  { pattern: /\btensorrt\b/i, canonical: "TensorRT" },
  { pattern: /\btriton\s*(?:inference|server)\b/i, canonical: "Triton Inference Server" },
  { pattern: /\bvllm\b/i, canonical: "vLLM" },
  { pattern: /\bray\b(?=\s*(?:,|\.|cluster|serve|tune|framework|distributed))/i, canonical: "Ray" },
  { pattern: /\bdeepspeed\b/i, canonical: "DeepSpeed" },
  { pattern: /\bmegatron\b/i, canonical: "Megatron" },

  // Observability & service mesh
  { pattern: /\bopentelemetry\b|\botel\b/i, canonical: "OpenTelemetry" },
  { pattern: /\bjaeger\b/i, canonical: "Jaeger" },
  { pattern: /\bzipkin\b/i, canonical: "Zipkin" },
  { pattern: /\benvoy\b(?=\s*(?:,|\.|proxy|sidecar|mesh|load|filter))/i, canonical: "Envoy Proxy" },
  { pattern: /\blinkerd\b/i, canonical: "Linkerd" },

  // Security
  { pattern: /\bmtls\b|\bmutual\s*tls\b/i, canonical: "mTLS" },
  { pattern: /\bspiffe\b/i, canonical: "SPIFFE" },
  { pattern: /\bvault\b(?=\s*(?:,|\.|secret|hashicorp|token|seal))/i, canonical: "HashiCorp Vault" },
  { pattern: /\bopa\b(?=\s*(?:,|\.|policy|rego|open\s*policy))/i, canonical: "OPA (Open Policy Agent)" },

  // Storage systems
  { pattern: /\bceph\b/i, canonical: "Ceph" },
  { pattern: /\bminio\b/i, canonical: "MinIO" },
  { pattern: /\bcolumnar\s*storage\b/i, canonical: "Columnar Storage" },
  { pattern: /\borc\b(?=\s*(?:,|\.|format|file|storage|columnar))/i, canonical: "ORC" },
  { pattern: /\barrow\b(?=\s*(?:,|\.|flight|format|apache|columnar|memory))/i, canonical: "Apache Arrow" },
  { pattern: /\brocksdb\b/i, canonical: "RocksDB" },
  { pattern: /\bleveldb\b/i, canonical: "LevelDB" },
  { pattern: /\btikv\b/i, canonical: "TiKV" },
  { pattern: /\btidb\b/i, canonical: "TiDB" },
  { pattern: /\bcockroachdb\b|\bcockroach\s*db\b/i, canonical: "CockroachDB" },
  { pattern: /\bscylladb\b|\bscylla\s*db\b/i, canonical: "ScyllaDB" },

  // Stream processing & CDC
  { pattern: /\bdebezium\b/i, canonical: "Debezium" },
  { pattern: /\bcdc\b(?=\s*(?:,|\.|change|capture|pipeline|stream|event))/i, canonical: "CDC (Change Data Capture)" },
  { pattern: /\bmaterialized\s*view/i, canonical: "Materialized Views" },

  // Workflow & orchestration
  { pattern: /\btemporal\b(?=\s*(?:,|\.|io|workflow|worker|activity))/i, canonical: "Temporal" },
  { pattern: /\bcadence\b(?=\s*(?:,|\.|workflow|uber))/i, canonical: "Cadence" },
  { pattern: /\bstep\s*functions\b/i, canonical: "Step Functions" },
];

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Parse a job description (HTML or plain text) and extract tech stack.
 * @param {string} description - Raw JD content (may contain HTML)
 * @returns {{ languages: string[], frameworks: string[], databases: string[], cloud: string[], tools: string[], niche: string[] }}
 */
export function parseJdTechStack(description) {
  const text = stripHtml(description);
  const result = { languages: [], frameworks: [], databases: [], cloud: [], tools: [], niche: [] };

  for (const [category, entries] of Object.entries(TECH)) {
    const seen = new Set();
    for (const { pattern, canonical } of entries) {
      if (!seen.has(canonical) && pattern.test(text)) {
        seen.add(canonical);
        result[category].push(canonical);
      }
    }
  }

  // Niche / specialized tech
  const seenNiche = new Set();
  for (const { pattern, canonical } of NICHE_TECH) {
    if (!seenNiche.has(canonical) && pattern.test(text)) {
      seenNiche.add(canonical);
      result.niche.push(canonical);
    }
  }

  return result;
}

/**
 * Flatten a tech stack object into a single array of canonical names.
 * @param {{ languages: string[], frameworks: string[], databases: string[], cloud: string[], tools: string[], niche?: string[] }} stack
 * @returns {string[]}
 */
export function flattenStack(stack) {
  return [
    ...(stack.languages || []),
    ...(stack.frameworks || []),
    ...(stack.databases || []),
    ...(stack.cloud || []),
    ...(stack.tools || []),
    ...(stack.niche || []),
  ];
}

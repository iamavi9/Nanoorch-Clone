import { executeKubernetesTool, validateKubernetesCredentials, type KubernetesCredentials } from "./kubernetes";
export type { KubernetesCredentials };
import { assertSafeUrl } from "../lib/ssrf-guard";
import { EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import { S3Client, ListBucketsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { LambdaClient, ListFunctionsCommand } from "@aws-sdk/client-lambda";
import { CloudWatchLogsClient, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { Storage } from "@google-cloud/storage";
import { google } from "googleapis";
import { ClientSecretCredential } from "@azure/identity";
import { ResourceManagementClient } from "@azure/arm-resources";
import { ComputeManagementClient } from "@azure/arm-compute";
import { StorageManagementClient } from "@azure/arm-storage";

export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
}

export interface GCPCredentials {
  serviceAccountJson: Record<string, string>;
}

export interface AzureCredentials {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  subscriptionId: string;
}

export interface RAGFlowCredentials {
  baseUrl: string;
  apiKey: string;
}

export interface JiraCredentials {
  baseUrl: string;
  email: string;
  apiToken: string;
  defaultProjectKey?: string;
  tokenType?: string;
}

export interface GitHubCredentials {
  token: string;
  defaultOwner?: string;
}

export interface GitLabCredentials {
  baseUrl: string;
  token: string;
  defaultProjectId?: string;
}

export interface TeamsCredentials {
  webhookUrl: string;
}

export interface SlackCredentials {
  botToken: string;
  defaultChannel?: string;
}

export interface GoogleChatCredentials {
  webhookUrl: string;
}

export interface ServiceNowCredentials {
  instanceUrl: string;
  username: string;
  password: string;
}

export interface PostgreSQLCredentials {
  connectionString: string;
}

export type CloudCredentials =
  | { provider: "aws"; credentials: AWSCredentials }
  | { provider: "gcp"; credentials: GCPCredentials }
  | { provider: "azure"; credentials: AzureCredentials }
  | { provider: "ragflow"; credentials: RAGFlowCredentials }
  | { provider: "jira"; credentials: JiraCredentials }
  | { provider: "github"; credentials: GitHubCredentials }
  | { provider: "gitlab"; credentials: GitLabCredentials }
  | { provider: "teams"; credentials: TeamsCredentials }
  | { provider: "slack"; credentials: SlackCredentials }
  | { provider: "google_chat"; credentials: GoogleChatCredentials }
  | { provider: "servicenow"; credentials: ServiceNowCredentials }
  | { provider: "postgresql"; credentials: PostgreSQLCredentials }
  | { provider: "kubernetes"; credentials: KubernetesCredentials };

export async function validateCredentials(creds: CloudCredentials): Promise<{ ok: boolean; detail: string }> {
  try {
    if (creds.provider === "aws") {
      const { accessKeyId, secretAccessKey, region } = creds.credentials;
      const sts = new STSClient({ region: region ?? "us-east-1", credentials: { accessKeyId, secretAccessKey } });
      const res = await sts.send(new GetCallerIdentityCommand({}));
      return { ok: true, detail: `AWS identity: ${res.Arn}` };
    }
    if (creds.provider === "gcp") {
      const auth = new google.auth.GoogleAuth({
        credentials: creds.credentials.serviceAccountJson as any,
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      });
      const client = await auth.getClient();
      const token = await client.getAccessToken();
      return { ok: !!token.token, detail: "GCP credentials valid" };
    }
    if (creds.provider === "azure") {
      const { clientId, clientSecret, tenantId, subscriptionId } = creds.credentials;
      const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
      await credential.getToken("https://management.azure.com/.default");
      return { ok: true, detail: `Azure subscription: ${subscriptionId}` };
    }
    if (creds.provider === "ragflow") {
      const { baseUrl, apiKey } = creds.credentials;
      if (!baseUrl) throw new Error("RAGFlow Base URL is required");
      if (!apiKey) throw new Error("RAGFlow API Key is required");
      assertSafeUrl(baseUrl);
      const url = `${baseUrl.replace(/\/$/, "")}/api/v1/datasets?page=1&page_size=1`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`RAGFlow responded with ${res.status}`);
      const data = await res.json() as any;
      const count = data?.data?.total ?? "unknown";
      return { ok: true, detail: `Connected to RAGFlow — ${count} dataset(s) found` };
    }
    if (creds.provider === "jira") {
      const { baseUrl, email, apiToken } = creds.credentials;
      if (!baseUrl) throw new Error("Jira Base URL is required");
      if (!email) throw new Error("Jira email is required");
      if (!apiToken) throw new Error("Jira API token is required");
      assertSafeUrl(baseUrl);
      const base = baseUrl.replace(/\/$/, "");
      const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");
      const res = await fetch(`${base}/rest/api/3/myself`, {
        headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Jira responded with ${res.status}`);
      const data = await res.json() as any;
      return { ok: true, detail: `Connected as ${data.displayName ?? data.emailAddress} (${data.accountId})` };
    }
    if (creds.provider === "github") {
      const { token } = creds.credentials;
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      });
      if (!res.ok) throw new Error(`GitHub responded with ${res.status}`);
      const data = await res.json() as any;
      return { ok: true, detail: `Connected as ${data.login} (${data.name ?? "no name"})` };
    }
    if (creds.provider === "gitlab") {
      const { baseUrl, token } = creds.credentials;
      if (!baseUrl) throw new Error("GitLab Base URL is required");
      if (!token) throw new Error("GitLab token is required");
      assertSafeUrl(baseUrl);
      const base = baseUrl.replace(/\/$/, "");
      const res = await fetch(`${base}/api/v4/user`, {
        headers: { "PRIVATE-TOKEN": token, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`GitLab responded with ${res.status}`);
      const data = await res.json() as any;
      return { ok: true, detail: `Connected as ${data.username} (${data.name})` };
    }
    if (creds.provider === "teams") {
      const { webhookUrl } = creds.credentials;
      if (!webhookUrl) throw new Error("Teams webhook URL is required");
      assertSafeUrl(webhookUrl);
      const isConnector = new URL(webhookUrl).hostname.endsWith(".webhook.office.com") ||
        new URL(webhookUrl).hostname === "webhook.office.com";
      const testBody = isConnector
        ? {
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            themeColor: "0076D7",
            summary: "NanoOrch connection test",
            sections: [{ activityTitle: "NanoOrch Connected", activityText: "Teams integration is working correctly.", markdown: true }],
          }
        : {
            type: "message",
            attachments: [
              {
                contentType: "application/vnd.microsoft.card.adaptive",
                contentUrl: null,
                content: {
                  $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
                  type: "AdaptiveCard",
                  version: "1.4",
                  body: [
                    { type: "TextBlock", text: "NanoOrch Connected", weight: "Bolder", size: "Large", wrap: true },
                    { type: "TextBlock", text: "Teams integration is working correctly.", wrap: true },
                  ],
                },
              },
            ],
          };
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testBody),
      });
      if (!res.ok) throw new Error(`Teams webhook responded with ${res.status}`);
      return { ok: true, detail: "Teams webhook is reachable and accepting messages" };
    }
    if (creds.provider === "slack") {
      const { botToken } = creds.credentials;
      if (!botToken) throw new Error("Slack bot token is required");
      if (!botToken.startsWith("xoxb-")) throw new Error("Slack bot token must start with xoxb-");
      const res = await fetch("https://slack.com/api/auth.test", {
        method: "POST",
        headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
      });
      const data = await res.json() as any;
      if (!data.ok) throw new Error(`Slack auth failed: ${data.error}`);
      return { ok: true, detail: `Connected to Slack as @${data.user} (workspace: ${data.team})` };
    }
    if (creds.provider === "google_chat") {
      const { webhookUrl } = creds.credentials;
      if (!webhookUrl) throw new Error("Google Chat webhook URL is required");
      if (!webhookUrl.startsWith("https://chat.googleapis.com/")) throw new Error("Google Chat webhook URL must start with https://chat.googleapis.com/");
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "NanoOrch connection test — integration is working correctly." }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Google Chat webhook responded with ${res.status}`);
      return { ok: true, detail: "Google Chat webhook is reachable and accepting messages" };
    }
    if (creds.provider === "servicenow") {
      const { instanceUrl, username, password } = creds.credentials;
      if (!instanceUrl) throw new Error("ServiceNow Instance URL is required");
      if (!username) throw new Error("ServiceNow username is required");
      if (!password) throw new Error("ServiceNow password is required");
      assertSafeUrl(instanceUrl);
      const base = instanceUrl.replace(/\/$/, "");
      const auth = Buffer.from(`${username}:${password}`).toString("base64");
      const res = await fetch(`${base}/api/now/table/sys_user?sysparm_query=user_name=${encodeURIComponent(username)}&sysparm_limit=1&sysparm_fields=user_name,name,email`, {
        headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`ServiceNow responded with ${res.status} — check instance URL and credentials`);
      const data = await res.json() as any;
      const user = data?.result?.[0];
      return { ok: true, detail: `Connected to ${base} as ${user?.name ?? username} (${user?.email ?? "no email"})` };
    }
    if (creds.provider === "postgresql") {
      const { connectionString } = creds.credentials;
      if (!connectionString) throw new Error("Connection string is required");
      const { Pool } = await import("pg");
      const pool = new Pool({ connectionString, connectionTimeoutMillis: 10_000, max: 1 });
      try {
        const res = await pool.query("SELECT version()");
        const version = (res.rows[0]?.version as string ?? "").split(" ").slice(0, 2).join(" ");
        return { ok: true, detail: `Connected — ${version}` };
      } finally {
        await pool.end();
      }
    }
    if (creds.provider === "kubernetes") {
      return validateKubernetesCredentials(creds.credentials);
    }
    return { ok: false, detail: "Unknown provider" };
  } catch (err: any) {
    return { ok: false, detail: err?.message ?? String(err) };
  }
}

export async function executeCloudTool(
  toolName: string,
  toolArgs: Record<string, string>,
  creds: CloudCredentials
): Promise<unknown> {
  if (creds.provider === "aws") {
    return executeAWSTool(toolName, toolArgs, creds.credentials);
  }
  if (creds.provider === "gcp") {
    return executeGCPTool(toolName, toolArgs, creds.credentials);
  }
  if (creds.provider === "azure") {
    return executeAzureTool(toolName, toolArgs, creds.credentials);
  }
  if (creds.provider === "ragflow") {
    return executeRAGFlowTool(toolName, toolArgs, creds.credentials);
  }
  if (creds.provider === "jira") {
    return executeJiraTool(toolName, toolArgs, creds.credentials);
  }
  if (creds.provider === "github") {
    return executeGitHubTool(toolName, toolArgs, creds.credentials);
  }
  if (creds.provider === "gitlab") {
    return executeGitLabTool(toolName, toolArgs, creds.credentials);
  }
  if (creds.provider === "teams") {
    return executeTeamsTool(toolName, toolArgs, creds.credentials);
  }
  if (creds.provider === "slack") {
    return executeSlackTool(toolName, toolArgs, creds.credentials);
  }
  if (creds.provider === "google_chat") {
    return executeGoogleChatTool(toolName, toolArgs, creds.credentials);
  }
  if (creds.provider === "servicenow") {
    return executeServiceNowTool(toolName, toolArgs, creds.credentials);
  }
  if (creds.provider === "postgresql") {
    return executePostgreSQLTool(toolName, toolArgs, creds.credentials);
  }
  if (creds.provider === "kubernetes") {
    return executeKubernetesTool(creds.credentials, toolName, toolArgs);
  }
  throw new Error(`Unknown cloud provider`);
}

async function executeAWSTool(name: string, args: Record<string, string>, creds: AWSCredentials): Promise<unknown> {
  const region = args.region ?? creds.region ?? "us-east-1";
  const awsCreds = { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey };

  if (name === "aws_list_s3_buckets") {
    const s3 = new S3Client({ region, credentials: awsCreds });
    const res = await s3.send(new ListBucketsCommand({}));
    return { buckets: (res.Buckets ?? []).map((b) => ({ name: b.Name, createdAt: b.CreationDate })) };
  }

  if (name === "aws_list_s3_objects") {
    const s3 = new S3Client({ region, credentials: awsCreds });
    const res = await s3.send(new ListObjectsV2Command({ Bucket: args.bucket, Prefix: args.prefix, MaxKeys: 100 }));
    return { objects: (res.Contents ?? []).map((o) => ({ key: o.Key, size: o.Size, lastModified: o.LastModified })) };
  }

  if (name === "aws_list_ec2_instances") {
    const ec2 = new EC2Client({ region, credentials: awsCreds });
    const res = await ec2.send(new DescribeInstancesCommand({}));
    const instances = (res.Reservations ?? []).flatMap((r) => r.Instances ?? []).map((i) => ({
      id: i.InstanceId,
      type: i.InstanceType,
      state: i.State?.Name,
      name: i.Tags?.find((t) => t.Key === "Name")?.Value,
      publicIp: i.PublicIpAddress,
      launchTime: i.LaunchTime,
    }));
    const stateFilter = args.state && args.state !== "all" ? args.state : null;
    return { instances: stateFilter ? instances.filter((i) => i.state === stateFilter) : instances };
  }

  if (name === "aws_list_lambda_functions") {
    const lambda = new LambdaClient({ region, credentials: awsCreds });
    const res = await lambda.send(new ListFunctionsCommand({}));
    return { functions: (res.Functions ?? []).map((f) => ({ name: f.FunctionName, runtime: f.Runtime, lastModified: f.LastModified, memory: f.MemorySize })) };
  }

  if (name === "aws_get_cloudwatch_logs") {
    const logs = new CloudWatchLogsClient({ region, credentials: awsCreds });
    const res = await logs.send(new FilterLogEventsCommand({
      logGroupName: args.logGroupName,
      limit: args.limit ? parseInt(args.limit) : 50,
    }));
    return { events: (res.events ?? []).map((e) => ({ timestamp: e.timestamp, message: e.message })) };
  }

  throw new Error(`Unknown AWS tool: ${name}`);
}

async function executeGCPTool(name: string, args: Record<string, string>, creds: GCPCredentials): Promise<unknown> {
  const projectId = args.projectId ?? (creds.serviceAccountJson.project_id as string);

  if (name === "gcp_list_storage_buckets") {
    const storage = new Storage({ credentials: creds.serviceAccountJson as any, projectId });
    const [buckets] = await storage.getBuckets();
    return { buckets: buckets.map((b) => ({ name: b.name, location: b.metadata?.location })) };
  }

  if (name === "gcp_list_compute_instances") {
    const auth = new google.auth.GoogleAuth({ credentials: creds.serviceAccountJson as any, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
    const compute = google.compute({ version: "v1", auth });
    const zone = args.zone ?? "-";
    const res = await compute.instances.aggregatedList({ project: projectId });
    const items = res.data.items ?? {};
    const instances: unknown[] = [];
    for (const [z, zoneData] of Object.entries(items)) {
      for (const inst of (zoneData as any).instances ?? []) {
        instances.push({ name: inst.name, zone: z.replace("zones/", ""), status: inst.status, machineType: inst.machineType?.split("/").pop() });
      }
    }
    return { instances };
  }

  if (name === "gcp_list_cloud_functions") {
    const auth = new google.auth.GoogleAuth({ credentials: creds.serviceAccountJson as any, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
    const cf = google.cloudfunctions({ version: "v2", auth });
    const region = args.region ?? "-";
    const res = await cf.projects.locations.functions.list({ parent: `projects/${projectId}/locations/${region}` });
    return { functions: (res.data.functions ?? []).map((f: any) => ({ name: f.name?.split("/").pop(), state: f.state, runtime: f.buildConfig?.runtime })) };
  }

  throw new Error(`Unknown GCP tool: ${name}`);
}

async function executeAzureTool(name: string, args: Record<string, string>, creds: AzureCredentials): Promise<unknown> {
  const { clientId, clientSecret, tenantId, subscriptionId } = creds;
  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

  if (name === "azure_list_resource_groups") {
    const client = new ResourceManagementClient(credential, subscriptionId);
    const groups: unknown[] = [];
    for await (const g of client.resourceGroups.list()) {
      groups.push({ name: g.name, location: g.location, provisioningState: g.properties?.provisioningState });
    }
    return { resourceGroups: groups };
  }

  if (name === "azure_list_virtual_machines") {
    const client = new ComputeManagementClient(credential, subscriptionId);
    const vms: unknown[] = [];
    if (args.resourceGroup) {
      for await (const vm of client.virtualMachines.list(args.resourceGroup)) {
        vms.push({ name: vm.name, location: vm.location, size: vm.hardwareProfile?.vmSize });
      }
    } else {
      for await (const vm of client.virtualMachines.listAll()) {
        vms.push({ name: vm.name, location: vm.location, size: vm.hardwareProfile?.vmSize });
      }
    }
    return { virtualMachines: vms };
  }

  if (name === "azure_list_storage_accounts") {
    const client = new StorageManagementClient(credential, subscriptionId);
    const accounts: unknown[] = [];
    if (args.resourceGroup) {
      for await (const acc of client.storageAccounts.listByResourceGroup(args.resourceGroup)) {
        accounts.push({ name: acc.name, location: acc.location, kind: acc.kind, sku: acc.sku?.name });
      }
    } else {
      for await (const acc of client.storageAccounts.list()) {
        accounts.push({ name: acc.name, location: acc.location, kind: acc.kind, sku: acc.sku?.name });
      }
    }
    return { storageAccounts: accounts };
  }

  throw new Error(`Unknown Azure tool: ${name}`);
}

function extractRAGFlowChunks(data: any): Array<{ content: string; score: number; documentName: string }> {
  const rawChunks: any[] = data?.data?.chunks ?? data?.data ?? [];
  return rawChunks.map((c: any) => ({
    content: c.content_with_weight ?? c.content ?? "",
    score: typeof c.similarity === "number" ? c.similarity
      : typeof c.score === "number" ? c.score
      : typeof c.vector_similarity === "number" ? c.vector_similarity : 0,
    documentName: c.doc_name ?? c.document_keyword ?? c.docnm_kwd ?? c.document_name ?? "",
  }));
}

async function executeRAGFlowTool(name: string, args: Record<string, string>, creds: RAGFlowCredentials): Promise<unknown> {
  assertSafeUrl(creds.baseUrl);
  const base = creds.baseUrl.replace(/\/$/, "");
  const headers = { Authorization: `Bearer ${creds.apiKey}`, "Content-Type": "application/json" };

  if (name === "ragflow_list_datasets") {
    const res = await fetch(`${base}/api/v1/datasets?page=1&page_size=50`, { headers });
    if (!res.ok) throw new Error(`RAGFlow list datasets failed: ${res.status}`);
    const data = await res.json() as any;
    const datasets = (data?.data?.docs ?? data?.data ?? []).map((d: any) => ({
      id: d.id,
      name: d.name,
      documentCount: d.document_count ?? d.doc_num ?? 0,
      chunkCount: d.chunk_count ?? d.chunk_num ?? 0,
      description: d.description ?? "",
    }));
    return { datasets, total: data?.data?.total ?? datasets.length };
  }

  if (name === "ragflow_query_dataset") {
    const topK = parseInt(args.top_k ?? "5");
    const body = { question: args.question, dataset_ids: [args.dataset_id], top_k: topK };
    const res = await fetch(`${base}/api/v1/retrieval`, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`RAGFlow retrieval failed: ${res.status} — ${text}`);
    }
    const data = await res.json() as any;
    const chunks = extractRAGFlowChunks(data);
    return { question: args.question, chunks, total: chunks.length };
  }

  if (name === "ragflow_query_multiple_datasets") {
    const topK = parseInt(args.top_k ?? "5");
    const datasetIds = (args.dataset_ids ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
    if (!datasetIds.length) throw new Error("ragflow_query_multiple_datasets: dataset_ids must be a non-empty comma-separated list");
    const body = { question: args.question, dataset_ids: datasetIds, top_k: topK };
    const res = await fetch(`${base}/api/v1/retrieval`, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`RAGFlow retrieval failed: ${res.status} — ${text}`);
    }
    const data = await res.json() as any;
    const chunks = extractRAGFlowChunks(data).map((c) => ({ ...c, datasetId: (data?.data?.chunks ?? []).find((r: any) => r.content_with_weight === c.content || r.content === c.content)?.kb_id }));
    return { question: args.question, chunks, total: chunks.length, datasetsQueried: datasetIds.length };
  }

  throw new Error(`Unknown RAGFlow tool: ${name}`);
}

async function executeJiraTool(name: string, args: Record<string, string>, creds: JiraCredentials): Promise<unknown> {
  assertSafeUrl(creds.baseUrl);
  const base = creds.baseUrl.replace(/\/$/, "");
  const auth = Buffer.from(`${creds.email}:${creds.apiToken}`).toString("base64");
  const headers = { Authorization: `Basic ${auth}`, Accept: "application/json", "Content-Type": "application/json" };

  const jiraFetch = async (path: string, init?: RequestInit) => {
    const res = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira ${path} failed: ${res.status} — ${text}`);
    }
    return res.json();
  };

  if (name === "jira_list_projects") {
    const data = await jiraFetch("/rest/api/3/project?maxResults=50") as any;
    return { projects: (Array.isArray(data) ? data : data.values ?? []).map((p: any) => ({ id: p.id, key: p.key, name: p.name, type: p.projectTypeKey })) };
  }

  if (name === "jira_search_issues") {
    const max = parseInt(args.maxResults ?? "20");
    const data = await jiraFetch("/rest/api/3/search/jql", {
      method: "POST",
      body: JSON.stringify({ jql: args.jql, maxResults: Math.min(max, 50), fields: ["summary", "status", "priority", "assignee", "issuetype", "created", "updated"] }),
    }) as any;
    return {
      total: data.total,
      issues: (data.issues ?? []).map((i: any) => ({
        key: i.key,
        summary: i.fields?.summary,
        status: i.fields?.status?.name,
        priority: i.fields?.priority?.name,
        assignee: i.fields?.assignee?.displayName ?? null,
        type: i.fields?.issuetype?.name,
        created: i.fields?.created,
        updated: i.fields?.updated,
      })),
    };
  }

  if (name === "jira_get_issue") {
    const data = await jiraFetch(`/rest/api/3/issue/${args.issueKey}`) as any;
    return {
      key: data.key,
      summary: data.fields?.summary,
      description: data.fields?.description,
      status: data.fields?.status?.name,
      priority: data.fields?.priority?.name,
      assignee: data.fields?.assignee?.displayName ?? null,
      reporter: data.fields?.reporter?.displayName ?? null,
      type: data.fields?.issuetype?.name,
      created: data.fields?.created,
      updated: data.fields?.updated,
      labels: data.fields?.labels ?? [],
      attachments: ((data.fields?.attachment ?? []) as any[]).map((a: any) => ({
        id: a.id,
        filename: a.filename,
        mimeType: a.mimeType,
        size: a.size,
        created: a.created,
        author: a.author?.displayName ?? null,
      })),
    };
  }

  if (name === "jira_create_issue") {
    const projectKey = args.projectKey ?? creds.defaultProjectKey;
    if (!projectKey) throw new Error("projectKey is required");
    const body: Record<string, unknown> = {
      fields: {
        project: { key: projectKey },
        summary: args.summary,
        issuetype: { name: args.issueType },
        ...(args.description ? { description: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: args.description }] }] } } : {}),
        ...(args.priority ? { priority: { name: args.priority } } : {}),
        ...(args.assignee ? { assignee: { accountId: args.assignee } } : {}),
      },
    };
    const data = await jiraFetch("/rest/api/3/issue", { method: "POST", body: JSON.stringify(body) }) as any;
    return { key: data.key, id: data.id, self: data.self };
  }

  if (name === "jira_update_issue") {
    const fields: Record<string, unknown> = {};
    if (args.summary) fields.summary = args.summary;
    if (args.priority) fields.priority = { name: args.priority };
    if (args.assignee) fields.assignee = { accountId: args.assignee };
    if (Object.keys(fields).length > 0) {
      await jiraFetch(`/rest/api/3/issue/${args.issueKey}`, { method: "PUT", body: JSON.stringify({ fields }) });
    }
    if (args.status) {
      const transitions = await jiraFetch(`/rest/api/3/issue/${args.issueKey}/transitions`) as any;
      const transition = (transitions.transitions ?? []).find((t: any) => t.name.toLowerCase() === args.status.toLowerCase());
      if (!transition) throw new Error(`No transition named '${args.status}' found for issue ${args.issueKey}`);
      await jiraFetch(`/rest/api/3/issue/${args.issueKey}/transitions`, { method: "POST", body: JSON.stringify({ transition: { id: transition.id } }) });
    }
    return { ok: true, issueKey: args.issueKey };
  }

  if (name === "jira_add_comment") {
    const data = await jiraFetch(`/rest/api/3/issue/${args.issueKey}/comment`, {
      method: "POST",
      body: JSON.stringify({ body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: args.comment }] }] } }),
    }) as any;
    return { commentId: data.id, issueKey: args.issueKey, created: data.created };
  }

  if (name === "jira_list_sprints") {
    const state = args.state ?? "active";
    const data = await jiraFetch(`/rest/agile/1.0/board/${args.boardId}/sprint?state=${state}`) as any;
    return { sprints: (data.values ?? []).map((s: any) => ({ id: s.id, name: s.name, state: s.state, startDate: s.startDate, endDate: s.endDate })) };
  }

  if (name === "jira_upload_attachment") {
    const { issueKey, filename, content, mimeType, encoding } = args;
    if (!issueKey) throw new Error("issueKey is required");
    if (!filename) throw new Error("filename is required");
    if (!content) throw new Error("content is required");
    const buffer = encoding === "text"
      ? Buffer.from(content, "utf8")
      : Buffer.from(content, "base64");
    const blob = new Blob([buffer], { type: mimeType ?? "application/octet-stream" });
    const form = new FormData();
    form.append("file", blob, filename);
    const res = await fetch(`${creds.baseUrl}/rest/api/3/issue/${issueKey}/attachments`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${creds.email}:${creds.apiToken}`).toString("base64")}`,
        "X-Atlassian-Token": "no-check",
      },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => String(res.status));
      throw new Error(`Jira upload attachment failed: ${res.status} — ${text}`);
    }
    const data = await res.json() as any[];
    const att = data[0];
    return { id: att?.id, filename: att?.filename, size: att?.size, mimeType: att?.mimeType, issueKey };
  }

  if (name === "jira_get_attachment") {
    const MAX_BYTES = 5 * 1024 * 1024; // 5 MB safety cap
    const res = await fetch(`${creds.baseUrl}/rest/api/3/attachment/content/${args.attachmentId}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${creds.email}:${creds.apiToken}`).toString("base64")}`,
        Accept: "*/*",
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`Jira attachment ${args.attachmentId} failed: ${res.status}`);
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BYTES) {
      return { attachmentId: args.attachmentId, contentType, error: `Attachment too large (${contentLength} bytes). Maximum supported size is 5 MB.` };
    }
    const isText =
      contentType.startsWith("text/") ||
      contentType.includes("application/json") ||
      contentType.includes("application/xml") ||
      contentType.includes("application/csv") ||
      contentType.includes("application/x-ndjson");
    if (isText) {
      const text = await res.text();
      return { attachmentId: args.attachmentId, contentType, encoding: "text", content: text, sizeBytes: Buffer.byteLength(text, "utf8") };
    }
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      return { attachmentId: args.attachmentId, contentType, error: `Attachment too large (${buffer.byteLength} bytes). Maximum supported size is 5 MB.` };
    }
    const base64 = Buffer.from(buffer).toString("base64");
    return { attachmentId: args.attachmentId, contentType, encoding: "base64", content: base64, sizeBytes: buffer.byteLength };
  }

  throw new Error(`Unknown Jira tool: ${name}`);
}

async function executeGitHubTool(name: string, args: Record<string, string>, creds: GitHubCredentials): Promise<unknown> {
  const base = "https://api.github.com";
  const headers = {
    Authorization: `Bearer ${creds.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const ghFetch = async (path: string, init?: RequestInit) => {
    const res = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub ${path} failed: ${res.status} — ${text}`);
    }
    return res.json();
  };

  const owner = (v: string | undefined) => v ?? creds.defaultOwner ?? "";

  if (name === "github_list_repos") {
    const o = owner(args.owner);
    const type = args.type ?? "all";
    let data: any;
    if (o) {
      data = await ghFetch(`/orgs/${o}/repos?type=${type}&per_page=50`).catch(() => ghFetch(`/users/${o}/repos?type=${type}&per_page=50`));
    } else {
      data = await ghFetch(`/user/repos?type=${type}&per_page=50`);
    }
    return { repos: (data as any[]).map((r: any) => ({ name: r.name, fullName: r.full_name, private: r.private, stars: r.stargazers_count, language: r.language, updatedAt: r.updated_at })) };
  }

  if (name === "github_list_issues") {
    const o = owner(args.owner);
    const state = args.state ?? "open";
    const params = new URLSearchParams({ state, per_page: "30" });
    if (args.labels) params.set("labels", args.labels);
    const data = await ghFetch(`/repos/${o}/${args.repo}/issues?${params}`) as any[];
    return { issues: data.filter((i) => !i.pull_request).map((i: any) => ({ number: i.number, title: i.title, state: i.state, labels: (i.labels ?? []).map((l: any) => l.name), assignees: (i.assignees ?? []).map((a: any) => a.login), createdAt: i.created_at, updatedAt: i.updated_at })) };
  }

  if (name === "github_get_issue") {
    const o = owner(args.owner);
    const data = await ghFetch(`/repos/${o}/${args.repo}/issues/${args.issueNumber}`) as any;
    return { number: data.number, title: data.title, body: data.body, state: data.state, labels: (data.labels ?? []).map((l: any) => l.name), assignees: (data.assignees ?? []).map((a: any) => a.login), createdAt: data.created_at, updatedAt: data.updated_at };
  }

  if (name === "github_create_issue") {
    const o = owner(args.owner);
    const body: Record<string, unknown> = { title: args.title };
    if (args.body) body.body = args.body;
    if (args.labels) body.labels = args.labels.split(",").map((s) => s.trim()).filter(Boolean);
    if (args.assignees) body.assignees = args.assignees.split(",").map((s) => s.trim()).filter(Boolean);
    const data = await ghFetch(`/repos/${o}/${args.repo}/issues`, { method: "POST", body: JSON.stringify(body) }) as any;
    return { number: data.number, url: data.html_url, title: data.title };
  }

  if (name === "github_list_pull_requests") {
    const o = owner(args.owner);
    const params = new URLSearchParams({ state: args.state ?? "open", per_page: "30" });
    if (args.base) params.set("base", args.base);
    const data = await ghFetch(`/repos/${o}/${args.repo}/pulls?${params}`) as any[];
    return { pullRequests: data.map((p: any) => ({ number: p.number, title: p.title, state: p.state, head: p.head?.ref, base: p.base?.ref, author: p.user?.login, createdAt: p.created_at, updatedAt: p.updated_at })) };
  }

  if (name === "github_create_pull_request") {
    const o = owner(args.owner);
    const body: Record<string, unknown> = { title: args.title, head: args.head, base: args.base };
    if (args.body) body.body = args.body;
    const data = await ghFetch(`/repos/${o}/${args.repo}/pulls`, { method: "POST", body: JSON.stringify(body) }) as any;
    return { number: data.number, url: data.html_url, title: data.title };
  }

  if (name === "github_list_workflow_runs") {
    const o = owner(args.owner);
    const params = new URLSearchParams({ per_page: "20" });
    if (args.status) params.set("status", args.status);
    if (args.branch) params.set("branch", args.branch);
    const data = await ghFetch(`/repos/${o}/${args.repo}/actions/runs?${params}`) as any;
    return { runs: (data.workflow_runs ?? []).map((r: any) => ({ id: r.id, name: r.name, status: r.status, conclusion: r.conclusion, branch: r.head_branch, createdAt: r.created_at, updatedAt: r.updated_at, url: r.html_url })) };
  }

  throw new Error(`Unknown GitHub tool: ${name}`);
}

async function executeGitLabTool(name: string, args: Record<string, string>, creds: GitLabCredentials): Promise<unknown> {
  assertSafeUrl(creds.baseUrl);
  const base = creds.baseUrl.replace(/\/$/, "");
  const headers = { "PRIVATE-TOKEN": creds.token, Accept: "application/json", "Content-Type": "application/json" };

  const glFetch = async (path: string, init?: RequestInit) => {
    const res = await fetch(`${base}/api/v4${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitLab ${path} failed: ${res.status} — ${text}`);
    }
    return res.json();
  };

  const encodeId = (id: string) => encodeURIComponent(id);

  if (name === "gitlab_list_projects") {
    const params = new URLSearchParams({ per_page: "30", order_by: "last_activity_at" });
    if (args.search) params.set("search", args.search);
    if (args.owned === "true") params.set("owned", "true");
    const data = await glFetch(`/projects?${params}`) as any[];
    return { projects: data.map((p: any) => ({ id: p.id, name: p.name, path: p.path_with_namespace, visibility: p.visibility, lastActivity: p.last_activity_at, webUrl: p.web_url })) };
  }

  if (name === "gitlab_list_issues") {
    const pid = args.projectId ?? creds.defaultProjectId ?? "";
    const params = new URLSearchParams({ per_page: "30", state: args.state ?? "opened" });
    if (args.labels) params.set("labels", args.labels);
    if (args.assigneeUsername) params.set("assignee_username", args.assigneeUsername);
    const data = await glFetch(`/projects/${encodeId(pid)}/issues?${params}`) as any[];
    return { issues: data.map((i: any) => ({ iid: i.iid, title: i.title, state: i.state, labels: i.labels ?? [], assignees: (i.assignees ?? []).map((a: any) => a.username), createdAt: i.created_at, updatedAt: i.updated_at, webUrl: i.web_url })) };
  }

  if (name === "gitlab_get_issue") {
    const pid = args.projectId ?? creds.defaultProjectId ?? "";
    const data = await glFetch(`/projects/${encodeId(pid)}/issues/${args.issueIid}`) as any;
    return { iid: data.iid, title: data.title, description: data.description, state: data.state, labels: data.labels ?? [], assignees: (data.assignees ?? []).map((a: any) => a.username), author: data.author?.username, createdAt: data.created_at, updatedAt: data.updated_at, webUrl: data.web_url };
  }

  if (name === "gitlab_create_issue") {
    const pid = args.projectId ?? creds.defaultProjectId ?? "";
    const body: Record<string, unknown> = { title: args.title };
    if (args.description) body.description = args.description;
    if (args.labels) body.labels = args.labels;
    if (args.assigneeUsernames) body.assignee_usernames = args.assigneeUsernames.split(",").map((s) => s.trim()).filter(Boolean);
    const data = await glFetch(`/projects/${encodeId(pid)}/issues`, { method: "POST", body: JSON.stringify(body) }) as any;
    return { iid: data.iid, title: data.title, webUrl: data.web_url };
  }

  if (name === "gitlab_list_merge_requests") {
    const pid = args.projectId ?? creds.defaultProjectId ?? "";
    const params = new URLSearchParams({ per_page: "30", state: args.state ?? "opened" });
    if (args.targetBranch) params.set("target_branch", args.targetBranch);
    const data = await glFetch(`/projects/${encodeId(pid)}/merge_requests?${params}`) as any[];
    return { mergeRequests: data.map((m: any) => ({ iid: m.iid, title: m.title, state: m.state, sourceBranch: m.source_branch, targetBranch: m.target_branch, author: m.author?.username, createdAt: m.created_at, webUrl: m.web_url })) };
  }

  if (name === "gitlab_create_merge_request") {
    const pid = args.projectId ?? creds.defaultProjectId ?? "";
    const body: Record<string, unknown> = { title: args.title, source_branch: args.sourceBranch, target_branch: args.targetBranch };
    if (args.description) body.description = args.description;
    const data = await glFetch(`/projects/${encodeId(pid)}/merge_requests`, { method: "POST", body: JSON.stringify(body) }) as any;
    return { iid: data.iid, title: data.title, webUrl: data.web_url };
  }

  if (name === "gitlab_list_pipelines") {
    const pid = args.projectId ?? creds.defaultProjectId ?? "";
    const params = new URLSearchParams({ per_page: "20" });
    if (args.status) params.set("status", args.status);
    if (args.ref) params.set("ref", args.ref);
    const data = await glFetch(`/projects/${encodeId(pid)}/pipelines?${params}`) as any[];
    return { pipelines: data.map((p: any) => ({ id: p.id, status: p.status, ref: p.ref, sha: p.sha, createdAt: p.created_at, updatedAt: p.updated_at, webUrl: p.web_url })) };
  }

  if (name === "gitlab_trigger_pipeline") {
    const pid = args.projectId ?? creds.defaultProjectId ?? "";
    const data = await glFetch(`/projects/${encodeId(pid)}/pipeline`, { method: "POST", body: JSON.stringify({ ref: args.ref }) }) as any;
    return { id: data.id, status: data.status, ref: data.ref, webUrl: data.web_url };
  }

  throw new Error(`Unknown GitLab tool: ${name}`);
}

async function executeTeamsTool(name: string, args: Record<string, string>, creds: TeamsCredentials): Promise<unknown> {
  const { webhookUrl } = creds;
  assertSafeUrl(webhookUrl);

  // Detect URL type: old Office 365 Connectors vs new Power Automate Workflows
  const isConnector = new URL(webhookUrl).hostname.endsWith(".webhook.office.com") ||
    new URL(webhookUrl).hostname === "webhook.office.com";

  const buildAdaptiveCard = (bodyBlocks: object[]) => ({
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: bodyBlocks,
        },
      },
    ],
  });

  const postPayload = async (connectorBody: object, workflowBody: object) => {
    const body = isConnector ? connectorBody : workflowBody;
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Teams webhook failed: ${res.status} — ${text}`);
    }
    return { sent: true };
  };

  if (name === "teams_send_message") {
    return postPayload(
      {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        themeColor: args.color ?? "0076D7",
        summary: args.text?.slice(0, 100) ?? "Message from NanoOrch",
        sections: [{ activityText: args.text, markdown: true }],
      },
      buildAdaptiveCard([
        { type: "TextBlock", text: args.text ?? "", wrap: true, size: "default" },
      ])
    );
  }

  if (name === "teams_send_notification") {
    const facts: Array<{ name: string; value: string }> = [];
    if (args.facts) {
      try {
        const parsed = JSON.parse(args.facts);
        for (const [k, v] of Object.entries(parsed)) {
          facts.push({ name: String(k), value: String(v) });
        }
      } catch {
        facts.push({ name: "Details", value: args.facts });
      }
    }

    // Adaptive Card body blocks for Workflows
    const acBlocks: object[] = [];
    if (args.title) acBlocks.push({ type: "TextBlock", text: args.title, weight: "Bolder", size: "Large", wrap: true });
    if (args.subtitle) acBlocks.push({ type: "TextBlock", text: args.subtitle, isSubtle: true, wrap: true });
    if (args.body) acBlocks.push({ type: "TextBlock", text: args.body, wrap: true, spacing: "Medium" });
    if (facts.length > 0) {
      acBlocks.push({
        type: "FactSet",
        facts: facts.map((f) => ({ title: f.name, value: f.value })),
        spacing: "Medium",
      });
    }
    if (args.actionUrl) {
      acBlocks.push({
        type: "ActionSet",
        spacing: "Medium",
        actions: [{ type: "Action.OpenUrl", title: args.actionLabel ?? "View", url: args.actionUrl }],
      });
    }

    return postPayload(
      {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        themeColor: args.color ?? "0076D7",
        summary: args.title ?? "Notification from NanoOrch",
        sections: [
          {
            activityTitle: args.title ?? "Notification",
            activitySubtitle: args.subtitle ?? "",
            activityText: args.body ?? "",
            facts,
            markdown: true,
          },
        ],
        ...(args.actionUrl && args.actionLabel ? {
          potentialAction: [{
            "@type": "OpenUri",
            name: args.actionLabel,
            targets: [{ os: "default", uri: args.actionUrl }],
          }],
        } : {}),
      },
      buildAdaptiveCard(acBlocks.length > 0 ? acBlocks : [{ type: "TextBlock", text: "Notification from NanoOrch", wrap: true }])
    );
  }

  throw new Error(`Unknown Teams tool: ${name}`);
}

async function executeSlackTool(name: string, args: Record<string, string>, creds: SlackCredentials): Promise<unknown> {
  const channel = args.channel || creds.defaultChannel || "";
  if (!channel) throw new Error("No Slack channel specified and no default channel configured in integration");

  const postJson = async (body: object) => {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json() as any;
    if (!data.ok) throw new Error(`Slack API error: ${data.error}`);
    return { sent: true, ts: data.ts, channel: data.channel };
  };

  if (name === "slack_send_message") {
    return postJson({ channel, text: args.text ?? "" });
  }

  if (name === "slack_send_notification") {
    const fields: Array<{ title: string; value: string; short: boolean }> = [];
    if (args.fields) {
      try {
        const parsed = JSON.parse(args.fields);
        for (const [k, v] of Object.entries(parsed)) {
          fields.push({ title: String(k), value: String(v), short: true });
        }
      } catch {
        fields.push({ title: "Details", value: args.fields, short: false });
      }
    }
    return postJson({
      channel,
      attachments: [
        {
          color: args.color ?? "good",
          title: args.title ?? "",
          text: args.body ?? "",
          fields,
          mrkdwn_in: ["text", "fields"],
        },
      ],
    });
  }

  throw new Error(`Unknown Slack tool: ${name}`);
}

async function executeGoogleChatTool(name: string, args: Record<string, string>, creds: GoogleChatCredentials): Promise<unknown> {
  assertSafeUrl(creds.webhookUrl);
  const post = async (body: object) => {
    const res = await fetch(creds.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google Chat webhook failed: ${res.status} — ${text}`);
    }
    return { sent: true };
  };

  if (name === "google_chat_send_message") {
    return post({ text: args.text ?? "" });
  }

  if (name === "google_chat_send_card") {
    const sections: object[] = [
      { widgets: [{ textParagraph: { text: args.body ?? "" } }] },
    ];
    if (args.imageUrl) {
      sections.push({ widgets: [{ image: { imageUrl: args.imageUrl, onClick: { openLink: { url: args.imageUrl } } } }] });
    }
    return post({
      cards: [
        {
          header: {
            title: args.title ?? "",
            subtitle: args.subtitle ?? undefined,
          },
          sections,
        },
      ],
    });
  }

  throw new Error(`Unknown Google Chat tool: ${name}`);
}

async function executeServiceNowTool(name: string, args: Record<string, string>, creds: ServiceNowCredentials): Promise<unknown> {
  assertSafeUrl(creds.instanceUrl);
  const base = creds.instanceUrl.replace(/\/$/, "");
  const auth = Buffer.from(`${creds.username}:${creds.password}`).toString("base64");
  const headers = {
    Authorization: `Basic ${auth}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  const snFetch = async (path: string, init?: RequestInit) => {
    const res = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ServiceNow ${path} responded with ${res.status} — ${text.slice(0, 300)}`);
    }
    return res.json();
  };

  const isLikeSysId = (id: string) => /^[0-9a-f]{32}$/i.test(id);

  if (name === "servicenow_search_records") {
    const limit = Math.min(parseInt(args.limit ?? "10") || 10, 50);
    const fields = args.fields ? `&sysparm_fields=${encodeURIComponent(args.fields)}` : "";
    const data = await snFetch(
      `/api/now/table/${encodeURIComponent(args.table)}?sysparm_query=${encodeURIComponent(args.query)}&sysparm_limit=${limit}&sysparm_display_value=true${fields}`
    ) as any;
    return { table: args.table, count: data.result?.length ?? 0, records: data.result ?? [] };
  }

  if (name === "servicenow_get_incident") {
    const id = args.identifier;
    const query = isLikeSysId(id) ? `sys_id=${id}` : `number=${id}`;
    const data = await snFetch(
      `/api/now/table/incident?sysparm_query=${query}&sysparm_limit=1&sysparm_display_value=true` +
      `&sysparm_fields=number,sys_id,short_description,description,state,urgency,impact,priority,category,` +
      `assignment_group,assigned_to,caller_id,work_notes,opened_at,resolved_at,close_notes`
    ) as any;
    const record = data.result?.[0];
    if (!record) throw new Error(`Incident not found: ${id}`);
    return record;
  }

  if (name === "servicenow_create_incident") {
    const body: Record<string, unknown> = {
      short_description: args.short_description,
      ...(args.description ? { description: args.description } : {}),
      ...(args.urgency ? { urgency: args.urgency } : {}),
      ...(args.impact ? { impact: args.impact } : {}),
      ...(args.category ? { category: args.category } : {}),
      ...(args.assignment_group ? { assignment_group: args.assignment_group } : {}),
      ...(args.caller_id ? { caller_id: args.caller_id } : {}),
      ...(args.work_notes ? { work_notes: args.work_notes } : {}),
    };
    const data = await snFetch("/api/now/table/incident", { method: "POST", body: JSON.stringify(body) }) as any;
    const rec = data.result;
    return { number: rec.number, sys_id: rec.sys_id, link: `${base}/nav_to.do?uri=incident.do?sys_id=${rec.sys_id}` };
  }

  if (name === "servicenow_update_record") {
    let fields: Record<string, unknown>;
    try { fields = JSON.parse(args.fields); } catch { throw new Error(`fields must be a valid JSON object string`); }
    await snFetch(`/api/now/table/${encodeURIComponent(args.table)}/${args.sys_id}`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    });
    return { updated: true, table: args.table, sys_id: args.sys_id, fields_updated: Object.keys(fields) };
  }

  if (name === "servicenow_add_work_note") {
    await snFetch(`/api/now/table/${encodeURIComponent(args.table)}/${args.sys_id}`, {
      method: "PATCH",
      body: JSON.stringify({ work_notes: args.work_note }),
    });
    return { added: true, table: args.table, sys_id: args.sys_id };
  }

  if (name === "servicenow_get_ritm") {
    const id = args.identifier;
    const query = isLikeSysId(id) ? `sys_id=${id}` : `number=${id}`;
    const data = await snFetch(
      `/api/now/table/sc_req_item?sysparm_query=${query}&sysparm_limit=1&sysparm_display_value=true` +
      `&sysparm_fields=number,sys_id,short_description,stage,state,cat_item,request,requested_for,assignment_group,opened_at`
    ) as any;
    const record = data.result?.[0];
    if (!record) throw new Error(`RITM not found: ${id}`);
    const ritmSysId = isLikeSysId(id) ? id : record.sys_id;
    let variables: unknown[] = [];
    try {
      const varData = await snFetch(`/api/now/table/sc_item_option_mtom?sysparm_query=request_item=${ritmSysId}&sysparm_display_value=true&sysparm_fields=sc_item_option`) as any;
      const varSysIds: string[] = (varData.result ?? []).map((r: any) => r.sc_item_option?.value).filter(Boolean);
      if (varSysIds.length > 0) {
        const optData = await snFetch(`/api/now/table/sc_item_option?sysparm_query=sys_id=${varSysIds.join("^ORsys_id=")}&sysparm_display_value=true&sysparm_fields=item_option,value`) as any;
        variables = (optData.result ?? []).map((v: any) => ({ name: v.item_option?.display_value ?? v.item_option?.value, value: v.value }));
      }
    } catch { }
    return { ...record, variables };
  }

  if (name === "servicenow_create_ritm") {
    const catalogSysId = args.catalog_item_sys_id;
    let variables: Record<string, string> = {};
    if (args.variables) {
      try { variables = JSON.parse(args.variables); } catch { throw new Error(`variables must be a valid JSON object string`); }
    }
    const body: Record<string, unknown> = {
      sysparm_quantity: args.quantity ?? "1",
      variables,
      ...(args.requested_for ? { requested_for: args.requested_for } : {}),
    };
    const data = await snFetch(`/api/sn_sc/servicecatalog/items/${encodeURIComponent(catalogSysId)}/order_now`, {
      method: "POST",
      body: JSON.stringify(body),
    }) as any;
    const reqResult = data.result ?? data;
    const reqNumber = reqResult.request_number ?? reqResult.number;
    const reqSysId = reqResult.request_id?.value ?? reqResult.sys_id;
    let ritmNumber: string | undefined;
    let ritmSysId: string | undefined;
    if (reqSysId) {
      try {
        const ritmData = await snFetch(`/api/now/table/sc_req_item?sysparm_query=request=${reqSysId}&sysparm_limit=1&sysparm_fields=number,sys_id`) as any;
        ritmNumber = ritmData.result?.[0]?.number;
        ritmSysId = ritmData.result?.[0]?.sys_id;
      } catch { }
    }
    return {
      request_number: reqNumber,
      request_sys_id: reqSysId,
      ritm_number: ritmNumber,
      ritm_sys_id: ritmSysId,
      link: reqSysId ? `${base}/nav_to.do?uri=sc_request.do?sys_id=${reqSysId}` : undefined,
    };
  }

  if (name === "servicenow_create_change_request") {
    const body: Record<string, unknown> = {
      short_description: args.short_description,
      ...(args.description ? { description: args.description } : {}),
      ...(args.type ? { type: args.type } : {}),
      ...(args.assignment_group ? { assignment_group: args.assignment_group } : {}),
      ...(args.risk ? { risk: args.risk } : {}),
      ...(args.start_date ? { start_date: args.start_date } : {}),
      ...(args.end_date ? { end_date: args.end_date } : {}),
    };
    const data = await snFetch("/api/now/table/change_request", { method: "POST", body: JSON.stringify(body) }) as any;
    const rec = data.result;
    return { number: rec.number, sys_id: rec.sys_id, link: `${base}/nav_to.do?uri=change_request.do?sys_id=${rec.sys_id}` };
  }

  if (name === "servicenow_get_catalog_items") {
    const limit = Math.min(parseInt(args.limit ?? "20") || 20, 50);
    const queryParts = ["active=true"];
    if (args.search) queryParts.push(`nameLIKE${args.search}`);
    if (args.category) queryParts.push(`category.nameLIKE${args.category}`);
    const data = await snFetch(
      `/api/now/table/sc_cat_item?sysparm_query=${encodeURIComponent(queryParts.join("^"))}` +
      `&sysparm_limit=${limit}&sysparm_display_value=true&sysparm_fields=sys_id,name,short_description,category,active`
    ) as any;
    return {
      count: data.result?.length ?? 0,
      items: (data.result ?? []).map((item: any) => ({
        sys_id: item.sys_id,
        name: item.name,
        short_description: item.short_description,
        category: item.category?.display_value ?? item.category,
        active: item.active,
      })),
    };
  }

  throw new Error(`Unknown ServiceNow tool: ${name}`);
}

async function executePostgreSQLTool(name: string, args: Record<string, string>, creds: PostgreSQLCredentials): Promise<unknown> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: creds.connectionString, connectionTimeoutMillis: 15_000, max: 2 });

  // Validates PostgreSQL identifiers to prevent SQL injection via identifier interpolation.
  // Values (not identifiers) must always use parameterized queries ($1, $2, ...).
  const safeId = (value: string, label: string): string => {
    if (!value) throw new Error(`${label} is required.`);
    if (!/^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(value)) {
      throw new Error(
        `Invalid ${label} "${value}": must start with a letter or underscore and contain only alphanumeric characters, underscores, or dollar signs.`
      );
    }
    return value;
  };

  try {
    // ── Original 5 tools ────────────────────────────────────────────────────

    if (name === "pg_list_schemas") {
      const res = await pool.query(
        `SELECT schema_name FROM information_schema.schemata
         WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
           AND schema_name NOT LIKE 'pg_toast%'
           AND schema_name NOT LIKE 'pg_temp_%'
         ORDER BY schema_name`
      );
      return { schemas: res.rows.map((r: any) => r.schema_name) };
    }

    if (name === "pg_list_tables") {
      const schema = args.schema ?? "public";
      const res = await pool.query(
        `SELECT t.table_name, t.table_type,
                c.reltuples::bigint AS estimated_row_count
         FROM information_schema.tables t
         LEFT JOIN pg_class c ON c.relname = t.table_name
           AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = t.table_schema)
         WHERE t.table_schema = $1
         ORDER BY t.table_name`,
        [schema]
      );
      return { schema, tables: res.rows.map((r: any) => ({ name: r.table_name, type: r.table_type, estimatedRows: r.estimated_row_count })) };
    }

    if (name === "pg_describe_table") {
      const schema = args.schema ?? "public";
      const res = await pool.query(
        `SELECT c.column_name, c.data_type, c.character_maximum_length,
                c.is_nullable, c.column_default,
                CASE WHEN pk.column_name IS NOT NULL THEN 'YES' ELSE 'NO' END AS is_primary_key
         FROM information_schema.columns c
         LEFT JOIN (
           SELECT ku.column_name
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage ku
             ON tc.constraint_name = ku.constraint_name AND tc.table_schema = ku.table_schema
           WHERE tc.constraint_type = 'PRIMARY KEY'
             AND tc.table_schema = $1 AND tc.table_name = $2
         ) pk ON c.column_name = pk.column_name
         WHERE c.table_schema = $1 AND c.table_name = $2
         ORDER BY c.ordinal_position`,
        [schema, args.table]
      );
      if (res.rows.length === 0) throw new Error(`Table "${schema}.${args.table}" not found`);
      return {
        table: args.table,
        schema,
        columns: res.rows.map((r: any) => ({
          name: r.column_name,
          type: r.character_maximum_length ? `${r.data_type}(${r.character_maximum_length})` : r.data_type,
          nullable: r.is_nullable === "YES",
          default: r.column_default ?? null,
          primaryKey: r.is_primary_key === "YES",
        })),
      };
    }

    if (name === "pg_query") {
      const sql = (args.sql ?? "").trim().replace(/;+$/, "");
      const upper = sql.toUpperCase().replace(/\s+/g, " ");
      if (!upper.startsWith("SELECT") && !upper.startsWith("WITH") && !upper.startsWith("EXPLAIN") && !upper.startsWith("SHOW") && !upper.startsWith("TABLE ")) {
        throw new Error("pg_query only allows read-only statements (SELECT, WITH, EXPLAIN, SHOW). Use pg_execute for write operations.");
      }
      const limit = Math.min(parseInt(args.limit ?? "100") || 100, 500);
      const wrapped = `SELECT * FROM (${sql}) __q LIMIT ${limit}`;
      const res = await pool.query(wrapped);
      return { rowCount: res.rows.length, rows: res.rows, fields: res.fields.map((f: any) => ({ name: f.name, dataTypeID: f.dataTypeID })) };
    }

    if (name === "pg_execute") {
      const sql = (args.sql ?? "").trim();
      const upper = sql.toUpperCase().replace(/\s+/g, " ");
      if (upper.startsWith("SELECT") && !upper.includes("INTO")) {
        throw new Error("pg_execute is for write operations only. Use pg_query for SELECT statements.");
      }
      const res = await pool.query(sql);
      return {
        rowCount: res.rowCount ?? 0,
        command: res.command,
        rows: res.rows?.length ? res.rows : undefined,
      };
    }

    // ── Phase 1: Query Enhancements ─────────────────────────────────────────

    if (name === "pg_query_page") {
      const sql = (args.sql ?? "").trim().replace(/;+$/, "");
      const upper = sql.toUpperCase().replace(/\s+/g, " ");
      if (!upper.startsWith("SELECT") && !upper.startsWith("WITH") && !upper.startsWith("TABLE ")) {
        throw new Error("pg_query_page only allows SELECT or WITH statements. Do not include LIMIT/OFFSET in the SQL — use the limit and offset parameters instead.");
      }
      const limit = Math.min(parseInt(args.limit ?? "100") || 100, 1000);
      const offset = Math.max(parseInt(args.offset ?? "0") || 0, 0);
      const [dataRes, countRes] = await Promise.all([
        pool.query(`SELECT * FROM (${sql}) __q LIMIT ${limit} OFFSET ${offset}`),
        pool.query(`SELECT COUNT(*) AS total FROM (${sql}) __q`),
      ]);
      const total = parseInt(countRes.rows[0]?.total ?? "0");
      return {
        rows: dataRes.rows,
        rowCount: dataRes.rows.length,
        total,
        limit,
        offset,
        hasMore: offset + dataRes.rows.length < total,
        fields: dataRes.fields.map((f: any) => ({ name: f.name, dataTypeID: f.dataTypeID })),
      };
    }

    if (name === "pg_explain") {
      const sql = (args.sql ?? "").trim().replace(/;+$/, "");
      const upper = sql.toUpperCase().replace(/\s+/g, " ");
      if (upper.startsWith("INSERT") || upper.startsWith("UPDATE") || upper.startsWith("DELETE") || upper.startsWith("DROP") || upper.startsWith("CREATE") || upper.startsWith("ALTER") || upper.startsWith("TRUNCATE")) {
        throw new Error("pg_explain cannot explain DDL/write statements. Use with SELECT or WITH statements only.");
      }
      const res = await pool.query(`EXPLAIN (FORMAT JSON) ${sql}`);
      return { plan: (res.rows[0] as any)["QUERY PLAN"] };
    }

    if (name === "pg_explain_analyze") {
      const sql = (args.sql ?? "").trim().replace(/;+$/, "");
      const upper = sql.toUpperCase().replace(/\s+/g, " ");
      if (!upper.startsWith("SELECT") && !upper.startsWith("WITH") && !upper.startsWith("TABLE ")) {
        throw new Error("pg_explain_analyze only supports SELECT or WITH statements to avoid unintended data modification.");
      }
      const res = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`);
      return { plan: (res.rows[0] as any)["QUERY PLAN"] };
    }

    if (name === "pg_call_procedure") {
      if (!args.procedure) throw new Error("procedure is required (e.g. 'my_proc' or 'my_schema.my_proc').");
      // Allow schema-qualified names like "schema.procedure"
      const parts = args.procedure.split(".");
      if (parts.length > 2 || parts.some((p) => !/^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(p))) {
        throw new Error(`Invalid procedure name "${args.procedure}". Use "procedure_name" or "schema.procedure_name".`);
      }
      const qualifiedName = parts.map((p) => `"${p}"`).join(".");
      let res: any;
      if (args.args) {
        const argValues: unknown[] = JSON.parse(args.args);
        if (!Array.isArray(argValues)) throw new Error("args must be a JSON array of values.");
        const placeholders = argValues.map((_: unknown, i: number) => `$${i + 1}`).join(", ");
        res = await pool.query(`CALL ${qualifiedName}(${placeholders})`, argValues);
      } else {
        res = await pool.query(`CALL ${qualifiedName}()`);
      }
      return { command: res.command ?? "CALL", rowCount: res.rowCount ?? 0, rows: res.rows ?? [] };
    }

    // ── Phase 2: Schema & Metadata Exploration ──────────────────────────────

    if (name === "pg_list_indexes") {
      const schema = args.schema ?? "public";
      const params: unknown[] = [schema];
      let sql = `
        SELECT pi.tablename AS table_name, pi.indexname AS index_name, pi.indexdef AS definition,
               ix.indisunique AS is_unique, ix.indisprimary AS is_primary
        FROM pg_indexes pi
        JOIN pg_class c ON c.relname = pi.indexname
          AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = pi.schemaname)
        JOIN pg_index ix ON ix.indexrelid = c.oid
        WHERE pi.schemaname = $1`;
      if (args.table) {
        params.push(args.table);
        sql += ` AND pi.tablename = $${params.length}`;
      }
      sql += ` ORDER BY pi.tablename, pi.indexname`;
      const res = await pool.query(sql, params);
      return {
        schema,
        indexCount: res.rows.length,
        indexes: res.rows.map((r: any) => ({
          table: r.table_name,
          name: r.index_name,
          definition: r.definition,
          unique: r.is_unique,
          primary: r.is_primary,
        })),
      };
    }

    if (name === "pg_list_views") {
      const schema = args.schema ?? "public";
      const [viewsRes, matviewsRes] = await Promise.all([
        pool.query(
          `SELECT table_name AS view_name, 'VIEW' AS view_type
           FROM information_schema.views WHERE table_schema = $1 ORDER BY table_name`,
          [schema]
        ),
        pool.query(
          `SELECT matviewname AS view_name, 'MATERIALIZED VIEW' AS view_type
           FROM pg_matviews WHERE schemaname = $1 ORDER BY matviewname`,
          [schema]
        ),
      ]);
      const views = [
        ...viewsRes.rows.map((r: any) => ({ name: r.view_name, type: r.view_type })),
        ...matviewsRes.rows.map((r: any) => ({ name: r.view_name, type: r.view_type })),
      ].sort((a, b) => a.name.localeCompare(b.name));
      return { schema, viewCount: views.length, views };
    }

    if (name === "pg_list_functions") {
      const schema = args.schema ?? "public";
      const res = await pool.query(
        `SELECT r.routine_name AS name, r.routine_type AS type, r.data_type AS return_type,
                COALESCE(
                  string_agg(
                    COALESCE(p.parameter_name, 'arg' || p.ordinal_position::text) || ' ' || p.data_type,
                    ', ' ORDER BY p.ordinal_position
                  ),
                  ''
                ) AS parameters
         FROM information_schema.routines r
         LEFT JOIN information_schema.parameters p
           ON p.specific_name = r.specific_name AND p.specific_schema = r.specific_schema
           AND p.parameter_mode = 'IN'
         WHERE r.routine_schema = $1
         GROUP BY r.specific_name, r.routine_name, r.routine_type, r.data_type
         ORDER BY r.routine_name`,
        [schema]
      );
      return { schema, functionCount: res.rows.length, functions: res.rows };
    }

    if (name === "pg_list_triggers") {
      const schema = args.schema ?? "public";
      const params: unknown[] = [schema];
      let sql = `
        SELECT trigger_name AS name, event_object_table AS table_name,
               event_manipulation AS event, action_timing AS timing, action_statement AS statement
        FROM information_schema.triggers WHERE trigger_schema = $1`;
      if (args.table) {
        params.push(args.table);
        sql += ` AND event_object_table = $${params.length}`;
      }
      sql += ` ORDER BY event_object_table, trigger_name`;
      const res = await pool.query(sql, params);
      return { schema, triggerCount: res.rows.length, triggers: res.rows };
    }

    if (name === "pg_list_constraints") {
      const schema = args.schema ?? "public";
      const params: unknown[] = [schema];
      let sql = `
        SELECT tc.constraint_name AS name, tc.table_name AS table_name,
               tc.constraint_type AS type, kcu.column_name AS column_name,
               ccu.table_name AS foreign_table, ccu.column_name AS foreign_column,
               rc.delete_rule AS on_delete, rc.update_rule AS on_update
        FROM information_schema.table_constraints tc
        LEFT JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
        LEFT JOIN information_schema.referential_constraints rc
          ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.constraint_schema
        LEFT JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = rc.unique_constraint_name AND ccu.constraint_schema = rc.unique_constraint_schema
        WHERE tc.table_schema = $1`;
      if (args.table) {
        params.push(args.table);
        sql += ` AND tc.table_name = $${params.length}`;
      }
      sql += ` ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name`;
      const res = await pool.query(sql, params);
      return { schema, constraintCount: res.rows.length, constraints: res.rows };
    }

    if (name === "pg_list_extensions") {
      const res = await pool.query(
        `SELECT e.extname AS name, e.extversion AS version, n.nspname AS schema,
                obj_description(e.oid, 'pg_extension') AS description
         FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
         ORDER BY e.extname`
      );
      return { extensionCount: res.rows.length, extensions: res.rows };
    }

    if (name === "pg_column_stats") {
      if (!args.table) throw new Error("table is required.");
      const schema = args.schema ?? "public";
      const res = await pool.query(
        `SELECT attname AS column_name, null_frac AS null_fraction, avg_width AS avg_byte_width,
                n_distinct AS distinct_values, most_common_vals::text AS most_common_values,
                most_common_freqs::text AS most_common_frequencies, correlation
         FROM pg_stats WHERE schemaname = $1 AND tablename = $2 ORDER BY attname`,
        [schema, args.table]
      );
      if (res.rows.length === 0) {
        throw new Error(`No statistics found for "${schema}.${args.table}". Run ANALYZE on the table first or check the table/schema name.`);
      }
      return { schema, table: args.table, columnStats: res.rows };
    }

    // ── Phase 3: DBA Monitoring ─────────────────────────────────────────────

    if (name === "pg_active_connections") {
      const res = await pool.query(
        `SELECT pid, usename AS username, application_name,
                client_addr::text AS client_address, state,
                wait_event_type, wait_event,
                EXTRACT(EPOCH FROM (now() - query_start))::int AS query_duration_seconds,
                LEFT(query, 300) AS query
         FROM pg_stat_activity
         WHERE pid <> pg_backend_pid() AND state IS NOT NULL
         ORDER BY query_start DESC NULLS LAST`
      );
      return { totalConnections: res.rows.length, connections: res.rows };
    }

    if (name === "pg_long_queries") {
      const minSec = Math.max(parseInt(args.min_duration_seconds ?? "30") || 30, 1);
      const res = await pool.query(
        `SELECT pid, usename AS username, application_name, state,
                wait_event_type, wait_event,
                EXTRACT(EPOCH FROM (now() - query_start))::int AS duration_seconds,
                LEFT(query, 500) AS query
         FROM pg_stat_activity
         WHERE pid <> pg_backend_pid()
           AND state <> 'idle'
           AND query_start < now() - (INTERVAL '1 second' * $1)
         ORDER BY query_start ASC`,
        [minSec]
      );
      return { minDurationSeconds: minSec, count: res.rows.length, queries: res.rows };
    }

    if (name === "pg_list_locks") {
      const res = await pool.query(
        `SELECT l.pid, l.locktype, l.mode, l.granted,
                sa.usename AS username, sa.state,
                LEFT(sa.query, 200) AS query,
                c.relname AS relation
         FROM pg_locks l
         LEFT JOIN pg_stat_activity sa ON sa.pid = l.pid
         LEFT JOIN pg_class c ON c.oid = l.relation
         WHERE l.pid <> pg_backend_pid()
         ORDER BY l.granted, l.pid`
      );
      return { lockCount: res.rows.length, locks: res.rows };
    }

    if (name === "pg_blocking_queries") {
      const res = await pool.query(
        `SELECT blocked.pid AS blocked_pid,
                blocked_sa.usename AS blocked_user,
                LEFT(blocked_sa.query, 300) AS blocked_query,
                blocking.pid AS blocking_pid,
                blocking_sa.usename AS blocking_user,
                LEFT(blocking_sa.query, 300) AS blocking_query,
                EXTRACT(EPOCH FROM (now() - blocked_sa.query_start))::int AS blocked_for_seconds
         FROM pg_locks blocked
         JOIN pg_stat_activity blocked_sa ON blocked_sa.pid = blocked.pid
         JOIN pg_locks blocking
           ON blocking.locktype = blocked.locktype
           AND blocking.database IS NOT DISTINCT FROM blocked.database
           AND blocking.relation IS NOT DISTINCT FROM blocked.relation
           AND blocking.page IS NOT DISTINCT FROM blocked.page
           AND blocking.tuple IS NOT DISTINCT FROM blocked.tuple
           AND blocking.transactionid IS NOT DISTINCT FROM blocked.transactionid
           AND blocking.classid IS NOT DISTINCT FROM blocked.classid
           AND blocking.objid IS NOT DISTINCT FROM blocked.objid
           AND blocking.objsubid IS NOT DISTINCT FROM blocked.objsubid
           AND blocking.pid <> blocked.pid
         JOIN pg_stat_activity blocking_sa ON blocking_sa.pid = blocking.pid
         WHERE NOT blocked.granted
         ORDER BY blocked_for_seconds DESC`
      );
      return { blockedCount: res.rows.length, blocks: res.rows };
    }

    if (name === "pg_table_sizes") {
      const schema = args.schema ?? "public";
      const res = await pool.query(
        `SELECT n.nspname AS schema, c.relname AS table_name,
                pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
                pg_size_pretty(pg_relation_size(c.oid)) AS table_size,
                pg_size_pretty(pg_indexes_size(c.oid)) AS indexes_size,
                pg_total_relation_size(c.oid) AS total_bytes
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = $1 AND c.relkind = 'r'
         ORDER BY pg_total_relation_size(c.oid) DESC`,
        [schema]
      );
      return { schema, tables: res.rows };
    }

    if (name === "pg_database_size") {
      const res = await pool.query(
        `SELECT current_database() AS database,
                pg_size_pretty(pg_database_size(current_database())) AS size,
                pg_database_size(current_database()) AS size_bytes`
      );
      return res.rows[0];
    }

    if (name === "pg_table_health") {
      const schema = args.schema ?? "public";
      const res = await pool.query(
        `SELECT schemaname AS schema, relname AS table_name,
                n_live_tup AS live_rows, n_dead_tup AS dead_rows,
                CASE WHEN (n_live_tup + n_dead_tup) > 0
                     THEN ROUND(100.0 * n_dead_tup / (n_live_tup + n_dead_tup), 2) ELSE 0
                END AS dead_row_pct,
                last_vacuum, last_autovacuum, last_analyze, last_autoanalyze,
                seq_scan, idx_scan
         FROM pg_stat_user_tables WHERE schemaname = $1
         ORDER BY n_dead_tup DESC`,
        [schema]
      );
      return { schema, tables: res.rows };
    }

    if (name === "pg_index_usage") {
      const schema = args.schema ?? "public";
      const res = await pool.query(
        `SELECT schemaname AS schema, relname AS table_name, indexrelname AS index_name,
                idx_scan AS scans, idx_tup_read AS tuples_read, idx_tup_fetch AS tuples_fetched,
                pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
         FROM pg_stat_user_indexes WHERE schemaname = $1
         ORDER BY idx_scan ASC`,
        [schema]
      );
      return { schema, indexes: res.rows };
    }

    if (name === "pg_slow_queries") {
      try {
        await pool.query("SELECT 1 FROM pg_stat_statements LIMIT 1");
      } catch {
        throw new Error(
          "pg_stat_statements extension is not enabled on this database. " +
          "Enable it with: CREATE EXTENSION pg_stat_statements; and add 'pg_stat_statements' to shared_preload_libraries in postgresql.conf, then restart PostgreSQL."
        );
      }
      const limit = Math.min(parseInt(args.limit ?? "20") || 20, 100);
      const res = await pool.query(
        `SELECT LEFT(query, 400) AS query, calls,
                ROUND(total_exec_time::numeric, 2) AS total_ms,
                ROUND(mean_exec_time::numeric, 2) AS mean_ms,
                ROUND(min_exec_time::numeric, 2) AS min_ms,
                ROUND(max_exec_time::numeric, 2) AS max_ms,
                rows
         FROM pg_stat_statements
         WHERE query NOT LIKE '%pg_stat_statements%'
         ORDER BY mean_exec_time DESC LIMIT $1`,
        [limit]
      );
      return { topSlowQueries: res.rows };
    }

    if (name === "pg_replication_lag") {
      const res = await pool.query(
        `SELECT client_addr::text AS replica_address, state,
                sent_lsn::text, write_lsn::text, flush_lsn::text, replay_lsn::text,
                write_lag, flush_lag, replay_lag, sync_state
         FROM pg_stat_replication ORDER BY client_addr NULLS LAST`
      );
      if (res.rows.length === 0) {
        return { message: "No active replication connections found. This may not be a primary server, or no standbys are currently connected.", replicas: [] };
      }
      return { replicaCount: res.rows.length, replicas: res.rows };
    }

    if (name === "pg_terminate_connection") {
      const pid = parseInt(args.pid ?? "");
      if (isNaN(pid) || pid <= 0) throw new Error("pid must be a positive integer.");
      const res = await pool.query("SELECT pg_terminate_backend($1) AS terminated", [pid]);
      const terminated = (res.rows[0] as any)?.terminated;
      return {
        pid,
        terminated,
        message: terminated
          ? `Connection PID ${pid} terminated successfully.`
          : `Could not terminate PID ${pid}. It may have already ended or you may lack permission.`,
      };
    }

    if (name === "pg_vacuum") {
      if (!args.table) throw new Error("table is required.");
      const schema = safeId(args.schema ?? "public", "schema");
      const table = safeId(args.table, "table");
      const analyze = args.analyze !== "false";
      const sql = `VACUUM ${analyze ? "ANALYZE " : ""}"${schema}"."${table}"`;
      await pool.query(sql);
      return { message: `VACUUM${analyze ? " ANALYZE" : ""} completed on "${schema}"."${table}".` };
    }

    // ── Phase 4: DDL / Write Operations (all require prior request_approval) ─

    if (name === "pg_upsert") {
      if (!args.table) throw new Error("table is required.");
      if (!args.data) throw new Error("data (JSON object of column→value) is required.");
      if (!args.conflict_columns) throw new Error("conflict_columns (comma-separated column names) is required.");
      const schema = safeId(args.schema ?? "public", "schema");
      const table = safeId(args.table, "table");
      const data: Record<string, unknown> = JSON.parse(args.data);
      const conflictCols = args.conflict_columns.split(",").map((c: string) => safeId(c.trim(), "conflict column"));
      const allCols = Object.keys(data).map((k: string) => safeId(k, "column"));
      const values = Object.values(data);
      const placeholders = values.map((_: unknown, i: number) => `$${i + 1}`).join(", ");
      const conflictDef = conflictCols.map((c: string) => `"${c}"`).join(", ");
      const updateCols = allCols.filter((c: string) => !conflictCols.includes(c));
      let sql = `INSERT INTO "${schema}"."${table}" (${allCols.map((c: string) => `"${c}"`).join(", ")}) VALUES (${placeholders})`;
      if (updateCols.length > 0) {
        const updates = updateCols.map((c: string) => `"${c}" = EXCLUDED."${c}"`).join(", ");
        sql += ` ON CONFLICT (${conflictDef}) DO UPDATE SET ${updates}`;
      } else {
        sql += ` ON CONFLICT (${conflictDef}) DO NOTHING`;
      }
      sql += " RETURNING *";
      const res = await pool.query(sql, values);
      return { rowCount: res.rowCount ?? 0, rows: res.rows };
    }

    if (name === "pg_bulk_insert") {
      if (!args.table) throw new Error("table is required.");
      if (!args.rows) throw new Error("rows (JSON array of objects) is required.");
      const schema = safeId(args.schema ?? "public", "schema");
      const table = safeId(args.table, "table");
      const rows: Record<string, unknown>[] = JSON.parse(args.rows);
      if (!Array.isArray(rows) || rows.length === 0) throw new Error("rows must be a non-empty JSON array of objects.");
      if (rows.length > 1000) throw new Error("Maximum 1000 rows per bulk insert call.");
      const colNames = Object.keys(rows[0]).map((k: string) => safeId(k, "column"));
      const values: unknown[] = [];
      const rowPlaceholders = rows.map((row: Record<string, unknown>) => {
        return "(" + colNames.map((col: string) => {
          values.push(row[col]);
          return `$${values.length}`;
        }).join(", ") + ")";
      });
      const sql = `INSERT INTO "${schema}"."${table}" (${colNames.map((c: string) => `"${c}"`).join(", ")}) VALUES ${rowPlaceholders.join(", ")}`;
      const res = await pool.query(sql, values);
      return { rowCount: res.rowCount ?? 0, message: `Inserted ${res.rowCount ?? 0} rows into "${schema}"."${table}".` };
    }

    if (name === "pg_truncate") {
      if (!args.table) throw new Error("table is required.");
      const schema = safeId(args.schema ?? "public", "schema");
      const table = safeId(args.table, "table");
      const cascade = args.cascade === "true" ? " CASCADE" : "";
      const restartIdentity = args.restart_identity === "true" ? " RESTART IDENTITY" : "";
      await pool.query(`TRUNCATE TABLE "${schema}"."${table}"${restartIdentity}${cascade}`);
      return { message: `Table "${schema}"."${table}" truncated.${restartIdentity}${cascade}` };
    }

    if (name === "pg_create_table") {
      if (!args.table) throw new Error("table is required.");
      if (!args.columns) throw new Error("columns (JSON array of column definitions) is required.");
      const schema = safeId(args.schema ?? "public", "schema");
      const table = safeId(args.table, "table");
      const columns: Array<{ name: string; type: string; nullable?: boolean; default?: string; primaryKey?: boolean }> = JSON.parse(args.columns);
      if (!Array.isArray(columns) || columns.length === 0) throw new Error("columns must be a non-empty JSON array.");
      const pkCols = columns.filter((c) => c.primaryKey).map((c) => `"${safeId(c.name, "column")}"`);
      const colDefs = columns.map((c) => {
        const colName = safeId(c.name, "column name");
        let def = `"${colName}" ${c.type}`;
        if (c.nullable === false) def += " NOT NULL";
        if (c.default !== undefined) def += ` DEFAULT ${c.default}`;
        return def;
      });
      if (pkCols.length > 0) colDefs.push(`PRIMARY KEY (${pkCols.join(", ")})`);
      const ifNotExists = args.if_not_exists !== "false" ? "IF NOT EXISTS " : "";
      const sql = `CREATE TABLE ${ifNotExists}"${schema}"."${table}" (${colDefs.join(", ")})`;
      await pool.query(sql);
      return { message: `Table "${schema}"."${table}" created.`, sql };
    }

    if (name === "pg_drop_table") {
      if (!args.table) throw new Error("table is required.");
      const schema = safeId(args.schema ?? "public", "schema");
      const table = safeId(args.table, "table");
      const cascade = args.cascade === "true" ? " CASCADE" : "";
      const ifExists = args.if_exists !== "false" ? "IF EXISTS " : "";
      await pool.query(`DROP TABLE ${ifExists}"${schema}"."${table}"${cascade}`);
      return { message: `Table "${schema}"."${table}" dropped.${cascade}` };
    }

    if (name === "pg_alter_table") {
      if (!args.table) throw new Error("table is required.");
      if (!args.operation) throw new Error("operation is required: add_column | drop_column | rename_column | rename_table | set_column_default | drop_column_default | set_not_null | drop_not_null");
      const schema = safeId(args.schema ?? "public", "schema");
      const table = safeId(args.table, "table");
      const op = args.operation;
      let sql: string;
      if (op === "add_column") {
        if (!args.column) throw new Error("column is required for add_column.");
        if (!args.type) throw new Error("type is required for add_column.");
        const col = safeId(args.column, "column");
        let colDef = `"${col}" ${args.type}`;
        if (args.nullable === "false") colDef += " NOT NULL";
        if (args.default) colDef += ` DEFAULT ${args.default}`;
        sql = `ALTER TABLE "${schema}"."${table}" ADD COLUMN ${colDef}`;
      } else if (op === "drop_column") {
        if (!args.column) throw new Error("column is required for drop_column.");
        const col = safeId(args.column, "column");
        sql = `ALTER TABLE "${schema}"."${table}" DROP COLUMN "${col}"${args.cascade === "true" ? " CASCADE" : ""}`;
      } else if (op === "rename_column") {
        if (!args.column || !args.new_name) throw new Error("column and new_name are required for rename_column.");
        sql = `ALTER TABLE "${schema}"."${table}" RENAME COLUMN "${safeId(args.column, "column")}" TO "${safeId(args.new_name, "new_name")}"`;
      } else if (op === "rename_table") {
        if (!args.new_name) throw new Error("new_name is required for rename_table.");
        sql = `ALTER TABLE "${schema}"."${table}" RENAME TO "${safeId(args.new_name, "new_name")}"`;
      } else if (op === "set_column_default") {
        if (!args.column || !args.default) throw new Error("column and default are required for set_column_default.");
        sql = `ALTER TABLE "${schema}"."${table}" ALTER COLUMN "${safeId(args.column, "column")}" SET DEFAULT ${args.default}`;
      } else if (op === "drop_column_default") {
        if (!args.column) throw new Error("column is required for drop_column_default.");
        sql = `ALTER TABLE "${schema}"."${table}" ALTER COLUMN "${safeId(args.column, "column")}" DROP DEFAULT`;
      } else if (op === "set_not_null") {
        if (!args.column) throw new Error("column is required for set_not_null.");
        sql = `ALTER TABLE "${schema}"."${table}" ALTER COLUMN "${safeId(args.column, "column")}" SET NOT NULL`;
      } else if (op === "drop_not_null") {
        if (!args.column) throw new Error("column is required for drop_not_null.");
        sql = `ALTER TABLE "${schema}"."${table}" ALTER COLUMN "${safeId(args.column, "column")}" DROP NOT NULL`;
      } else {
        throw new Error(`Unknown operation "${op}". Supported: add_column | drop_column | rename_column | rename_table | set_column_default | drop_column_default | set_not_null | drop_not_null`);
      }
      await pool.query(sql);
      return { message: `ALTER TABLE completed: ${op} on "${schema}"."${table}".`, sql };
    }

    if (name === "pg_create_index") {
      if (!args.table) throw new Error("table is required.");
      if (!args.columns) throw new Error("columns (comma-separated) is required.");
      const schema = safeId(args.schema ?? "public", "schema");
      const table = safeId(args.table, "table");
      const unique = args.unique === "true" ? "UNIQUE " : "";
      const concurrently = args.concurrently !== "false" ? "CONCURRENTLY " : "";
      const colList = args.columns.split(",").map((c: string) => `"${safeId(c.trim(), "column")}"`).join(", ");
      const method = args.method ? safeId(args.method.toLowerCase(), "index method") : "btree";
      const indexName = args.index_name
        ? safeId(args.index_name, "index_name")
        : `idx_${table}_${args.columns.replace(/,\s*/g, "_").replace(/\s+/g, "")}`;
      const ifNotExists = args.if_not_exists !== "false" ? "IF NOT EXISTS " : "";
      const sql = `CREATE ${unique}INDEX ${concurrently}${ifNotExists}"${indexName}" ON "${schema}"."${table}" USING ${method} (${colList})`;
      await pool.query(sql);
      return { message: `Index "${indexName}" created on "${schema}"."${table}".`, sql };
    }

    if (name === "pg_drop_index") {
      if (!args.index_name) throw new Error("index_name is required.");
      const indexName = safeId(args.index_name, "index_name");
      const schemaPrefix = args.schema ? `"${safeId(args.schema, "schema")}".` : "";
      const cascade = args.cascade === "true" ? " CASCADE" : "";
      // PostgreSQL does not allow DROP INDEX CONCURRENTLY with CASCADE — disable CONCURRENTLY when cascade is requested
      const concurrently = (args.concurrently !== "false" && !cascade) ? "CONCURRENTLY " : "";
      const ifExists = args.if_exists !== "false" ? "IF EXISTS " : "";
      const sql = `DROP INDEX ${concurrently}${ifExists}${schemaPrefix}"${indexName}"${cascade}`;
      await pool.query(sql);
      return { message: `Index "${indexName}" dropped.${cascade ? " (CASCADE)" : ""}${concurrently ? " (CONCURRENTLY)" : ""}` };
    }

    if (name === "pg_refresh_matview") {
      if (!args.view) throw new Error("view is required.");
      const schema = safeId(args.schema ?? "public", "schema");
      const view = safeId(args.view, "view");
      const concurrently = args.concurrently === "true" ? "CONCURRENTLY " : "";
      const sql = `REFRESH MATERIALIZED VIEW ${concurrently}"${schema}"."${view}"`;
      await pool.query(sql);
      return { message: `Materialized view "${schema}"."${view}" refreshed.${concurrently ? " (CONCURRENTLY)" : ""}` };
    }

    if (name === "pg_transaction") {
      if (!args.statements) throw new Error("statements (JSON array of SQL strings) is required.");
      const statements: string[] = JSON.parse(args.statements);
      if (!Array.isArray(statements) || statements.length === 0) throw new Error("statements must be a non-empty JSON array of SQL strings.");
      if (statements.length > 50) throw new Error("Maximum 50 statements per transaction.");
      const client = await pool.connect();
      const results: Array<{ index: number; statement: string; command: string; rowCount: number }> = [];
      try {
        await client.query("BEGIN");
        for (let i = 0; i < statements.length; i++) {
          const res = await client.query(statements[i]);
          results.push({ index: i + 1, statement: statements[i].substring(0, 100), command: res.command ?? "", rowCount: res.rowCount ?? 0 });
        }
        await client.query("COMMIT");
        return { status: "committed", statementCount: statements.length, results };
      } catch (err: any) {
        try { await client.query("ROLLBACK"); } catch {}
        return {
          status: "rolled_back",
          failedAtStatement: results.length + 1,
          error: err.message,
          executedBefore: results,
          failedSql: statements[results.length]?.substring(0, 200),
        };
      } finally {
        client.release();
      }
    }

    // ── Phase 5: Advanced Features ──────────────────────────────────────────

    if (name === "pg_vector_search") {
      if (!args.table || !args.column || !args.query_vector) throw new Error("table, column, and query_vector are required.");
      const schema = safeId(args.schema ?? "public", "schema");
      const table = safeId(args.table, "table");
      const column = safeId(args.column, "column");
      const queryVector: number[] = JSON.parse(args.query_vector);
      if (!Array.isArray(queryVector) || queryVector.some((v) => typeof v !== "number")) {
        throw new Error("query_vector must be a JSON array of numbers.");
      }
      const limit = Math.min(parseInt(args.limit ?? "10") || 10, 100);
      const operator = args.operator === "inner_product" ? "<#>" : args.operator === "l2" ? "<->" : "<=>";
      const vectorLiteral = `[${queryVector.join(",")}]`;
      const res = await pool.query(
        `SELECT *, ("${column}" ${operator} $1::vector) AS distance
         FROM "${schema}"."${table}"
         ORDER BY "${column}" ${operator} $1::vector
         LIMIT $2`,
        [vectorLiteral, limit]
      );
      return { rowCount: res.rows.length, operator, rows: res.rows };
    }

    if (name === "pg_fulltext_search") {
      if (!args.table || !args.column || !args.query) throw new Error("table, column, and query are required.");
      const schema = safeId(args.schema ?? "public", "schema");
      const table = safeId(args.table, "table");
      const column = safeId(args.column, "column");
      const limit = Math.min(parseInt(args.limit ?? "20") || 20, 500);
      const language = args.language ?? "english";
      // Detect if column is tsvector or text
      const typeRes = await pool.query(
        `SELECT data_type FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name=$3`,
        [schema, args.table, args.column]
      );
      const colType = (typeRes.rows[0] as any)?.data_type ?? "text";
      let sql: string;
      if (colType === "tsvector") {
        sql = `SELECT *, ts_rank("${column}", plainto_tsquery($1, $2)) AS rank
               FROM "${schema}"."${table}"
               WHERE "${column}" @@ plainto_tsquery($1, $2)
               ORDER BY rank DESC LIMIT ${limit}`;
      } else {
        sql = `SELECT *, ts_rank(to_tsvector($1, "${column}"::text), plainto_tsquery($1, $2)) AS rank
               FROM "${schema}"."${table}"
               WHERE to_tsvector($1, "${column}"::text) @@ plainto_tsquery($1, $2)
               ORDER BY rank DESC LIMIT ${limit}`;
      }
      const res = await pool.query(sql, [language, args.query]);
      return { rowCount: res.rows.length, language, columnType: colType, rows: res.rows };
    }

    if (name === "pg_notify") {
      if (!args.channel) throw new Error("channel is required.");
      const payload = args.payload ?? "";
      await pool.query("SELECT pg_notify($1, $2)", [args.channel, payload]);
      return { message: `Notification sent to channel "${args.channel}".`, channel: args.channel, payload };
    }

    if (name === "pg_list_partitions") {
      if (!args.table) throw new Error("table is required.");
      const schema = safeId(args.schema ?? "public", "schema");
      const table = safeId(args.table, "table");
      const res = await pool.query(
        `SELECT n.nspname AS schema, child.relname AS partition_name,
                pg_size_pretty(pg_relation_size(child.oid)) AS size,
                pg_get_expr(child.relpartbound, child.oid) AS partition_bound
         FROM pg_class parent
         JOIN pg_namespace n ON n.oid = parent.relnamespace
         JOIN pg_inherits i ON i.inhparent = parent.oid
         JOIN pg_class child ON child.oid = i.inhrelid
         WHERE parent.relname = $1 AND n.nspname = $2
         ORDER BY child.relname`,
        [table, schema]
      );
      return { parentTable: `${schema}.${table}`, partitionCount: res.rows.length, partitions: res.rows };
    }

    if (name === "pg_list_policies") {
      const schema = args.schema ?? "public";
      const params: unknown[] = [schema];
      let sql = `
        SELECT schemaname AS schema, tablename AS table_name, policyname AS policy_name,
               roles, cmd AS command, qual AS using_expr, with_check AS check_expr, permissive
        FROM pg_policies WHERE schemaname = $1`;
      if (args.table) {
        params.push(args.table);
        sql += ` AND tablename = $${params.length}`;
      }
      sql += ` ORDER BY tablename, policyname`;
      const res = await pool.query(sql, params);
      return { schema, policyCount: res.rows.length, policies: res.rows };
    }

    if (name === "pg_list_replication_slots") {
      const res = await pool.query(
        `SELECT slot_name, plugin, slot_type, database, active, active_pid,
                xmin::text, catalog_xmin::text, restart_lsn::text, confirmed_flush_lsn::text,
                pg_size_pretty(
                  CASE WHEN restart_lsn IS NOT NULL
                  THEN pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)
                  ELSE 0 END
                ) AS replication_lag_size
         FROM pg_replication_slots ORDER BY slot_name`
      );
      return { slotCount: res.rows.length, slots: res.rows };
    }

    throw new Error(`Unknown PostgreSQL tool: ${name}`);
  } finally {
    await pool.end();
  }
}

export async function retrieveRAGFlowContext(
  question: string,
  creds: RAGFlowCredentials,
): Promise<Array<{ content: string; documentName: string; score: number }>> {
  assertSafeUrl(creds.baseUrl);
  const base = creds.baseUrl.replace(/\/$/, "");
  const headers = { Authorization: `Bearer ${creds.apiKey}`, "Content-Type": "application/json" };

  const listRes = await fetch(`${base}/api/v1/datasets?page=1&page_size=50`, { headers });
  if (!listRes.ok) return [];
  const listData = await listRes.json() as any;
  const datasets: string[] = (listData?.data?.docs ?? listData?.data ?? []).map((d: any) => d.id).filter(Boolean);
  if (datasets.length === 0) return [];

  const body = { question, dataset_ids: datasets, top_k: 6 };
  const res = await fetch(`${base}/api/v1/retrieval`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) return [];
  const data = await res.json() as any;
  return extractRAGFlowChunks(data);
}

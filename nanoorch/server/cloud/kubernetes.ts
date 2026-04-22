import * as https from "https";
import * as http from "http";

export interface KubernetesCredentials {
  apiServer?: string;
  bearerToken?: string;
  caCertBase64?: string;
  insecureSkipTlsVerify?: string;
  kubeconfigJson?: string;
  defaultNamespace?: string;
}

interface ParsedKubeConfig {
  server: string;
  token: string;
  ca?: string;
  skipTls: boolean;
  ns: string;
}

function parseKubeConfig(creds: KubernetesCredentials): ParsedKubeConfig {
  if (creds.kubeconfigJson?.trim()) {
    try {
      const kc = JSON.parse(creds.kubeconfigJson);
      const ctxName: string = kc["current-context"] ?? "";
      const ctxObj = (kc.contexts ?? []).find((c: any) => c.name === ctxName)?.context ?? {};
      const cluster = (kc.clusters ?? []).find((c: any) => c.name === ctxObj.cluster)?.cluster ?? {};
      const user = (kc.users ?? []).find((u: any) => u.name === ctxObj.user)?.user ?? {};
      return {
        server: (cluster.server ?? "").replace(/\/$/, ""),
        token: user.token ?? user["token-data"] ?? "",
        ca: cluster["certificate-authority-data"],
        skipTls: cluster["insecure-skip-tls-verify"] === true,
        ns: ctxObj.namespace ?? creds.defaultNamespace ?? "default",
      };
    } catch (e: any) {
      throw new Error(`Invalid kubeconfig JSON: ${e.message}`);
    }
  }
  return {
    server: (creds.apiServer ?? "").replace(/\/$/, ""),
    token: creds.bearerToken ?? "",
    ca: creds.caCertBase64,
    skipTls: creds.insecureSkipTlsVerify === "true",
    ns: creds.defaultNamespace ?? "default",
  };
}

async function kubeReq(
  creds: KubernetesCredentials,
  method: string,
  path: string,
  body?: unknown,
  contentType = "application/json",
  raw = false,
): Promise<any> {
  const cfg = parseKubeConfig(creds);
  if (!cfg.server) throw new Error("Kubernetes API server URL not configured. Set apiServer or kubeconfigJson.");

  const fullUrl = `${cfg.server}${path}`;
  const headers: Record<string, string> = {
    Accept: raw ? "text/plain" : "application/json",
    "Content-Type": contentType,
  };
  if (cfg.token) headers["Authorization"] = `Bearer ${cfg.token}`;

  const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;
  if (bodyStr) headers["Content-Length"] = String(Buffer.byteLength(bodyStr));

  return new Promise<any>((resolve, reject) => {
    const agentOpts: https.AgentOptions = { rejectUnauthorized: !cfg.skipTls };
    if (cfg.ca) agentOpts.ca = Buffer.from(cfg.ca, "base64").toString("utf-8");

    const isHttps = fullUrl.startsWith("https://");
    const agent = isHttps ? new https.Agent(agentOpts) : undefined;
    const opts: http.RequestOptions = { method, headers, ...(agent ? { agent } : {}) };

    const lib: typeof http = isHttps ? (https as unknown as typeof http) : http;
    const req = lib.request(fullUrl, opts, (res: http.IncomingMessage) => {
      let buf = "";
      res.on("data", (c: Buffer | string) => { buf += c; });
      res.on("end", () => {
        const status = res.statusCode ?? 0;
        if (raw) {
          if (status >= 400) {
            reject(new Error(`HTTP ${status}: ${buf.slice(0, 300)}`));
          } else {
            resolve(buf);
          }
          return;
        }
        if (!buf.trim()) { resolve(null); return; }
        try {
          const obj = JSON.parse(buf);
          if (status >= 400) {
            reject(new Error(obj.message ?? obj.reason ?? `HTTP ${status}`));
          } else {
            resolve(obj);
          }
        } catch {
          reject(new Error(`Non-JSON Kubernetes response (HTTP ${status}): ${buf.slice(0, 300)}`));
        }
      });
    });
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function age(createdAt: string): string {
  const diff = Date.now() - new Date(createdAt).getTime();
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (d > 0) return `${d}d${h}h`;
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
}

function ok(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function podSummary(p: any) {
  const container = p.spec?.containers?.[0];
  const phase = p.status?.phase ?? "Unknown";
  const ready = (p.status?.containerStatuses ?? []).filter((c: any) => c.ready).length;
  const total = (p.status?.containerStatuses ?? []).length;
  const restarts = (p.status?.containerStatuses ?? []).reduce((sum: number, c: any) => sum + (c.restartCount ?? 0), 0);
  return {
    name: p.metadata.name,
    namespace: p.metadata.namespace,
    status: phase,
    ready: `${ready}/${total || "?"}`,
    restarts,
    ip: p.status?.podIP,
    node: p.spec?.nodeName,
    image: container?.image,
    age: p.metadata.creationTimestamp ? age(p.metadata.creationTimestamp) : "?",
  };
}

function deploymentSummary(d: any) {
  return {
    name: d.metadata.name,
    namespace: d.metadata.namespace,
    desired: d.spec?.replicas ?? 0,
    ready: d.status?.readyReplicas ?? 0,
    available: d.status?.availableReplicas ?? 0,
    updated: d.status?.updatedReplicas ?? 0,
    image: d.spec?.template?.spec?.containers?.[0]?.image,
    age: d.metadata.creationTimestamp ? age(d.metadata.creationTimestamp) : "?",
  };
}

const NAMESPACED_RESOURCES: Record<string, { group: string; plural: string }> = {
  pod: { group: "/api/v1", plural: "pods" },
  service: { group: "/api/v1", plural: "services" },
  configmap: { group: "/api/v1", plural: "configmaps" },
  secret: { group: "/api/v1", plural: "secrets" },
  serviceaccount: { group: "/api/v1", plural: "serviceaccounts" },
  persistentvolumeclaim: { group: "/api/v1", plural: "persistentvolumeclaims" },
  deployment: { group: "/apis/apps/v1", plural: "deployments" },
  statefulset: { group: "/apis/apps/v1", plural: "statefulsets" },
  daemonset: { group: "/apis/apps/v1", plural: "daemonsets" },
  replicaset: { group: "/apis/apps/v1", plural: "replicasets" },
  job: { group: "/apis/batch/v1", plural: "jobs" },
  cronjob: { group: "/apis/batch/v1", plural: "cronjobs" },
  ingress: { group: "/apis/networking.k8s.io/v1", plural: "ingresses" },
  horizontalpodautoscaler: { group: "/apis/autoscaling/v2", plural: "horizontalpodautoscalers" },
  resourcequota: { group: "/api/v1", plural: "resourcequotas" },
};

const CLUSTER_RESOURCES: Record<string, { group: string; plural: string }> = {
  node: { group: "/api/v1", plural: "nodes" },
  namespace: { group: "/api/v1", plural: "namespaces" },
  persistentvolume: { group: "/api/v1", plural: "persistentvolumes" },
  storageclass: { group: "/apis/storage.k8s.io/v1", plural: "storageclasses" },
};

function resolveResourcePath(kindLower: string, resourceNs: string): string | null {
  const ns = NAMESPACED_RESOURCES[kindLower];
  if (ns) return `${ns.group}/namespaces/${resourceNs}/${ns.plural}`;
  const cl = CLUSTER_RESOURCES[kindLower];
  if (cl) return `${cl.group}/${cl.plural}`;
  return null;
}

async function applyResource(
  creds: KubernetesCredentials,
  kindLower: string,
  ns: string,
  name: string,
  body: unknown,
): Promise<string> {
  const basePath = resolveResourcePath(kindLower, ns);
  if (!basePath) throw new Error(`Unsupported kind "${kindLower}" — use kube_apply_manifest instead`);

  let existingVersion: string | undefined;
  try {
    const existing = await kubeReq(creds, "GET", `${basePath}/${name}`);
    existingVersion = existing?.metadata?.resourceVersion;
  } catch { /* resource doesn't exist */ }

  const manifest = body as any;
  if (existingVersion) {
    if (!manifest.metadata) manifest.metadata = {};
    manifest.metadata.resourceVersion = existingVersion;
    await kubeReq(creds, "PUT", `${basePath}/${name}`, manifest);
    return JSON.stringify({ applied: name, namespace: ns, action: "updated" });
  } else {
    const nsBasePath = NAMESPACED_RESOURCES[kindLower]
      ? `${NAMESPACED_RESOURCES[kindLower].group}/namespaces/${ns}/${NAMESPACED_RESOURCES[kindLower].plural}`
      : `${CLUSTER_RESOURCES[kindLower].group}/${CLUSTER_RESOURCES[kindLower].plural}`;
    await kubeReq(creds, "POST", nsBasePath, manifest);
    return JSON.stringify({ applied: name, namespace: ns, action: "created" });
  }
}

export async function executeKubernetesTool(
  creds: KubernetesCredentials,
  toolName: string,
  args: Record<string, string>,
): Promise<string> {
  const cfg = parseKubeConfig(creds);
  const ns = args.namespace ?? cfg.ns;
  const allNs = args.allNamespaces === "true";

  try {
    // ── Cluster ────────────────────────────────────────────────────────────────
    if (toolName === "kube_get_cluster_info") {
      const [version, apis] = await Promise.all([
        kubeReq(creds, "GET", "/version"),
        kubeReq(creds, "GET", "/apis"),
      ]);
      return ok({
        serverVersion: version,
        apiGroups: (apis?.groups ?? []).map((g: any) => `${g.name} (${g.preferredVersion?.version})`),
      });
    }

    if (toolName === "kube_list_nodes") {
      const res = await kubeReq(creds, "GET", "/api/v1/nodes");
      return ok((res.items ?? []).map((n: any) => ({
        name: n.metadata.name,
        status: n.status?.conditions?.find((c: any) => c.type === "Ready")?.status === "True" ? "Ready" : "NotReady",
        roles: Object.keys(n.metadata.labels ?? {})
          .filter((k) => k.startsWith("node-role.kubernetes.io/"))
          .map((k) => k.split("/")[1])
          .join(", ") || "worker",
        version: n.status?.nodeInfo?.kubeletVersion,
        os: n.status?.nodeInfo?.operatingSystem,
        cpu: n.status?.capacity?.cpu,
        memory: n.status?.capacity?.memory,
        age: n.metadata.creationTimestamp ? age(n.metadata.creationTimestamp) : "?",
      })));
    }

    if (toolName === "kube_list_namespaces") {
      const res = await kubeReq(creds, "GET", "/api/v1/namespaces");
      return ok((res.items ?? []).map((n: any) => ({
        name: n.metadata.name,
        status: n.status?.phase,
        age: n.metadata.creationTimestamp ? age(n.metadata.creationTimestamp) : "?",
      })));
    }

    if (toolName === "kube_list_api_resources") {
      const res = await kubeReq(creds, "GET", "/api/v1");
      return ok((res.resources ?? []).map((r: any) => ({
        name: r.name,
        kind: r.kind,
        namespaced: r.namespaced,
        verbs: r.verbs,
      })));
    }

    if (toolName === "kube_list_events") {
      const path = allNs ? "/api/v1/events" : `/api/v1/namespaces/${ns}/events`;
      const res = await kubeReq(creds, "GET", path);
      return ok((res.items ?? []).slice(-50).map((e: any) => ({
        type: e.type,
        reason: e.reason,
        regarding: `${e.involvedObject?.kind}/${e.involvedObject?.name}`,
        message: e.message,
        count: e.count,
        namespace: e.metadata.namespace,
        lastSeen: e.lastTimestamp ?? e.eventTime,
      })));
    }

    // ── Workloads ──────────────────────────────────────────────────────────────
    if (toolName === "kube_list_pods") {
      const qs = args.labelSelector ? `?labelSelector=${encodeURIComponent(args.labelSelector)}` : "";
      const path = allNs ? `/api/v1/pods${qs}` : `/api/v1/namespaces/${ns}/pods${qs}`;
      const res = await kubeReq(creds, "GET", path);
      return ok((res.items ?? []).map(podSummary));
    }

    if (toolName === "kube_get_pod") {
      const res = await kubeReq(creds, "GET", `/api/v1/namespaces/${ns}/pods/${args.name}`);
      return ok({
        ...podSummary(res),
        containers: (res.spec?.containers ?? []).map((c: any) => ({
          name: c.name,
          image: c.image,
          ports: c.ports,
          resources: c.resources,
        })),
        conditions: res.status?.conditions,
      });
    }

    if (toolName === "kube_get_pod_logs") {
      const tail = args.tailLines ? `tailLines=${args.tailLines}` : "tailLines=100";
      const container = args.container ? `&container=${encodeURIComponent(args.container)}` : "";
      const logs = await kubeReq(creds, "GET", `/api/v1/namespaces/${ns}/pods/${args.name}/log?${tail}${container}`, undefined, "text/plain", true);
      return JSON.stringify({ pod: args.name, namespace: ns, logs: String(logs) });
    }

    if (toolName === "kube_delete_pod") {
      await kubeReq(creds, "DELETE", `/api/v1/namespaces/${ns}/pods/${args.name}`);
      return JSON.stringify({ deleted: args.name, namespace: ns });
    }

    if (toolName === "kube_list_deployments") {
      const path = allNs ? "/apis/apps/v1/deployments" : `/apis/apps/v1/namespaces/${ns}/deployments`;
      const res = await kubeReq(creds, "GET", path);
      return ok((res.items ?? []).map(deploymentSummary));
    }

    if (toolName === "kube_get_deployment") {
      const res = await kubeReq(creds, "GET", `/apis/apps/v1/namespaces/${ns}/deployments/${args.name}`);
      return ok({
        ...deploymentSummary(res),
        strategy: res.spec?.strategy,
        conditions: res.status?.conditions,
        selector: res.spec?.selector,
      });
    }

    if (toolName === "kube_scale_deployment") {
      const replicas = parseInt(args.replicas, 10);
      if (isNaN(replicas) || replicas < 0) throw new Error("replicas must be a non-negative integer");
      await kubeReq(
        creds, "PATCH",
        `/apis/apps/v1/namespaces/${ns}/deployments/${args.name}/scale`,
        { spec: { replicas } },
        "application/merge-patch+json",
      );
      return JSON.stringify({ scaled: args.name, namespace: ns, replicas });
    }

    if (toolName === "kube_rollout_restart") {
      const patch = { spec: { template: { metadata: { annotations: { "kubectl.kubernetes.io/restartedAt": new Date().toISOString() } } } } };
      await kubeReq(creds, "PATCH", `/apis/apps/v1/namespaces/${ns}/deployments/${args.name}`, patch, "application/strategic-merge-patch+json");
      return JSON.stringify({ restarted: args.name, namespace: ns, at: new Date().toISOString() });
    }

    if (toolName === "kube_rollout_status") {
      const res = await kubeReq(creds, "GET", `/apis/apps/v1/namespaces/${ns}/deployments/${args.name}`);
      const desired = res.spec?.replicas ?? 0;
      const ready = res.status?.readyReplicas ?? 0;
      const available = res.status?.availableReplicas ?? 0;
      const updated = res.status?.updatedReplicas ?? 0;
      return ok({
        deployment: args.name,
        namespace: ns,
        desired,
        ready,
        available,
        updated,
        complete: ready === desired && updated === desired && available === desired,
        conditions: (res.status?.conditions ?? []).map((c: any) => ({
          type: c.type, status: c.status, reason: c.reason, message: c.message,
        })),
      });
    }

    if (toolName === "kube_list_replicasets") {
      const path = allNs ? "/apis/apps/v1/replicasets" : `/apis/apps/v1/namespaces/${ns}/replicasets`;
      const res = await kubeReq(creds, "GET", path);
      return ok((res.items ?? []).map((r: any) => ({
        name: r.metadata.name,
        namespace: r.metadata.namespace,
        desired: r.spec?.replicas ?? 0,
        ready: r.status?.readyReplicas ?? 0,
        owner: (r.metadata.ownerReferences ?? [])[0]?.name,
        age: r.metadata.creationTimestamp ? age(r.metadata.creationTimestamp) : "?",
      })));
    }

    if (toolName === "kube_list_statefulsets") {
      const path = allNs ? "/apis/apps/v1/statefulsets" : `/apis/apps/v1/namespaces/${ns}/statefulsets`;
      const res = await kubeReq(creds, "GET", path);
      return ok((res.items ?? []).map((s: any) => ({
        name: s.metadata.name,
        namespace: s.metadata.namespace,
        desired: s.spec?.replicas ?? 0,
        ready: s.status?.readyReplicas ?? 0,
        image: s.spec?.template?.spec?.containers?.[0]?.image,
        age: s.metadata.creationTimestamp ? age(s.metadata.creationTimestamp) : "?",
      })));
    }

    // ── Services & Networking ──────────────────────────────────────────────────
    if (toolName === "kube_list_services") {
      const path = allNs ? "/api/v1/services" : `/api/v1/namespaces/${ns}/services`;
      const res = await kubeReq(creds, "GET", path);
      return ok((res.items ?? []).map((s: any) => ({
        name: s.metadata.name,
        namespace: s.metadata.namespace,
        type: s.spec?.type,
        clusterIP: s.spec?.clusterIP,
        externalIP: s.status?.loadBalancer?.ingress?.[0]?.ip ?? s.status?.loadBalancer?.ingress?.[0]?.hostname,
        ports: (s.spec?.ports ?? []).map((p: any) => `${p.port}${p.targetPort ? `:${p.targetPort}` : ""}/${p.protocol}`).join(", "),
        age: s.metadata.creationTimestamp ? age(s.metadata.creationTimestamp) : "?",
      })));
    }

    if (toolName === "kube_get_service") {
      const res = await kubeReq(creds, "GET", `/api/v1/namespaces/${ns}/services/${args.name}`);
      return ok({
        name: res.metadata.name,
        namespace: res.metadata.namespace,
        type: res.spec?.type,
        clusterIP: res.spec?.clusterIP,
        selector: res.spec?.selector,
        ports: res.spec?.ports,
        externalIP: res.status?.loadBalancer?.ingress,
        age: res.metadata.creationTimestamp ? age(res.metadata.creationTimestamp) : "?",
      });
    }

    if (toolName === "kube_list_ingresses") {
      const path = allNs ? "/apis/networking.k8s.io/v1/ingresses" : `/apis/networking.k8s.io/v1/namespaces/${ns}/ingresses`;
      const res = await kubeReq(creds, "GET", path);
      return ok((res.items ?? []).map((i: any) => ({
        name: i.metadata.name,
        namespace: i.metadata.namespace,
        class: i.spec?.ingressClassName ?? i.metadata.annotations?.["kubernetes.io/ingress.class"],
        hosts: (i.spec?.rules ?? []).map((r: any) => r.host).filter(Boolean),
        tls: (i.spec?.tls ?? []).length > 0,
        age: i.metadata.creationTimestamp ? age(i.metadata.creationTimestamp) : "?",
      })));
    }

    if (toolName === "kube_get_ingress") {
      const res = await kubeReq(creds, "GET", `/apis/networking.k8s.io/v1/namespaces/${ns}/ingresses/${args.name}`);
      return ok({
        name: res.metadata.name,
        namespace: res.metadata.namespace,
        rules: res.spec?.rules,
        tls: res.spec?.tls,
        class: res.spec?.ingressClassName,
        status: res.status,
        age: res.metadata.creationTimestamp ? age(res.metadata.creationTimestamp) : "?",
      });
    }

    if (toolName === "kube_list_endpoints") {
      const path = allNs ? "/api/v1/endpoints" : `/api/v1/namespaces/${ns}/endpoints`;
      const res = await kubeReq(creds, "GET", path);
      return ok((res.items ?? []).map((e: any) => ({
        name: e.metadata.name,
        namespace: e.metadata.namespace,
        addresses: (e.subsets ?? []).flatMap((s: any) => (s.addresses ?? []).map((a: any) => a.ip)),
        ports: (e.subsets ?? []).flatMap((s: any) => s.ports ?? []).map((p: any) => `${p.port}/${p.protocol}`),
      })));
    }

    // ── Config & Secrets ───────────────────────────────────────────────────────
    if (toolName === "kube_list_configmaps") {
      const path = allNs ? "/api/v1/configmaps" : `/api/v1/namespaces/${ns}/configmaps`;
      const res = await kubeReq(creds, "GET", path);
      return ok((res.items ?? []).map((cm: any) => ({
        name: cm.metadata.name,
        namespace: cm.metadata.namespace,
        keys: Object.keys(cm.data ?? {}),
        age: cm.metadata.creationTimestamp ? age(cm.metadata.creationTimestamp) : "?",
      })));
    }

    if (toolName === "kube_get_configmap") {
      const res = await kubeReq(creds, "GET", `/api/v1/namespaces/${ns}/configmaps/${args.name}`);
      return ok({ name: res.metadata.name, namespace: res.metadata.namespace, data: res.data ?? {} });
    }

    if (toolName === "kube_apply_configmap") {
      let data: Record<string, string> = {};
      try { data = JSON.parse(args.data); } catch { throw new Error("data must be a valid JSON object of key-value string pairs"); }
      return applyResource(creds, "configmap", ns, args.name, {
        apiVersion: "v1", kind: "ConfigMap",
        metadata: { name: args.name, namespace: ns },
        data,
      });
    }

    if (toolName === "kube_list_secrets") {
      const path = allNs ? "/api/v1/secrets" : `/api/v1/namespaces/${ns}/secrets`;
      const res = await kubeReq(creds, "GET", path);
      return ok((res.items ?? []).map((s: any) => ({
        name: s.metadata.name,
        namespace: s.metadata.namespace,
        type: s.type,
        keys: Object.keys(s.data ?? {}),
        age: s.metadata.creationTimestamp ? age(s.metadata.creationTimestamp) : "?",
      })));
    }

    if (toolName === "kube_get_secret_keys") {
      const res = await kubeReq(creds, "GET", `/api/v1/namespaces/${ns}/secrets/${args.name}`);
      return ok({ name: res.metadata.name, namespace: res.metadata.namespace, type: res.type, keys: Object.keys(res.data ?? {}) });
    }

    if (toolName === "kube_apply_secret") {
      let rawData: Record<string, string> = {};
      try { rawData = JSON.parse(args.data); } catch { throw new Error("data must be a valid JSON object — values will be base64-encoded automatically"); }
      const encoded: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawData)) {
        encoded[k] = Buffer.from(v).toString("base64");
      }
      return applyResource(creds, "secret", ns, args.name, {
        apiVersion: "v1", kind: "Secret",
        metadata: { name: args.name, namespace: ns },
        type: args.secretType ?? "Opaque",
        data: encoded,
      });
    }

    // ── Storage ────────────────────────────────────────────────────────────────
    if (toolName === "kube_list_pvcs") {
      const path = allNs ? "/api/v1/persistentvolumeclaims" : `/api/v1/namespaces/${ns}/persistentvolumeclaims`;
      const res = await kubeReq(creds, "GET", path);
      return ok((res.items ?? []).map((p: any) => ({
        name: p.metadata.name,
        namespace: p.metadata.namespace,
        status: p.status?.phase,
        storageClass: p.spec?.storageClassName,
        capacity: p.status?.capacity?.storage,
        accessModes: p.spec?.accessModes,
        volumeName: p.spec?.volumeName,
        age: p.metadata.creationTimestamp ? age(p.metadata.creationTimestamp) : "?",
      })));
    }

    if (toolName === "kube_get_pvc") {
      const res = await kubeReq(creds, "GET", `/api/v1/namespaces/${ns}/persistentvolumeclaims/${args.name}`);
      return ok({
        name: res.metadata.name,
        namespace: res.metadata.namespace,
        status: res.status?.phase,
        storageClass: res.spec?.storageClassName,
        capacity: res.status?.capacity?.storage,
        accessModes: res.spec?.accessModes,
        volumeName: res.spec?.volumeName,
        age: res.metadata.creationTimestamp ? age(res.metadata.creationTimestamp) : "?",
      });
    }

    if (toolName === "kube_list_pvs") {
      const res = await kubeReq(creds, "GET", "/api/v1/persistentvolumes");
      return ok((res.items ?? []).map((p: any) => ({
        name: p.metadata.name,
        status: p.status?.phase,
        capacity: p.spec?.capacity?.storage,
        accessModes: p.spec?.accessModes,
        reclaimPolicy: p.spec?.persistentVolumeReclaimPolicy,
        storageClass: p.spec?.storageClassName,
        claimRef: p.spec?.claimRef ? `${p.spec.claimRef.namespace}/${p.spec.claimRef.name}` : undefined,
        age: p.metadata.creationTimestamp ? age(p.metadata.creationTimestamp) : "?",
      })));
    }

    if (toolName === "kube_list_storage_classes") {
      const res = await kubeReq(creds, "GET", "/apis/storage.k8s.io/v1/storageclasses");
      return ok((res.items ?? []).map((s: any) => ({
        name: s.metadata.name,
        provisioner: s.provisioner,
        reclaimPolicy: s.reclaimPolicy,
        isDefault: s.metadata.annotations?.["storageclass.kubernetes.io/is-default-class"] === "true",
        volumeBindingMode: s.volumeBindingMode,
      })));
    }

    // ── Jobs & CronJobs ────────────────────────────────────────────────────────
    if (toolName === "kube_list_jobs") {
      const path = allNs ? "/apis/batch/v1/jobs" : `/apis/batch/v1/namespaces/${ns}/jobs`;
      const res = await kubeReq(creds, "GET", path);
      return ok((res.items ?? []).map((j: any) => ({
        name: j.metadata.name,
        namespace: j.metadata.namespace,
        status: j.status?.succeeded ? "Succeeded" : (j.status?.failed ? "Failed" : "Active"),
        completions: `${j.status?.succeeded ?? 0}/${j.spec?.completions ?? 1}`,
        duration: j.status?.startTime && j.status?.completionTime
          ? `${Math.round((new Date(j.status.completionTime).getTime() - new Date(j.status.startTime).getTime()) / 1000)}s`
          : "running",
        age: j.metadata.creationTimestamp ? age(j.metadata.creationTimestamp) : "?",
      })));
    }

    if (toolName === "kube_get_job") {
      const res = await kubeReq(creds, "GET", `/apis/batch/v1/namespaces/${ns}/jobs/${args.name}`);
      return ok({
        name: res.metadata.name, namespace: res.metadata.namespace,
        status: res.status, spec: { completions: res.spec?.completions, parallelism: res.spec?.parallelism },
        age: res.metadata.creationTimestamp ? age(res.metadata.creationTimestamp) : "?",
      });
    }

    if (toolName === "kube_list_cronjobs") {
      const path = allNs ? "/apis/batch/v1/cronjobs" : `/apis/batch/v1/namespaces/${ns}/cronjobs`;
      const res = await kubeReq(creds, "GET", path);
      return ok((res.items ?? []).map((c: any) => ({
        name: c.metadata.name,
        namespace: c.metadata.namespace,
        schedule: c.spec?.schedule,
        active: c.status?.active?.length ?? 0,
        lastSchedule: c.status?.lastScheduleTime,
        suspended: c.spec?.suspend ?? false,
        age: c.metadata.creationTimestamp ? age(c.metadata.creationTimestamp) : "?",
      })));
    }

    if (toolName === "kube_trigger_cronjob") {
      const cjRes = await kubeReq(creds, "GET", `/apis/batch/v1/namespaces/${ns}/cronjobs/${args.name}`);
      const jobName = `${args.name}-manual-${Date.now()}`;
      await kubeReq(creds, "POST", `/apis/batch/v1/namespaces/${ns}/jobs`, {
        apiVersion: "batch/v1",
        kind: "Job",
        metadata: {
          name: jobName,
          namespace: ns,
          annotations: { "cronjob.kubernetes.io/instantiate": "manual" },
          ownerReferences: [{ apiVersion: "batch/v1", kind: "CronJob", name: args.name, uid: cjRes.metadata.uid, blockOwnerDeletion: true, controller: true }],
        },
        spec: cjRes.spec?.jobTemplate?.spec,
      });
      return JSON.stringify({ triggered: args.name, jobCreated: jobName, namespace: ns });
    }

    // ── DaemonSets ─────────────────────────────────────────────────────────────
    if (toolName === "kube_list_daemonsets") {
      const path = allNs ? "/apis/apps/v1/daemonsets" : `/apis/apps/v1/namespaces/${ns}/daemonsets`;
      const res = await kubeReq(creds, "GET", path);
      return ok((res.items ?? []).map((d: any) => ({
        name: d.metadata.name,
        namespace: d.metadata.namespace,
        desired: d.status?.desiredNumberScheduled ?? 0,
        ready: d.status?.numberReady ?? 0,
        available: d.status?.numberAvailable ?? 0,
        image: d.spec?.template?.spec?.containers?.[0]?.image,
        age: d.metadata.creationTimestamp ? age(d.metadata.creationTimestamp) : "?",
      })));
    }

    if (toolName === "kube_get_daemonset") {
      const res = await kubeReq(creds, "GET", `/apis/apps/v1/namespaces/${ns}/daemonsets/${args.name}`);
      return ok({
        name: res.metadata.name,
        namespace: res.metadata.namespace,
        status: res.status,
        selector: res.spec?.selector,
        image: res.spec?.template?.spec?.containers?.[0]?.image,
        age: res.metadata.creationTimestamp ? age(res.metadata.creationTimestamp) : "?",
      });
    }

    // ── Helm (via Kubernetes secrets) ──────────────────────────────────────────
    if (toolName === "kube_helm_list_releases") {
      const path = allNs
        ? "/api/v1/secrets?labelSelector=owner%3Dhelm%2Cstatus%3Ddeployed"
        : `/api/v1/namespaces/${ns}/secrets?labelSelector=owner%3Dhelm%2Cstatus%3Ddeployed`;
      const res = await kubeReq(creds, "GET", path);
      return ok((res.items ?? []).map((s: any) => ({
        name: s.metadata.labels?.name,
        namespace: s.metadata.namespace,
        chart: s.metadata.labels?.chart,
        version: s.metadata.labels?.version,
        status: s.metadata.labels?.status,
        updated: s.metadata.creationTimestamp,
      })));
    }

    if (toolName === "kube_helm_get_release_info") {
      const res = await kubeReq(
        creds, "GET",
        `/api/v1/namespaces/${ns}/secrets?labelSelector=owner%3Dhelm%2Cname%3D${encodeURIComponent(args.name)}`,
      );
      const secret = (res.items ?? []).sort((a: any, b: any) =>
        new Date(b.metadata.creationTimestamp).getTime() - new Date(a.metadata.creationTimestamp).getTime()
      )[0];
      if (!secret) throw new Error(`No Helm release found for "${args.name}" in namespace "${ns}"`);
      return ok({
        name: secret.metadata.labels?.name,
        namespace: secret.metadata.namespace,
        chart: secret.metadata.labels?.chart,
        version: secret.metadata.labels?.version,
        status: secret.metadata.labels?.status,
        updated: secret.metadata.creationTimestamp,
      });
    }

    if (toolName === "kube_helm_delete_release") {
      const res = await kubeReq(
        creds, "GET",
        `/api/v1/namespaces/${ns}/secrets?labelSelector=owner%3Dhelm%2Cname%3D${encodeURIComponent(args.name)}`,
      );
      const secrets = res.items ?? [];
      for (const s of secrets) {
        await kubeReq(creds, "DELETE", `/api/v1/namespaces/${ns}/secrets/${s.metadata.name}`);
      }
      return JSON.stringify({
        deleted: args.name, namespace: ns, secretsRemoved: secrets.length,
        note: "Helm release state secrets deleted. Workload resources (Deployments, Services, etc.) are NOT removed — use kube_delete_resource for those.",
      });
    }

    // ── Manifests ──────────────────────────────────────────────────────────────
    if (toolName === "kube_apply_manifest") {
      let manifest: any;
      try { manifest = JSON.parse(args.manifest); } catch { throw new Error("manifest must be valid JSON"); }

      const kindLower = (manifest.kind ?? "").toLowerCase();
      const resourceNs: string = manifest.metadata?.namespace ?? ns;
      const resourceName: string = manifest.metadata?.name;
      if (!resourceName) throw new Error("manifest.metadata.name is required");

      return applyResource(creds, kindLower, resourceNs, resourceName, manifest);
    }

    if (toolName === "kube_delete_resource") {
      const kindLower = (args.kind ?? "").toLowerCase();
      const path = resolveResourcePath(kindLower, ns);
      if (!path) throw new Error(`Unsupported kind "${args.kind}"`);
      await kubeReq(creds, "DELETE", `${path}/${args.name}`);
      return JSON.stringify({ deleted: args.name, kind: args.kind, namespace: ns });
    }

    if (toolName === "kube_describe_resource") {
      const kindLower = (args.kind ?? "").toLowerCase();
      const path = resolveResourcePath(kindLower, ns);
      if (!path) throw new Error(`Unsupported kind "${args.kind}"`);
      const res = await kubeReq(creds, "GET", `${path}/${args.name}`);
      return ok(res);
    }

    // ── Observability ──────────────────────────────────────────────────────────
    if (toolName === "kube_list_hpas") {
      const path = allNs
        ? "/apis/autoscaling/v2/horizontalpodautoscalers"
        : `/apis/autoscaling/v2/namespaces/${ns}/horizontalpodautoscalers`;
      const res = await kubeReq(creds, "GET", path);
      return ok((res.items ?? []).map((h: any) => ({
        name: h.metadata.name,
        namespace: h.metadata.namespace,
        target: `${h.spec?.scaleTargetRef?.kind}/${h.spec?.scaleTargetRef?.name}`,
        minReplicas: h.spec?.minReplicas,
        maxReplicas: h.spec?.maxReplicas,
        currentReplicas: h.status?.currentReplicas,
        desiredReplicas: h.status?.desiredReplicas,
        age: h.metadata.creationTimestamp ? age(h.metadata.creationTimestamp) : "?",
      })));
    }

    if (toolName === "kube_list_resource_quotas") {
      const path = allNs ? "/api/v1/resourcequotas" : `/api/v1/namespaces/${ns}/resourcequotas`;
      const res = await kubeReq(creds, "GET", path);
      return ok((res.items ?? []).map((q: any) => ({
        name: q.metadata.name,
        namespace: q.metadata.namespace,
        hard: q.status?.hard,
        used: q.status?.used,
        age: q.metadata.creationTimestamp ? age(q.metadata.creationTimestamp) : "?",
      })));
    }

    return JSON.stringify({ error: `Unknown Kubernetes tool: ${toolName}` });

  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

export async function validateKubernetesCredentials(creds: KubernetesCredentials): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await kubeReq(creds, "GET", "/version");
    return { ok: true, detail: `Kubernetes ${res?.gitVersion ?? "version unknown"} — API server connected successfully` };
  } catch (err: any) {
    return { ok: false, detail: err.message };
  }
}

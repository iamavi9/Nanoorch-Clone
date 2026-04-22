export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
}

export const AWS_TOOLS: ToolDefinition[] = [
  {
    name: "aws_list_s3_buckets",
    description: "List all S3 buckets in the AWS account",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "aws_list_s3_objects",
    description: "List objects in an S3 bucket",
    parameters: {
      type: "object",
      properties: {
        bucket: { type: "string", description: "S3 bucket name" },
        prefix: { type: "string", description: "Key prefix filter (optional)" },
      },
      required: ["bucket"],
    },
  },
  {
    name: "aws_list_ec2_instances",
    description: "List EC2 instances, optionally filtered by region",
    parameters: {
      type: "object",
      properties: {
        region: { type: "string", description: "AWS region (e.g. us-east-1)" },
        state: { type: "string", description: "Filter by state: running, stopped, terminated", enum: ["running", "stopped", "terminated", "all"] },
      },
      required: [],
    },
  },
  {
    name: "aws_list_lambda_functions",
    description: "List Lambda functions in the AWS account",
    parameters: {
      type: "object",
      properties: {
        region: { type: "string", description: "AWS region (e.g. us-east-1)" },
      },
      required: [],
    },
  },
  {
    name: "aws_get_cloudwatch_logs",
    description: "Get recent CloudWatch log events from a log group",
    parameters: {
      type: "object",
      properties: {
        logGroupName: { type: "string", description: "CloudWatch log group name" },
        region: { type: "string", description: "AWS region" },
        limit: { type: "string", description: "Maximum number of log events to return (default 50)" },
      },
      required: ["logGroupName"],
    },
  },
];

export const GCP_TOOLS: ToolDefinition[] = [
  {
    name: "gcp_list_storage_buckets",
    description: "List all Google Cloud Storage buckets in the project",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "GCP project ID (uses service account project if omitted)" },
      },
      required: [],
    },
  },
  {
    name: "gcp_list_compute_instances",
    description: "List Google Compute Engine VM instances",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "GCP project ID" },
        zone: { type: "string", description: "GCP zone (e.g. us-central1-a). Use '-' for all zones." },
      },
      required: [],
    },
  },
  {
    name: "gcp_list_cloud_functions",
    description: "List Google Cloud Functions in a project",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "GCP project ID" },
        region: { type: "string", description: "GCP region (e.g. us-central1). Use '-' for all regions." },
      },
      required: [],
    },
  },
];

export const AZURE_TOOLS: ToolDefinition[] = [
  {
    name: "azure_list_resource_groups",
    description: "List all Azure resource groups in the subscription",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "azure_list_virtual_machines",
    description: "List Azure virtual machines, optionally filtered by resource group",
    parameters: {
      type: "object",
      properties: {
        resourceGroup: { type: "string", description: "Resource group name (optional, lists all if omitted)" },
      },
      required: [],
    },
  },
  {
    name: "azure_list_storage_accounts",
    description: "List Azure storage accounts in the subscription",
    parameters: {
      type: "object",
      properties: {
        resourceGroup: { type: "string", description: "Resource group name (optional)" },
      },
      required: [],
    },
  },
];

export const RAGFLOW_TOOLS: ToolDefinition[] = [
  {
    name: "ragflow_list_datasets",
    description: "List all available RAGFlow knowledge base datasets",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "ragflow_query_dataset",
    description: "Query a RAGFlow knowledge base dataset with a natural language question and retrieve relevant chunks",
    parameters: {
      type: "object",
      properties: {
        dataset_id: { type: "string", description: "ID of the RAGFlow dataset to query" },
        question: { type: "string", description: "The natural language question to search for" },
        top_k: { type: "string", description: "Number of chunks to retrieve (default 5)" },
      },
      required: ["dataset_id", "question"],
    },
  },
  {
    name: "ragflow_query_multiple_datasets",
    description: "Query multiple RAGFlow datasets at once with a natural language question",
    parameters: {
      type: "object",
      properties: {
        dataset_ids: { type: "string", description: "Comma-separated list of dataset IDs to search across" },
        question: { type: "string", description: "The natural language question to search for" },
        top_k: { type: "string", description: "Number of chunks to retrieve per dataset (default 5)" },
      },
      required: ["dataset_ids", "question"],
    },
  },
];

export const CODE_INTERPRETER_TOOL: ToolDefinition = {
  name: "code_interpreter",
  description:
    "Execute code in a secure, isolated sandbox and return the output. " +
    "Supports Python, JavaScript, Bash, Ruby, R, Go, and Java. " +
    "Use this to run computations, parse data, generate reports, or demonstrate scripts. " +
    "The sandbox has no network access and no filesystem access beyond /tmp. " +
    "CRITICAL — output rules (scripts do NOT behave like a REPL; bare expressions produce no output): " +
    "Python: always use print() for every value you want to show — e.g. print(result), print(hash_value). A bare variable name on the last line produces NO output. " +
    "JavaScript: always use console.log() — e.g. console.log(result). A bare expression produces NO output. " +
    "Bash: use echo. Ruby: use puts or p. R: use print() or cat(). " +
    "Go requires 'package main' and 'func main()'. " +
    "Java uses single-source-file execution — write a class with a main method (class name need not match filename).",
  parameters: {
    type: "object",
    properties: {
      language: {
        type: "string",
        description: "Programming language to use",
        enum: ["python", "javascript", "bash", "ruby", "r", "go", "java"],
      },
      code: {
        type: "string",
        description: "The code to execute. Always use explicit print/log statements to produce output — bare expressions at the end of a script are silently discarded.",
      },
    },
    required: ["language", "code"],
  },
};

export const JIRA_TOOLS: ToolDefinition[] = [
  {
    name: "jira_list_projects",
    description: "List all accessible JIRA projects",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "jira_search_issues",
    description: "Search JIRA issues using JQL (JIRA Query Language)",
    parameters: {
      type: "object",
      properties: {
        jql: { type: "string", description: "JQL query string, e.g. 'project = CORE AND status = Open ORDER BY created DESC'" },
        maxResults: { type: "string", description: "Maximum number of results to return (default 20, max 50)" },
      },
      required: ["jql"],
    },
  },
  {
    name: "jira_get_issue",
    description: "Get details of a specific JIRA issue by its key",
    parameters: {
      type: "object",
      properties: {
        issueKey: { type: "string", description: "JIRA issue key, e.g. CORE-123" },
      },
      required: ["issueKey"],
    },
  },
  {
    name: "jira_create_issue",
    description: "Create a new JIRA issue",
    parameters: {
      type: "object",
      properties: {
        projectKey: { type: "string", description: "JIRA project key (e.g. CORE)" },
        summary: { type: "string", description: "Issue title/summary" },
        issueType: { type: "string", description: "Issue type: Bug, Task, Story, Epic", enum: ["Bug", "Task", "Story", "Epic", "Subtask"] },
        description: { type: "string", description: "Issue description (plain text)" },
        priority: { type: "string", description: "Priority: Highest, High, Medium, Low, Lowest", enum: ["Highest", "High", "Medium", "Low", "Lowest"] },
        assignee: { type: "string", description: "Assignee account ID or email (optional)" },
      },
      required: ["projectKey", "summary", "issueType"],
    },
  },
  {
    name: "jira_update_issue",
    description: "Update fields of an existing JIRA issue",
    parameters: {
      type: "object",
      properties: {
        issueKey: { type: "string", description: "JIRA issue key, e.g. CORE-123" },
        summary: { type: "string", description: "New summary (optional)" },
        status: { type: "string", description: "Transition to this status name (optional)" },
        priority: { type: "string", description: "New priority (optional)" },
        assignee: { type: "string", description: "New assignee account ID (optional)" },
      },
      required: ["issueKey"],
    },
  },
  {
    name: "jira_add_comment",
    description: "Add a comment to a JIRA issue",
    parameters: {
      type: "object",
      properties: {
        issueKey: { type: "string", description: "JIRA issue key, e.g. CORE-123" },
        comment: { type: "string", description: "Comment text to add" },
      },
      required: ["issueKey", "comment"],
    },
  },
  {
    name: "jira_list_sprints",
    description: "List active and recent sprints for a JIRA board",
    parameters: {
      type: "object",
      properties: {
        boardId: { type: "string", description: "JIRA board ID (numeric)" },
        state: { type: "string", description: "Sprint state filter: active, future, closed", enum: ["active", "future", "closed"] },
      },
      required: ["boardId"],
    },
  },
  {
    name: "jira_get_attachment",
    description: "Download the content of a JIRA issue attachment by its ID. Returns plain text for text-based files (txt, csv, json, xml, log) or base64-encoded content for binary files (images, PDFs). Get attachment IDs from jira_get_issue.",
    parameters: {
      type: "object",
      properties: {
        attachmentId: { type: "string", description: "Attachment ID from the attachments list returned by jira_get_issue" },
      },
      required: ["attachmentId"],
    },
  },
  {
    name: "jira_upload_attachment",
    description: "Upload a file as an attachment to a JIRA issue. Use base64 content from jira_get_attachment to copy attachments between issues. Requires Create Attachments permission on the target issue.",
    parameters: {
      type: "object",
      properties: {
        issueKey: { type: "string", description: "JIRA issue key to attach the file to, e.g. SUPPORT-55" },
        filename: { type: "string", description: "Filename including extension, e.g. screenshot.png or error-log.txt" },
        content: { type: "string", description: "Base64-encoded file content (from jira_get_attachment encoding: base64) or plain text content for text files" },
        mimeType: { type: "string", description: "MIME type of the file, e.g. image/png, text/plain, application/pdf. Defaults to application/octet-stream if omitted." },
        encoding: { type: "string", description: "Content encoding: 'base64' for binary files, 'text' for plain text files (from jira_get_attachment)", enum: ["base64", "text"] },
      },
      required: ["issueKey", "filename", "content"],
    },
  },
];

export const GITHUB_TOOLS: ToolDefinition[] = [
  {
    name: "github_list_repos",
    description: "List GitHub repositories for a user or organisation",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "GitHub username or organisation (uses default if omitted)" },
        type: { type: "string", description: "Repository type: all, public, private, forks, sources", enum: ["all", "public", "private", "forks", "sources"] },
      },
      required: [],
    },
  },
  {
    name: "github_list_issues",
    description: "List issues in a GitHub repository",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner/org" },
        repo: { type: "string", description: "Repository name" },
        state: { type: "string", description: "Issue state: open, closed, all", enum: ["open", "closed", "all"] },
        labels: { type: "string", description: "Comma-separated label names to filter by (optional)" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "github_get_issue",
    description: "Get details of a specific GitHub issue",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner/org" },
        repo: { type: "string", description: "Repository name" },
        issueNumber: { type: "string", description: "Issue number" },
      },
      required: ["owner", "repo", "issueNumber"],
    },
  },
  {
    name: "github_create_issue",
    description: "Create a new GitHub issue",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner/org" },
        repo: { type: "string", description: "Repository name" },
        title: { type: "string", description: "Issue title" },
        body: { type: "string", description: "Issue body/description (Markdown)" },
        labels: { type: "string", description: "Comma-separated label names (optional)" },
        assignees: { type: "string", description: "Comma-separated GitHub usernames to assign (optional)" },
      },
      required: ["owner", "repo", "title"],
    },
  },
  {
    name: "github_list_pull_requests",
    description: "List pull requests in a GitHub repository",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner/org" },
        repo: { type: "string", description: "Repository name" },
        state: { type: "string", description: "PR state: open, closed, all", enum: ["open", "closed", "all"] },
        base: { type: "string", description: "Filter by base branch name (optional)" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "github_create_pull_request",
    description: "Create a new GitHub pull request",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner/org" },
        repo: { type: "string", description: "Repository name" },
        title: { type: "string", description: "PR title" },
        body: { type: "string", description: "PR description (Markdown)" },
        head: { type: "string", description: "Branch to merge from (e.g. feature/my-branch)" },
        base: { type: "string", description: "Branch to merge into (e.g. main)" },
      },
      required: ["owner", "repo", "title", "head", "base"],
    },
  },
  {
    name: "github_list_workflow_runs",
    description: "List recent GitHub Actions workflow runs",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner/org" },
        repo: { type: "string", description: "Repository name" },
        status: { type: "string", description: "Filter by status: queued, in_progress, completed, failure, success", enum: ["queued", "in_progress", "completed", "failure", "success"] },
        branch: { type: "string", description: "Filter by branch name (optional)" },
      },
      required: ["owner", "repo"],
    },
  },
];

export const GITLAB_TOOLS: ToolDefinition[] = [
  {
    name: "gitlab_list_projects",
    description: "List accessible GitLab projects",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string", description: "Search term to filter projects by name (optional)" },
        owned: { type: "string", description: "Set to 'true' to return only projects owned by the authenticated user" },
      },
      required: [],
    },
  },
  {
    name: "gitlab_list_issues",
    description: "List issues in a GitLab project",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "GitLab project ID or URL-encoded path (e.g. 123 or mygroup%2Fmyproject)" },
        state: { type: "string", description: "Filter by state: opened, closed, all", enum: ["opened", "closed", "all"] },
        labels: { type: "string", description: "Comma-separated label names to filter by (optional)" },
        assigneeUsername: { type: "string", description: "Filter by assignee username (optional)" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "gitlab_get_issue",
    description: "Get details of a specific GitLab issue",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "GitLab project ID or path" },
        issueIid: { type: "string", description: "Issue internal ID (iid)" },
      },
      required: ["projectId", "issueIid"],
    },
  },
  {
    name: "gitlab_create_issue",
    description: "Create a new GitLab issue",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "GitLab project ID or path" },
        title: { type: "string", description: "Issue title" },
        description: { type: "string", description: "Issue description (Markdown, optional)" },
        labels: { type: "string", description: "Comma-separated labels (optional)" },
        assigneeUsernames: { type: "string", description: "Comma-separated usernames to assign (optional)" },
      },
      required: ["projectId", "title"],
    },
  },
  {
    name: "gitlab_list_merge_requests",
    description: "List merge requests in a GitLab project",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "GitLab project ID or path" },
        state: { type: "string", description: "MR state: opened, closed, merged, all", enum: ["opened", "closed", "merged", "all"] },
        targetBranch: { type: "string", description: "Filter by target branch (optional)" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "gitlab_create_merge_request",
    description: "Create a new GitLab merge request",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "GitLab project ID or path" },
        title: { type: "string", description: "MR title" },
        description: { type: "string", description: "MR description (Markdown, optional)" },
        sourceBranch: { type: "string", description: "Branch to merge from" },
        targetBranch: { type: "string", description: "Branch to merge into (e.g. main)" },
      },
      required: ["projectId", "title", "sourceBranch", "targetBranch"],
    },
  },
  {
    name: "gitlab_list_pipelines",
    description: "List recent CI/CD pipelines for a GitLab project",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "GitLab project ID or path" },
        status: { type: "string", description: "Filter by status: running, pending, success, failed, canceled", enum: ["running", "pending", "success", "failed", "canceled"] },
        ref: { type: "string", description: "Filter by branch or tag name (optional)" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "gitlab_trigger_pipeline",
    description: "Trigger a new CI/CD pipeline for a GitLab project",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "GitLab project ID or path" },
        ref: { type: "string", description: "Branch or tag name to run the pipeline on" },
      },
      required: ["projectId", "ref"],
    },
  },
];

export const TEAMS_TOOLS: ToolDefinition[] = [
  {
    name: "teams_send_message",
    description: "Send a plain markdown message to a Microsoft Teams channel via the configured incoming webhook",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Message text (supports markdown formatting)" },
        color: { type: "string", description: "Hex accent color for the card border, e.g. 0076D7 (blue), FF0000 (red), 00C176 (green)" },
      },
      required: ["text"],
    },
  },
  {
    name: "teams_send_notification",
    description: "Send a structured notification card to Microsoft Teams with a title, body, optional key-value facts, and an optional action button link",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Card title shown prominently at the top" },
        subtitle: { type: "string", description: "Optional subtitle shown below the title" },
        body: { type: "string", description: "Main body text of the notification (markdown supported)" },
        facts: { type: "string", description: "Optional JSON object of key-value pairs to display as a facts table, e.g. {\"Issue\": \"NAN-3\", \"Priority\": \"High\"}" },
        actionLabel: { type: "string", description: "Label for an optional action button (requires actionUrl)" },
        actionUrl: { type: "string", description: "URL that the action button opens" },
        color: { type: "string", description: "Hex accent color for the card, e.g. 0076D7" },
      },
      required: ["title", "body"],
    },
  },
];

export const SLACK_TOOLS: ToolDefinition[] = [
  {
    name: "slack_send_message",
    description: "Send a plain text or mrkdwn message to a Slack channel via the configured bot token",
    parameters: {
      type: "object",
      properties: {
        channel: { type: "string", description: "Slack channel ID or name (e.g. C012AB3CD or #general). Uses the default channel configured in the integration if omitted." },
        text: { type: "string", description: "Message text (supports Slack mrkdwn formatting: *bold*, _italic_, `code`, >quote)" },
      },
      required: ["text"],
    },
  },
  {
    name: "slack_send_notification",
    description: "Send a structured attachment-based notification to a Slack channel with a title, body, optional key-value fields, and a colour bar",
    parameters: {
      type: "object",
      properties: {
        channel: { type: "string", description: "Slack channel ID or name. Uses default channel if omitted." },
        title: { type: "string", description: "Bold title shown at the top of the notification" },
        body: { type: "string", description: "Main notification body text (mrkdwn supported)" },
        fields: { type: "string", description: "Optional JSON object of key-value pairs shown as fields, e.g. {\"Status\": \"OK\", \"Agent\": \"Heartbeat\"}" },
        color: { type: "string", description: "Attachment colour: good (green), warning (yellow), danger (red), or any CSS hex colour e.g. #0076D7" },
      },
      required: ["title", "body"],
    },
  },
];

export const GOOGLE_CHAT_TOOLS: ToolDefinition[] = [
  {
    name: "google_chat_send_message",
    description: "Send a plain text message to the configured Google Chat space via incoming webhook",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Message text to send. Supports basic Google Chat formatting (*bold*, _italic_, ~strikethrough~, `code`)." },
      },
      required: ["text"],
    },
  },
  {
    name: "google_chat_send_card",
    description: "Send a formatted card to Google Chat with a title, optional subtitle, and body text",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Card header title shown prominently" },
        subtitle: { type: "string", description: "Optional subtitle shown below the title" },
        body: { type: "string", description: "Main card body text" },
        imageUrl: { type: "string", description: "Optional HTTPS image URL to display in the card" },
      },
      required: ["title", "body"],
    },
  },
];

export const SERVICENOW_TOOLS: ToolDefinition[] = [
  {
    name: "servicenow_search_records",
    description: "Search any ServiceNow table using an encoded query string. Returns records with display values.",
    parameters: {
      type: "object",
      properties: {
        table: { type: "string", description: "ServiceNow table name, e.g. incident, sc_req_item, change_request, cmdb_ci" },
        query: { type: "string", description: "Encoded query string, e.g. active=true^priority=1 or number=INC0012345" },
        limit: { type: "string", description: "Maximum number of records to return (default 10, max 50)" },
        fields: { type: "string", description: "Comma-separated field names to return (optional — returns key fields by default)" },
      },
      required: ["table", "query"],
    },
  },
  {
    name: "servicenow_get_incident",
    description: "Get a ServiceNow incident by its number (INC...) or sys_id. Returns full incident details including description, state, priority, assignment, and work notes.",
    parameters: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "Incident number (e.g. INC0012345) or sys_id (32-char hex)" },
      },
      required: ["identifier"],
    },
  },
  {
    name: "servicenow_create_incident",
    description: "Create a new ServiceNow incident. Returns the incident number, sys_id, and link.",
    parameters: {
      type: "object",
      properties: {
        short_description: { type: "string", description: "Brief one-line description of the incident (required)" },
        description: { type: "string", description: "Full description of the issue (optional)" },
        urgency: { type: "string", description: "Urgency: 1 (High), 2 (Medium), 3 (Low)", enum: ["1", "2", "3"] },
        impact: { type: "string", description: "Impact: 1 (High), 2 (Medium), 3 (Low)", enum: ["1", "2", "3"] },
        category: { type: "string", description: "Incident category (e.g. software, hardware, network — optional)" },
        assignment_group: { type: "string", description: "Name or sys_id of the group to assign the incident to (optional)" },
        caller_id: { type: "string", description: "Username or sys_id of the person reporting the incident (optional)" },
        work_notes: { type: "string", description: "Initial work note to add (optional)" },
      },
      required: ["short_description"],
    },
  },
  {
    name: "servicenow_update_record",
    description: "Update fields on any ServiceNow record by table and sys_id. Use this to change state, assignment, resolution notes, etc.",
    parameters: {
      type: "object",
      properties: {
        table: { type: "string", description: "ServiceNow table name, e.g. incident, sc_req_item, change_request" },
        sys_id: { type: "string", description: "The sys_id of the record to update (32-char hex)" },
        fields: { type: "string", description: "JSON object string of field names and new values, e.g. {\"state\":\"6\",\"close_notes\":\"Resolved via automation\"}" },
      },
      required: ["table", "sys_id", "fields"],
    },
  },
  {
    name: "servicenow_add_work_note",
    description: "Add a work note (internal comment visible to agents only) to any ServiceNow record — incident, RITM, change request, etc.",
    parameters: {
      type: "object",
      properties: {
        table: { type: "string", description: "ServiceNow table name, e.g. incident, sc_req_item, change_request" },
        sys_id: { type: "string", description: "The sys_id of the record" },
        work_note: { type: "string", description: "The work note text to add" },
      },
      required: ["table", "sys_id", "work_note"],
    },
  },
  {
    name: "servicenow_get_ritm",
    description: "Get a ServiceNow Requested Item (RITM) by its number (RITM...) or sys_id. Returns fulfilment stage, variables (form answers), and parent request details.",
    parameters: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "RITM number (e.g. RITM0012345) or sys_id (32-char hex)" },
      },
      required: ["identifier"],
    },
  },
  {
    name: "servicenow_create_ritm",
    description: "Submit a ServiceNow Service Catalog item order. Creates a Request (REQ) and one or more Requested Items (RITMs) for fulfilment. Returns the REQ number and RITM sys_id.",
    parameters: {
      type: "object",
      properties: {
        catalog_item_sys_id: { type: "string", description: "The sys_id of the catalog item to order. Use servicenow_get_catalog_items to find available items." },
        variables: { type: "string", description: "JSON object string of variable name-value pairs for the catalog item form, e.g. {\"repo\":\"backend-api\",\"role\":\"write\"}" },
        requested_for: { type: "string", description: "Username or sys_id of the person the item is being requested for (optional — defaults to the integration user)" },
        quantity: { type: "string", description: "Number of items to order (default 1)" },
      },
      required: ["catalog_item_sys_id"],
    },
  },
  {
    name: "servicenow_create_change_request",
    description: "Create a ServiceNow change request. Returns the change number and sys_id.",
    parameters: {
      type: "object",
      properties: {
        short_description: { type: "string", description: "Brief description of the change (required)" },
        description: { type: "string", description: "Full description including justification and implementation plan (optional)" },
        type: { type: "string", description: "Change type: standard, normal, emergency", enum: ["standard", "normal", "emergency"] },
        assignment_group: { type: "string", description: "Name or sys_id of the group responsible (optional)" },
        risk: { type: "string", description: "Risk level: 1 (High), 2 (Medium), 3 (Low), 4 (Very Low)", enum: ["1", "2", "3", "4"] },
        start_date: { type: "string", description: "Planned start datetime in ISO 8601 format (optional)" },
        end_date: { type: "string", description: "Planned end datetime in ISO 8601 format (optional)" },
      },
      required: ["short_description"],
    },
  },
  {
    name: "servicenow_get_catalog_items",
    description: "List available ServiceNow Service Catalog items. Use this to find catalog_item_sys_id values for servicenow_create_ritm.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string", description: "Search term to filter catalog items by name (optional)" },
        category: { type: "string", description: "Category name or sys_id to filter by (optional)" },
        limit: { type: "string", description: "Maximum results to return (default 20)" },
      },
      required: [],
    },
  },
];

const PG_APPROVAL_NOTE =
  "IMPORTANT: You MUST call request_approval before using this tool — this operation modifies or drops data and requires human approval.";

export const POSTGRESQL_TOOLS: ToolDefinition[] = [
  // ── Original 5 tools ──────────────────────────────────────────────────────
  {
    name: "pg_list_schemas",
    description: "List all non-system schemas in the connected PostgreSQL database.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "pg_list_tables",
    description: "List all tables (with type and estimated row count) in a PostgreSQL schema.",
    parameters: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema name (default: public)" },
      },
      required: [],
    },
  },
  {
    name: "pg_describe_table",
    description: "Show columns, data types, nullability, defaults, and primary key flags for a PostgreSQL table.",
    parameters: {
      type: "object",
      properties: {
        table: { type: "string", description: "Table name" },
        schema: { type: "string", description: "Schema name (default: public)" },
      },
      required: ["table"],
    },
  },
  {
    name: "pg_query",
    description: "Run a read-only SQL query (SELECT, WITH, EXPLAIN, SHOW) against the connected PostgreSQL database. Non-read statements are rejected automatically.",
    parameters: {
      type: "object",
      properties: {
        sql: { type: "string", description: "The SELECT / WITH / EXPLAIN / SHOW statement to execute" },
        limit: { type: "string", description: "Maximum rows to return (default 100, max 500)" },
      },
      required: ["sql"],
    },
  },
  {
    name: "pg_execute",
    description:
      "Execute a write SQL statement (INSERT, UPDATE, DELETE, TRUNCATE, DDL) against the connected PostgreSQL database. " +
      "IMPORTANT: You MUST call request_approval before using this tool — write operations require human approval from all sources " +
      "(chat, scheduled jobs, triggers, tasks, and two-way comms channels). " +
      "Returns rows affected and (for INSERT) the inserted rows.",
    parameters: {
      type: "object",
      properties: {
        sql: { type: "string", description: "The write SQL statement to execute (INSERT, UPDATE, DELETE, TRUNCATE, or DDL)" },
      },
      required: ["sql"],
    },
  },

  // ── Phase 1: Query Enhancements ───────────────────────────────────────────
  {
    name: "pg_query_page",
    description: "Run a paginated read-only SELECT or WITH query. Returns rows for the requested page along with total row count and hasMore flag. Do NOT include LIMIT/OFFSET in the SQL — use the limit and offset parameters instead.",
    parameters: {
      type: "object",
      properties: {
        sql: { type: "string", description: "The base SELECT or WITH statement (without LIMIT or OFFSET)" },
        limit: { type: "string", description: "Rows per page (default 100, max 1000)" },
        offset: { type: "string", description: "Number of rows to skip (default 0)" },
      },
      required: ["sql"],
    },
  },
  {
    name: "pg_explain",
    description: "Return the query execution plan (EXPLAIN FORMAT JSON) for a SELECT or WITH statement without executing it. Use to diagnose slow queries and missing indexes.",
    parameters: {
      type: "object",
      properties: {
        sql: { type: "string", description: "The SELECT or WITH statement to explain (not executed)" },
      },
      required: ["sql"],
    },
  },
  {
    name: "pg_explain_analyze",
    description: "Return the query execution plan with actual runtime statistics (EXPLAIN ANALYZE BUFFERS FORMAT JSON). Executes the query — only use with SELECT or WITH statements.",
    parameters: {
      type: "object",
      properties: {
        sql: { type: "string", description: "The SELECT or WITH statement to explain and execute" },
      },
      required: ["sql"],
    },
  },
  {
    name: "pg_call_procedure",
    description:
      "Call a stored procedure or function via CALL. " + PG_APPROVAL_NOTE,
    parameters: {
      type: "object",
      properties: {
        procedure: { type: "string", description: "Procedure name, optionally schema-qualified (e.g. 'public.my_proc')" },
        args: { type: "string", description: "JSON array of argument values to pass to the procedure (e.g. '[1, \"hello\"]')" },
      },
      required: ["procedure"],
    },
  },

  // ── Phase 2: Schema & Metadata Exploration ────────────────────────────────
  {
    name: "pg_list_indexes",
    description: "List all indexes in a schema, including uniqueness, primary key status, and index definition. Optionally filter by table.",
    parameters: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema name (default: public)" },
        table: { type: "string", description: "Optional: filter indexes to this table only" },
      },
      required: [],
    },
  },
  {
    name: "pg_list_views",
    description: "List all views and materialized views in a PostgreSQL schema.",
    parameters: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema name (default: public)" },
      },
      required: [],
    },
  },
  {
    name: "pg_list_functions",
    description: "List all stored functions and procedures in a PostgreSQL schema with their return types and parameter signatures.",
    parameters: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema name (default: public)" },
      },
      required: [],
    },
  },
  {
    name: "pg_list_triggers",
    description: "List all triggers in a schema, showing event type, timing, and associated table. Optionally filter by table.",
    parameters: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema name (default: public)" },
        table: { type: "string", description: "Optional: filter triggers to this table only" },
      },
      required: [],
    },
  },
  {
    name: "pg_list_constraints",
    description: "List all table constraints (PRIMARY KEY, FOREIGN KEY, UNIQUE, CHECK) in a schema with foreign key relationships. Optionally filter by table.",
    parameters: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema name (default: public)" },
        table: { type: "string", description: "Optional: filter constraints to this table only" },
      },
      required: [],
    },
  },
  {
    name: "pg_list_extensions",
    description: "List all PostgreSQL extensions installed in the database (e.g. pgvector, postgis, pg_stat_statements).",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "pg_column_stats",
    description: "Show per-column statistics from pg_stats (null fraction, distinct values, most common values, correlation). Requires ANALYZE to have been run on the table.",
    parameters: {
      type: "object",
      properties: {
        table: { type: "string", description: "Table name" },
        schema: { type: "string", description: "Schema name (default: public)" },
      },
      required: ["table"],
    },
  },

  // ── Phase 3: DBA Monitoring ───────────────────────────────────────────────
  {
    name: "pg_active_connections",
    description: "List all active database connections with username, state, wait event, duration, and current query. Excludes the tool's own connection.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "pg_long_queries",
    description: "List queries that have been running longer than a specified duration threshold. Useful for identifying stuck or slow queries.",
    parameters: {
      type: "object",
      properties: {
        min_duration_seconds: { type: "string", description: "Minimum duration in seconds to report (default: 30)" },
      },
      required: [],
    },
  },
  {
    name: "pg_list_locks",
    description: "List all current database locks, showing lock type, mode, granted status, and the query holding each lock.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "pg_blocking_queries",
    description: "Show queries that are blocking other queries, including the blocking PID, user, query text, and how long the blocked query has been waiting.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "pg_table_sizes",
    description: "Show disk size (table data + indexes + total) for all tables in a schema, sorted by total size descending.",
    parameters: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema name (default: public)" },
      },
      required: [],
    },
  },
  {
    name: "pg_database_size",
    description: "Return the total disk size of the current PostgreSQL database.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "pg_table_health",
    description: "Show live/dead row counts, dead row percentage, last vacuum/analyze timestamps, and seq/index scan counts for all tables in a schema. Use to identify tables needing VACUUM.",
    parameters: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema name (default: public)" },
      },
      required: [],
    },
  },
  {
    name: "pg_index_usage",
    description: "Show scan counts, tuples read, and size for all indexes in a schema sorted by least used first. Use to identify unused indexes that waste disk space.",
    parameters: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema name (default: public)" },
      },
      required: [],
    },
  },
  {
    name: "pg_slow_queries",
    description: "Return the top slowest queries by mean execution time from pg_stat_statements. Requires the pg_stat_statements extension to be installed and enabled.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "string", description: "Number of queries to return (default 20, max 100)" },
      },
      required: [],
    },
  },
  {
    name: "pg_replication_lag",
    description: "Show replication lag (write/flush/replay lag) for all connected standby replicas. Returns empty if no replication is configured.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "pg_terminate_connection",
    description: "Terminate an active database connection by PID. " + PG_APPROVAL_NOTE,
    parameters: {
      type: "object",
      properties: {
        pid: { type: "string", description: "Process ID of the connection to terminate (from pg_active_connections)" },
      },
      required: ["pid"],
    },
  },
  {
    name: "pg_vacuum",
    description: "Run VACUUM (and optionally ANALYZE) on a table to reclaim dead tuple space. " + PG_APPROVAL_NOTE,
    parameters: {
      type: "object",
      properties: {
        table: { type: "string", description: "Table name to vacuum" },
        schema: { type: "string", description: "Schema name (default: public)" },
        analyze: { type: "string", description: "Also run ANALYZE to update statistics? 'true' (default) or 'false'" },
      },
      required: ["table"],
    },
  },

  // ── Phase 4: DDL / Write Operations ──────────────────────────────────────
  {
    name: "pg_upsert",
    description: "Insert a single row or update it on conflict (INSERT … ON CONFLICT). " + PG_APPROVAL_NOTE,
    parameters: {
      type: "object",
      properties: {
        table: { type: "string", description: "Target table name" },
        schema: { type: "string", description: "Schema name (default: public)" },
        data: { type: "string", description: "JSON object mapping column names to values (e.g. '{\"id\":1,\"name\":\"Alice\"}')" },
        conflict_columns: { type: "string", description: "Comma-separated column names that form the unique conflict key (e.g. 'id' or 'email,tenant_id')" },
      },
      required: ["table", "data", "conflict_columns"],
    },
  },
  {
    name: "pg_bulk_insert",
    description: "Insert multiple rows from a JSON array in a single statement (max 1000 rows per call). " + PG_APPROVAL_NOTE,
    parameters: {
      type: "object",
      properties: {
        table: { type: "string", description: "Target table name" },
        schema: { type: "string", description: "Schema name (default: public)" },
        rows: { type: "string", description: "JSON array of objects where each object maps column names to values (e.g. '[{\"name\":\"Alice\"},{\"name\":\"Bob\"}]')" },
      },
      required: ["table", "rows"],
    },
  },
  {
    name: "pg_truncate",
    description: "Remove all rows from a table (TRUNCATE). Much faster than DELETE for large tables but cannot be filtered. " + PG_APPROVAL_NOTE,
    parameters: {
      type: "object",
      properties: {
        table: { type: "string", description: "Table name to truncate" },
        schema: { type: "string", description: "Schema name (default: public)" },
        restart_identity: { type: "string", description: "Reset sequences? 'true' or 'false' (default: false)" },
        cascade: { type: "string", description: "Also truncate tables with foreign key references? 'true' or 'false' (default: false)" },
      },
      required: ["table"],
    },
  },
  {
    name: "pg_create_table",
    description: "Create a new table from a JSON column definition. " + PG_APPROVAL_NOTE,
    parameters: {
      type: "object",
      properties: {
        table: { type: "string", description: "New table name" },
        schema: { type: "string", description: "Schema name (default: public)" },
        columns: {
          type: "string",
          description: "JSON array of column definitions. Each object: {name, type, nullable?, default?, primaryKey?}. Example: '[{\"name\":\"id\",\"type\":\"serial\",\"primaryKey\":true},{\"name\":\"email\",\"type\":\"text\",\"nullable\":false}]'",
        },
        if_not_exists: { type: "string", description: "Use IF NOT EXISTS? 'true' (default) or 'false'" },
      },
      required: ["table", "columns"],
    },
  },
  {
    name: "pg_drop_table",
    description: "Drop a table permanently. This is irreversible. " + PG_APPROVAL_NOTE,
    parameters: {
      type: "object",
      properties: {
        table: { type: "string", description: "Table name to drop" },
        schema: { type: "string", description: "Schema name (default: public)" },
        if_exists: { type: "string", description: "Use IF EXISTS? 'true' (default) or 'false'" },
        cascade: { type: "string", description: "Also drop dependent objects? 'true' or 'false' (default: false)" },
      },
      required: ["table"],
    },
  },
  {
    name: "pg_alter_table",
    description: "Alter a table structure: add/drop/rename columns, rename the table, set/drop column defaults, or set/drop NOT NULL. " + PG_APPROVAL_NOTE,
    parameters: {
      type: "object",
      properties: {
        table: { type: "string", description: "Table name to alter" },
        schema: { type: "string", description: "Schema name (default: public)" },
        operation: {
          type: "string",
          description: "Operation to perform: add_column | drop_column | rename_column | rename_table | set_column_default | drop_column_default | set_not_null | drop_not_null",
        },
        column: { type: "string", description: "Column name (required for column operations)" },
        type: { type: "string", description: "Column data type (required for add_column, e.g. 'text', 'integer', 'timestamptz')" },
        new_name: { type: "string", description: "New name (required for rename_column and rename_table)" },
        default: { type: "string", description: "Default expression (required for set_column_default, e.g. 'now()' or \"'active'\")" },
        nullable: { type: "string", description: "Allow nulls? 'true' or 'false' (used for add_column)" },
        cascade: { type: "string", description: "Drop dependent objects? 'true' or 'false' (used for drop_column)" },
      },
      required: ["table", "operation"],
    },
  },
  {
    name: "pg_create_index",
    description: "Create an index on a table. Uses CONCURRENTLY by default to avoid locking. " + PG_APPROVAL_NOTE,
    parameters: {
      type: "object",
      properties: {
        table: { type: "string", description: "Table name" },
        schema: { type: "string", description: "Schema name (default: public)" },
        columns: { type: "string", description: "Comma-separated column names to index (e.g. 'email' or 'last_name, first_name')" },
        index_name: { type: "string", description: "Optional custom index name (auto-generated if omitted)" },
        unique: { type: "string", description: "Create a UNIQUE index? 'true' or 'false' (default: false)" },
        method: { type: "string", description: "Index method: btree (default), hash, gin, gist, spgist, brin" },
        concurrently: { type: "string", description: "Build index without locking writes? 'true' (default) or 'false'" },
        if_not_exists: { type: "string", description: "Use IF NOT EXISTS? 'true' (default) or 'false'" },
      },
      required: ["table", "columns"],
    },
  },
  {
    name: "pg_drop_index",
    description: "Drop an index. Uses CONCURRENTLY by default to avoid locking. " + PG_APPROVAL_NOTE,
    parameters: {
      type: "object",
      properties: {
        index_name: { type: "string", description: "Index name to drop" },
        schema: { type: "string", description: "Optional schema name to qualify the index" },
        if_exists: { type: "string", description: "Use IF EXISTS? 'true' (default) or 'false'" },
        concurrently: { type: "string", description: "Drop without locking? 'true' (default) or 'false'" },
        cascade: { type: "string", description: "Drop dependent objects? 'true' or 'false' (default: false)" },
      },
      required: ["index_name"],
    },
  },
  {
    name: "pg_refresh_matview",
    description: "Refresh a materialized view to update its data. " + PG_APPROVAL_NOTE,
    parameters: {
      type: "object",
      properties: {
        view: { type: "string", description: "Materialized view name" },
        schema: { type: "string", description: "Schema name (default: public)" },
        concurrently: { type: "string", description: "Refresh without locking reads? 'true' or 'false' (default: false — requires a unique index on the matview)" },
      },
      required: ["view"],
    },
  },
  {
    name: "pg_transaction",
    description:
      "Execute multiple SQL statements as an atomic transaction. All succeed or all roll back on failure. Returns per-statement results on commit, or the error and rollback info on failure. " +
      PG_APPROVAL_NOTE,
    parameters: {
      type: "object",
      properties: {
        statements: {
          type: "string",
          description: "JSON array of SQL strings to execute in order (max 50). Example: '[\"UPDATE orders SET status='done' WHERE id=1\", \"INSERT INTO audit_log VALUES (1,'closed')\"]'",
        },
      },
      required: ["statements"],
    },
  },

  // ── Phase 5: Advanced Features ────────────────────────────────────────────
  {
    name: "pg_vector_search",
    description: "Perform vector similarity search using pgvector. Requires the pgvector extension and a vector column. Returns nearest neighbours sorted by distance.",
    parameters: {
      type: "object",
      properties: {
        table: { type: "string", description: "Table name containing the vector column" },
        schema: { type: "string", description: "Schema name (default: public)" },
        column: { type: "string", description: "Name of the vector column (type: vector)" },
        query_vector: { type: "string", description: "JSON array of floats representing the query embedding (e.g. '[0.1, 0.2, ...]')" },
        limit: { type: "string", description: "Number of nearest neighbours to return (default 10, max 100)" },
        operator: { type: "string", description: "Distance metric: cosine (default, <=>), l2 (<->), or inner_product (<#>)" },
      },
      required: ["table", "column", "query_vector"],
    },
  },
  {
    name: "pg_fulltext_search",
    description: "Search text or tsvector columns using PostgreSQL full-text search (plainto_tsquery). Works on both tsvector columns and plain text columns.",
    parameters: {
      type: "object",
      properties: {
        table: { type: "string", description: "Table name to search" },
        schema: { type: "string", description: "Schema name (default: public)" },
        column: { type: "string", description: "Column name to search (tsvector or text type)" },
        query: { type: "string", description: "Natural language search query (e.g. 'invoice payment failed')" },
        limit: { type: "string", description: "Max results to return (default 20, max 500)" },
        language: { type: "string", description: "Text search language (default: english)" },
      },
      required: ["table", "column", "query"],
    },
  },
  {
    name: "pg_notify",
    description: "Send a NOTIFY event to a PostgreSQL listen/notify channel. Useful for triggering downstream listeners or pub/sub workflows.",
    parameters: {
      type: "object",
      properties: {
        channel: { type: "string", description: "Channel name to notify" },
        payload: { type: "string", description: "Optional payload string to include with the notification" },
      },
      required: ["channel"],
    },
  },
  {
    name: "pg_list_partitions",
    description: "List all child partitions of a partitioned table, including partition bounds and size.",
    parameters: {
      type: "object",
      properties: {
        table: { type: "string", description: "Parent partitioned table name" },
        schema: { type: "string", description: "Schema name (default: public)" },
      },
      required: ["table"],
    },
  },
  {
    name: "pg_list_policies",
    description: "List all Row Level Security (RLS) policies on tables in a schema. Shows roles, command scope, USING expression, and WITH CHECK expression.",
    parameters: {
      type: "object",
      properties: {
        schema: { type: "string", description: "Schema name (default: public)" },
        table: { type: "string", description: "Optional: filter to a specific table" },
      },
      required: [],
    },
  },
  {
    name: "pg_list_replication_slots",
    description: "List all logical and physical replication slots with their lag size, active status, and LSN positions.",
    parameters: { type: "object", properties: {}, required: [] },
  },
];

export const ALL_TOOLS: Record<string, ToolDefinition[]> = {
  aws: AWS_TOOLS,
  gcp: GCP_TOOLS,
  azure: AZURE_TOOLS,
  ragflow: RAGFLOW_TOOLS,
  jira: JIRA_TOOLS,
  github: GITHUB_TOOLS,
  gitlab: GITLAB_TOOLS,
  teams: TEAMS_TOOLS,
  slack: SLACK_TOOLS,
  google_chat: GOOGLE_CHAT_TOOLS,
  servicenow: SERVICENOW_TOOLS,
  postgresql: POSTGRESQL_TOOLS,
};

export const KUBERNETES_TOOLS: ToolDefinition[] = [
  // ── Cluster ─────────────────────────────────────────────────────────────────
  { name: "kube_get_cluster_info", description: "Get Kubernetes cluster version and available API groups", parameters: { type: "object", properties: {} } },
  { name: "kube_list_nodes", description: "List all cluster nodes with status, roles, CPU/memory capacity, and kubelet version", parameters: { type: "object", properties: {} } },
  { name: "kube_list_namespaces", description: "List all namespaces in the cluster", parameters: { type: "object", properties: {} } },
  { name: "kube_list_api_resources", description: "List available Kubernetes API resource types in the core API group", parameters: { type: "object", properties: {} } },
  { name: "kube_list_events", description: "List recent Kubernetes events in a namespace", parameters: { type: "object", properties: { namespace: { type: "string", description: "Namespace (uses default if omitted)" }, allNamespaces: { type: "string", description: "Set to 'true' to list events across all namespaces" } } } },
  // ── Workloads ────────────────────────────────────────────────────────────────
  { name: "kube_list_pods", description: "List pods with status, readiness, restarts, and node assignment", parameters: { type: "object", properties: { namespace: { type: "string", description: "Namespace (uses default if omitted)" }, labelSelector: { type: "string", description: "Label selector filter, e.g. app=nginx" }, allNamespaces: { type: "string", description: "Set to 'true' for all namespaces" } } } },
  { name: "kube_get_pod", description: "Get details of a specific pod including containers, conditions, and status", parameters: { type: "object", properties: { name: { type: "string", description: "Pod name" }, namespace: { type: "string", description: "Namespace" } }, required: ["name"] } },
  { name: "kube_get_pod_logs", description: "Retrieve recent log output from a pod container", parameters: { type: "object", properties: { name: { type: "string", description: "Pod name" }, namespace: { type: "string", description: "Namespace" }, container: { type: "string", description: "Container name (uses first container if omitted)" }, tailLines: { type: "string", description: "Number of log lines to return (default 100)" } }, required: ["name"] } },
  { name: "kube_delete_pod", description: "Delete a pod — it will be recreated by its controller", parameters: { type: "object", properties: { name: { type: "string", description: "Pod name" }, namespace: { type: "string", description: "Namespace" } }, required: ["name"] } },
  { name: "kube_list_deployments", description: "List deployments with desired/ready/available replica counts and image", parameters: { type: "object", properties: { namespace: { type: "string", description: "Namespace" }, allNamespaces: { type: "string", description: "Set to 'true' for all namespaces" } } } },
  { name: "kube_get_deployment", description: "Get details of a specific deployment including strategy and conditions", parameters: { type: "object", properties: { name: { type: "string", description: "Deployment name" }, namespace: { type: "string", description: "Namespace" } }, required: ["name"] } },
  { name: "kube_scale_deployment", description: "Scale a deployment to a specific number of replicas", parameters: { type: "object", properties: { name: { type: "string", description: "Deployment name" }, namespace: { type: "string", description: "Namespace" }, replicas: { type: "string", description: "Desired replica count (non-negative integer)" } }, required: ["name", "replicas"] } },
  { name: "kube_rollout_restart", description: "Trigger a rolling restart of a deployment by updating its restartedAt annotation", parameters: { type: "object", properties: { name: { type: "string", description: "Deployment name" }, namespace: { type: "string", description: "Namespace" } }, required: ["name"] } },
  { name: "kube_rollout_status", description: "Check rollout status and replica conditions of a deployment", parameters: { type: "object", properties: { name: { type: "string", description: "Deployment name" }, namespace: { type: "string", description: "Namespace" } }, required: ["name"] } },
  { name: "kube_list_replicasets", description: "List ReplicaSets with desired/ready counts and owner deployment", parameters: { type: "object", properties: { namespace: { type: "string", description: "Namespace" }, allNamespaces: { type: "string", description: "Set to 'true' for all namespaces" } } } },
  { name: "kube_list_statefulsets", description: "List StatefulSets with replica status and container image", parameters: { type: "object", properties: { namespace: { type: "string", description: "Namespace" }, allNamespaces: { type: "string", description: "Set to 'true' for all namespaces" } } } },
  // ── Services & Networking ────────────────────────────────────────────────────
  { name: "kube_list_services", description: "List services with type, ports, cluster IP, and external IP", parameters: { type: "object", properties: { namespace: { type: "string", description: "Namespace" }, allNamespaces: { type: "string", description: "Set to 'true' for all namespaces" } } } },
  { name: "kube_get_service", description: "Get full details of a specific service including selector and ports", parameters: { type: "object", properties: { name: { type: "string", description: "Service name" }, namespace: { type: "string", description: "Namespace" } }, required: ["name"] } },
  { name: "kube_list_ingresses", description: "List Ingress resources with hostnames, class, and TLS status", parameters: { type: "object", properties: { namespace: { type: "string", description: "Namespace" }, allNamespaces: { type: "string", description: "Set to 'true' for all namespaces" } } } },
  { name: "kube_get_ingress", description: "Get routing rules and TLS config of a specific Ingress", parameters: { type: "object", properties: { name: { type: "string", description: "Ingress name" }, namespace: { type: "string", description: "Namespace" } }, required: ["name"] } },
  { name: "kube_list_endpoints", description: "List endpoint objects showing pod IPs backing each service", parameters: { type: "object", properties: { namespace: { type: "string", description: "Namespace" }, allNamespaces: { type: "string", description: "Set to 'true' for all namespaces" } } } },
  // ── Config & Secrets ─────────────────────────────────────────────────────────
  { name: "kube_list_configmaps", description: "List ConfigMaps with their key names (values not shown)", parameters: { type: "object", properties: { namespace: { type: "string", description: "Namespace" }, allNamespaces: { type: "string", description: "Set to 'true' for all namespaces" } } } },
  { name: "kube_get_configmap", description: "Get a ConfigMap and all its key-value data", parameters: { type: "object", properties: { name: { type: "string", description: "ConfigMap name" }, namespace: { type: "string", description: "Namespace" } }, required: ["name"] } },
  { name: "kube_apply_configmap", description: "Create or update a ConfigMap with the given key-value data", parameters: { type: "object", properties: { name: { type: "string", description: "ConfigMap name" }, namespace: { type: "string", description: "Namespace" }, data: { type: "string", description: "JSON object of string key-value pairs, e.g. {\"KEY\": \"value\"}" } }, required: ["name", "data"] } },
  { name: "kube_list_secrets", description: "List Secrets showing names, types, and key names only (values are never returned)", parameters: { type: "object", properties: { namespace: { type: "string", description: "Namespace" }, allNamespaces: { type: "string", description: "Set to 'true' for all namespaces" } } } },
  { name: "kube_get_secret_keys", description: "Get a Secret's key names only — secret values are never returned for security", parameters: { type: "object", properties: { name: { type: "string", description: "Secret name" }, namespace: { type: "string", description: "Namespace" } }, required: ["name"] } },
  { name: "kube_apply_secret", description: "Create or update a Secret — plain-text values are base64-encoded automatically", parameters: { type: "object", properties: { name: { type: "string", description: "Secret name" }, namespace: { type: "string", description: "Namespace" }, data: { type: "string", description: "JSON object of key-value pairs (plain text)" }, secretType: { type: "string", description: "Secret type (default: Opaque)" } }, required: ["name", "data"] } },
  // ── Storage ──────────────────────────────────────────────────────────────────
  { name: "kube_list_pvcs", description: "List PersistentVolumeClaims with storage class, capacity, and binding status", parameters: { type: "object", properties: { namespace: { type: "string", description: "Namespace" }, allNamespaces: { type: "string", description: "Set to 'true' for all namespaces" } } } },
  { name: "kube_get_pvc", description: "Get details of a specific PersistentVolumeClaim", parameters: { type: "object", properties: { name: { type: "string", description: "PVC name" }, namespace: { type: "string", description: "Namespace" } }, required: ["name"] } },
  { name: "kube_list_pvs", description: "List PersistentVolumes with capacity, access modes, and reclaim policy", parameters: { type: "object", properties: {} } },
  { name: "kube_list_storage_classes", description: "List StorageClasses with provisioner, reclaim policy, and default class flag", parameters: { type: "object", properties: {} } },
  // ── Jobs & CronJobs ──────────────────────────────────────────────────────────
  { name: "kube_list_jobs", description: "List Jobs with completion status and duration", parameters: { type: "object", properties: { namespace: { type: "string", description: "Namespace" }, allNamespaces: { type: "string", description: "Set to 'true' for all namespaces" } } } },
  { name: "kube_get_job", description: "Get details and status of a specific Job", parameters: { type: "object", properties: { name: { type: "string", description: "Job name" }, namespace: { type: "string", description: "Namespace" } }, required: ["name"] } },
  { name: "kube_list_cronjobs", description: "List CronJobs with schedule, last run time, and suspension status", parameters: { type: "object", properties: { namespace: { type: "string", description: "Namespace" }, allNamespaces: { type: "string", description: "Set to 'true' for all namespaces" } } } },
  { name: "kube_trigger_cronjob", description: "Manually trigger a CronJob by creating a Job from its template immediately", parameters: { type: "object", properties: { name: { type: "string", description: "CronJob name" }, namespace: { type: "string", description: "Namespace" } }, required: ["name"] } },
  // ── DaemonSets ────────────────────────────────────────────────────────────────
  { name: "kube_list_daemonsets", description: "List DaemonSets with desired/ready/available pod counts", parameters: { type: "object", properties: { namespace: { type: "string", description: "Namespace" }, allNamespaces: { type: "string", description: "Set to 'true' for all namespaces" } } } },
  { name: "kube_get_daemonset", description: "Get full details of a specific DaemonSet", parameters: { type: "object", properties: { name: { type: "string", description: "DaemonSet name" }, namespace: { type: "string", description: "Namespace" } }, required: ["name"] } },
  // ── Helm ─────────────────────────────────────────────────────────────────────
  { name: "kube_helm_list_releases", description: "List active Helm 3 releases by querying their Kubernetes state secrets", parameters: { type: "object", properties: { namespace: { type: "string", description: "Namespace to search in" }, allNamespaces: { type: "string", description: "Set to 'true' for all namespaces" } } } },
  { name: "kube_helm_get_release_info", description: "Get chart, version, and status metadata for a specific Helm 3 release", parameters: { type: "object", properties: { name: { type: "string", description: "Helm release name" }, namespace: { type: "string", description: "Namespace where the release is installed" } }, required: ["name"] } },
  { name: "kube_helm_delete_release", description: "Delete a Helm 3 release's state secrets — marks release as removed (does not delete workload resources)", parameters: { type: "object", properties: { name: { type: "string", description: "Helm release name" }, namespace: { type: "string", description: "Namespace" } }, required: ["name"] } },
  // ── Manifests ─────────────────────────────────────────────────────────────────
  { name: "kube_apply_manifest", description: "Create or update any Kubernetes resource from a JSON manifest (supports Pod, Service, Deployment, ConfigMap, Secret, Job, CronJob, Ingress, etc.)", parameters: { type: "object", properties: { manifest: { type: "string", description: "Full Kubernetes manifest as a JSON string — must include apiVersion, kind, and metadata.name" } }, required: ["manifest"] } },
  { name: "kube_delete_resource", description: "Delete a Kubernetes resource by kind and name", parameters: { type: "object", properties: { kind: { type: "string", description: "Resource kind, e.g. Pod, Deployment, Service, ConfigMap, Secret, Job, Ingress" }, name: { type: "string", description: "Resource name" }, namespace: { type: "string", description: "Namespace (for namespaced resources)" } }, required: ["kind", "name"] } },
  { name: "kube_describe_resource", description: "Get the full specification and live status of any Kubernetes resource", parameters: { type: "object", properties: { kind: { type: "string", description: "Resource kind, e.g. Pod, Node, Deployment, Namespace, PersistentVolume" }, name: { type: "string", description: "Resource name" }, namespace: { type: "string", description: "Namespace (for namespaced resources)" } }, required: ["kind", "name"] } },
  // ── Observability ─────────────────────────────────────────────────────────────
  { name: "kube_list_hpas", description: "List HorizontalPodAutoscalers with min/max replicas, current, and desired counts", parameters: { type: "object", properties: { namespace: { type: "string", description: "Namespace" }, allNamespaces: { type: "string", description: "Set to 'true' for all namespaces" } } } },
  { name: "kube_list_resource_quotas", description: "List ResourceQuotas showing hard limits and current usage per namespace", parameters: { type: "object", properties: { namespace: { type: "string", description: "Namespace" }, allNamespaces: { type: "string", description: "Set to 'true' for all namespaces" } } } },
];

export function getToolsForProvider(cloudProvider: "aws" | "gcp" | "azure" | "ragflow" | "jira" | "github" | "gitlab" | "teams" | "slack" | "google_chat" | "servicenow" | "postgresql" | "kubernetes"): ToolDefinition[] {
  if (cloudProvider === "kubernetes") return KUBERNETES_TOOLS;
  return ALL_TOOLS[cloudProvider as keyof typeof ALL_TOOLS] ?? [];
}

export const REQUEST_APPROVAL_TOOL: ToolDefinition = {
  name: "request_approval",
  description:
    "Pause the current task and request human approval before proceeding. " +
    "Use this for irreversible, sensitive, or high-impact actions such as deleting resources, " +
    "sending emails to customers, deploying to production, or spending money. " +
    "After calling this tool, summarize what you requested and wait for human response.",
  parameters: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "Clear description of what needs approval and why it requires human review",
      },
      action: {
        type: "string",
        description: "The specific action that will be taken upon approval (be precise and concise)",
      },
      impact: {
        type: "string",
        description: "What will happen if approved — describe consequences, scope, and reversibility",
      },
    },
    required: ["message", "action"],
  },
};

export const SPAWN_AGENT_TOOL: ToolDefinition = {
  name: "spawn_agent",
  description:
    "Delegate a specific subtask to a specialist agent and wait for the result. " +
    "Multiple spawn_agent calls within the same response run in parallel automatically. " +
    "Use the agentId from the available agents list provided in your system context.",
  parameters: {
    type: "object",
    properties: {
      agentId: {
        type: "string",
        description: "The ID of the target agent to delegate to (from the available agents list)",
      },
      agentName: {
        type: "string",
        description: "The display name of the target agent",
      },
      prompt: {
        type: "string",
        description: "The specific task, question, or instructions to send to this agent",
      },
    },
    required: ["agentId", "prompt"],
  },
};

export function getToolByName(name: string): ToolDefinition | undefined {
  if (name === "code_interpreter") return CODE_INTERPRETER_TOOL;
  if (name === "request_approval") return REQUEST_APPROVAL_TOOL;
  if (name === "spawn_agent") return SPAWN_AGENT_TOOL;
  return [...AWS_TOOLS, ...GCP_TOOLS, ...AZURE_TOOLS, ...RAGFLOW_TOOLS, ...JIRA_TOOLS, ...GITHUB_TOOLS, ...GITLAB_TOOLS, ...TEAMS_TOOLS, ...SLACK_TOOLS, ...GOOGLE_CHAT_TOOLS, ...SERVICENOW_TOOLS, ...POSTGRESQL_TOOLS, ...KUBERNETES_TOOLS].find((t) => t.name === name);
}

export function detectProviderFromToolName(name: string): "aws" | "gcp" | "azure" | "ragflow" | "jira" | "github" | "gitlab" | "teams" | "slack" | "google_chat" | "servicenow" | "postgresql" | "kubernetes" | "sandbox" | "approval" | null {
  if (name === "code_interpreter") return "sandbox";
  if (name === "request_approval") return "approval";
  if (name.startsWith("aws_")) return "aws";
  if (name.startsWith("gcp_")) return "gcp";
  if (name.startsWith("azure_")) return "azure";
  if (name.startsWith("ragflow_")) return "ragflow";
  if (name.startsWith("jira_")) return "jira";
  if (name.startsWith("github_")) return "github";
  if (name.startsWith("gitlab_")) return "gitlab";
  if (name.startsWith("teams_")) return "teams";
  if (name.startsWith("slack_")) return "slack";
  if (name.startsWith("google_chat_")) return "google_chat";
  if (name.startsWith("servicenow_")) return "servicenow";
  if (name.startsWith("pg_")) return "postgresql";
  if (name.startsWith("kube_")) return "kubernetes";
  if (name.startsWith("helm_")) return "kubernetes";
  return null;
}

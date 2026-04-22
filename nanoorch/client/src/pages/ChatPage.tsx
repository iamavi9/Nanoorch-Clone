import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Send, Trash2, MessageSquare, Bot, User, Loader2, CheckCircle, XCircle, Terminal, ChevronDown, ChevronUp, AlertCircle, FileText, Code2, GitFork, Pencil, Check, X, Zap, ShieldCheck, ShieldAlert, ShieldOff, PlusCircle, Brain, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatConversation, ChatMessage } from "@shared/schema";

interface WorkspaceAgent {
  id: string;
  name: string;
  orchestratorName: string;
  provider: string;
  model: string;
}

type SubtaskState = {
  id: string;
  agentId: string;
  agentName: string;
  status: "running" | "done" | "error";
  output: string;
};

export type ToolActivityItem = {
  id: string;
  type: "reasoning" | "tool_call";
  toolName?: string;
  reasoning?: string;
  status: "running" | "done" | "error";
  result?: string;
  error?: string;
};

type StreamingMsg = {
  id: string;
  role: "streaming";
  agentId: string;
  agentName: string;
  content: string;
  streaming: true;
  codeRunning?: string;
  subtasks: SubtaskState[];
  toolActivity: ToolActivityItem[];
  conversationId: string;
  mentions: string[];
  messageType: "text";
  metadata: Record<string, unknown>;
  createdAt: Date | null;
  bypassed?: boolean;
};
type DisplayMessage = ChatMessage | StreamingMsg;

type ConfirmStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

type ConfirmState = {
  status: ConfirmStatus;
  logs: Array<{ level: string; message: string }>;
  streamedContent: string;
  resultMessageId?: string;
};

const PROVIDER_COLORS: Record<string, string> = {
  openai: "bg-green-500",
  anthropic: "bg-orange-500",
  gemini: "bg-blue-500",
};

function AgentRoster({ agents, onMention }: { agents: WorkspaceAgent[]; onMention: (name: string) => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, WorkspaceAgent[]>();
    for (const a of agents) {
      const key = a.orchestratorName ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return Array.from(map.entries());
  }, [agents]);

  const [open, setOpen] = useState<Set<string>>(() => {
    const firstKey = groups[0]?.[0] ?? "";
    return new Set(agents.length <= 8 ? groups.map(([k]) => k) : firstKey ? [firstKey] : []);
  });

  const toggle = (key: string) => setOpen(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  return (
    <div className="space-y-1.5">
      {groups.map(([orchName, groupAgents]) => (
        <div key={orchName}>
          <button
            className="w-full flex items-center gap-1 text-[10px] text-muted-foreground/55 hover:text-muted-foreground/80 transition-colors py-0.5"
            onClick={() => toggle(orchName)}
            data-testid={`agent-group-${orchName}`}
          >
            <ChevronDown className={cn(
              "w-2.5 h-2.5 shrink-0 transition-transform duration-150",
              open.has(orchName) ? "" : "-rotate-90"
            )} />
            <span className="truncate font-semibold uppercase tracking-wider flex-1 text-left">{orchName}</span>
            <span className="shrink-0 tabular-nums ml-1">{groupAgents.length}</span>
          </button>

          {open.has(orchName) && (
            <div className="grid grid-cols-2 gap-1 mt-1 pl-1">
              {groupAgents.map(agent => (
                <button
                  key={agent.id}
                  className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-accent/70 active:bg-accent transition-colors text-left min-w-0"
                  title={`${agent.name}\n${agent.provider} · ${agent.orchestratorName}`}
                  onClick={() => onMention(agent.name)}
                  data-testid={`agent-chip-${agent.id}`}
                >
                  <div className={cn(
                    "w-4 h-4 rounded flex items-center justify-center text-white text-[9px] font-bold shrink-0",
                    PROVIDER_COLORS[agent.provider] ?? "bg-zinc-500"
                  )}>
                    {agent.name[0].toUpperCase()}
                  </div>
                  <span className="text-[11px] text-foreground/80 truncate leading-tight">{agent.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function parseMentionNames(text: string): string[] {
  const results: string[] = [];
  const regex = /@([\w][^\s@]*)/g;
  let m;
  while ((m = regex.exec(text)) !== null) results.push(m[1]);
  return results;
}

function renderWithMentions(text: string, isUser = false) {
  const parts = text.split(/(@[\w][^\s@]*)/g);
  return parts.map((part, i) =>
    part.startsWith("@")
      ? <span key={i} className={isUser
          ? "font-bold underline decoration-white/60"
          : "font-semibold text-primary"
        }>{part}</span>
      : <span key={i}>{part}</span>
  );
}

interface Props { workspaceId: string }

export default function ChatPage({ workspaceId }: Props) {
  const qc = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [confirmStates, setConfirmStates] = useState<Map<string, ConfirmState>>(new Map());
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [convsOpen, setConvsOpen] = useState(true);
  const [agentsOpen, setAgentsOpen] = useState(true);

  const { data: conversations = [], isLoading: convsLoading } = useQuery<ChatConversation[]>({
    queryKey: [`/api/workspaces/${workspaceId}/conversations`],
  });

  const { data: defaultConv } = useQuery<ChatConversation>({
    queryKey: [`/api/workspaces/${workspaceId}/default-conversation`],
  });

  const { data: agents = [] } = useQuery<WorkspaceAgent[]>({
    queryKey: [`/api/workspaces/${workspaceId}/agents`],
  });

  const allConvs: ChatConversation[] = conversations.length > 0
    ? conversations
    : (defaultConv ? [defaultConv] : []);

  useEffect(() => {
    if (!activeConvId && allConvs.length > 0) {
      setActiveConvId(allConvs[0].id);
    }
  }, [allConvs.length]);

  useEffect(() => {
    if (!activeConvId) return;
    setDisplayMessages([]);
    setConfirmStates(new Map());
    fetch(`/api/conversations/${activeConvId}/messages`)
      .then(r => r.json())
      .then((msgs: ChatMessage[]) => {
        setDisplayMessages(msgs ?? []);
        const newStates = new Map<string, ConfirmState>();
        for (const msg of (msgs ?? [])) {
          if (msg.messageType === "pending_confirmation" && msg.metadata) {
            const meta = msg.metadata as Record<string, unknown>;
            const rawStatus = (meta.status as string) ?? "pending";
            const status: ConfirmStatus =
              rawStatus === "running" ? "cancelled" :
              (rawStatus as ConfirmStatus);
            newStates.set(msg.id, { status, logs: [], streamedContent: "" });
          }
        }
        setConfirmStates(newStates);
      });
  }, [activeConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages]);

  const createConvMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/workspaces/${workspaceId}/conversations`, { title: "New Chat" });
      return res.json() as Promise<{ id: string; title: string }>;
    },
    onSuccess: (conv) => {
      qc.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/conversations`] });
      setActiveConvId(conv.id);
      setDisplayMessages([]);
      setConfirmStates(new Map());
    },
  });

  const deleteConvMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/conversations/${id}`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/conversations`] });
      if (activeConvId === id) {
        setActiveConvId(null);
        setDisplayMessages([]);
        setConfirmStates(new Map());
      }
    },
  });

  const renameConvMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      apiRequest("PATCH", `/api/conversations/${id}`, { title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/conversations`] });
      setEditingConvId(null);
    },
  });

  const startEditing = (conv: ChatConversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingConvId(conv.id);
    setEditingTitle(conv.title);
  };

  const commitRename = (id: string) => {
    const trimmed = editingTitle.trim();
    if (trimmed) renameConvMutation.mutate({ id, title: trimmed });
    else setEditingConvId(null);
  };

  const getActiveMentionQuery = () => {
    const el = textareaRef.current;
    if (!el) return null;
    const before = el.value.slice(0, el.selectionStart);
    const m = before.match(/@([\w]*)$/);
    return m ? m[1] : null;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
    const q = getActiveMentionQuery();
    setMentionQuery(q);
    setMentionIndex(0);
  };

  const insertMention = (agentName: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const pos = el.selectionStart;
    const before = el.value.slice(0, pos);
    const after = el.value.slice(pos);
    const atIdx = before.lastIndexOf("@");
    const newText = before.slice(0, atIdx) + `@${agentName} ` + after;
    setInputText(newText);
    setMentionQuery(null);
    setTimeout(() => {
      el.focus();
      const newPos = atIdx + agentName.length + 2;
      el.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const quickMention = (agentName: string) => {
    setInputText(prev => prev ? prev.trimEnd() + ` @${agentName} ` : `@${agentName} `);
    setMentionQuery(null);
    setTimeout(() => { textareaRef.current?.focus(); }, 0);
  };

  const filteredAgents = mentionQuery !== null
    ? agents.filter(a => a.name.toLowerCase().includes(mentionQuery.toLowerCase()))
    : [];

  const sendMessage = async () => {
    if (!inputText.trim() || !activeConvId || isStreaming) return;
    const text = inputText.trim();
    const mentionedNames = parseMentionNames(text);
    const mentionedAgents = agents.filter(a =>
      mentionedNames.some(n => n.toLowerCase() === a.name.toLowerCase())
    );
    const mentionedAgentIds = mentionedAgents.map(a => a.id);
    setInputText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setMentionQuery(null);
    setIsStreaming(true);
    let currentCoordinatorAgentId: string | null = null;

    try {
      const resp = await apiRequest("POST", `/api/conversations/${activeConvId}/chat`, { content: text, mentionedAgentIds });
      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let event: any;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          if (event.type === "user_message") {
            setDisplayMessages(prev => [...prev, event.message as ChatMessage]);
          } else if (event.type === "confirmation") {
            const msg = event.message as ChatMessage;
            setDisplayMessages(prev => [...prev, msg]);
            setConfirmStates(prev => {
              const next = new Map(prev);
              next.set(msg.id, { status: "pending", logs: [], streamedContent: "" });
              return next;
            });
          } else if (event.type === "agent_start") {
            const { agentId, agentName, bypassed } = event;
            currentCoordinatorAgentId = agentId;
            const placeholder: StreamingMsg = {
              id: `streaming-${agentId}`,
              role: "streaming",
              agentId,
              agentName,
              content: "",
              streaming: true,
              subtasks: [],
              toolActivity: [],
              conversationId: activeConvId,
              mentions: [],
              messageType: "text",
              metadata: {},
              createdAt: new Date(),
              bypassed: bypassed === true,
            };
            setDisplayMessages(prev => [...prev, placeholder]);
          } else if (event.type === "reasoning") {
            const { agentId, content } = event;
            const item: ToolActivityItem = {
              id: `r-${agentId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: "reasoning",
              reasoning: content,
              status: "done",
            };
            setDisplayMessages(prev => prev.map(m =>
              m.id === `streaming-${agentId}` && m.role === "streaming"
                ? { ...m, toolActivity: [...((m as StreamingMsg).toolActivity ?? []), item] }
                : m
            ));
          } else if (event.type === "tool_call") {
            const { agentId, toolName, callId } = event;
            const item: ToolActivityItem = { id: callId, type: "tool_call", toolName, status: "running" };
            setDisplayMessages(prev => prev.map(m =>
              m.id === `streaming-${agentId}` && m.role === "streaming"
                ? { ...m, toolActivity: [...((m as StreamingMsg).toolActivity ?? []), item] }
                : m
            ));
          } else if (event.type === "tool_call_done") {
            const { agentId, callId, result, error } = event;
            setDisplayMessages(prev => prev.map(m => {
              if (m.id !== `streaming-${agentId}` || m.role !== "streaming") return m;
              const updated = ((m as StreamingMsg).toolActivity ?? []).map((item) =>
                item.id === callId
                  ? { ...item, status: (error ? "error" : "done") as "done" | "error", result: result ?? undefined, error: error ?? undefined }
                  : item
              );
              return { ...m, toolActivity: updated };
            }));
          } else if (event.type === "code_running") {
            const { agentId, language } = event;
            setDisplayMessages(prev => prev.map(m =>
              m.id === `streaming-${agentId}` && m.role === "streaming"
                ? { ...m, codeRunning: language as string }
                : m
            ));
          } else if (event.type === "chunk") {
            const { agentId, content } = event;
            setDisplayMessages(prev => prev.map(m =>
              m.id === `streaming-${agentId}` && m.role === "streaming"
                ? { ...m, content: m.content + content, codeRunning: undefined }
                : m
            ));
          } else if (event.type === "agent_done") {
            const { agentId, messageId, agentName, metadata } = event;
            setDisplayMessages(prev => prev.map(m =>
              m.id === `streaming-${agentId}` && m.role === "streaming"
                ? { ...m, id: messageId, role: "agent" as const, agentName, metadata: metadata ?? {}, streaming: undefined } as unknown as ChatMessage
                : m
            ));
          } else if (event.type === "agent_error") {
            setDisplayMessages(prev => prev.filter(m => m.id !== `streaming-${event.agentId}`));
          } else if (event.type === "subtask_start") {
            if (!currentCoordinatorAgentId) continue;
            const coordId = currentCoordinatorAgentId;
            const newSubtask: SubtaskState = {
              id: event.subtaskId,
              agentId: event.agentId,
              agentName: event.agentName,
              status: "running",
              output: "",
            };
            setDisplayMessages(prev => prev.map(m =>
              m.id === `streaming-${coordId}` && m.role === "streaming"
                ? { ...m, subtasks: [...((m as StreamingMsg).subtasks ?? []), newSubtask] }
                : m
            ));
          } else if (event.type === "subtask_chunk") {
            if (!currentCoordinatorAgentId) continue;
            const coordId = currentCoordinatorAgentId;
            setDisplayMessages(prev => prev.map(m =>
              m.id === `streaming-${coordId}` && m.role === "streaming"
                ? {
                    ...m,
                    subtasks: ((m as StreamingMsg).subtasks ?? []).map(st =>
                      st.id === event.subtaskId ? { ...st, output: st.output + event.content } : st
                    ),
                  }
                : m
            ));
          } else if (event.type === "subtask_done") {
            if (!currentCoordinatorAgentId) continue;
            const coordId = currentCoordinatorAgentId;
            setDisplayMessages(prev => prev.map(m =>
              m.id === `streaming-${coordId}` && m.role === "streaming"
                ? {
                    ...m,
                    subtasks: ((m as StreamingMsg).subtasks ?? []).map(st =>
                      st.id === event.subtaskId ? { ...st, status: "done", output: event.output } : st
                    ),
                  }
                : m
            ));
          } else if (event.type === "subtask_error") {
            if (!currentCoordinatorAgentId) continue;
            const coordId = currentCoordinatorAgentId;
            setDisplayMessages(prev => prev.map(m =>
              m.id === `streaming-${coordId}` && m.role === "streaming"
                ? {
                    ...m,
                    subtasks: ((m as StreamingMsg).subtasks ?? []).map(st =>
                      st.id === event.subtaskId ? { ...st, status: "error", output: event.error } : st
                    ),
                  }
                : m
            ));
          }
        }
      }
    } catch (err) {
      console.error("Chat error:", err);
    } finally {
      setIsStreaming(false);
      // Refresh conversation list so auto-generated title is picked up
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/conversations`] });
      }, 2500);
    }
  };

  const handleApprove = useCallback(async (msgId: string, convId: string) => {
    setConfirmStates(prev => {
      const next = new Map(prev);
      next.set(msgId, { status: "running", logs: [], streamedContent: "" });
      return next;
    });

    try {
      const resp = await apiRequest("POST", `/api/conversations/${convId}/messages/${msgId}/confirm`, { approved: true });
      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let event: any;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          if (event.type === "task_log") {
            setConfirmStates(prev => {
              const next = new Map(prev);
              const cur = next.get(msgId) ?? { status: "running" as ConfirmStatus, logs: [], streamedContent: "" };
              next.set(msgId, { ...cur, logs: [...cur.logs, { level: event.level, message: event.message }] });
              return next;
            });
          } else if (event.type === "chunk") {
            setConfirmStates(prev => {
              const next = new Map(prev);
              const cur = next.get(msgId) ?? { status: "running" as ConfirmStatus, logs: [], streamedContent: "" };
              next.set(msgId, { ...cur, streamedContent: cur.streamedContent + event.content });
              return next;
            });
          } else if (event.type === "done") {
            const resultMsg = event.resultMessage as ChatMessage;
            setDisplayMessages(prev => [...prev, resultMsg]);
            setConfirmStates(prev => {
              const next = new Map(prev);
              const cur = next.get(msgId) ?? { status: "running" as ConfirmStatus, logs: [], streamedContent: "" };
              next.set(msgId, { ...cur, status: "completed", resultMessageId: resultMsg.id });
              return next;
            });
          } else if (event.type === "error") {
            setConfirmStates(prev => {
              const next = new Map(prev);
              const cur = next.get(msgId) ?? { status: "running" as ConfirmStatus, logs: [], streamedContent: "" };
              next.set(msgId, { ...cur, status: "failed" });
              return next;
            });
          }
        }
      }
    } catch (err) {
      console.error("Confirm error:", err);
      setConfirmStates(prev => {
        const next = new Map(prev);
        const cur = next.get(msgId) ?? { status: "running" as ConfirmStatus, logs: [], streamedContent: "" };
        next.set(msgId, { ...cur, status: "failed" });
        return next;
      });
    }
  }, []);

  const handleCancel = useCallback(async (msgId: string, convId: string) => {
    setConfirmStates(prev => {
      const next = new Map(prev);
      const cur = next.get(msgId) ?? { status: "cancelled" as ConfirmStatus, logs: [], streamedContent: "" };
      next.set(msgId, { ...cur, status: "cancelled" });
      return next;
    });
    try {
      await apiRequest("POST", `/api/conversations/${convId}/messages/${msgId}/confirm`, { approved: false });
    } catch {}
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && filteredAgents.length > 0) {
      if (e.key === "Escape") { e.preventDefault(); setMentionQuery(null); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % filteredAgents.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + filteredAgents.length) % filteredAgents.length);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        insertMention(filteredAgents[mentionIndex]?.name ?? filteredAgents[0].name);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div className="flex h-full overflow-hidden bg-background">
      <div className="w-52 flex flex-col border-r shrink-0 overflow-hidden">
        {/* ── New Chat button ── */}
        <div className="p-3 border-b shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-1.5 text-xs"
            onClick={() => createConvMutation.mutate()}
            disabled={createConvMutation.isPending}
            data-testid="button-new-chat"
          >
            <Plus className="w-3 h-3" /> New Chat
          </Button>
        </div>

        {/* ── Chats section (collapsible, takes remaining space when open) ── */}
        <div className={cn("flex flex-col border-b", convsOpen ? "flex-1 min-h-0" : "shrink-0")}>
          <button
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider hover:text-muted-foreground/80 transition-colors shrink-0"
            onClick={() => setConvsOpen(v => !v)}
            data-testid="toggle-chats-sidebar"
          >
            <span className="flex items-center gap-1">
              <ChevronDown className={cn("w-2.5 h-2.5 transition-transform duration-150", convsOpen ? "" : "-rotate-90")} />
              Chats
            </span>
            {allConvs.length > 0 && (
              <span className="tabular-nums text-muted-foreground/40">{allConvs.length}</span>
            )}
          </button>

          {convsOpen && (
            <ScrollArea className="flex-1 py-1">
              <div className="px-2 space-y-0.5">
                {convsLoading && <p className="text-xs text-muted-foreground px-2 py-2">Loading…</p>}
                {allConvs.map(conv => {
                  const isActive = activeConvId === conv.id;
                  const isEditing = editingConvId === conv.id;
                  return (
                    <div
                      key={conv.id}
                      className={cn(
                        "flex items-center gap-1 px-2 py-1.5 rounded-md text-xs transition-colors cursor-pointer",
                        isEditing
                          ? "bg-accent/70"
                          : isActive
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground hover:bg-accent/50"
                      )}
                      onClick={() => !isEditing && setActiveConvId(conv.id)}
                      data-testid={`conv-item-${conv.id}`}
                    >
                      <MessageSquare className="w-3 h-3 shrink-0 opacity-60" />

                      {isEditing ? (
                        /* ── Inline edit mode ── */
                        <div className="flex items-center gap-1 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
                          <input
                            autoFocus
                            value={editingTitle}
                            onChange={e => setEditingTitle(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") commitRename(conv.id);
                              if (e.key === "Escape") setEditingConvId(null);
                            }}
                            onBlur={() => commitRename(conv.id)}
                            className="flex-1 min-w-0 bg-transparent border-b border-primary outline-none text-xs text-foreground py-0.5"
                            data-testid={`input-rename-conv-${conv.id}`}
                          />
                          <button
                            onMouseDown={e => { e.preventDefault(); commitRename(conv.id); }}
                            className="text-primary hover:text-primary/80 shrink-0"
                            data-testid={`button-confirm-rename-${conv.id}`}
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onMouseDown={e => { e.preventDefault(); setEditingConvId(null); }}
                            className="text-muted-foreground hover:text-foreground shrink-0"
                            data-testid={`button-cancel-rename-${conv.id}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        /* ── Normal display mode ── */
                        <>
                          <span className="truncate flex-1">{conv.title}</span>
                          {isActive && (
                            <div className="flex items-center gap-0.5 shrink-0 ml-1">
                              <button
                                className="p-0.5 rounded hover:bg-accent-foreground/10 text-accent-foreground/70 hover:text-accent-foreground"
                                onClick={e => startEditing(conv, e)}
                                title="Rename"
                                data-testid={`button-rename-conv-${conv.id}`}
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                className="p-0.5 rounded hover:bg-accent-foreground/10 text-accent-foreground/70 hover:text-destructive"
                                onClick={e => { e.stopPropagation(); deleteConvMutation.mutate(conv.id); }}
                                title="Delete"
                                data-testid={`button-delete-conv-${conv.id}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
                {!convsLoading && allConvs.length === 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-2">No conversations yet</p>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* ── Agents section (collapsible, capped height with scroll when open) ── */}
        <div className={cn(
          "flex flex-col shrink-0",
          agentsOpen && agents.length > 0 ? "max-h-[45%] min-h-0 overflow-hidden" : ""
        )}>
          <button
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider hover:text-muted-foreground/80 transition-colors"
            onClick={() => setAgentsOpen(v => !v)}
            data-testid="toggle-agents-sidebar"
          >
            <span className="flex items-center gap-1">
              <ChevronDown className={cn("w-2.5 h-2.5 transition-transform duration-150", agentsOpen ? "" : "-rotate-90")} />
              Agents
            </span>
            {agents.length > 0 && (
              <span className="tabular-nums text-muted-foreground/40">{agents.length}</span>
            )}
          </button>

          {agentsOpen && (
            agents.length === 0
              ? <p className="text-xs text-muted-foreground/60 px-3 pb-2">No agents</p>
              : <ScrollArea className="flex-1 pb-2">
                  <div className="px-3">
                    <AgentRoster agents={agents} onMention={quickMention} />
                  </div>
                </ScrollArea>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <div className="h-14 border-b flex items-center px-5 gap-2 shrink-0">
          <MessageSquare className="w-4 h-4 text-primary" />
          <h1 className="font-semibold">Chat</h1>
          {agents.length > 0 && (
            <span className="text-xs text-muted-foreground">
              · Type <kbd className="font-mono bg-muted rounded px-1">@name</kbd> to mention an agent
            </span>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-5 max-w-3xl mx-auto w-full">
            {displayMessages.length === 0 && !isStreaming && (
              <div className="flex flex-col items-center justify-center h-52 text-center">
                <Bot className="w-12 h-12 mb-4 text-muted-foreground/30" />
                <p className="text-sm font-medium text-muted-foreground">
                  {agents.length === 0 ? "No agents configured" : "Start a conversation"}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs">
                  {agents.length === 0
                    ? "Create agents from an orchestrator first, then come back to chat"
                    : `Mention @${agents[0]?.name ?? "AgentName"} to get a response from that agent`
                  }
                </p>
              </div>
            )}

            {displayMessages.map(msg => {
              if ((msg as ChatMessage).messageType === "pending_confirmation") {
                const confirmState = confirmStates.get(msg.id) ?? { status: "pending", logs: [], streamedContent: "" };
                return (
                  <ConfirmationCard
                    key={msg.id}
                    message={msg as ChatMessage}
                    confirmState={confirmState}
                    convId={activeConvId!}
                    onApprove={() => handleApprove(msg.id, activeConvId!)}
                    onCancel={() => handleCancel(msg.id, activeConvId!)}
                  />
                );
              }
              if ((msg as ChatMessage).messageType === "task_result") {
                return <MessageBubble key={msg.id} message={msg} isTaskResult />;
              }
              return <MessageBubble key={msg.id} message={msg} />;
            })}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <div className="border-t p-4 shrink-0">
          <div className="max-w-3xl mx-auto relative">
            {mentionQuery !== null && filteredAgents.length > 0 && (
              <div
                className="absolute bottom-full mb-2 left-0 bg-popover border rounded-xl shadow-xl z-50 min-w-[220px] overflow-hidden"
                data-testid="mention-dropdown"
              >
                <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b">
                  Agents
                </div>
                {filteredAgents.map((agent, idx) => (
                  <button
                    key={agent.id}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors",
                      idx === mentionIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                    )}
                    onMouseDown={(e) => { e.preventDefault(); insertMention(agent.name); }}
                    onMouseEnter={() => setMentionIndex(idx)}
                    data-testid={`mention-option-${agent.id}`}
                  >
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0",
                      PROVIDER_COLORS[agent.provider] ?? "bg-zinc-500"
                    )}>
                      {agent.name[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{agent.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {agent.orchestratorName} · {agent.provider}
                      </div>
                    </div>
                    {idx === mentionIndex && (
                      <kbd className="ml-auto text-[10px] font-mono bg-muted rounded px-1 text-muted-foreground">↵</kbd>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2">
              <Textarea
                ref={textareaRef}
                placeholder={agents.length > 0
                  ? `Message… type @ to mention an agent`
                  : "Message…"
                }
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                rows={1}
                className="resize-none min-h-[44px] max-h-[200px] flex-1 leading-relaxed"
                disabled={isStreaming || !activeConvId}
                data-testid="input-chat-message"
              />
              <Button
                onClick={sendMessage}
                disabled={!inputText.trim() || isStreaming || !activeConvId}
                className="h-[44px] w-[44px] p-0 shrink-0"
                data-testid="button-send-message"
              >
                {isStreaming
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Send className="w-4 h-4" />
                }
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground/60 mt-1.5 ml-1">
              Enter to send · Shift+Enter for newline · ↑↓ to navigate · ↵ to select @mention
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ConfirmationCardProps {
  message: ChatMessage;
  confirmState: ConfirmState;
  convId: string;
  onApprove: () => void;
  onCancel: () => void;
}

type PreflightOperation = {
  tool: string;
  description: string;
  riskLevel: "read-only" | "creates" | "modifies" | "deletes";
};

type PreflightData = {
  summary: string;
  operations: PreflightOperation[];
};

function RiskBadge({ level }: { level: PreflightOperation["riskLevel"] }) {
  const config = {
    "read-only":  { icon: ShieldCheck,  label: "read-only", cls: "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800" },
    "creates":   { icon: PlusCircle,   label: "creates",   cls: "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800" },
    "modifies":  { icon: ShieldAlert,  label: "modifies",  cls: "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800" },
    "deletes":   { icon: ShieldOff,    label: "deletes",   cls: "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800" },
  }[level] ?? { icon: AlertCircle, label: level, cls: "text-muted-foreground bg-muted border-border" };
  const Icon = config.icon;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-medium border rounded px-1.5 py-0.5 shrink-0", config.cls)}>
      <Icon className="w-2.5 h-2.5" />
      {config.label}
    </span>
  );
}

function ConfirmationCard({ message, confirmState, onApprove, onCancel }: ConfirmationCardProps) {
  const [logsOpen, setLogsOpen] = useState(false);
  const meta = (message.metadata ?? {}) as Record<string, unknown>;
  const agentName = meta.agentName as string ?? "Agent";
  const proposedAction = meta.proposedAction as string ?? "";
  const preflight = meta.preflight as PreflightData | null ?? null;
  const { status, logs, streamedContent } = confirmState;

  const isPending = status === "pending";
  const isRunning = status === "running";
  const isDone = status === "completed" || status === "failed";
  const isCancelled = status === "cancelled";

  const hasWriteOps = preflight?.operations?.some(op => op.riskLevel !== "read-only");

  return (
    <div
      className="flex gap-3"
      data-testid={`confirmation-card-${message.id}`}
    >
      <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-white bg-amber-500">
        <Terminal className="w-3.5 h-3.5" />
      </div>

      <div className="flex-1 max-w-[75%]">
        <div className="flex items-center gap-2 px-1 mb-1">
          <span className="text-xs font-semibold text-foreground">{agentName}</span>
          <span className="text-xs text-muted-foreground">wants to run a cloud action</span>
        </div>

        <div className="bg-muted border rounded-xl overflow-hidden">
          <div className="px-4 py-3 space-y-3">

            {/* Preflight summary and operations */}
            {preflight ? (
              <div>
                {preflight.summary && (
                  <p className="text-sm text-foreground mb-2">{preflight.summary}</p>
                )}
                {preflight.operations?.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Predicted operations</p>
                    <div className="space-y-1">
                      {preflight.operations.map((op, i) => (
                        <div key={i} className="flex items-start gap-2 bg-background/60 rounded-md px-2.5 py-1.5">
                          <RiskBadge level={op.riskLevel} />
                          <div className="min-w-0">
                            <p className="text-xs text-foreground">{op.description}</p>
                            <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{op.tool}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <Terminal className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Requested action</p>
                  <p className="text-sm text-foreground font-mono break-all bg-background/60 rounded-md px-2 py-1.5">
                    {proposedAction}
                  </p>
                </div>
              </div>
            )}

            {/* Warning for write operations */}
            {isPending && (
              <p className="text-xs text-muted-foreground/80 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" />
                {hasWriteOps
                  ? "This will make changes using your cloud credentials. Review carefully before approving."
                  : "This will execute in an isolated environment using your cloud credentials."}
              </p>
            )}

            {/* Action buttons */}
            {isPending && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={onApprove}
                  data-testid={`button-approve-${message.id}`}
                >
                  <CheckCircle className="w-3.5 h-3.5" /> Approve & Run
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  onClick={onCancel}
                  data-testid={`button-cancel-${message.id}`}
                >
                  <XCircle className="w-3.5 h-3.5" /> Cancel
                </Button>
              </div>
            )}

            {isRunning && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                <span>Executing in isolated environment…</span>
              </div>
            )}

            {isDone && (
              <div className={cn(
                "flex items-center gap-1.5 text-xs font-medium",
                status === "completed" ? "text-green-600 dark:text-green-400" : "text-destructive"
              )}>
                {status === "completed"
                  ? <CheckCircle className="w-3.5 h-3.5" />
                  : <XCircle className="w-3.5 h-3.5" />
                }
                {status === "completed" ? "Completed — see result below" : "Execution failed — see result below"}
              </div>
            )}

            {isCancelled && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <XCircle className="w-3.5 h-3.5" />
                Cancelled
              </div>
            )}
          </div>

          {(isRunning || isDone) && logs.length > 0 && (
            <div className="border-t">
              <button
                className="w-full flex items-center justify-between px-4 py-2 text-xs text-muted-foreground hover:bg-accent/40 transition-colors"
                onClick={() => setLogsOpen(v => !v)}
                data-testid={`button-toggle-logs-${message.id}`}
              >
                <span className="flex items-center gap-1.5">
                  <Terminal className="w-3 h-3" />
                  Execution logs ({logs.length})
                </span>
                {logsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {logsOpen && (
                <div className="px-4 pb-3 max-h-48 overflow-y-auto">
                  <div className="font-mono text-xs space-y-0.5 bg-black/20 rounded-md p-2">
                    {logs.map((log, i) => (
                      <div
                        key={i}
                        className={cn(
                          "flex gap-2",
                          log.level === "error" ? "text-red-400" :
                          log.level === "warn" ? "text-amber-400" :
                          "text-green-400"
                        )}
                      >
                        <span className="shrink-0 text-muted-foreground/50">[{log.level}]</span>
                        <span className="break-all">{log.message}</span>
                      </div>
                    ))}
                    {isRunning && streamedContent && (
                      <div className="text-blue-400 break-all">{streamedContent}</div>
                    )}
                    {isRunning && (
                      <div className="text-muted-foreground/50 animate-pulse">▊</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface SourceChunk {
  content: string;
  documentName: string;
  score: number;
  datasetId?: string;
}

function SourcesAccordion({ sources }: { sources: SourceChunk[] }) {
  const [open, setOpen] = useState(false);
  const unique = sources.reduce<SourceChunk[]>((acc, s) => {
    if (!acc.find((x) => x.documentName === s.documentName && Math.abs(x.score - s.score) < 0.001)) acc.push(s);
    return acc;
  }, []);

  return (
    <div className="mt-1.5 rounded-xl border border-border/60 overflow-hidden text-xs">
      <button
        className="w-full flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 hover:bg-muted text-muted-foreground font-medium transition-colors"
        onClick={() => setOpen((o) => !o)}
        data-testid="button-toggle-sources"
      >
        <FileText className="w-3 h-3 shrink-0" />
        <span>{unique.length} source{unique.length !== 1 ? "s" : ""}</span>
        {open ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
      </button>
      {open && (
        <div className="divide-y divide-border/40 bg-background/60">
          {unique.map((s, i) => (
            <div key={i} className="px-3 py-2 flex items-start gap-2" data-testid={`source-item-${i}`}>
              <FileText className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground truncate">{s.documentName || "Unknown document"}</p>
                <p className="text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">{s.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SubtaskPanel({ subtasks }: { subtasks: SubtaskState[] }) {
  return (
    <div className="mb-2 rounded-xl border border-primary/20 bg-background/60 p-2.5 space-y-1.5" data-testid="subtask-panel">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        <GitFork className="w-3 h-3" />
        Parallel subtasks ({subtasks.length})
      </div>
      {subtasks.map(st => (
        <div key={st.id} className="flex items-start gap-2 text-xs" data-testid={`subtask-${st.id}`}>
          <div className="shrink-0 mt-0.5">
            {st.status === "running" && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
            {st.status === "done" && <CheckCircle className="w-3 h-3 text-green-500" />}
            {st.status === "error" && <XCircle className="w-3 h-3 text-destructive" />}
          </div>
          <div className="min-w-0 flex-1">
            <span className="font-medium text-foreground">{st.agentName}</span>
            {st.status === "running" && !st.output && (
              <span className="text-muted-foreground animate-pulse"> — working…</span>
            )}
            {st.output && (
              <p className={cn(
                "mt-0.5 line-clamp-2 leading-relaxed",
                st.status === "running" ? "text-muted-foreground/60 italic" : "text-muted-foreground"
              )}>
                {st.output}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ThoughtProcess({
  items,
  isStreaming,
}: {
  items: ToolActivityItem[];
  isStreaming: boolean;
}) {
  const [open, setOpen] = useState(isStreaming);
  const hasActivity = items.length > 0;
  const runningItem = items.find((i) => i.status === "running");

  // Auto-open when activity arrives during streaming
  useEffect(() => {
    if (isStreaming && hasActivity) setOpen(true);
  }, [isStreaming, hasActivity]);

  // Auto-collapse when streaming completes
  useEffect(() => {
    if (!isStreaming) setOpen(false);
  }, [isStreaming]);

  if (!hasActivity && !isStreaming) return null;
  if (!hasActivity && isStreaming) return null; // nothing yet

  return (
    <div className="w-full rounded-xl border border-border/60 overflow-hidden text-xs mt-1" data-testid="thought-process-panel">
      {/* Header toggle */}
      <button
        className="w-full flex items-center gap-1.5 px-3 py-1.5 bg-muted/40 hover:bg-muted/70 text-muted-foreground font-medium transition-colors"
        onClick={() => setOpen((o) => !o)}
        data-testid="button-toggle-thought-process"
      >
        <Brain className="w-3 h-3 shrink-0 text-blue-400" />
        <span className="flex-1 text-left">
          {isStreaming && runningItem
            ? <span className="flex items-center gap-1">
                <Loader2 className="w-2.5 h-2.5 animate-spin inline" />
                {runningItem.type === "tool_call"
                  ? `Calling ${runningItem.toolName}…`
                  : "Thinking…"
                }
              </span>
            : isStreaming
              ? <span className="animate-pulse">Processing…</span>
              : `Thought process · ${items.length} step${items.length !== 1 ? "s" : ""}`
          }
        </span>
        {open ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
      </button>

      {open && (
        <div className="divide-y divide-border/30 bg-background/50">
          {items.map((item, idx) => (
            <div key={item.id} className="px-3 py-2" data-testid={`thought-step-${idx}`}>
              {item.type === "reasoning" ? (
                <div className="flex gap-2 items-start">
                  <Brain className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide mb-0.5">Reasoning</div>
                    <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap line-clamp-4">
                      {item.reasoning}
                    </p>
                  </div>
                </div>
              ) : (
                <ToolCallRow item={item} />
              )}
            </div>
          ))}
          {isStreaming && !runningItem && (
            <div className="px-3 py-2 flex items-center gap-1.5 text-muted-foreground/60">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Generating response…</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToolCallRow({ item }: { item: ToolActivityItem }) {
  const [open, setOpen] = useState(false);
  const isRunning = item.status === "running";
  const isError = item.status === "error";

  return (
    <div className="flex gap-2 items-start">
      <div className="shrink-0 mt-0.5">
        {isRunning
          ? <Loader2 className="w-3 h-3 animate-spin text-orange-400" />
          : isError
            ? <XCircle className="w-3 h-3 text-red-400" />
            : <CheckCircle className="w-3 h-3 text-green-400" />
        }
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Wrench className="w-2.5 h-2.5 text-orange-400 shrink-0" />
          <span className="font-mono text-[10px] font-semibold text-orange-400">{item.toolName}</span>
          {((item.result != null && item.result.length > 0) || item.error) && (
            <button
              onClick={() => setOpen((o) => !o)}
              className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
              data-testid={`button-toggle-tool-result-${item.id}`}
            >
              {open ? "hide" : "result"}
            </button>
          )}
        </div>
        {open && item.result && (
          <div className="mt-1 rounded bg-muted/60 border border-border px-2 py-1.5 font-mono text-[10px] text-muted-foreground break-all whitespace-pre-wrap max-h-28 overflow-y-auto">
            {item.result}
          </div>
        )}
        {open && item.error && (
          <div className="mt-1 rounded bg-red-500/5 border border-red-500/20 px-2 py-1.5 text-[10px] text-red-400 break-all">
            {item.error}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message, isTaskResult }: { message: DisplayMessage; isTaskResult?: boolean }) {
  const isUser = message.role === "user";
  const isStreaming = (message as StreamingMsg).streaming === true;
  const codeRunning = (message as StreamingMsg).codeRunning;
  const subtasks = (message as StreamingMsg).subtasks ?? [];
  const bypassed = (message as StreamingMsg).bypassed === true;
  const agentName = (message as any).agentName as string | undefined;
  const meta = (message as any).metadata as Record<string, unknown> | undefined;
  const sources = (meta?.sources as SourceChunk[] | undefined) ?? [];
  // Tool activity: live from StreamingMsg, or persisted in metadata for completed messages
  const liveToolActivity = (message as StreamingMsg).toolActivity;
  const toolActivity: ToolActivityItem[] = isStreaming
    ? (liveToolActivity ?? [])
    : ((meta?.toolActivity as ToolActivityItem[] | undefined) ?? []);
  const hasThoughtProcess = toolActivity.length > 0;

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")} data-testid={`message-${message.id}`}>
      <div className={cn(
        "w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-white",
        isUser
          ? "bg-primary"
          : isTaskResult
            ? "bg-violet-500"
            : (PROVIDER_COLORS["openai"] ?? "bg-zinc-500")
      )}>
        {isUser
          ? <User className="w-3.5 h-3.5" />
          : isTaskResult
            ? <Terminal className="w-3.5 h-3.5" />
            : <span className="text-xs font-bold">{(agentName ?? "A")[0].toUpperCase()}</span>
        }
      </div>

      <div className={cn("flex flex-col gap-1 max-w-[75%]", isUser ? "items-end" : "items-start")}>
        {!isUser && (
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs font-semibold text-foreground">
              {isTaskResult ? `${agentName ?? "Agent"} · Task Result` : (agentName ?? "Agent")}
            </span>
            {bypassed && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded px-1.5 py-0.5">
                <Zap className="w-2.5 h-2.5" /> approval bypassed
              </span>
            )}
            {isStreaming && !codeRunning && subtasks.length === 0 && (
              <span className="text-[11px] text-muted-foreground animate-pulse">typing…</span>
            )}
            {isStreaming && subtasks.some(st => st.status === "running") && (
              <span className="flex items-center gap-1 text-[11px] text-primary">
                <GitFork className="w-3 h-3 animate-pulse" />
                delegating…
              </span>
            )}
            {codeRunning && (
              <span className="flex items-center gap-1 text-[11px] text-blue-500">
                <Code2 className="w-3 h-3 animate-pulse" />
                running {codeRunning} in sandbox…
              </span>
            )}
          </div>
        )}
        {isStreaming && subtasks.length > 0 && (
          <SubtaskPanel subtasks={subtasks} />
        )}
        <div className={cn(
          "rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words",
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : isTaskResult
              ? "bg-violet-500/10 border border-violet-500/20 text-foreground rounded-tl-sm font-mono text-xs"
              : "bg-muted text-foreground rounded-tl-sm"
        )}>
          {isUser
            ? renderWithMentions(message.content, true)
            : message.content
          }
          {isStreaming && !message.content && (
            <span className="inline-flex items-center gap-1 h-4">
              <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          )}
        </div>
        {!isUser && hasThoughtProcess && (
          <div className="w-full max-w-[90%]">
            <ThoughtProcess items={toolActivity} isStreaming={isStreaming} />
          </div>
        )}
        {!isUser && sources.length > 0 && (
          <div className="w-full max-w-[90%]">
            <SourcesAccordion sources={sources} />
          </div>
        )}
      </div>
    </div>
  );
}

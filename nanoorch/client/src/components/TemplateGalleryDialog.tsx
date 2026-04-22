import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, Loader2, ChevronRight, Wrench } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  categoryLabel: string;
  icon: string;
  systemPrompt: string;
  tools: string[];
  defaultTemperature: number;
  defaultMaxTokens: number;
  tags: string[];
}

const CATEGORIES = [
  { id: "all",          label: "All" },
  { id: "devops",       label: "DevOps" },
  { id: "data",         label: "Data" },
  { id: "security",     label: "Security" },
  { id: "communication",label: "Communication" },
  { id: "engineering",  label: "Engineering" },
  { id: "general",      label: "General" },
];

const CATEGORY_COLORS: Record<string, string> = {
  devops:       "bg-blue-500/15 text-blue-400 border-blue-500/30",
  data:         "bg-violet-500/15 text-violet-400 border-violet-500/30",
  security:     "bg-red-500/15 text-red-400 border-red-500/30",
  communication:"bg-green-500/15 text-green-400 border-green-500/30",
  engineering:  "bg-orange-500/15 text-orange-400 border-orange-500/30",
  general:      "bg-muted text-muted-foreground border-border",
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (template: AgentTemplate) => void;
}

function TemplateCard({ template, onSelect }: { template: AgentTemplate; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false);
  const colorClass = CATEGORY_COLORS[template.category] ?? CATEGORY_COLORS.general;

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border p-4 cursor-pointer transition-all duration-150",
        hovered
          ? "border-primary/40 bg-primary/5 shadow-sm"
          : "border-border bg-card hover:border-primary/30 hover:bg-muted/30"
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
      data-testid={`template-card-${template.id}`}
    >
      {/* Icon + category */}
      <div className="flex items-start justify-between">
        <div className="text-3xl leading-none select-none">{template.icon}</div>
        <Badge variant="outline" className={cn("text-[10px] border", colorClass)}>
          {template.categoryLabel}
        </Badge>
      </div>

      {/* Name + description */}
      <div className="flex-1">
        <div className="font-semibold text-sm leading-snug mb-1">{template.name}</div>
        <div className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {template.description}
        </div>
      </div>

      {/* Tools count */}
      {template.tools.length > 0 && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Wrench className="w-3 h-3" />
          <span>{template.tools.length} tool{template.tools.length !== 1 ? "s" : ""}</span>
          <span className="mx-1 opacity-40">·</span>
          <span className="truncate max-w-[140px]" title={template.tools.slice(0, 3).join(", ")}>
            {template.tools.slice(0, 3).join(", ")}{template.tools.length > 3 ? `…` : ""}
          </span>
        </div>
      )}

      {/* Hover CTA */}
      <div className={cn(
        "absolute inset-0 rounded-xl flex items-center justify-center bg-primary/10 backdrop-blur-[1px] transition-opacity duration-100",
        hovered ? "opacity-100" : "opacity-0 pointer-events-none"
      )}>
        <Button size="sm" className="gap-1.5 shadow-md">
          Use Template <ChevronRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function TemplateGalleryDialog({ open, onClose, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const { data: templates = [], isLoading } = useQuery<AgentTemplate[]>({
    queryKey: ["/api/agent-templates"],
    enabled: open,
  });

  const filtered = templates.filter((t) => {
    const matchCat = activeCategory === "all" || t.category === activeCategory;
    const q = search.toLowerCase();
    const matchSearch = !q
      || t.name.toLowerCase().includes(q)
      || t.description.toLowerCase().includes(q)
      || t.tags.some((tag) => tag.includes(q))
      || t.tools.some((tool) => tool.includes(q));
    return matchCat && matchSearch;
  });

  const handleSelect = (template: AgentTemplate) => {
    onSelect(template);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl w-full h-[82vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-0 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <DialogTitle className="text-lg">Agent Templates</DialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                Pick a template to pre-fill your agent configuration. All fields remain editable.
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search templates, tools, tags…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-template-search"
              autoFocus
            />
          </div>

          {/* Category tabs */}
          <div className="flex gap-1 overflow-x-auto pb-3 scrollbar-none">
            {CATEGORIES.map((cat) => {
              const count = cat.id === "all"
                ? templates.length
                : templates.filter((t) => t.category === cat.id).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  data-testid={`tab-template-${cat.id}`}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors shrink-0",
                    activeCategory === cat.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  )}
                >
                  {cat.label}
                  <span className={cn(
                    "text-[10px] rounded-full px-1.5 py-0.5 font-medium",
                    activeCategory === cat.id ? "bg-white/20" : "bg-muted"
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="border-b border-border" />
        </DialogHeader>

        {/* Template grid */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading templates…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Search className="w-8 h-8 mb-2 opacity-30" />
              <div className="text-sm">No templates match your search</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onSelect={() => handleSelect(template)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border flex items-center justify-between shrink-0">
          <span className="text-xs text-muted-foreground">
            {filtered.length} template{filtered.length !== 1 ? "s" : ""}
            {search || activeCategory !== "all" ? " matching filters" : " available"}
          </span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Start from scratch instead
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

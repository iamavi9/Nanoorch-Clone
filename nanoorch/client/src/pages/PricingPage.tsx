import { useState } from "react";
import { Check, Github, Mail, Zap, GitBranch, Database, Cpu, Shield, Users, Clock, Webhook, TerminalSquare, HeartHandshake, Building2, Star } from "lucide-react";

const MONTHLY_PRICE = 499;
const ANNUAL_PRICE = 399;
const ANNUAL_DISCOUNT = Math.round((1 - ANNUAL_PRICE / MONTHLY_PRICE) * 100);

const OSS_FEATURES = [
  { icon: Zap,            text: "Core orchestration engine" },
  { icon: Users,          text: "Multi-tenant workspaces & 3-tier RBAC" },
  { icon: Shield,         text: "OpenAI · Anthropic · Gemini · Ollama providers" },
  { icon: Clock,          text: "Task scheduling, pipelines & approvals" },
  { icon: Webhook,        text: "Webhook & event triggers" },
  { icon: TerminalSquare, text: "Docker & K3s sandbox execution" },
  { icon: Shield,         text: "SSO via OIDC & SAML 2.0" },
  { icon: Github,         text: "Full source code — MIT licence" },
];

const COMMERCIAL_FEATURES = [
  { icon: Cpu,            text: "vLLM / on-prem GPU cluster support" },
  { icon: GitBranch,      text: "Git Agents — repo-driven .nanoorch.yml automation" },
  { icon: Database,       text: "Database integrations (PostgreSQL, cloud DBs)" },
  { icon: Building2,      text: "Custom AI pipeline & workflow development" },
  { icon: HeartHandshake, text: "Dedicated onboarding & priority support" },
  { icon: Shield,         text: "Enterprise SLA & uptime guarantees" },
  { icon: Star,           text: "White-label / OEM deployment rights" },
  { icon: Mail,           text: "Direct engineering access & hands-on support" },
];

function FeatureRow({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
        <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
      </span>
      <span className="text-sm text-slate-600 dark:text-slate-300 leading-snug">{text}</span>
    </li>
  );
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(true);
  const price = annual ? ANNUAL_PRICE : MONTHLY_PRICE;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans antialiased">

      {/* ── NAV ── */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center shadow-sm">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-slate-900 dark:text-white tracking-tight">NanoOrch</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="https://github.com" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
              <Github className="w-4 h-4" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
            <a href="#contact"
              className="flex items-center gap-1.5 text-sm font-medium bg-sky-600 hover:bg-sky-700 text-white px-3.5 py-1.5 rounded-md transition-colors">
              <Mail className="w-3.5 h-3.5" />
              Contact us
            </a>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="relative bg-gradient-to-b from-slate-900 to-slate-800 dark:from-slate-950 dark:to-slate-900 pb-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(199_89%_48%_/_0.15),_transparent_60%)] pointer-events-none" />
        <div className="max-w-5xl mx-auto px-6 py-20 pb-12 text-center relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
            Self-hosted · Open source · No lock-in
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight leading-tight mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-slate-400 max-w-xl mx-auto leading-relaxed">
            NanoOrch is free and open-source forever. Add commercial integrations and expert development when your team needs them.
          </p>
        </div>
      </section>

      {/* ── BILLING TOGGLE ── */}
      <div className="max-w-5xl mx-auto px-6 -mt-6 flex justify-center relative z-10">
        <div className="inline-flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-5 py-2.5 shadow-md">
          <button
            data-testid="toggle-monthly"
            onClick={() => setAnnual(false)}
            className={`text-sm font-medium px-3 py-1 rounded-full transition-all ${
              !annual
                ? "bg-sky-600 text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            Monthly
          </button>
          <button
            data-testid="toggle-annual"
            onClick={() => setAnnual(true)}
            className={`text-sm font-medium px-3 py-1 rounded-full transition-all ${
              annual
                ? "bg-sky-600 text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            Annual
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              annual ? "bg-white/20 text-white" : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
            }`}>
              Save {ANNUAL_DISCOUNT}%
            </span>
          </button>
        </div>
      </div>

      {/* ── PRICING CARDS ── */}
      <section className="max-w-5xl mx-auto px-6 py-14">
        <div className="grid md:grid-cols-2 gap-8 items-start">

          {/* ── OPEN SOURCE CARD ── */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden"
               data-testid="card-opensource">
            <div className="p-8 pb-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                  <Github className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                </div>
                <span className="font-semibold text-slate-900 dark:text-white text-lg">Open Source</span>
              </div>
              <div className="mb-1">
                <span className="text-4xl font-bold text-slate-900 dark:text-white">Free</span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Forever. No credit card required.</p>

              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="btn-get-started-oss"
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200 font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <Github className="w-4 h-4" />
                View on GitHub
              </a>
            </div>

            <div className="px-8 pb-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4">
                What's included
              </p>
              <ul className="space-y-3">
                {OSS_FEATURES.map((f) => (
                  <FeatureRow key={f.text} icon={f.icon} text={f.text} />
                ))}
              </ul>
            </div>
          </div>

          {/* ── COMMERCIAL CARD ── */}
          <div className="relative bg-gradient-to-b from-slate-900 to-slate-800 dark:from-slate-900 dark:to-slate-950 rounded-2xl border border-sky-500/30 shadow-xl overflow-hidden"
               data-testid="card-commercial">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_hsl(199_89%_48%_/_0.12),_transparent_60%)] pointer-events-none" />

            <div className="absolute top-5 right-5">
              <span className="text-xs font-semibold bg-sky-500 text-white px-2.5 py-1 rounded-full shadow">
                Commercial
              </span>
            </div>

            <div className="p-8 pb-6 relative">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-sky-400" />
                </div>
                <span className="font-semibold text-white text-lg">Commercial Plan</span>
              </div>

              <div className="flex items-end gap-2 mb-1">
                <span className="text-4xl font-bold text-white">${price.toLocaleString()}</span>
                <span className="text-slate-400 mb-1 text-sm">/month</span>
              </div>
              {annual && (
                <p className="text-xs text-slate-400 mb-1">
                  Billed annually — ${(ANNUAL_PRICE * 12).toLocaleString()}/year
                </p>
              )}
              <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                Everything in Open Source, plus advanced integrations and hands-on engineering support.
              </p>

              <a
                href="#contact"
                data-testid="btn-contact-commercial"
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm transition-colors shadow-md shadow-sky-900/40"
              >
                <Mail className="w-4 h-4" />
                Get started — contact us
              </a>
            </div>

            <div className="px-8 pb-8 relative">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">
                Everything in Open Source, plus
              </p>
              <ul className="space-y-3">
                {COMMERCIAL_FEATURES.map((f) => (
                  <li key={f.text} className="flex items-start gap-3">
                    <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-sky-500/20 border border-sky-500/30 flex items-center justify-center">
                      <Check className="w-3 h-3 text-sky-400" />
                    </span>
                    <span className="text-sm text-slate-300 leading-snug">{f.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── WHAT'S INCLUDED IN COMMERCIAL ── */}
      <section className="bg-white dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white text-center mb-2">
            What the Commercial Plan covers
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-center mb-12 max-w-lg mx-auto">
            A flat monthly or annual subscription — no per-seat fees, no usage surprises.
          </p>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              {
                icon: Cpu,
                title: "vLLM Integration",
                desc: "Connect NanoOrch directly to your on-premises GPU cluster or private vLLM server. Fully encrypted API key management, per-orchestrator configuration.",
              },
              {
                icon: GitBranch,
                title: "Git Agents",
                desc: "Repo-driven automation via .nanoorch.yml. Auto-trigger on push, PR, or schedule events. Sandboxed execution, GitLab / GitHub comment posting.",
              },
              {
                icon: Database,
                title: "Database Integrations",
                desc: "Native PostgreSQL + cloud DB connectors. Give your agents SQL query tools, schema inspection, and safe read/write capabilities.",
              },
              {
                icon: HeartHandshake,
                title: "Custom Development",
                desc: "Our engineering team builds bespoke pipelines, custom tool integrations, and workflow automation tailored to your organisation.",
              },
              {
                icon: Shield,
                title: "Enterprise Support",
                desc: "Priority issue resolution, SLA-backed uptime commitments, and direct access to engineers via email or scheduled calls.",
              },
              {
                icon: Building2,
                title: "White-label Rights",
                desc: "Deploy NanoOrch under your own brand. OEM and reseller arrangements available — contact us to discuss.",
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex flex-col gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-900/20 border border-sky-100 dark:border-sky-800/40 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                </div>
                <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white text-center mb-10">
          Frequently asked questions
        </h2>
        <div className="space-y-8">
          {[
            {
              q: "Is NanoOrch truly free?",
              a: "Yes. The core NanoOrch engine — including multi-tenant workspaces, RBAC, scheduling, pipelines, SSO, and Docker/K3s sandbox execution — is released under the MIT licence and will remain free forever. You can self-host it today at no cost.",
            },
            {
              q: "What exactly is in the Commercial Plan?",
              a: "The commercial plan adds vLLM (on-prem GPU) support, Git Agent automation, cloud database integrations, priority engineering support, SLA guarantees, and white-label/OEM rights. It also includes custom development hours for bespoke pipeline and integration work.",
            },
            {
              q: "How does flat-rate pricing work?",
              a: "One price covers your entire deployment — no per-seat, per-agent, or per-token fees. Pay monthly or annually (annual saves 20%). Contact us to discuss volume or multi-year arrangements.",
            },
            {
              q: "Can I start with Open Source and upgrade later?",
              a: "Absolutely. Start with the free self-hosted version. When you need advanced integrations or dedicated support, reach out and we'll activate the commercial features on your existing deployment.",
            },
            {
              q: "Who builds NanoOrch?",
              a: "NanoOrch is an open-source project released under the MIT licence. The commercial plan is backed by a dedicated engineering team available for onboarding, custom development, and ongoing support.",
            },
          ].map(({ q, a }) => (
            <div key={q} className="border-b border-slate-200 dark:border-slate-800 pb-8 last:border-0">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-2">{q}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section id="contact" className="bg-gradient-to-r from-slate-900 to-slate-800 dark:from-slate-950 dark:to-slate-900">
        <div className="max-w-5xl mx-auto px-6 py-14 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_hsl(199_89%_48%_/_0.15),_transparent_65%)] pointer-events-none" />
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3 relative">
            Ready to orchestrate at scale?
          </h2>
          <p className="text-slate-400 mb-8 max-w-md mx-auto relative">
            Start free, upgrade when you need to. We're here to help you deploy with confidence.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center relative">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="btn-cta-github"
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-slate-600 text-slate-200 font-medium text-sm hover:bg-slate-700 transition-colors"
            >
              <Github className="w-4 h-4" />
              Star on GitHub
            </a>
            <a
              href="#contact"
              data-testid="btn-cta-contact"
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm transition-colors shadow-lg shadow-sky-900/40"
            >
              <Mail className="w-4 h-4" />
              Get in touch
            </a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center">
              <Zap className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-900 dark:text-white">NanoOrch</span>
          </div>
          <div className="flex items-center gap-5 text-sm text-slate-500 dark:text-slate-400">
            <a href="https://github.com" target="_blank" rel="noopener noreferrer"
              className="hover:text-slate-700 dark:hover:text-slate-200 transition-colors flex items-center gap-1.5">
              <Github className="w-3.5 h-3.5" />
              GitHub
            </a>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-600">
            © {new Date().getFullYear()} NanoOrch. MIT licensed.
          </p>
        </div>
      </footer>

    </div>
  );
}

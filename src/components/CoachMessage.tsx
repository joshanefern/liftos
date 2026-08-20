import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

type CoachMessageProps = {
  role: "assistant" | "user";
  content: string;
  /** Renders a raspberry caret at the end of the text while tokens stream in. */
  streaming?: boolean;
};

/* Assistant replies are markdown (the model emits bold/lists for programs
   and breakdowns) — rendered with app-styled elements, ChatGPT/Claude
   style: user says it in a bubble, the coach answers in the page. */
const CoachMessage = ({ role, content, streaming = false }: CoachMessageProps) => {
  if (role === "user") {
    return (
      <div className="flex justify-end animate-fade-in">
        <div className="max-w-[85%] rounded-[14px] rounded-br-[0.3rem] bg-primary/10 px-4 py-2.5 text-sm leading-6 text-fg md:max-w-[75%]">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full animate-fade-in">
      <div className="mb-2 flex items-center gap-2.5">
        <Sparkles size={12} className="shrink-0 text-gold" />
        <span className="eyebrow !text-[10px]">
          LiftOS Coach
        </span>
      </div>
      <div
        data-selectable
        className={cn(
          "text-sm leading-6 text-fg",
          streaming && content.length === 0 && "min-h-[1.5rem]",
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Compact plan/comparison tables — the coach's "diagrams".
            table: ({ children }) => (
              <div className="mb-3 overflow-x-auto rounded-[10px] border border-border last:mb-0">
                <table className="w-full min-w-[280px] border-collapse text-[13px] leading-5">
                  {children}
                </table>
              </div>
            ),
            th: ({ children }) => (
              <th className="border-b border-border bg-foreground/[0.04] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border-b border-border/40 px-3 py-2 tabular-nums last:border-b-0 [tr:last-child_&]:border-b-0">
                {children}
              </td>
            ),
            p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
            ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
            ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
            li: ({ children }) => <li className="marker:text-fg-muted">{children}</li>,
            h1: ({ children }) => <p className="mb-2 mt-4 text-[15px] font-semibold first:mt-0">{children}</p>,
            h2: ({ children }) => <p className="mb-2 mt-4 text-[15px] font-semibold first:mt-0">{children}</p>,
            h3: ({ children }) => <p className="mb-1.5 mt-3 text-sm font-semibold first:mt-0">{children}</p>,
            code: ({ children }) => (
              <code className="mono rounded bg-secondary px-1.5 py-0.5 text-[12.5px]">{children}</code>
            ),
            a: ({ children }) => <span className="font-medium underline">{children}</span>,
          }}
        >
          {content}
        </ReactMarkdown>
        {streaming && (
          <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-[3px] animate-pulse rounded-full bg-primary" />
        )}
      </div>
    </div>
  );
};

export default CoachMessage;

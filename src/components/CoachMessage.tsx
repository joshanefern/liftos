import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

type CoachMessageProps = {
  role: "assistant" | "user";
  content: string;
  /** Renders a terracotta caret at the end of the text while tokens stream in. */
  streaming?: boolean;
};

const CoachMessage = ({ role, content, streaming = false }: CoachMessageProps) => {
  if (role === "user") {
    return (
      <div className="flex justify-end animate-fade-in">
        <div className="max-w-[85%] rounded-[14px] rounded-br-[0.3rem] bg-secondary px-4 py-2.5 text-sm leading-6 text-fg md:max-w-[75%]">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full rule-hairline pt-4 animate-fade-in md:pt-5">
      <div className="mb-2 flex items-center gap-2.5">
        <Sparkles size={12} className="shrink-0 text-gold" />
        <span className="eyebrow !text-[10px]">
          LiftOS Coach
        </span>
      </div>
      <p
        className={cn(
          "whitespace-pre-wrap text-sm leading-6 text-fg",
          streaming && content.length === 0 && "min-h-[1.5rem]",
        )}
      >
        {content}
        {streaming && (
          <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-[3px] animate-pulse rounded-full bg-primary" />
        )}
      </p>
    </div>
  );
};

export default CoachMessage;

import { cn } from "@/lib/utils";
import { Bot, User } from "lucide-react";

type CoachMessageProps = {
  role: "assistant" | "user";
  content: string;
};

const CoachMessage = ({ role, content }: CoachMessageProps) => {
  const isUser = role === "user";

  return (
    <div className={cn("flex gap-3", isUser && "justify-end")}>
      {!isUser && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg surface-3">
          <Bot size={17} className="text-gold" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[82%] rounded-xl border px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "border-gold/30 bg-gold text-background"
            : "border-border/20 bg-background/45 text-[hsl(var(--text-secondary))]",
        )}
      >
        {content}
      </div>
      {isUser && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold text-background">
          <User size={17} />
        </div>
      )}
    </div>
  );
};

export default CoachMessage;

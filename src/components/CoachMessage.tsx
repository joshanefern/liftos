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
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.875rem] border border-sky-300/20 bg-sky-300/10">
          <Bot size={17} className="text-sky-300" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[82%] rounded-[1rem] border px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "border-sky-300/20 bg-sky-300/[0.08] text-foreground"
            : "border-white/8 bg-white/[0.03] text-foreground/50",
        )}
      >
        {content}
      </div>
      {isUser && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.875rem] border border-sky-300/20 bg-sky-300/10 text-sky-300">
          <User size={17} />
        </div>
      )}
    </div>
  );
};

export default CoachMessage;

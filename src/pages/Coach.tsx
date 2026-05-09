import { coachPromptResponses } from "@/data/liftosMock";
import { ArrowUp, Sparkles } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

const categoryChips = [
  { label: "Plan my split" },
  { label: "Fix a plateau" },
  { label: "Volume advice" },
  { label: "Recovery tips" },
  { label: "Coach's pick" },
];

const Coach = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [started, setStarted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (started) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, started]);

  const sendPrompt = (prompt: string) => {
    const response =
      coachPromptResponses[prompt.toLowerCase()] ??
      "I'd use your recent training history, target frequency, and current split to keep the next step specific. For this mock, I recommend preserving your 5-day rhythm and adjusting only one variable at a time.";
    setMessages((prev) => [
      ...prev,
      { role: "user", content: prompt },
      { role: "assistant", content: response },
    ]);
    setStarted(true);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendPrompt(input.trim());
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  };

  return (
    <div className="flex h-[100dvh] flex-col">

      {/* ── Initial landing state ── */}
      {!started && (
        <div className="flex flex-1 flex-col items-center justify-center px-0 md:px-2 lg:px-3">
          <div className="mx-auto w-full max-w-4xl max-w-2xl">

            {/* Heading */}
            <h1 className="mb-8 flex items-center justify-center gap-3 text-center text-3xl font-semibold tracking-tight md:text-4xl">
              <Sparkles size={32} className="text-sky-300 shrink-0" />
              What shall we train?
            </h1>

            {/* Big input box */}
            <form
              onSubmit={onSubmit}
              className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] px-5 pt-4 pb-3 transition-colors focus-within:border-sky-300/30"
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim()) sendPrompt(input.trim());
                  }
                }}
                rows={2}
                placeholder="How can I help you today?"
                className="max-h-[200px] mx-auto w-full max-w-4xl resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-foreground/30"
              />
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sparkles size={13} className="text-sky-300/60" />
                  <span className="text-[11px] text-foreground/30 tracking-wide">LiftOS Coach</span>
                </div>
                <button
                  type="submit"
                  disabled={!input.trim()}
                  aria-label="Send"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-300 text-[#0a0c15] transition disabled:opacity-20 disabled:cursor-not-allowed hover:bg-sky-200"
                >
                  <ArrowUp size={15} strokeWidth={2.5} />
                </button>
              </div>
            </form>

            {/* Category chips */}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {categoryChips.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => sendPrompt(chip.label)}
                  className="rounded-full border border-white/8 bg-white/[0.03] px-4 py-2 text-xs text-foreground/50 transition hover:border-sky-300/30 hover:text-sky-300"
                >
                  {chip.label}
                </button>
              ))}
            </div>

          </div>
        </div>
      )}

      {/* ── Active chat state ── */}
      {started && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto py-10">
            <div className="mx-auto w-full max-w-4xl space-y-10 px-0 md:px-2 lg:px-3">
              {messages.map((message, index) => {
                const isUser = message.role === "user";
                return (
                  <div key={index} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    {isUser ? (
                      <div className="max-w-[75%] rounded-[1.25rem] rounded-br-[0.3rem] bg-white/[0.08] px-5 py-3 text-sm leading-7 text-foreground">
                        {message.content}
                      </div>
                    ) : (
                      <div className="mx-auto w-full max-w-4xl">
                        <div className="mb-3 flex items-center gap-2">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-sky-300/20 bg-sky-300/10">
                            <Sparkles size={11} className="text-sky-300" />
                          </div>
                          <span className="text-xs font-semibold text-foreground/50">LiftOS Coach</span>
                        </div>
                        <p className="text-sm leading-7 text-foreground/85">{message.content}</p>
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Bottom input — same two-section style as landing */}
          <div className="shrink-0 px-6 pb-8 pt-2 md:px-10 lg:px-12">
            <div className="mx-auto w-full max-w-4xl">
              <form
                onSubmit={onSubmit}
                className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] px-5 pt-4 pb-3 transition-colors focus-within:border-sky-300/30"
              >
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInput}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (input.trim()) sendPrompt(input.trim());
                    }
                  }}
                  rows={2}
                  placeholder="Message LiftOS Coach..."
                  className="max-h-[200px] mx-auto w-full max-w-4xl resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-foreground/25"
                />
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles size={13} className="text-sky-300/60" />
                    <span className="text-[11px] text-foreground/30 tracking-wide">LiftOS Coach</span>
                  </div>
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    aria-label="Send"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-300 text-[#0a0c15] transition disabled:opacity-20 disabled:cursor-not-allowed hover:bg-sky-200"
                  >
                    <ArrowUp size={15} strokeWidth={2.5} />
                  </button>
                </div>
              </form>
              <p className="mt-3 text-center text-[11px] text-foreground/20">
                LiftOS Coach can make mistakes. Verify important training decisions.
              </p>
            </div>
          </div>
        </>
      )}

    </div>
  );
};

export default Coach;

import CoachMessage from "@/components/CoachMessage";
import {
  coachCapabilities,
  coachContextCards,
  coachPromptResponses,
  initialCoachMessages,
} from "@/data/liftosMock";
import { Send, Sparkles } from "lucide-react";
import { FormEvent, useState } from "react";

const suggestedPrompts = [
  "build me a 4-day hypertrophy split",
  "what should I train tomorrow?",
  "why is my bench stalling?",
  "how much weekly volume should I do for chest?",
];

const Coach = () => {
  const [messages, setMessages] = useState(initialCoachMessages);
  const [input, setInput] = useState("");

  const sendPrompt = (prompt: string) => {
    const response =
      coachPromptResponses[prompt.toLowerCase()] ??
      "I would use your recent training history, target frequency, and current split to keep the next step specific. For this mock version, I recommend preserving your 5-day rhythm and adjusting only one training variable at a time.";
    setMessages((current) => [...current, { role: "user", content: prompt }, { role: "assistant", content: response }]);
    setInput("");
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!input.trim()) return;
    sendPrompt(input.trim());
  };

  return (
    <div className="relative min-h-screen max-w-7xl p-6 md:p-10 lg:p-12">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_50%_0%,rgba(125,211,252,0.06),transparent_60%)]" />

      <div className="relative mb-8 animate-reveal-up">
        <p className="label-xs mb-2">AI Coach</p>
        <h1 className="heading-lg">Training guidance that knows the log</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/50">
          A mocked assistant experience that responds as if it understands your workout history, goals, split, and lift trends.
        </p>
      </div>

      <div className="relative grid gap-6 xl:grid-cols-[1fr_340px]">
        <section className="flex min-h-[680px] flex-col overflow-hidden rounded-[1.25rem] bg-white/[0.04] border border-white/10">
          <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(125,211,252,0.18),transparent)]" />
          <div className="border-b border-white/8 p-5 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="label-xs mb-2">Conversation</p>
                <h2 className="heading-md">LiftOS Coach</h2>
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1.5 text-xs font-medium text-sky-300">
                <Sparkles size={13} className="text-sky-300" />
                AI powered
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-5 md:p-6">
            {messages.map((message, index) => (
              <CoachMessage key={`${message.role}-${index}`} role={message.role} content={message.content} />
            ))}
          </div>

          <div className="border-t border-white/8 p-5 md:p-6">
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => sendPrompt(prompt)}
                  className="shrink-0 rounded-full border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-foreground/50 transition hover:border-sky-300/40 hover:text-sky-300"
                >
                  {prompt}
                </button>
              ))}
            </div>
            <form onSubmit={onSubmit} className="flex items-end gap-3 rounded-[1.25rem] border border-white/8 bg-white/[0.03] p-3 focus-within:border-sky-300/40">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={2}
                placeholder="Ask about tomorrow's session, weekly volume, or a stalled lift..."
                className="min-h-12 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-foreground/30"
              />
              <button
                type="submit"
                aria-label="Send message"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-300/20 border border-sky-300/30 text-sky-300 transition hover:bg-sky-300 hover:text-background focus:outline-none focus:ring-2 focus:ring-sky-300/40"
              >
                <Send size={15} />
              </button>
            </form>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="relative overflow-hidden rounded-[1.25rem] bg-white/[0.04] border border-white/10 p-5 md:p-6">
            <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(125,211,252,0.14),transparent)]" />
            <p className="label-xs mb-4">Coach Context</p>
            <div className="space-y-3">
              {coachContextCards.map((item) => (
                <div key={item.label} className="flex items-start gap-3 rounded-[1rem] bg-white/[0.03] p-4">
                  <item.icon size={16} className="mt-0.5 text-sky-300" />
                  <div>
                    <p className="text-xs text-foreground/30">{item.label}</p>
                    <p className="mt-1 text-sm font-medium">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="relative overflow-hidden rounded-[1.25rem] bg-white/[0.04] border border-white/10 p-5 md:p-6">
            <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(125,211,252,0.14),transparent)]" />
            <p className="label-xs mb-4">What Coach Can Help With</p>
            <div className="space-y-4">
              {coachCapabilities.map((item) => (
                <div key={item.title} className="rounded-[1rem] border border-white/8 bg-white/[0.03] p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <item.icon size={15} className="text-sky-300" />
                    <p className="text-sm font-semibold">{item.title}</p>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/50">{item.body}</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default Coach;

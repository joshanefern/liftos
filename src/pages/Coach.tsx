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
    <div className="min-h-screen max-w-7xl p-6 md:p-10 lg:p-12">
      <div className="mb-8 animate-reveal-up">
        <p className="label-xs mb-2">AI Coach</p>
        <h1 className="heading-lg">Training guidance that knows the log</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[hsl(var(--text-secondary))]">
          A mocked assistant experience that responds as if it understands your workout history, goals, split, and lift trends.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <section className="flex min-h-[680px] flex-col rounded-xl surface-2 border border-border/20">
          <div className="border-b border-border/20 p-5 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="label-xs mb-2">Conversation</p>
                <h2 className="heading-md">LiftOS Coach</h2>
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-lg border border-border/20 surface-3 px-3 py-2 text-xs text-[hsl(var(--text-secondary))]">
                <Sparkles size={14} className="text-gold" />
                Mocked intelligence
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-5 md:p-6">
            {messages.map((message, index) => (
              <CoachMessage key={`${message.role}-${index}`} role={message.role} content={message.content} />
            ))}
          </div>

          <div className="border-t border-border/20 p-5 md:p-6">
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => sendPrompt(prompt)}
                  className="shrink-0 rounded-lg border border-border/20 surface-3 px-3 py-2 text-xs text-[hsl(var(--text-secondary))] transition hover:border-gold hover:text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
            <form onSubmit={onSubmit} className="flex items-end gap-3 rounded-xl border border-border/20 bg-background/50 p-3 focus-within:border-gold">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={2}
                placeholder="Ask about tomorrow's session, weekly volume, or a stalled lift..."
                className="min-h-12 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-[hsl(var(--text-tertiary))]"
              />
              <button
                type="submit"
                aria-label="Send message"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gold text-background transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-gold/60"
              >
                <Send size={17} />
              </button>
            </form>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-xl surface-2 border border-border/20 p-5 md:p-6">
            <p className="label-xs mb-4">Coach Context</p>
            <div className="space-y-3">
              {coachContextCards.map((item) => (
                <div key={item.label} className="flex items-start gap-3 rounded-lg surface-3 p-4">
                  <item.icon size={17} className="mt-0.5 text-gold" />
                  <div>
                    <p className="text-xs text-[hsl(var(--text-tertiary))]">{item.label}</p>
                    <p className="mt-1 text-sm font-medium">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl surface-2 border border-border/20 p-5 md:p-6">
            <p className="label-xs mb-4">What Coach Can Help With</p>
            <div className="space-y-4">
              {coachCapabilities.map((item) => (
                <div key={item.title} className="rounded-lg border border-border/20 bg-background/35 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <item.icon size={16} className="text-gold" />
                    <p className="text-sm font-semibold">{item.title}</p>
                  </div>
                  <p className="text-sm leading-relaxed text-[hsl(var(--text-secondary))]">{item.body}</p>
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

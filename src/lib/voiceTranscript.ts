/* ── Which transcript survives a session.
   iOS 26's recognizer can end a session with a "final" result that is a
   fragment (or nothing) of what the live partials already carried — a
   35-character utterance came back as 2 characters on a real iPhone. The
   native plugin and the JS control both apply this rule so neither layer
   can drop what was heard. Pure and tested. ── */

/** The final/latest wins when it is at least half as long as the longest
    transcript seen (a legitimate refinement like "one thirty five" → "135");
    anything shorter is a truncation and the longest is the truth. */
export const chooseTranscript = (latest: string, longest: string): string => {
  const a = latest.trim();
  const b = longest.trim();
  if (a.length * 2 >= b.length) return a;
  return b;
};

/** Fold one more partial/final into the running "longest". */
export const longerOf = (candidate: string, longest: string): string =>
  candidate.trim().length > longest.trim().length ? candidate.trim() : longest;

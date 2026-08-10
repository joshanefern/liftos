/* The champagne/espresso canvas carries the design on its own — the old
   aurora orbs are gone. All that remains is a fine grain that gives the
   flat color a paper-like tooth in both modes. (No blur filters: they're
   battery-hungry and stall screenshot capture.) */
export const FitnessBackground = () => (
  <div className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: -1 }}>
    <div style={{
      position: "absolute", inset: 0,
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
      backgroundRepeat: "repeat",
      backgroundSize: "180px 180px",
      opacity: 0.025,
      mixBlendMode: "overlay",
    }} />
  </div>
);

export const FitnessBackground = () => (
  <div className="pointer-events-none fixed inset-0 overflow-hidden" style={{ zIndex: -1 }}>

    {/* Gold / amber — upper right */}
    <div style={{
      position: "absolute",
      top: "-10%", right: "-5%",
      width: "55vw", height: "55vw",
      borderRadius: "50%",
      background: "radial-gradient(ellipse, rgba(200,152,48,0.18) 0%, rgba(184,132,30,0.06) 55%, transparent 75%)",
      filter: "blur(64px)",
      animation: "orb-1 28s ease-in-out infinite",
    }} />

    {/* Blue-purple — bottom left */}
    <div style={{
      position: "absolute",
      bottom: "-15%", left: "-8%",
      width: "60vw", height: "60vw",
      borderRadius: "50%",
      background: "radial-gradient(ellipse, rgba(72,58,190,0.22) 0%, rgba(58,42,160,0.08) 55%, transparent 75%)",
      filter: "blur(72px)",
      animation: "orb-2 34s ease-in-out infinite",
    }} />

    {/* Warm amber — center left, keeps hero area alive */}
    <div style={{
      position: "absolute",
      top: "20%", left: "-12%",
      width: "44vw", height: "44vw",
      borderRadius: "50%",
      background: "radial-gradient(ellipse, rgba(180,110,24,0.18) 0%, rgba(160,90,16,0.06) 60%, transparent 80%)",
      filter: "blur(80px)",
      animation: "orb-3 22s ease-in-out infinite",
    }} />

    {/* Teal-blue — upper left accent */}
    <div style={{
      position: "absolute",
      top: "-8%", left: "25%",
      width: "38vw", height: "38vw",
      borderRadius: "50%",
      background: "radial-gradient(ellipse, rgba(28,90,140,0.16) 0%, rgba(20,70,110,0.06) 60%, transparent 80%)",
      filter: "blur(60px)",
      animation: "orb-4 38s ease-in-out infinite",
    }} />

    {/* Deep purple — bottom right */}
    <div style={{
      position: "absolute",
      bottom: "-5%", right: "5%",
      width: "40vw", height: "40vw",
      borderRadius: "50%",
      background: "radial-gradient(ellipse, rgba(100,50,160,0.16) 0%, rgba(80,30,130,0.06) 60%, transparent 80%)",
      filter: "blur(68px)",
      animation: "orb-5 30s ease-in-out infinite",
    }} />

    {/* Subtle top-center gold highlight — sits behind the hero headline */}
    <div style={{
      position: "absolute",
      top: 0, left: "50%",
      transform: "translateX(-50%)",
      width: "50vw", height: "40vh",
      background: "radial-gradient(ellipse at 50% 0%, rgba(184,147,66,0.07) 0%, transparent 70%)",
      filter: "blur(40px)",
    }} />

    {/* Fine noise grain overlay for depth */}
    <div style={{
      position: "absolute", inset: 0,
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
      backgroundRepeat: "repeat",
      backgroundSize: "180px 180px",
      opacity: 0.032,
      mixBlendMode: "overlay",
    }} />

  </div>
);

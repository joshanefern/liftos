// Fonts are bundled (fontsource) — offline reliability is a core promise;
// no CDN fetch may ever gate first paint.
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/fraunces/500-italic.css";
import { Capacitor } from "@capacitor/core";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { voiceDiag } from "@/lib/speech";
import "./index.css";

// Boot probe — lands in the native diag file (and the console). The Speech
// plugin silently not being registered (stock CAPBridgeViewController
// instead of LiftOSBridgeViewController) cost days of "voice doesn't work";
// this line makes that failure mode visible on every launch.
if (Capacitor.isNativePlatform()) {
  voiceDiag(
    `boot: plugins speech=${Capacitor.isPluginAvailable("Speech")} healthkit=${Capacitor.isPluginAvailable("HealthKit")} platform=${Capacitor.getPlatform()}`,
  );
}

createRoot(document.getElementById("root")!).render(<App />);

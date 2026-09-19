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
import "./index.css";

// Boot probe — forwarded to the native console by Capacitor. The Speech
// plugin silently not being registered (stock CAPBridgeViewController
// instead of LiftOSBridgeViewController) cost days of "voice doesn't work";
// this line makes that failure mode visible in any captured launch.
if (Capacitor.isNativePlatform()) {
  console.log(
    `[boot] native plugins: speech=${Capacitor.isPluginAvailable("Speech")} healthkit=${Capacitor.isPluginAvailable("HealthKit")}`,
  );
}

createRoot(document.getElementById("root")!).render(<App />);

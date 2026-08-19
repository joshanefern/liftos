import Capacitor

/// App-target plugins can't use Capacitor's packageClassList auto-discovery
/// (the CLI regenerates it from npm packages on every `cap copy`), so they
/// register here — capacitorDidLoad runs in loadView, before the web view
/// loads, which guarantees the plugin header reaches the page.
class LiftOSBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(HealthKitPlugin())
        bridge?.registerPluginInstance(SpeechPlugin())
    }
}

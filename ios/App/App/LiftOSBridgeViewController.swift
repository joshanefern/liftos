import Capacitor
import UIKit

/// App-target plugins can't use Capacitor's packageClassList auto-discovery
/// (the CLI regenerates it from npm packages on every `cap copy`), so they
/// register here — capacitorDidLoad runs in loadView, before the web view
/// loads, which guarantees the plugin header reaches the page.
///
/// Also hosts the keyboard-pan repair: WKWebView pans its scroll view to
/// "reveal" a focused input — even one inside a position:fixed sheet, where
/// the pan accomplishes nothing — and routinely fails to undo it after the
/// keyboard hides. The app then sits shifted ("page opens slightly down").
/// Remedy: remember the offset when the keyboard arrives and put it back
/// when the keyboard leaves, unless the user genuinely dragged in between
/// (their scroll, their position — programmatic pans never fire the scroll
/// view's pan gesture, so the two are cleanly distinguishable).
class LiftOSBridgeViewController: CAPBridgeViewController {
    private var offsetBeforeKeyboard: CGFloat?
    private var userScrolledWithKeyboard = false

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(HealthKitPlugin())
        bridge?.registerPluginInstance(SpeechPlugin())

        NotificationCenter.default.addObserver(
            self, selector: #selector(keyboardWillShow),
            name: UIResponder.keyboardWillShowNotification, object: nil)
        NotificationCenter.default.addObserver(
            self, selector: #selector(keyboardDidHide),
            name: UIResponder.keyboardDidHideNotification, object: nil)
    }

    override open func viewDidLoad() {
        super.viewDidLoad()
        webView?.scrollView.panGestureRecognizer
            .addTarget(self, action: #selector(userPanned))
    }

    @objc private func keyboardWillShow() {
        // First appearance only — focus hops between fields re-fire this
        // while the keyboard stays up, and by then the offset is polluted.
        guard offsetBeforeKeyboard == nil, let scrollView = webView?.scrollView else { return }
        offsetBeforeKeyboard = scrollView.contentOffset.y
        userScrolledWithKeyboard = false
    }

    @objc private func userPanned(_ gesture: UIPanGestureRecognizer) {
        if gesture.state == .changed && offsetBeforeKeyboard != nil {
            userScrolledWithKeyboard = true
        }
    }

    @objc private func keyboardDidHide() {
        guard let scrollView = webView?.scrollView else { return }
        defer { offsetBeforeKeyboard = nil }
        let maxY = max(0, scrollView.contentSize.height - scrollView.bounds.height
            + scrollView.adjustedContentInset.bottom)
        let restored = (userScrolledWithKeyboard ? nil : offsetBeforeKeyboard)
            ?? scrollView.contentOffset.y
        let target = min(max(restored, 0), maxY)
        if target != scrollView.contentOffset.y {
            scrollView.setContentOffset(CGPoint(x: 0, y: target), animated: false)
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }
}

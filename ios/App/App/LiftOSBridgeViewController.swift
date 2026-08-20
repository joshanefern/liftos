import Capacitor
import UIKit
import WebKit
import ObjectiveC

/// App-target plugins can't use Capacitor's packageClassList auto-discovery
/// (the CLI regenerates it from npm packages on every `cap copy`), so they
/// register here — capacitorDidLoad runs in loadView, before the web view
/// loads, which guarantees the plugin header reaches the page.
///
/// Also hosts two WKWebView keyboard repairs:
/// 1. Pan residue — WKWebView pans its scroll view to "reveal" a focused
///    input (even one inside a position:fixed sheet, where the pan does
///    nothing) and routinely fails to undo it once the keyboard hides,
///    leaving the whole app shifted. Remedy: remember the offset when the
///    keyboard arrives and put it back the moment it starts leaving
///    (willHide — waiting for didHide flashes the polluted offset during
///    the dismiss animation), unless the user genuinely dragged in between
///    (their scroll, their position — programmatic pans never fire the
///    scroll view's pan gesture, so the two are cleanly distinguishable).
/// 2. The form-assistant accessory bar (˄ ˅ ✓ above the keyboard) — web
///    forms in a native-feeling app shouldn't ship a browser toolbar. The
///    WKContentView is re-classed at runtime to one whose
///    inputAccessoryView is nil; there is no supported API for this.
class LiftOSBridgeViewController: CAPBridgeViewController {
    private var offsetBeforeKeyboard: CGFloat?
    private var userScrolledWithKeyboard = false

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(HealthKitPlugin())
        bridge?.registerPluginInstance(SpeechPlugin())

        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(keyboardWillShow),
                           name: UIResponder.keyboardWillShowNotification, object: nil)
        center.addObserver(self, selector: #selector(keyboardWillHide),
                           name: UIResponder.keyboardWillHideNotification, object: nil)
        center.addObserver(self, selector: #selector(keyboardDidHide),
                           name: UIResponder.keyboardDidHideNotification, object: nil)
    }

    override open func viewDidLoad() {
        super.viewDidLoad()
        webView?.scrollView.panGestureRecognizer
            .addTarget(self, action: #selector(userPanned))
        if let webView { Self.removeInputAccessoryBar(from: webView) }
    }

    // MARK: keyboard pan repair

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

    @objc private func keyboardWillHide() {
        restoreOffset()
    }

    @objc private func keyboardDidHide() {
        // Backstop: the dismiss animation itself can re-pan.
        restoreOffset()
        offsetBeforeKeyboard = nil
    }

    private func restoreOffset() {
        guard let scrollView = webView?.scrollView else { return }
        let maxY = max(0, scrollView.contentSize.height - scrollView.bounds.height
            + scrollView.adjustedContentInset.bottom)
        let restored = (userScrolledWithKeyboard ? nil : offsetBeforeKeyboard)
            ?? scrollView.contentOffset.y
        let target = min(max(restored, 0), maxY)
        if target != scrollView.contentOffset.y {
            scrollView.setContentOffset(CGPoint(x: 0, y: target), animated: false)
        }
    }

    // MARK: accessory bar removal

    /// Re-class the WKContentView into a runtime subclass whose
    /// inputAccessoryView is nil. Standard technique — WKWebView offers no
    /// API to drop the form-assistant bar.
    private static func removeInputAccessoryBar(from webView: WKWebView) {
        guard let target = webView.scrollView.subviews.first(where: {
            String(describing: type(of: $0)).hasPrefix("WKContent")
        }) else { return }
        let subclassName = "\(type(of: target))_NoInputAccessory"
        var subclass: AnyClass? = NSClassFromString(subclassName)
        if subclass == nil {
            guard let created = objc_allocateClassPair(type(of: target), subclassName, 0),
                  let method = class_getInstanceMethod(
                    Helper.self, #selector(getter: Helper.inputAccessoryView)) else { return }
            class_addMethod(created, #selector(getter: UIResponder.inputAccessoryView),
                            method_getImplementation(method), method_getTypeEncoding(method))
            objc_registerClassPair(created)
            subclass = created
        }
        if let subclass { object_setClass(target, subclass) }
    }

    private final class Helper: NSObject {
        @objc var inputAccessoryView: AnyObject? { nil }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }
}

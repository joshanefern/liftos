import Capacitor
import Speech
import AVFoundation

/// Tap-to-speak dictation for the active-workout logger. In-app plugin,
/// registered manually by LiftOSBridgeViewController (Capacitor 8 auto-
/// discovery never scans the App target). JS side: src/lib/speech.ts
/// registers "Speech" and mirrors these signatures.
///
/// Design points:
/// - SFSpeechRecognizer with on-device recognition when the locale supports
///   it (gym privacy + no 1-minute server cap). The SIMULATOR claims
///   on-device support but ships no local model — requiring it kills the
///   task within milliseconds — so the sim always goes server-side.
/// - A task that errors before anything was heard retries once without the
///   on-device requirement (devices that haven't downloaded the local model
///   yet); an unrecoverable death emits "speechError" to JS — a listening
///   session must never end silently.
/// - contextualStrings biased with the session's exercise names so
///   "incline curl" beats "in klein girl".
/// - Partial results stream to JS ("speechPartial") for the live overlay;
///   stopListening resolves with the final transcript.
/// - AVAudioSession .playAndRecord + .measurement keeps AirPods/gym-noise
///   behavior sane; deactivated with notifyOthers so music ducks back in.
@objc(SpeechPlugin)
public class SpeechPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SpeechPlugin"
    public let jsName = "Speech"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestSpeechPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startListening", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopListening", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelListening", returnType: CAPPluginReturnPromise),
    ]

    private let audioEngine = AVAudioEngine()
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var latestTranscript = ""
    private var stopCall: CAPPluginCall?
    private var finished = false
    private var contextual: [String] = []
    private var onDeviceRequested = false
    private var triedServerFallback = false
    // Stale-task guard: bumped on begin/cancel/fallback so a dying task's
    // trailing callback can never touch the session that replaced it.
    private var generation = 0

    @objc public func isAvailable(_ call: CAPPluginCall) {
        let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en_US"))
        call.resolve([
            "available": recognizer?.isAvailable ?? false,
            "onDevice": recognizer?.supportsOnDeviceRecognition ?? false,
        ])
    }

    @objc public func requestSpeechPermissions(_ call: CAPPluginCall) {
        SFSpeechRecognizer.requestAuthorization { speechStatus in
            AVAudioSession.sharedInstance().requestRecordPermission { micGranted in
                call.resolve([
                    "speech": speechStatus == .authorized,
                    "microphone": micGranted,
                ])
            }
        }
    }

    @objc public func startListening(_ call: CAPPluginCall) {
        let contextual = (call.getArray("contextualStrings") as? [String]) ?? []
        DispatchQueue.main.async { [weak self] in
            self?.beginSession(call: call, contextual: Array(contextual.prefix(100)))
        }
    }

    #if DEBUG && targetEnvironment(simulator)
    /// One-shot QA transcript (Library/liftos-voice-script.txt, seeded by
    /// scripts/sim-say) — deleted the moment it's read so each seed fires
    /// exactly once. A file, NOT UserDefaults: sim cfprefsd resurrects
    /// externally-written keys under a running app, which made the first
    /// version of this hook replay its seed forever.
    private func consumeScriptedTranscript() -> String? {
        guard let library = FileManager.default.urls(
            for: .libraryDirectory, in: .userDomainMask).first else { return nil }
        let url = library.appendingPathComponent("liftos-voice-script.txt")
        guard let text = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        try? FileManager.default.removeItem(at: url)
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
    #endif

    private func beginSession(call: CAPPluginCall, contextual: [String]) {
        generation += 1
        teardown(cancelTask: true)

        #if DEBUG && targetEnvironment(simulator)
        // Simulators have no speech model assets (localspeechreco dies in
        // ~700ms) and often no host mic path, so real dictation can never
        // work there. A seeded transcript streams as live partials instead —
        // everything downstream (silence endpoint, edge fn, apply, undo)
        // runs for real.
        if let scripted = consumeScriptedTranscript() {
            latestTranscript = ""
            finished = false
            let words = scripted.split(separator: " ").map(String.init)
            let gen = generation
            for (index, word) in words.enumerated() {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4 + Double(index) * 0.18) { [weak self] in
                    guard let self, gen == self.generation, !self.finished else { return }
                    self.latestTranscript = self.latestTranscript.isEmpty
                        ? word : self.latestTranscript + " " + word
                    self.notifyListeners("speechPartial", data: ["transcript": self.latestTranscript])
                }
            }
            call.resolve(["started": true])
            return
        }
        #endif

        guard SFSpeechRecognizer.authorizationStatus() == .authorized else {
            call.reject("speech_not_authorized")
            return
        }
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en_US")),
              recognizer.isAvailable else {
            call.reject("recognizer_unavailable")
            return
        }
        self.recognizer = recognizer
        self.contextual = contextual

        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .measurement,
                                    options: [.duckOthers, .allowBluetoothA2DP])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            call.reject("audio_session_failed: \(error.localizedDescription)")
            return
        }

        #if targetEnvironment(simulator)
        onDeviceRequested = false
        #else
        onDeviceRequested = recognizer.supportsOnDeviceRecognition
        #endif
        triedServerFallback = false
        latestTranscript = ""
        finished = false

        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0 else {
            call.reject("no_input_device")
            return
        }
        launchTask(onDevice: onDeviceRequested)
        audioEngine.prepare()
        do {
            try audioEngine.start()
        } catch {
            teardown(cancelTask: true)
            call.reject("audio_engine_failed: \(error.localizedDescription)")
            return
        }

        call.resolve(["started": true])
    }

    /// Create the recognition request + task against the running input node.
    /// Reused by the server fallback, which swaps the pipeline mid-listen.
    private func launchTask(onDevice: Bool) {
        guard let recognizer else { return }
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.taskHint = .dictation
        if #available(iOS 16.0, *) { request.addsPunctuation = true }
        request.requiresOnDeviceRecognition = onDevice
        if !contextual.isEmpty {
            request.contextualStrings = contextual
        }
        self.request = request

        let input = audioEngine.inputNode
        input.removeTap(onBus: 0)
        let format = input.outputFormat(forBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            request.append(buffer)
        }

        let gen = generation
        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            DispatchQueue.main.async {
                guard let self, gen == self.generation else { return }
                if let result {
                    self.latestTranscript = result.bestTranscription.formattedString
                    self.notifyListeners("speechPartial", data: ["transcript": self.latestTranscript])
                    if result.isFinal { self.resolveStop() }
                }
                if error != nil { self.handleTaskError() }
            }
        }
    }

    /// Runs on main with the generation already validated.
    private func handleTaskError() {
        guard !finished else { return }
        // A stop is already in flight — finalize with whatever was heard.
        if stopCall != nil {
            resolveStop()
            return
        }
        // On-device model died before any speech landed — retry via server.
        if onDeviceRequested && !triedServerFallback && latestTranscript.isEmpty
            && audioEngine.isRunning {
            triedServerFallback = true
            onDeviceRequested = false
            generation += 1
            task?.cancel()
            task = nil
            request = nil
            launchTask(onDevice: false)
            return
        }
        // Unrecoverable mid-listen death: tell JS — never go quiet while the
        // overlay says "Listening…".
        finished = true
        teardown(cancelTask: true)
        notifyListeners("speechError", data: ["message": "recognition_failed"])
    }

    /// End of a tap-to-stop: end audio, wait for the recognizer to finalize
    /// (or time out fast) and resolve with everything heard.
    @objc public func stopListening(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            // Session already over (task error beat the stop, or a scripted
            // run) — hand back what was heard instead of waiting on a dead
            // recognizer.
            if self.finished || self.task == nil {
                call.resolve(["transcript": self.latestTranscript])
                return
            }
            self.stopCall = call
            self.audioEngine.stop()
            self.audioEngine.inputNode.removeTap(onBus: 0)
            self.request?.endAudio()
            // Recognizers can dawdle after endAudio — cap the wait at 1.5s;
            // partials already carry the transcript.
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
                self?.resolveStop()
            }
        }
    }

    @objc public func cancelListening(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.generation += 1
            self.teardown(cancelTask: true)
            call.resolve()
        }
    }

    private func resolveStop() {
        DispatchQueue.main.async { [weak self] in
            guard let self, !self.finished else { return }
            self.finished = true
            let transcript = self.latestTranscript
            self.teardown(cancelTask: false)
            self.stopCall?.resolve(["transcript": transcript])
            self.stopCall = nil
        }
    }

    private func teardown(cancelTask: Bool) {
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        request?.endAudio()
        if cancelTask { task?.cancel() }
        task = nil
        request = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

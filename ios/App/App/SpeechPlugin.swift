import Capacitor
import Speech
import AVFoundation

/// Press-and-hold dictation for the active-workout logger. In-app plugin,
/// registered manually by LiftOSBridgeViewController (Capacitor 8 auto-
/// discovery never scans the App target). JS side: src/lib/speech.ts
/// registers "Speech" and mirrors these signatures.
///
/// Design points:
/// - SFSpeechRecognizer with on-device recognition when the locale supports
///   it (gym privacy + no 1-minute server cap); falls back to server.
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

    private func beginSession(call: CAPPluginCall, contextual: [String]) {
        teardown(cancelTask: true)

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

        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .measurement,
                                    options: [.duckOthers, .allowBluetoothA2DP])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            call.reject("audio_session_failed: \(error.localizedDescription)")
            return
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.taskHint = .dictation
        if #available(iOS 16.0, *) { request.addsPunctuation = true }
        if recognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
        }
        if !contextual.isEmpty {
            request.contextualStrings = contextual
        }
        self.request = request
        self.latestTranscript = ""
        self.finished = false

        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0 else {
            call.reject("no_input_device")
            return
        }
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            request.append(buffer)
        }
        audioEngine.prepare()
        do {
            try audioEngine.start()
        } catch {
            input.removeTap(onBus: 0)
            call.reject("audio_engine_failed: \(error.localizedDescription)")
            return
        }

        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }
            if let result {
                self.latestTranscript = result.bestTranscription.formattedString
                self.notifyListeners("speechPartial", data: ["transcript": self.latestTranscript])
                if result.isFinal { self.resolveStop() }
            }
            if error != nil { self.resolveStop() }
        }

        call.resolve(["started": true])
    }

    /// Release of the hold: end audio, wait for the recognizer to finalize
    /// (or time out fast) and resolve with everything heard.
    @objc public func stopListening(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
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
            self?.teardown(cancelTask: true)
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

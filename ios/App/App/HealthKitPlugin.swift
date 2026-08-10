import Capacitor
import HealthKit

/// In-app Capacitor plugin (registered manually by LiftOSBridgeViewController —
/// Capacitor 8's auto-discovery only scans plugin npm packages, never the App
/// target). JS side: src/lib/healthkit.ts registers "HealthKit" and mirrors
/// these method signatures.
@objc(HealthKitPlugin)
public class HealthKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthKitPlugin"
    public let jsName = "HealthKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queryWorkouts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startObserving", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "debugSeedWorkout", returnType: CAPPluginReturnPromise),
    ]

    private let store = HKHealthStore()
    private var observerQuery: HKObserverQuery?

    private static let iso: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let bpmUnit = HKUnit.count().unitDivided(by: .minute())

    @objc public func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc public func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Health data is not available on this device")
            return
        }
        guard let heartRate = HKQuantityType.quantityType(forIdentifier: .heartRate),
              let energy = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)
        else {
            call.reject("HealthKit types unavailable")
            return
        }
        let read: Set<HKObjectType> = [HKObjectType.workoutType(), heartRate, energy]
        // Write access exists only so debug builds can seed the simulator's
        // empty Health store for end-to-end QA.
        #if DEBUG
        let share: Set<HKSampleType>? = [HKObjectType.workoutType(), heartRate]
        #else
        let share: Set<HKSampleType>? = nil
        #endif
        store.requestAuthorization(toShare: share, read: read) { _, error in
            DispatchQueue.main.async {
                if let error = error {
                    call.reject("Authorization failed: \(error.localizedDescription)")
                } else {
                    // iOS never discloses READ grants — resolving only means
                    // the sheet completed. Denied reads just query empty.
                    call.resolve()
                }
            }
        }
    }

    @objc public func queryWorkouts(_ call: CAPPluginCall) {
        guard let sinceISO = call.getString("sinceISO"),
              let since = Self.iso.date(from: sinceISO)
                ?? ISO8601DateFormatter().date(from: sinceISO)
        else {
            call.reject("sinceISO (ISO-8601 string) is required")
            return
        }
        let predicate = HKQuery.predicateForSamples(
            withStart: since, end: nil, options: .strictStartDate)
        let newestFirst = NSSortDescriptor(
            key: HKSampleSortIdentifierStartDate, ascending: false)
        // No limit — the predicate already bounds the window, and a cap
        // would silently drop the OLDEST in-window workouts forever for
        // multi-source Health stores (Watch + Strava + Peloton all write).
        let query = HKSampleQuery(
            sampleType: .workoutType(), predicate: predicate,
            limit: HKObjectQueryNoLimit, sortDescriptors: [newestFirst]
        ) { [weak self] _, samples, error in
            guard let self = self else { return }
            if let error = error {
                DispatchQueue.main.async {
                    call.reject("Workout query failed: \(error.localizedDescription)")
                }
                return
            }
            let workouts = (samples as? [HKWorkout]) ?? []
            self.buildPayloads(for: workouts) { payloads in
                DispatchQueue.main.async { call.resolve(["workouts": payloads]) }
            }
        }
        store.execute(query)
    }

    /// Registers an HKObserverQuery on workouts and enables background
    /// delivery. Fires a "workoutsChanged" event to JS whenever the Health
    /// store gains a workout — the JS side syncs and refreshes the pending
    /// queue. Idempotent: a second call is a no-op.
    @objc public func startObserving(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Health data is not available on this device")
            return
        }
        if observerQuery != nil {
            call.resolve()
            return
        }
        let workoutType = HKObjectType.workoutType()
        let query = HKObserverQuery(
            sampleType: workoutType, predicate: nil
        ) { [weak self] _, completionHandler, error in
            if error == nil {
                // Hop off HealthKit's anonymous queue — Capacitor's listener
                // array is not synchronized against add/remove.
                DispatchQueue.main.async {
                    self?.notifyListeners("workoutsChanged", data: [:])
                }
            }
            // Always call — skipping it makes HealthKit throttle deliveries.
            completionHandler()
        }
        store.execute(query)
        observerQuery = query
        // Deliberately NO enableBackgroundDelivery: this observer only exists
        // after the webview boots, so background launches (no UIScene, no JS)
        // could never handle a wake — HealthKit would just throttle us for
        // dropped deliveries. Capture is foreground-observed + caught up by
        // the JS sync-on-mount. A true background path needs a native
        // observer in didFinishLaunching + native upload (future work).
        call.resolve()
    }

    /// Serially attaches HR samples to each workout (30-day window keeps the
    /// count small; HR queries are fast local reads).
    private func buildPayloads(
        for workouts: [HKWorkout],
        completion: @escaping ([[String: Any]]) -> Void
    ) {
        var payloads: [[String: Any]] = []
        func next(_ index: Int) {
            guard index < workouts.count else {
                completion(payloads)
                return
            }
            let workout = workouts[index]
            heartRateSamples(for: workout) { samples in
                payloads.append(self.payload(for: workout, hrSamples: samples))
                next(index + 1)
            }
        }
        next(0)
    }

    private func heartRateSamples(
        for workout: HKWorkout,
        completion: @escaping ([[String: Any]]) -> Void
    ) {
        guard let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate) else {
            completion([])
            return
        }
        let predicate = HKQuery.predicateForSamples(
            withStart: workout.startDate, end: workout.endDate, options: [])
        let oldestFirst = NSSortDescriptor(
            key: HKSampleSortIdentifierStartDate, ascending: true)
        let query = HKSampleQuery(
            sampleType: hrType, predicate: predicate,
            limit: HKObjectQueryNoLimit, sortDescriptors: [oldestFirst]
        ) { _, samples, _ in
            // Downsample to ≥4s spacing — outdoor runs record ~1/s, which
            // balloons a 3h session to ~500KB of JSONB; set detection was
            // designed around the Watch's ~5s gym cadence anyway.
            var out: [[String: Any]] = []
            var lastT = -Double.greatestFiniteMagnitude
            for sample in ((samples as? [HKQuantitySample]) ?? []) {
                let t = sample.startDate.timeIntervalSince(workout.startDate)
                if t - lastT < 4 { continue }
                lastT = t
                out.append([
                    "t": t,
                    "bpm": sample.quantity.doubleValue(for: Self.bpmUnit),
                ])
            }
            completion(out)
        }
        store.execute(query)
    }

    private func payload(
        for workout: HKWorkout, hrSamples: [[String: Any]]
    ) -> [String: Any] {
        let bpms = hrSamples.compactMap { $0["bpm"] as? Double }
        let distance = workout.totalDistance?.doubleValue(for: .meter())
        let calories = workout.totalEnergyBurned?.doubleValue(for: .kilocalorie())
        return [
            "uuid": workout.uuid.uuidString,
            "activityTypeRaw": Int(workout.workoutActivityType.rawValue),
            "startDate": Self.iso.string(from: workout.startDate),
            "endDate": Self.iso.string(from: workout.endDate),
            "duration_s": workout.duration,
            "distance_m": distance.map { $0 as Any } ?? NSNull(),
            "calories": calories.map { $0 as Any } ?? NSNull(),
            "avg_hr": bpms.isEmpty
                ? NSNull() : (bpms.reduce(0, +) / Double(bpms.count)).rounded(),
            "max_hr": bpms.max().map { $0 as Any } ?? NSNull(),
            "hr_samples": hrSamples,
        ]
    }

    #if DEBUG && targetEnvironment(simulator)
    /// Simulator debug builds only — never on a real device, where it would
    /// pollute the user's actual Health store. Writes a synthetic strength
    /// workout (set-shaped HR trace) so the sim can exercise the full
    /// capture → pending review → confirm pipeline.
    @objc public func debugSeedWorkout(_ call: CAPPluginCall) {
        let minutes = call.getInt("minutes") ?? 40
        guard let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate) else {
            call.reject("HealthKit types unavailable")
            return
        }
        let config = HKWorkoutConfiguration()
        config.activityType = .traditionalStrengthTraining
        let builder = HKWorkoutBuilder(
            healthStore: store, configuration: config, device: .local())
        let end = Date()
        let start = end.addingTimeInterval(TimeInterval(-minutes * 60))

        builder.beginCollection(withStart: start) { began, error in
            guard began else {
                DispatchQueue.main.async {
                    call.reject("Seed failed: \(error?.localizedDescription ?? "begin")")
                }
                return
            }
            // 3-minute cycle: ~80s working set near 140 bpm, then recovery
            // near 100 — enough structure for HR-based set detection.
            var samples: [HKSample] = []
            var t = start
            while t < end {
                let phase = t.timeIntervalSince(start)
                    .truncatingRemainder(dividingBy: 180)
                let bpm = phase < 80
                    ? 138 + Double.random(in: -4...8)
                    : 98 + Double.random(in: -5...5)
                let quantity = HKQuantity(unit: Self.bpmUnit, doubleValue: bpm)
                samples.append(
                    HKQuantitySample(type: hrType, quantity: quantity, start: t, end: t))
                t += 5
            }
            builder.add(samples) { added, addError in
                guard added else {
                    // Typically HR write permission denied — surface it, a
                    // silent success here would poison the QA pipeline.
                    DispatchQueue.main.async {
                        call.reject(
                            "Seed failed adding HR: \(addError?.localizedDescription ?? "denied")")
                    }
                    builder.discardWorkout()
                    return
                }
                builder.endCollection(withEnd: end) { ended, endError in
                    guard ended else {
                        DispatchQueue.main.async {
                            call.reject(
                                "Seed failed ending: \(endError?.localizedDescription ?? "end")")
                        }
                        builder.discardWorkout()
                        return
                    }
                    builder.finishWorkout { workout, error in
                        DispatchQueue.main.async {
                            if let workout = workout {
                                call.resolve(["uuid": workout.uuid.uuidString])
                            } else {
                                call.reject(
                                    "Seed failed: \(error?.localizedDescription ?? "finish")")
                            }
                        }
                    }
                }
            }
        }
    }
    #else
    @objc public func debugSeedWorkout(_ call: CAPPluginCall) {
        call.unavailable("Debug builds only")
    }
    #endif
}

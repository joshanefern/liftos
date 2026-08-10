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
        CAPPluginMethod(name: "debugSeedWorkout", returnType: CAPPluginReturnPromise),
    ]

    private let store = HKHealthStore()

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
        let query = HKSampleQuery(
            sampleType: .workoutType(), predicate: predicate,
            limit: 100, sortDescriptors: [newestFirst]
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
            let out = ((samples as? [HKQuantitySample]) ?? []).map { sample in
                [
                    "t": sample.startDate.timeIntervalSince(workout.startDate),
                    "bpm": sample.quantity.doubleValue(for: Self.bpmUnit),
                ] as [String: Any]
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

    #if DEBUG
    /// Debug-only: writes a synthetic strength workout (with a set-shaped HR
    /// trace) into the local Health store so the simulator can exercise the
    /// full capture → pending review → confirm pipeline.
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
            builder.add(samples) { _, _ in
                builder.endCollection(withEnd: end) { _, _ in
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

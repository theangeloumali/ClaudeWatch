import Foundation
import os.log

/// Data model matching the stats.json written by the Electron main process.
/// Must stay in sync with WidgetStatsPayload in widget-stats-writer.ts.
struct WidgetStatsPayload: Codable {
    let updatedAt: String
    let stats: Stats
    let instances: [InstanceData]
    let usage: UsageData?
    let promo: PromoData?

    private static let logger = Logger(
        subsystem: "com.zkidzdev.claudewatch.widget",
        category: "WidgetStats"
    )

    struct Stats: Codable {
        let total: Int
        let active: Int
        let idle: Int
        let exited: Int
    }

    struct UsageData: Codable {
        let totalCostUSD: Double
        let totalInputTokens: Int
        let totalOutputTokens: Int
        let totalCacheReadTokens: Int
        let dataAvailable: Bool
    }

    struct PromoData: Codable {
        let is2x: Bool
        let promoActive: Bool
        let expiresInSeconds: Int?
        let promoPeriod: String
    }

    struct InstanceData: Codable, Identifiable {
        let pid: Int
        let projectName: String
        let status: String
        let cpuPercent: Double
        let memPercent: Double
        let elapsedSeconds: Int

        var id: Int { pid }

        var isActive: Bool { status == "active" }
        var isIdle: Bool { status == "idle" }
    }

    /// Time since last update, in seconds
    var staleness: TimeInterval {
        guard let date = ISO8601DateFormatter().date(from: updatedAt) else { return .infinity }
        return Date().timeIntervalSince(date)
    }

    /// Whether the data is considered stale (older than 5 minutes)
    var isStale: Bool { staleness > 300 }

    /// The non-scoped App Group ID suffix used to match directories.
    private static let appGroupSuffix = "group.com.zkidzdev.claudewatch"

    /// Read stats from the App Group shared container using a 4-strategy fallback chain.
    /// Strategy 0: Scan Group Containers for any directory matching our App Group (handles Team ID scoping)
    /// Strategy 1: containerURL (works when provisioning profiles are embedded)
    /// Strategy 2: UserDefaults shared suite (works without provisioning profiles)
    /// Strategy 3: Manual filesystem path (legacy fallback)
    static func load() -> WidgetStatsPayload? {
        if let payload = loadViaScanGroupContainers() {
            logger.info("Strategy 0 (scan) succeeded")
            return payload
        }

        if let payload = loadViaContainerURL() {
            logger.info("Strategy 1 (containerURL) succeeded")
            return payload
        }

        if let payload = loadViaUserDefaults() {
            logger.info("Strategy 2 (UserDefaults) succeeded")
            return payload
        }

        if let payload = loadViaManualPath() {
            logger.info("Strategy 3 (manual path) succeeded")
            return payload
        }

        logger.error("All 4 load strategies failed — no data available")
        return nil
    }

    /// Strategy 0: Scan ~/Library/Group Containers/ for any directory whose name
    /// ends with our App Group ID. This handles the Team ID scoping mismatch:
    /// - The Electron app writes to: group.com.zkidzdev.claudewatch/
    /// - A sandboxed widget may resolve to: {TEAM_ID}.group.com.zkidzdev.claudewatch/
    /// By scanning, we find stats.json regardless of which variant has it.
    private static func loadViaScanGroupContainers() -> WidgetStatsPayload? {
        logger.info("Trying Strategy 0: scan Group Containers")

        // Try multiple ways to get the real home directory
        let homeDir: String
        if let envHome = ProcessInfo.processInfo.environment["HOME"] {
            homeDir = envHome
        } else {
            homeDir = NSHomeDirectory()
        }

        let groupContainersPath = "\(homeDir)/Library/Group Containers"
        let groupContainersURL = URL(fileURLWithPath: groupContainersPath)

        logger.info("Strategy 0: scanning \(groupContainersPath)")

        guard let entries = try? FileManager.default.contentsOfDirectory(
            at: groupContainersURL,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ) else {
            logger.warning("Strategy 0: could not list Group Containers directory")
            return nil
        }

        // Find all directories matching *group.com.zkidzdev.claudewatch
        let matchingDirs = entries.filter { url in
            url.lastPathComponent == appGroupSuffix ||
            url.lastPathComponent.hasSuffix(".\(appGroupSuffix)")
        }

        logger.info("Strategy 0: found \(matchingDirs.count) matching directories")

        // Try each matching directory for stats.json
        for dir in matchingDirs {
            let statsURL = dir.appendingPathComponent("stats.json")
            logger.info("Strategy 0: trying \(statsURL.path)")
            if let payload = decodeStatsFile(at: statsURL) {
                return payload
            }
        }

        logger.warning("Strategy 0: no stats.json found in any matching directory")
        return nil
    }

    /// Strategy 1: Use FileManager.containerURL (standard App Group approach)
    private static func loadViaContainerURL() -> WidgetStatsPayload? {
        logger.info("Trying Strategy 1: containerURL")
        guard let containerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.com.zkidzdev.claudewatch"
        ) else {
            logger.warning("Strategy 1: containerURL returned nil (no provisioning profile?)")
            return nil
        }

        let fileURL = containerURL.appendingPathComponent("stats.json")
        logger.info("Strategy 1: reading from \(fileURL.path)")
        return decodeStatsFile(at: fileURL)
    }

    /// Strategy 2: Read JSON string from UserDefaults shared suite
    private static func loadViaUserDefaults() -> WidgetStatsPayload? {
        logger.info("Trying Strategy 2: UserDefaults shared suite")
        guard let defaults = UserDefaults(suiteName: "group.com.zkidzdev.claudewatch") else {
            logger.warning("Strategy 2: UserDefaults suite returned nil")
            return nil
        }

        guard let jsonString = defaults.string(forKey: "statsJson") else {
            logger.warning("Strategy 2: no statsJson key in UserDefaults")
            return nil
        }

        guard let data = jsonString.data(using: .utf8) else {
            logger.error("Strategy 2: failed to convert statsJson string to Data")
            return nil
        }

        return decodeStatsData(data, label: "Strategy 2")
    }

    /// Strategy 3: Construct the path manually via home directory
    private static func loadViaManualPath() -> WidgetStatsPayload? {
        logger.info("Trying Strategy 3: manual path")
        let home = FileManager.default.homeDirectoryForCurrentUser
        let fileURL = home
            .appendingPathComponent("Library/Group Containers")
            .appendingPathComponent("group.com.zkidzdev.claudewatch")
            .appendingPathComponent("stats.json")

        logger.info("Strategy 3: reading from \(fileURL.path)")
        return decodeStatsFile(at: fileURL)
    }

    /// Decode stats.json from a file URL
    private static func decodeStatsFile(at fileURL: URL) -> WidgetStatsPayload? {
        guard let data = try? Data(contentsOf: fileURL) else {
            logger.warning("File not found or unreadable at: \(fileURL.path)")
            return nil
        }
        return decodeStatsData(data, label: fileURL.lastPathComponent)
    }

    /// Decode a WidgetStatsPayload from raw Data
    private static func decodeStatsData(_ data: Data, label: String) -> WidgetStatsPayload? {
        guard let payload = try? JSONDecoder().decode(WidgetStatsPayload.self, from: data) else {
            logger.error("Failed to decode stats (\(label), \(data.count) bytes)")
            return nil
        }
        logger.info("Loaded stats via \(label): \(payload.stats.total) total, \(payload.stats.active) active")
        return payload
    }

    /// Empty/default payload for when no data is available
    static let empty = WidgetStatsPayload(
        updatedAt: ISO8601DateFormatter().string(from: Date()),
        stats: Stats(total: 0, active: 0, idle: 0, exited: 0),
        instances: [],
        usage: nil,
        promo: nil
    )
}

/// Format token count into compact string (e.g. 1.2K, 455.8M)
func formatCompactNumber(_ n: Int) -> String {
    if n < 1_000 { return "\(n)" }
    if n < 1_000_000 {
        let v = Double(n) / 1_000.0
        return v.truncatingRemainder(dividingBy: 1) == 0
            ? "\(Int(v))K"
            : String(format: "%.1fK", v)
    }
    if n < 1_000_000_000 {
        let v = Double(n) / 1_000_000.0
        return v.truncatingRemainder(dividingBy: 1) == 0
            ? "\(Int(v))M"
            : String(format: "%.1fM", v)
    }
    let v = Double(n) / 1_000_000_000.0
    return String(format: "%.1fB", v)
}

/// Format USD cost as "$X.XX"
func formatCurrency(_ amount: Double) -> String {
    return String(format: "$%.2f", amount)
}

/// Format countdown seconds into "Xh Ym" or "Ym"
func formatCountdown(_ seconds: Int) -> String {
    if seconds <= 0 { return "0m" }
    let h = seconds / 3600
    let m = (seconds % 3600) / 60
    if h > 0 { return "\(h)h \(m)m" }
    return "\(m)m"
}

/// Format elapsed seconds into human-readable string
func formatElapsed(_ seconds: Int) -> String {
    let hours = seconds / 3600
    let minutes = (seconds % 3600) / 60
    let secs = seconds % 60

    if hours > 0 {
        return String(format: "%d:%02d:%02d", hours, minutes, secs)
    } else {
        return String(format: "%d:%02d", minutes, secs)
    }
}

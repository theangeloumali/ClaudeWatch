import WidgetKit
import SwiftUI
import os.log

/// Timeline entry carrying the stats payload
struct ClaudeWatchEntry: TimelineEntry {
    let date: Date
    let data: WidgetStatsPayload
}

/// Provides timeline entries by reading stats.json from the App Group container
struct ClaudeWatchTimelineProvider: TimelineProvider {

    private static let logger = Logger(
        subsystem: "com.zkidzdev.claudewatch.widget",
        category: "TimelineProvider"
    )

    func placeholder(in context: Context) -> ClaudeWatchEntry {
        ClaudeWatchEntry(
            date: Date(),
            data: .placeholder
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (ClaudeWatchEntry) -> Void) {
        Self.logger.info("getSnapshot called (isPreview: \(context.isPreview))")
        let data = WidgetStatsPayload.load() ?? .empty
        Self.logger.info("getSnapshot result: \(data.stats.total) total, \(data.stats.active) active")
        completion(ClaudeWatchEntry(date: Date(), data: data))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ClaudeWatchEntry>) -> Void) {
        Self.logger.info("getTimeline called (family: \(String(describing: context.family)))")
        let data = WidgetStatsPayload.load() ?? .empty
        let entry = ClaudeWatchEntry(date: Date(), data: data)

        Self.logger.info("getTimeline result: \(data.stats.total) total, \(data.stats.active) active, stale: \(data.isStale)")

        // Refresh every 1 minute for near-real-time data updates
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 1, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        Self.logger.info("Next timeline update scheduled at: \(nextUpdate)")
        completion(timeline)
    }
}

// MARK: - Placeholder data for widget gallery

extension WidgetStatsPayload {
    static let placeholder = WidgetStatsPayload(
        updatedAt: ISO8601DateFormatter().string(from: Date()),
        stats: Stats(total: 5, active: 3, idle: 2, exited: 0),
        instances: [
            InstanceData(pid: 1, projectName: "api-gateway", status: "active", cpuPercent: 42.1, memPercent: 2.3, elapsedSeconds: 3600),
            InstanceData(pid: 2, projectName: "web-dashboard", status: "active", cpuPercent: 28.5, memPercent: 1.8, elapsedSeconds: 1800),
            InstanceData(pid: 3, projectName: "auth-service", status: "active", cpuPercent: 15.2, memPercent: 0.9, elapsedSeconds: 900),
            InstanceData(pid: 4, projectName: "data-pipeline", status: "idle", cpuPercent: 0.1, memPercent: 1.1, elapsedSeconds: 7200),
            InstanceData(pid: 5, projectName: "mobile-app", status: "idle", cpuPercent: 0.0, memPercent: 0.5, elapsedSeconds: 5400)
        ],
        usage: UsageData(totalCostUSD: 425.94, totalInputTokens: 1_981_851, totalOutputTokens: 2_697_252, totalCacheReadTokens: 455_842_215, dataAvailable: true),
        promo: PromoData(is2x: true, promoActive: true, expiresInSeconds: 6180, promoPeriod: "March 13–27, 2026")
    )
}

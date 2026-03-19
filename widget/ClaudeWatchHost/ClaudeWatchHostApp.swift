import SwiftUI
import WidgetKit

/// Minimal host app that exists to register the WidgetKit extension with macOS.
/// Also handles URL scheme triggers from the Electron app to force widget timeline reloads.
@main
struct ClaudeWatchHostApp: App {
    var body: some Scene {
        WindowGroup {
            VStack(spacing: 16) {
                Image(systemName: "widget.small")
                    .font(.system(size: 48))
                    .foregroundStyle(.secondary)

                Text("ClaudeWatch Widget Host")
                    .font(.title2.bold())

                Text("This app registers the widget extension.\nAdd the widget via Desktop → Edit Widgets.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(40)
            .frame(width: 360, height: 240)
        }
        .windowResizability(.contentSize)
        .handlesExternalEvents(matching: ["*"])
    }

    init() {
        // Check for reload argument passed via command line
        if CommandLine.arguments.contains("--reload-widget") {
            WidgetCenter.shared.reloadAllTimelines()
            // Exit after triggering reload — don't show the window
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                NSApplication.shared.terminate(nil)
            }
        }
    }
}

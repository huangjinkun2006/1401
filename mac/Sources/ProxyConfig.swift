// 1401
// Copyright (c) 2026 NullMoth Systems. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import Foundation

/// The outbound HTTP/HTTPS proxy the app itself applies to every network call, so 1401 no longer depends on the
/// system proxy (System Settings > Network) being pointed at a gateway. The gateway is set in the Driver settings
/// window and saved to Application Support; when it is off, sessions fall back to the OS default (which still honors
/// the system proxy). Saved as proxy.json; an empty or absent file means "no proxy, use the OS default".
struct ProxyConfig: Codable {
    var enabled: Bool = false
    /// "http" = HTTP CONNECT proxy used for both http and https; "socks" = SOCKS5.
    var type: String = "http"
    var host: String = ""
    var port: Int = 7890

    static let file = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("NullMoth/proxy.json")

    /// The saved proxy, or a default (disabled) one when the file is missing or unreadable.
    static var current: ProxyConfig {
        guard let d = try? Data(contentsOf: file),
              let c = try? JSONDecoder().decode(ProxyConfig.self, from: d) else { return ProxyConfig() }
        return c
    }

    /// Persist this configuration. A write that removes the file would be riskier than a disabled entry, so saving
    /// always records the (possibly disabled) entry.
    func save() {
        try? FileManager.default.createDirectory(at: ProxyConfig.file.deletingLastPathComponent(), withIntermediateDirectories: true)
        if let d = try? JSONEncoder().encode(self) { try? d.write(to: ProxyConfig.file, options: .atomic) }
    }

    /// What the Driver settings page receives and sends back: plain fields, no decoding needed on the Swift side.
    var dictionary: [String: Any] {
        ["enabled": enabled, "type": type, "host": host, "port": port]
    }

    /// The connectionProxyDictionary for a URLSessionConfiguration, or nil when the proxy is off or incomplete (nil
    /// means the session uses the OS default, including the system proxy).
    var connectionProxyDictionary: [String: Any]? {
        guard enabled, !host.isEmpty, port > 0 else { return nil }
        if type == "socks" {
            return ["SOCKSEnable": 1, "SOCKSProxy": host, "SOCKSPort": port]
        }
        return ["HTTPEnable": 1, "HTTPProxy": host, "HTTPPort": port,
                "HTTPSEnable": 1, "HTTPSProxy": host, "HTTPSPort": port]
    }

    /// A configuration carrying the user's proxy over the given base. Called before each session is built.
    static func configuration(_ base: URLSessionConfiguration = .default) -> URLSessionConfiguration {
        let c = base
        c.connectionProxyDictionary = ProxyConfig.current.connectionProxyDictionary
        return c
    }

    /// A shared session carrying the user's proxy, built lazily from the saved config. Used in place of
    /// URLSession.shared so all of 1401's traffic honors the in-app proxy without the system proxy being set.
    private static var _session: URLSession?
    static var session: URLSession {
        if let s = _session { return s }
        let s = URLSession(configuration: configuration(.default))
        _session = s
        return s
    }

    /// Drop the shared session so the next call rebuilds it from a just-saved proxy. In-flight tasks are cancelled;
    /// this is called from a settings save, where none are expected.
    static func refresh() {
        _session?.invalidateAndCancel()
        _session = nil
    }
}

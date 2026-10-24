import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

// This process has no tools, file access APIs, or network client. Its only input
// is one bounded prompt from the local server; its only output is NDJSON.
@main
struct CompanionModel {
    static let maximumInputBytes = 100 * 1024
    static let maximumTextCharacters = 4000

    static func emit(_ value: [String: Any]) {
        guard var bytes = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .withoutEscapingSlashes]) else { return }
        bytes.append(0x0a)
        FileHandle.standardOutput.write(bytes)
    }

    static func error(_ code: String, _ message: String) {
        emit(["type": "error", "code": code, "message": message])
    }

    static func main() async {
        #if canImport(FoundationModels)
        if #available(macOS 26.0, *) {
            if CommandLine.arguments.dropFirst().elementsEqual(["--availability"]) {
                let state = availability()
                emit(["available": state.available, "reason": state.reason])
                return
            }
            guard CommandLine.arguments.count == 1 else {
                error("invalidRequest", "The conversation request is invalid.")
                return
            }
            await generate()
            return
        }
        #endif
        if CommandLine.arguments.dropFirst().elementsEqual(["--availability"]) {
            emit(["available": false, "reason": "macOS26Required"])
        } else {
            error("macOS26Required", "On-device conversation requires macOS 26 or later.")
        }
    }

    #if canImport(FoundationModels)
    @available(macOS 26.0, *)
    static func availability() -> (available: Bool, reason: String) {
        switch SystemLanguageModel.default.availability {
        case .available: return (true, "available")
        case .unavailable(let reason):
            switch reason {
            case .deviceNotEligible: return (false, "deviceNotEligible")
            case .appleIntelligenceNotEnabled: return (false, "appleIntelligenceNotEnabled")
            case .modelNotReady: return (false, "modelNotReady")
            @unknown default: return (false, "unavailable")
            }
        @unknown default: return (false, "unavailable")
        }
    }

    @available(macOS 26.0, *)
    static func generate() async {
        do {
            var bytes = Data()
            while let chunk = try FileHandle.standardInput.read(upToCount: 8192), !chunk.isEmpty {
                bytes.append(chunk)
                guard bytes.count <= maximumInputBytes else {
                    error("invalidRequest", "The conversation request is too large.")
                    return
                }
            }
            guard let body = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
                  Set(body.keys).isSubset(of: Set(["instructions", "prompt", "history"])),
                  let instructions = body["instructions"] as? String,
                  let prompt = body["prompt"] as? String,
                  !instructions.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  instructions.utf16.count + prompt.utf16.count <= 10_000 else {
                error("invalidRequest", "The conversation request is invalid.")
                return
            }
            let rawHistory = body["history"] ?? []
            guard let history = rawHistory as? [[String: Any]], history.count <= 6 else {
                error("invalidRequest", "The conversation history is invalid.")
                return
            }
            var previous: [(role: String, text: String)] = []
            var length = instructions.utf16.count + prompt.utf16.count
            for entry in history {
                guard Set(entry.keys) == Set(["role", "text"]),
                      let role = entry["role"] as? String, ["user", "assistant"].contains(role),
                      let text = entry["text"] as? String,
                      !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                      text.utf16.count <= 1000 else {
                    error("invalidRequest", "The conversation history is invalid.")
                    return
                }
                length += text.utf16.count
                previous.append((role, text))
            }
            guard length <= 10_000 else {
                error("invalidRequest", "The conversation request is too large.")
                return
            }
            let state = availability()
            guard state.available else {
                error(state.reason, "The on-device model is not available. Check Apple Intelligence in System Settings.")
                return
            }
            // Preserve the actual conversational roles. Quoting an entire chat
            // inside a fresh prompt makes a small model imitate old replies.
            func segments(_ text: String) -> [Transcript.Segment] {
                [.text(Transcript.TextSegment(content: text))]
            }
            var entries: [Transcript.Entry] = [
                .instructions(Transcript.Instructions(segments: segments(instructions), toolDefinitions: []))
            ]
            for entry in previous {
                if entry.role == "user" {
                    entries.append(.prompt(Transcript.Prompt(segments: segments(entry.text))))
                } else {
                    entries.append(.response(Transcript.Response(assetIDs: [], segments: segments(entry.text))))
                }
            }
            let session = LanguageModelSession(model: .default, tools: [], transcript: Transcript(entries: entries))
            let options = GenerationOptions(temperature: 0.3, maximumResponseTokens: 160)
            var latest = ""
            for try await snapshot in session.streamResponse(to: prompt, options: options) {
                try Task.checkCancellation()
                // Match the app's bounded plain-text history. Do not split a
                // grapheme; a terminal length error preserves the prior text.
                let text = snapshot.content
                guard text.utf16.count <= maximumTextCharacters else {
                    error("responseTooLong", "The reply was too long. Please ask a shorter question.")
                    return
                }
                if text != latest {
                    latest = text
                    emit(["type": "text", "text": text])
                }
            }
            guard !latest.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                error("emptyResponse", "No reply came through. Please try again.")
                return
            }
            emit(["type": "done"])
        } catch let generationError as LanguageModelSession.GenerationError {
            // Framework debug descriptions can contain prompt content. Never
            // forward or log them; only this fixed vocabulary crosses stdout.
            switch generationError {
            case .exceededContextWindowSize:
                error("contextTooLong", "This request is too long for the on-device model. Please ask a shorter question.")
            case .assetsUnavailable:
                error("modelNotReady", "The on-device model is not ready. Check Apple Intelligence in System Settings.")
            case .guardrailViolation, .refusal:
                error("refused", "The on-device model could not answer that request. Try rephrasing it.")
            case .unsupportedLanguageOrLocale:
                error("unsupportedLanguage", "The on-device model does not support that language yet.")
            case .rateLimited, .concurrentRequests:
                error("modelBusy", "The on-device model is busy. Please try again in a moment.")
            default:
                error("generationFailed", "The reply was interrupted. Please try again.")
            }
        } catch is CancellationError {
            error("cancelled", "Reply stopped.")
        } catch {
            self.error("generationFailed", "The reply could not be generated. Please try again.")
        }
    }
    #endif
}

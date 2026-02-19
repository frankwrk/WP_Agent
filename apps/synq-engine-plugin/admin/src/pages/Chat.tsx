import { useEffect, useMemo, useState } from "react";
import {
  createOrResumeSession,
  getCurrentSession,
  sendMessage,
} from "../api/client";
import type { ChatMessage, ChatSession, PolicyPreset } from "../api/types";

const PRESETS: PolicyPreset[] = ["fast", "balanced", "quality", "reasoning"];

export function ChatPage() {
  const [policyPreset, setPolicyPreset] = useState<PolicyPreset>("balanced");
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [messages],
  );

  const loadSession = async (preset: PolicyPreset) => {
    setLoading(true);
    setError(null);
    try {
      const current = await getCurrentSession(preset);
      setSession(current.session);
      setMessages(current.messages ?? []);
    } catch {
      try {
        const created = await createOrResumeSession(preset);
        setSession(created.session);
        setMessages(created.messages ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to initialize chat session");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSession(policyPreset);
  }, []);

  const handlePresetChange = (value: PolicyPreset) => {
    setPolicyPreset(value);
    void loadSession(value);
  };

  const handleSend = async () => {
    if (!session || !input.trim()) {
      return;
    }

    setSending(true);
    setError(null);

    try {
      const response = await sendMessage(session.session_id, input.trim());
      setSession(response.session);
      setMessages((prev) => [...prev, response.user_message, response.assistant_message]);
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="wp-agent-panel wp-agent-chat">
      <div className="wp-agent-chat-header">
        <h1>SYNQ Engine Chat</h1>
        <label>
          Policy preset
          <select
            value={policyPreset}
            onChange={(event) => handlePresetChange(event.target.value as PolicyPreset)}
          >
            {PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {preset}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? <p>Loading chat session...</p> : null}
      {error ? <p className="wp-agent-error">{error}</p> : null}

      <div className="wp-agent-chat-log">
        {sortedMessages.length === 0 ? <p className="wp-agent-muted">No messages yet.</p> : null}
        {sortedMessages.map((message, index) => (
          <article
            key={`${message.created_at}-${index}`}
            className={`wp-agent-bubble wp-agent-bubble-${message.role}`}
          >
            <header>
              <strong>{message.role === "assistant" ? "Assistant" : "You"}</strong>
              <span>{message.created_at}</span>
            </header>
            <p>{message.content}</p>
          </article>
        ))}
      </div>

      <div className="wp-agent-chat-input">
        <textarea
          placeholder="Ask about your WordPress environment and content inventory..."
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={4}
        />
        <button className="button button-primary" disabled={sending || !session} onClick={() => void handleSend()}>
          {sending ? "Sending..." : "Send"}
        </button>
      </div>
    </section>
  );
}

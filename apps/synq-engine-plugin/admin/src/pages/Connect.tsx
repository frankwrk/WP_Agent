import { useEffect, useState } from "react";
import {
  fetchConnectSettings,
  fetchConnectStatus,
  runPairing,
  saveConnectSettings,
  testBackendConnection,
} from "../api/client";
import type { ConnectStatus, ConnectTestResult } from "../api/types";

export function ConnectPage() {
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [backendUrl, setBackendUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [pairing, setPairing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<ConnectTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const [next, settings] = await Promise.all([fetchConnectStatus(), fetchConnectSettings()]);
      setStatus(next);
      setBackendUrl(settings.backend_base_url || next.backend_base_url || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const handlePair = async () => {
    setPairing(true);
    setError(null);
    setMessage(null);

    try {
      await runPairing();
      await loadStatus();
      setMessage("Pairing completed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pairing failed");
    } finally {
      setPairing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    setTestResult(null);

    try {
      const next = await saveConnectSettings(backendUrl);
      setStatus(next);
      setBackendUrl(next.backend_base_url || "");
      setMessage("Backend URL saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save backend URL");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setError(null);
    setMessage(null);

    try {
      const result = await testBackendConnection(backendUrl);
      setTestResult(result);
      setMessage(result.connected ? "Connected." : `Connection failed (${result.status_code}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection test failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="wp-agent-panel">
      <h1>SYNQ Engine Connect</h1>
      <p className="wp-agent-muted">Connect this WordPress site to the backend orchestrator.</p>

      {loading ? <p>Loading connection status...</p> : null}
      {error ? <p className="wp-agent-error">{error}</p> : null}
      {message ? <p className="wp-agent-success">{message}</p> : null}

      {status ? (
        <>
          <div className="wp-agent-connect-settings">
            <label htmlFor="wp-agent-backend-url">
              <strong>Backend URL</strong>
            </label>
            <input
              id="wp-agent-backend-url"
              type="url"
              value={backendUrl}
              onChange={(event) => setBackendUrl(event.target.value)}
              placeholder="http://localhost:3001"
            />
            <p className="wp-agent-muted">
              Use http://localhost:3001 for local dev; use https://api.synqengine.com for production.
            </p>
            <div className="wp-agent-actions">
              <button className="button" onClick={() => void handleSave()} disabled={saving}>
                {saving ? "Saving..." : "Save Backend URL"}
              </button>
              <button className="button" onClick={() => void handleTest()} disabled={testing}>
                {testing ? "Testing..." : "Test Connection"}
              </button>
            </div>
            {testResult ? (
              <p className={testResult.connected ? "wp-agent-success" : "wp-agent-error"}>{testResult.message}</p>
            ) : null}
          </div>

          <dl className="wp-agent-kv">
            <div>
              <dt>Paired</dt>
              <dd>{status.paired ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt>Installation ID</dt>
              <dd>{status.installation_id}</dd>
            </div>
            <div>
              <dt>Paired At</dt>
              <dd>{status.paired_at || "-"}</dd>
            </div>
            <div>
              <dt>Backend URL</dt>
              <dd>{status.backend_base_url || "-"}</dd>
            </div>
            <div>
              <dt>Audience</dt>
              <dd>{status.backend_audience || "-"}</dd>
            </div>
            <div>
              <dt>Signature Alg</dt>
              <dd>{status.signature_alg}</dd>
            </div>
          </dl>
        </>
      ) : null}

      <button className="button button-primary" onClick={() => void handlePair()} disabled={pairing}>
        {pairing ? "Pairing..." : "Run Pairing"}
      </button>
    </section>
  );
}

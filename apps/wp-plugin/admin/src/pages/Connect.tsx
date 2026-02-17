import { useEffect, useState } from "react";
import { fetchConnectStatus, runPairing } from "../api/client";
import type { ConnectStatus } from "../api/types";

export function ConnectPage() {
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchConnectStatus();
      setStatus(next);
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

    try {
      await runPairing();
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pairing failed");
    } finally {
      setPairing(false);
    }
  };

  return (
    <section className="wp-agent-panel">
      <h1>WP Agent Connect</h1>
      <p className="wp-agent-muted">Connect this WordPress site to the backend orchestrator.</p>

      {loading ? <p>Loading connection status...</p> : null}
      {error ? <p className="wp-agent-error">{error}</p> : null}

      {status ? (
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
      ) : null}

      <button className="button button-primary" onClick={() => void handlePair()} disabled={pairing}>
        {pairing ? "Pairing..." : "Run Pairing"}
      </button>
    </section>
  );
}

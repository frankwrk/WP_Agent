import type { RunEventApi, RunRecordApi, RunRollbackApi, RunStepApi } from "../api/types";

interface RunTimelineProps {
  run: RunRecordApi | null;
  steps: RunStepApi[];
  events: RunEventApi[];
  rollbacks: RunRollbackApi[];
  rollingBack: boolean;
  onRollback: () => void;
}

export function RunTimeline({
  run,
  steps,
  events,
  rollbacks,
  rollingBack,
  onRollback,
}: RunTimelineProps) {
  if (!run) {
    return (
      <section className="wp-agent-run-panel">
        <h3>Run Timeline</h3>
        <p className="wp-agent-muted">No run started yet.</p>
      </section>
    );
  }

  return (
    <section className="wp-agent-run-panel">
      <div className="wp-agent-plan-title-row">
        <h3>Run Timeline</h3>
        <span className={`wp-agent-pill wp-agent-pill-status-${run.status}`}>{run.status}</span>
      </div>

      <p>
        <strong>Run ID:</strong> {run.run_id}
      </p>
      <dl className="wp-agent-kv wp-agent-kv-tight">
        <div>
          <dt>Planned pages</dt>
          <dd>{run.planned_pages}</dd>
        </div>
        <div>
          <dt>Actual pages</dt>
          <dd>{run.actual_pages}</dd>
        </div>
        <div>
          <dt>Planned tool calls</dt>
          <dd>{run.planned_tool_calls}</dd>
        </div>
        <div>
          <dt>Actual tool calls</dt>
          <dd>{run.actual_tool_calls}</dd>
        </div>
      </dl>

      {run.error_code || run.error_message ? (
        <p className="wp-agent-error">
          {run.error_code ? <code>{run.error_code}</code> : null}
          {run.error_code ? " " : null}
          {run.error_message}
        </p>
      ) : null}

      <h4>Steps</h4>
      <ul className="wp-agent-events">
        {steps.map((step) => (
          <li key={step.step_id}>
            <strong>{step.step_id}</strong> · {step.status} · pages {step.actual_pages}/{step.planned_pages}
          </li>
        ))}
      </ul>

      <h4>Events</h4>
      <ul className="wp-agent-events">
        {events.map((event) => (
          <li key={event.id}>
            <strong>{event.event_type}</strong> · {event.created_at}
          </li>
        ))}
      </ul>

      <h4>Rollback Handles</h4>
      {rollbacks.length === 0 ? (
        <p className="wp-agent-muted">No rollback handles recorded.</p>
      ) : (
        <ul className="wp-agent-events">
          {rollbacks.map((rollback) => (
            <li key={rollback.handle_id}>
              <strong>{rollback.kind}</strong> · {rollback.status} · {rollback.handle_id}
            </li>
          ))}
        </ul>
      )}

      <button
        className="button"
        disabled={rollingBack || !run.rollback_available}
        onClick={onRollback}
      >
        {rollingBack ? "Rolling back..." : "Apply Rollback"}
      </button>
    </section>
  );
}

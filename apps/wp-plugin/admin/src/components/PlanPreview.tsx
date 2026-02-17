import type { PlanContractApi, PlanEvent } from "../api/types";

interface PlanPreviewProps {
  plan: PlanContractApi | null;
  events: PlanEvent[];
  approving: boolean;
  onApprove: () => void;
}

export function PlanPreview({ plan, events, approving, onApprove }: PlanPreviewProps) {
  if (!plan) {
    return (
      <section className="wp-agent-plan-preview">
        <h2>Plan Preview</h2>
        <p className="wp-agent-muted">Generate a plan to preview steps, estimates, risk, and approve status.</p>
      </section>
    );
  }

  return (
    <section className="wp-agent-plan-preview">
      <div className="wp-agent-plan-title-row">
        <h2>Plan Preview</h2>
        <span className={`wp-agent-pill wp-agent-pill-status-${plan.status}`}>{plan.status}</span>
      </div>

      <p>
        <strong>Plan ID:</strong> {plan.plan_id}
      </p>
      <p>
        <strong>Goal:</strong> {plan.goal}
      </p>

      <h3>Steps</h3>
      <ol className="wp-agent-plan-steps">
        {plan.steps.map((step) => (
          <li key={step.step_id}>
            <strong>{step.title}</strong>
            <p>{step.objective}</p>
            <p className="wp-agent-muted">Tools: {step.tools.join(", ") || "-"}</p>
          </li>
        ))}
      </ol>

      <h3>Estimate</h3>
      <dl className="wp-agent-kv wp-agent-kv-tight">
        <div>
          <dt>Pages</dt>
          <dd>{plan.estimates.estimated_pages}</dd>
        </div>
        <div>
          <dt>Cost Band</dt>
          <dd>{plan.estimates.estimated_cost_usd_band}</dd>
        </div>
        <div>
          <dt>Cost (USD)</dt>
          <dd>{plan.estimates.estimated_cost_usd.toFixed(4)}</dd>
        </div>
        <div>
          <dt>Runtime (sec)</dt>
          <dd>{plan.estimates.estimated_runtime_sec}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>{plan.estimates.confidence_band}</dd>
        </div>
        <div>
          <dt>Risk Tier</dt>
          <dd>{plan.risk.tier}</dd>
        </div>
      </dl>

      <h3>Validation Issues</h3>
      {plan.validation_issues.length === 0 ? (
        <p className="wp-agent-muted">No validation issues.</p>
      ) : (
        <ul className="wp-agent-issues">
          {plan.validation_issues.map((issue, index) => (
            <li key={`${issue.code}-${index}`}>
              <code>{issue.code}</code> {issue.message}
            </li>
          ))}
        </ul>
      )}

      <h3>Events</h3>
      <ul className="wp-agent-events">
        {events.map((event) => (
          <li key={event.id}>
            <strong>{event.event_type}</strong> · {event.actor_type}:{event.actor_id} · {event.created_at}
          </li>
        ))}
      </ul>

      <button
        className="button button-primary"
        disabled={approving || plan.status !== "validated"}
        onClick={onApprove}
      >
        {approving ? "Approving..." : "Approve Plan"}
      </button>
    </section>
  );
}

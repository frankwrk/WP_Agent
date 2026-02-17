import { useEffect } from "react";
import {
  approvePlan,
  createRun,
  draftPlan,
  getRun,
  getSkill,
  listSkills,
  rollbackRun,
  syncSkills,
} from "../api/client";
import { PlanPreview } from "../components/PlanPreview";
import { RunTimeline } from "../components/RunTimeline";
import { SkillCard } from "../components/SkillCard";
import { useSkillsPlannerStore } from "../state/store";

function parseInputs(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {};
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Inputs must be a JSON object");
  }

  return parsed as Record<string, unknown>;
}

function isRunActive(status: string): boolean {
  return status === "queued" || status === "running" || status === "rolling_back";
}

export function SkillsPage() {
  const { state, actions } = useSkillsPlannerStore();

  const loadSkills = async () => {
    actions.dispatch({ type: "setLoadingSkills", value: true });
    actions.dispatch({ type: "setError", value: null });

    try {
      const data = await listSkills({
        search: state.filters.search || undefined,
        safetyClass: state.filters.safetyClass === "all" ? undefined : state.filters.safetyClass,
        deprecated:
          state.filters.deprecated === "all"
            ? undefined
            : state.filters.deprecated === "deprecated",
      });
      actions.dispatch({ type: "setSkills", value: data.items ?? [] });
    } catch (error) {
      actions.dispatch({
        type: "setError",
        value: error instanceof Error ? error.message : "Failed to load skills",
      });
    } finally {
      actions.dispatch({ type: "setLoadingSkills", value: false });
    }
  };

  useEffect(() => {
    void loadSkills();
  }, []);

  useEffect(() => {
    if (!state.run || !isRunActive(state.run.status)) {
      return;
    }

    const pollId = window.setInterval(() => {
      void (async () => {
        try {
          const response = await getRun(state.run!.run_id);
          actions.dispatch({
            type: "setRunResult",
            run: response.run,
            steps: response.steps,
            events: response.events,
            rollbacks: response.rollbacks,
          });
        } catch {
          // keep the last known run state if polling transiently fails
        }
      })();
    }, 2000);

    return () => {
      window.clearInterval(pollId);
    };
  }, [state.run?.run_id, state.run?.status]);

  const selectSkill = async (skillId: string) => {
    actions.dispatch({ type: "selectSkill", value: skillId });
    actions.dispatch({ type: "setError", value: null });

    try {
      const skill = await getSkill(skillId);
      actions.dispatch({ type: "setSelectedSkill", value: skill });
    } catch (error) {
      actions.dispatch({
        type: "setError",
        value: error instanceof Error ? error.message : "Failed to load skill details",
      });
    }
  };

  const handleSync = async () => {
    actions.dispatch({ type: "setSyncingSkills", value: true });
    actions.dispatch({ type: "setError", value: null });

    try {
      await syncSkills(state.syncForm.repoUrl, state.syncForm.commitSha);
      await loadSkills();
    } catch (error) {
      actions.dispatch({
        type: "setError",
        value: error instanceof Error ? error.message : "Failed to sync skills",
      });
    } finally {
      actions.dispatch({ type: "setSyncingSkills", value: false });
    }
  };

  const handleGeneratePlan = async () => {
    if (!state.selectedSkillId) {
      actions.dispatch({ type: "setError", value: "Select a skill first" });
      return;
    }

    actions.dispatch({ type: "setGeneratingPlan", value: true });
    actions.dispatch({ type: "setError", value: null });

    try {
      const response = await draftPlan({
        policyPreset: state.planner.policyPreset,
        skillId: state.selectedSkillId,
        goal: state.planner.goal,
        inputs: parseInputs(state.planner.inputsText),
      });
      actions.dispatch({
        type: "setPlanResult",
        plan: response.plan,
        events: response.events,
      });
    } catch (error) {
      actions.dispatch({
        type: "setError",
        value: error instanceof Error ? error.message : "Failed to draft plan",
      });
    } finally {
      actions.dispatch({ type: "setGeneratingPlan", value: false });
    }
  };

  const handleApprove = async () => {
    if (!state.plan) {
      return;
    }

    actions.dispatch({ type: "setApprovingPlan", value: true });
    actions.dispatch({ type: "setError", value: null });

    try {
      const response = await approvePlan(state.plan.plan_id);
      actions.dispatch({
        type: "setPlanResult",
        plan: response.plan,
        events: response.events,
      });
    } catch (error) {
      actions.dispatch({
        type: "setError",
        value: error instanceof Error ? error.message : "Failed to approve plan",
      });
    } finally {
      actions.dispatch({ type: "setApprovingPlan", value: false });
    }
  };

  const handleExecute = async () => {
    if (!state.plan) {
      return;
    }

    actions.dispatch({ type: "setCreatingRun", value: true });
    actions.dispatch({ type: "setError", value: null });

    try {
      const response = await createRun(state.plan.plan_id);
      actions.dispatch({
        type: "setRunResult",
        run: response.run,
        steps: response.steps,
        events: response.events,
        rollbacks: response.rollbacks,
      });
    } catch (error) {
      actions.dispatch({
        type: "setError",
        value: error instanceof Error ? error.message : "Failed to start run",
      });
    } finally {
      actions.dispatch({ type: "setCreatingRun", value: false });
    }
  };

  const handleRollback = async () => {
    if (!state.run) {
      return;
    }

    actions.dispatch({ type: "setRollingBackRun", value: true });
    actions.dispatch({ type: "setError", value: null });

    try {
      const response = await rollbackRun(state.run.run_id);
      actions.dispatch({
        type: "setRunResult",
        run: response.run,
        steps: response.steps,
        events: response.events,
        rollbacks: response.rollbacks,
      });
    } catch (error) {
      actions.dispatch({
        type: "setError",
        value: error instanceof Error ? error.message : "Failed to apply rollback",
      });
    } finally {
      actions.dispatch({ type: "setRollingBackRun", value: false });
    }
  };

  return (
    <section className="wp-agent-panel wp-agent-skills-page">
      <div className="wp-agent-skills-header">
        <h1>Skills & Plan Preview</h1>
        <button className="button" onClick={() => void loadSkills()} disabled={state.loadingSkills}>
          {state.loadingSkills ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {state.error ? <p className="wp-agent-error">{state.error}</p> : null}

      <div className="wp-agent-sync-row">
        <input
          type="text"
          placeholder="GitHub repo URL"
          value={state.syncForm.repoUrl}
          onChange={(event) => actions.dispatch({ type: "setSyncRepoUrl", value: event.target.value })}
        />
        <input
          type="text"
          placeholder="Commit SHA"
          value={state.syncForm.commitSha}
          onChange={(event) => actions.dispatch({ type: "setSyncCommitSha", value: event.target.value })}
        />
        <button className="button" onClick={() => void handleSync()} disabled={state.syncingSkills}>
          {state.syncingSkills ? "Syncing..." : "Sync Skills"}
        </button>
      </div>

      <div className="wp-agent-filters">
        <input
          type="search"
          placeholder="Search skills"
          value={state.filters.search}
          onChange={(event) => actions.dispatch({ type: "setFilterSearch", value: event.target.value })}
        />
        <select
          value={state.filters.safetyClass}
          onChange={(event) =>
            actions.dispatch({
              type: "setFilterSafety",
              value: event.target.value as "all" | "read" | "write_draft" | "write_publish",
            })
          }
        >
          <option value="all">All safety classes</option>
          <option value="read">read</option>
          <option value="write_draft">write_draft</option>
          <option value="write_publish">write_publish</option>
        </select>
        <select
          value={state.filters.deprecated}
          onChange={(event) =>
            actions.dispatch({
              type: "setFilterDeprecated",
              value: event.target.value as "all" | "active" | "deprecated",
            })
          }
        >
          <option value="all">All statuses</option>
          <option value="active">Active only</option>
          <option value="deprecated">Deprecated only</option>
        </select>
        <button className="button" onClick={() => void loadSkills()}>
          Apply
        </button>
      </div>

      <div className="wp-agent-skills-layout">
        <div className="wp-agent-skills-list">
          {state.skills.length === 0 ? <p className="wp-agent-muted">No skills found.</p> : null}
          {state.skills.map((skill) => (
            <SkillCard
              key={`${skill.skill_id}:${skill.version}`}
              skill={skill}
              selected={state.selectedSkillId === skill.skill_id}
              onSelect={(skillId) => void selectSkill(skillId)}
            />
          ))}
        </div>

        <div className="wp-agent-planner-panel">
          <h2>Generate Plan</h2>
          <p className="wp-agent-muted">
            Selected skill: {state.selectedSkill?.name ?? state.selectedSkillId ?? "none"}
          </p>

          <label>
            Policy preset
            <select
              value={state.planner.policyPreset}
              onChange={(event) =>
                actions.dispatch({
                  type: "setPolicyPreset",
                  value: event.target.value as "fast" | "balanced" | "quality" | "reasoning",
                })
              }
            >
              <option value="fast">fast</option>
              <option value="balanced">balanced</option>
              <option value="quality">quality</option>
              <option value="reasoning">reasoning</option>
            </select>
          </label>

          <label>
            Goal
            <textarea
              rows={3}
              placeholder="Describe the desired outcome"
              value={state.planner.goal}
              onChange={(event) => actions.dispatch({ type: "setGoal", value: event.target.value })}
            />
          </label>

          <label>
            Inputs (JSON object)
            <textarea
              rows={6}
              value={state.planner.inputsText}
              onChange={(event) => actions.dispatch({ type: "setInputsText", value: event.target.value })}
            />
          </label>

          <button
            className="button button-primary"
            onClick={() => void handleGeneratePlan()}
            disabled={state.generatingPlan || !state.selectedSkillId}
          >
            {state.generatingPlan ? "Generating..." : "Generate Plan"}
          </button>

          <PlanPreview
            plan={state.plan}
            events={state.events}
            approving={state.approvingPlan}
            executing={state.creatingRun}
            onApprove={() => void handleApprove()}
            onExecute={() => void handleExecute()}
          />

          <RunTimeline
            run={state.run}
            steps={state.runSteps}
            events={state.runEvents}
            rollbacks={state.runRollbacks}
            rollingBack={state.rollingBackRun}
            onRollback={() => void handleRollback()}
          />
        </div>
      </div>
    </section>
  );
}

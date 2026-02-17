import { useMemo, useReducer } from "react";
import type {
  PlanContractApi,
  PlanEvent,
  PolicyPreset,
  SkillCatalogItem,
  SkillSpec,
} from "../api/types";

export interface SkillsPlannerState {
  loadingSkills: boolean;
  syncingSkills: boolean;
  generatingPlan: boolean;
  approvingPlan: boolean;
  error: string | null;
  skills: SkillCatalogItem[];
  selectedSkillId: string | null;
  selectedSkill: SkillSpec | null;
  plan: PlanContractApi | null;
  events: PlanEvent[];
  filters: {
    search: string;
    safetyClass: "all" | "read" | "write_draft" | "write_publish";
    deprecated: "all" | "active" | "deprecated";
  };
  planner: {
    policyPreset: PolicyPreset;
    goal: string;
    inputsText: string;
  };
  syncForm: {
    repoUrl: string;
    commitSha: string;
  };
}

const INITIAL_STATE: SkillsPlannerState = {
  loadingSkills: false,
  syncingSkills: false,
  generatingPlan: false,
  approvingPlan: false,
  error: null,
  skills: [],
  selectedSkillId: null,
  selectedSkill: null,
  plan: null,
  events: [],
  filters: {
    search: "",
    safetyClass: "all",
    deprecated: "all",
  },
  planner: {
    policyPreset: "balanced",
    goal: "",
    inputsText: "{}",
  },
  syncForm: {
    repoUrl: "",
    commitSha: "",
  },
};

type Action =
  | { type: "setLoadingSkills"; value: boolean }
  | { type: "setSyncingSkills"; value: boolean }
  | { type: "setGeneratingPlan"; value: boolean }
  | { type: "setApprovingPlan"; value: boolean }
  | { type: "setError"; value: string | null }
  | { type: "setSkills"; value: SkillCatalogItem[] }
  | { type: "selectSkill"; value: string | null }
  | { type: "setSelectedSkill"; value: SkillSpec | null }
  | { type: "setPlanResult"; plan: PlanContractApi; events: PlanEvent[] }
  | { type: "setEvents"; value: PlanEvent[] }
  | { type: "setFilterSearch"; value: string }
  | {
      type: "setFilterSafety";
      value: "all" | "read" | "write_draft" | "write_publish";
    }
  | { type: "setFilterDeprecated"; value: "all" | "active" | "deprecated" }
  | { type: "setPolicyPreset"; value: PolicyPreset }
  | { type: "setGoal"; value: string }
  | { type: "setInputsText"; value: string }
  | { type: "setSyncRepoUrl"; value: string }
  | { type: "setSyncCommitSha"; value: string };

function reducer(state: SkillsPlannerState, action: Action): SkillsPlannerState {
  switch (action.type) {
    case "setLoadingSkills":
      return { ...state, loadingSkills: action.value };
    case "setSyncingSkills":
      return { ...state, syncingSkills: action.value };
    case "setGeneratingPlan":
      return { ...state, generatingPlan: action.value };
    case "setApprovingPlan":
      return { ...state, approvingPlan: action.value };
    case "setError":
      return { ...state, error: action.value };
    case "setSkills":
      return { ...state, skills: action.value };
    case "selectSkill":
      return { ...state, selectedSkillId: action.value, selectedSkill: null, plan: null, events: [] };
    case "setSelectedSkill":
      return { ...state, selectedSkill: action.value };
    case "setPlanResult":
      return { ...state, plan: action.plan, events: action.events };
    case "setEvents":
      return { ...state, events: action.value };
    case "setFilterSearch":
      return { ...state, filters: { ...state.filters, search: action.value } };
    case "setFilterSafety":
      return { ...state, filters: { ...state.filters, safetyClass: action.value } };
    case "setFilterDeprecated":
      return { ...state, filters: { ...state.filters, deprecated: action.value } };
    case "setPolicyPreset":
      return { ...state, planner: { ...state.planner, policyPreset: action.value } };
    case "setGoal":
      return { ...state, planner: { ...state.planner, goal: action.value } };
    case "setInputsText":
      return { ...state, planner: { ...state.planner, inputsText: action.value } };
    case "setSyncRepoUrl":
      return { ...state, syncForm: { ...state.syncForm, repoUrl: action.value } };
    case "setSyncCommitSha":
      return { ...state, syncForm: { ...state.syncForm, commitSha: action.value } };
    default:
      return state;
  }
}

export function useSkillsPlannerStore() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const actions = useMemo(() => ({ dispatch }), [dispatch]);
  return { state, actions };
}

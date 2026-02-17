import type { SkillCatalogItem } from "../api/types";

interface SkillCardProps {
  skill: SkillCatalogItem;
  selected: boolean;
  onSelect: (skillId: string) => void;
}

export function SkillCard({ skill, selected, onSelect }: SkillCardProps) {
  return (
    <article className={`wp-agent-skill-card${selected ? " is-selected" : ""}`}>
      <header>
        <h3>{skill.name}</h3>
        <span className={`wp-agent-pill wp-agent-pill-${skill.safety_class}`}>{skill.safety_class}</span>
      </header>
      <p>{skill.description}</p>
      <p className="wp-agent-muted">{skill.skill_id}</p>
      <div className="wp-agent-skill-tags">
        {skill.tags.map((tag) => (
          <span key={tag} className="wp-agent-tag">
            {tag}
          </span>
        ))}
      </div>
      <button className="button" onClick={() => onSelect(skill.skill_id)}>
        {selected ? "Selected" : "Select"}
      </button>
    </article>
  );
}

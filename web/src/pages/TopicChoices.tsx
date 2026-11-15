import { useEffect, useState } from "react";
import { api } from "../api.js";

export function TopicChoices({ selected, onChange, conference }: {
  selected: string[];
  onChange: (topics: string[]) => void;
  conference: string | null;
}) {
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!conference) return;
    let active = true;
    setError("");
    api.catalogTopics(conference).then((result) => {
      if (active) setTags(result.topics);
    }, () => { if (active) setError("Topics could not be loaded. Please retry before registering."); });
    return () => { active = false; };
  }, [attempt, conference]);
  return <fieldset>
    <legend>Topics that interest you</legend>
    <p>Select any that apply. These topics come from the talk catalog.</p>
    {error && <><p role="status">{error}</p><button type="button" onClick={() => setAttempt(attempt + 1)}>Retry topics</button></>}
    <div className="topic-choices">{tags.map((tag) => <label key={tag}>
      <input type="checkbox" checked={selected.includes(tag)} onChange={(event) =>
        onChange(event.target.checked ? [...selected, tag] : selected.filter((value) => value !== tag))} /> {tag}
    </label>)}</div>
  </fieldset>;
}

import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ExperienceLevel, SearchHit } from "@cc/shared";
import { api } from "../api.js";
import { NoConferenceState, UnpublishedTalksState, conferenceSlug, useConferenceEntry } from "../components/PageState.js";
import { rememberSkipped } from "../skippedTalks.js";
import { withConference } from "../conferenceLink.js";
import { TopicChoices } from "./TopicChoices.js";
import "./attendee.css";

/**
 * Talk ids with valid times in score order. Overlaps are left in on purpose: the
 * server drops them greedily and reports them as `skipped`, so /schedule can
 * show what was left out and offer a swap.
 */
export function selectTalks(hits: SearchHit[]): string[] {
  return [...hits].sort((a, b) => b.score - a.score).filter(({ talk }) => {
    const start = Date.parse(talk.start);
    const end = Date.parse(talk.end);
    return Number.isFinite(start) && Number.isFinite(end) && start < end;
  }).map(({ talk }) => talk.id);
}

export function Onboarding() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const conference = conferenceSlug(search);
  const conferenceEntry = useConferenceEntry(conference);
  const [topics, setTopics] = useState<string[]>([]);
  const [experience, setExperience] = useState<ExperienceLevel>("beginner");
  const [goals, setGoals] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [unpublished, setUnpublished] = useState(false);
  useEffect(() => { setUnpublished(false); }, [conference]);
  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (topics.length === 0 && goals.length === 0 && freeText.trim() === "") {
      setError("Choose a topic or goal, or describe what you would like to learn.");
      return;
    }
    setPending(true);
    setError("");
    setUnpublished(false);
    try {
      const result = await api.onboarding({ answers: { topics, experience, goals, freeText: freeText.trim() } }, conference);
      const matches = await api.search(result.query.text, result.query.mode, false, {}, conference);
      const talkIds = selectTalks(matches.hits);
      if (talkIds.length === 0) {
        // An empty hit list for an event with no programme is not a bad query: point at the organiser instead.
        try {
          if ((await api.catalogTopics(conference)).topics.length === 0) { setUnpublished(true); return; }
        } catch { /* fall through to the query advice */ }
        setError("No matching talks found. Try a broader topic or a shorter description.");
        return;
      }
      rememberSkipped((await api.saveSchedule({ talkIds })).skipped);
      navigate(withConference("/schedule", search));
    } catch {
      setError("We could not build your schedule. Please try again. If your session expired, register again.");
    } finally { setPending(false); }
  }
  if (!conference) return <div className="attendee-form">
    <h1>Find talks</h1>
    <NoConferenceState />
  </div>;
  return <form className="attendee-form" onSubmit={onSubmit} aria-busy={pending}>
    <h1>Find talks</h1>
    <p>Tell us what you want to learn. We’ll find relevant talks and save a schedule without overlapping sessions.</p>
    {unpublished && <UnpublishedTalksState conference={conferenceEntry} />}
    <TopicChoices selected={topics} onChange={setTopics} conference={conference} />
    <label htmlFor="experience">Your experience level</label>
    <select id="experience" value={experience} onChange={(event) => setExperience(event.target.value as ExperienceLevel)}>
      <option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option>
    </select>
    <fieldset><legend>What do you want from the conference?</legend>
      {["Learn the basics", "Solve a production problem", "Explore new tools", "Hear real-world stories"].map((goal) => <label key={goal}>
        <input type="checkbox" checked={goals.includes(goal)} onChange={(event) => setGoals(event.target.checked
          ? [...goals, goal] : goals.filter((value) => value !== goal))} /> {goal}
      </label>)}
    </fieldset>
    <label htmlFor="learning-goal">What would you like to learn, in your own words?</label>
    <p id="learning-help">For example, “How can I secure my Kubernetes supply chain?” Please leave out personal or sensitive information.</p>
    <textarea id="learning-goal" aria-describedby="learning-help" rows={4} maxLength={1000}
      value={freeText} onChange={(event) => setFreeText(event.target.value)} />
    <button type="submit" disabled={pending}>{pending ? "Building your schedule…" : "Find talks"}</button>
    {error && <p role="alert">{error}</p>}
  </form>;
}

import { Link, useLocation } from "react-router-dom";
import { withConference } from "../conferenceLink.js";
import "./site-shell.css";

/** One slim line: product name, privacy, the organizer area and service status. */
export function SiteFooter() {
  const { search } = useLocation();
  return (
    <footer className="site-footer">
      <div className="site-footer__bar">
        <span className="site-footer__name">Conference Companion</span>
        <a className="site-footer__link" href="/site/#privacy">Privacy</a>
        <Link className="site-footer__link" to={withConference("/organizer", search)}>Organizers</Link>
        <Link className="site-footer__link" to={withConference("/status", search)}>Status</Link>
      </div>
    </footer>
  );
}

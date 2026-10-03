import { Link } from 'react-router-dom';
import { WebsiteFrame } from '../components/SiteLayout';

export function NotFound() {
  return (
    <WebsiteFrame>
      <section className="website-section">
        <div className="page-heading">
          <div>
            <span className="page-eyebrow">404</span>
            <h1>Page not found.</h1>
            <p>
              This address does not match an AliveRadar page. Explore the website or return home.
            </p>
          </div>
        </div>
        <div className="hero-actions">
          <Link className="button primary" to="/">
            Back to home
          </Link>
          <Link className="button secondary" to="/overview">
            Explore website monitoring
          </Link>
        </div>
      </section>
    </WebsiteFrame>
  );
}

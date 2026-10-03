import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Activity, ArrowRight, BellRing, Globe2, Radio, Timer, TriangleAlert } from 'lucide-react';
import { addWebsiteTarget, authPath } from '../authNavigation';

const features = [
  {
    id: 'page-health',
    Icon: Globe2,
    title: 'Every URL gets its own check.',
    text: 'Monitor Home, Login, Checkout and other important pages together. Each URL has its own status and check history.',
  },
  {
    id: 'website-health',
    Icon: Activity,
    title: 'One clear website status.',
    text: 'UP means all active pages are healthy. DEGRADED means some are down. DOWN means all are down. Pages awaiting checks stay unknown.',
  },
  {
    id: 'failed-pages',
    Icon: TriangleAlert,
    title: 'Find the page that needs you.',
    text: 'When a page fails, see its name and URL in your dashboard. You can pause or manage each page independently.',
  },
  {
    id: 'page-history',
    Icon: Timer,
    title: 'A history you can follow.',
    text: 'See observed uptime, response times and incidents. Monitoring continues in the background while you are away.',
  },
  {
    id: 'email-alerts',
    Icon: BellRing,
    title: 'Know when something changes.',
    text: 'Enable email alerts for confirmed page outages and recoveries. Every alert names the website and affected page.',
  },
  {
    id: 'public-status',
    Icon: Radio,
    title: 'Keep your visitors informed.',
    text: 'Publish a status page for the services you choose. Anyone with the link can see availability and incident history.',
  },
];

export function PublicOverview() {
  const location = useLocation();
  useEffect(() => {
    if (location.hash)
      requestAnimationFrame(() =>
        document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }),
      );
  }, [location.hash]);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="page-eyebrow">GET TO KNOW ALIVERADAR</div>
          <h1>
            Overview<span className="heading-dot">.</span>
          </h1>
          <p>Website monitoring, page by page. Explore what AliveRadar can do for you.</p>
        </div>
        <Link className="button primary" to={authPath('/login', addWebsiteTarget)}>
          Add website <ArrowRight size={17} />
        </Link>
      </div>
      <section className="website-section">
        <div className="website-section-heading">
          <div>
            <span className="section-eyebrow">EVERY PAGE, ON YOUR RADAR</span>
            <h2>A clearer view of your website.</h2>
            <p>
              Browse freely. Sign in when you are ready to add your website and start monitoring.
            </p>
          </div>
        </div>
        <div className="website-steps">
          {features.map(({ id, Icon, title, text }, index) => (
            <article key={id} id={id}>
              <div className="step-top">
                <span className="step-icon">
                  <Icon size={26} />
                </span>
                <span className="step-number">0{index + 1}</span>
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="website-closing">
        <div>
          <span className="section-eyebrow">READY WHEN YOU ARE</span>
          <h2>
            Your website.
            <br />
            On our radar.
          </h2>
        </div>
        <Link className="button primary" to={authPath('/login', addWebsiteTarget)}>
          Start monitoring <ArrowRight size={18} />
        </Link>
      </section>
    </>
  );
}

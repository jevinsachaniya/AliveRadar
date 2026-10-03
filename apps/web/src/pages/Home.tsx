import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Radar,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BellRing,
  Check,
  ChevronDown,
  CircleDot,
  Globe2,
  Plus,
  Radio,
  ShieldCheck,
  Timer,
  Zap,
} from 'lucide-react';
import { api } from '../api';
import { addWebsiteTarget, authPath } from '../authNavigation';
import type { Monitor, Overview, Paginated, User } from '../types';
import { AddMonitorDialog } from '../components/AddMonitorDialog';
import { AddWebsiteDialog } from '../components/AddWebsiteDialog';
import { WebsiteOverview } from '../components/WebsiteCards';
import {
  ErrorState,
  LogoMark,
  LoadingSkeleton,
  StatusBadge,
  UptimeBar,
  milliseconds,
  percent,
  relative,
} from '../components/ui';

const questions = [
  [
    'What can I monitor?',
    'Add a website to AliveRadar, group its URLs and give each page a name. Pages are checked independently. See UP, DEGRADED or DOWN for the website, with the exact page names when an outage occurs.',
  ],
  [
    'Does my browser need to stay open?',
    'No. Monitoring continues in the background even when you close this website. Return whenever you want to see the latest observations.',
  ],
  [
    'How is uptime calculated?',
    'Uptime is the percentage of successful observed checks in the selected period. Times without checks remain unknown, rather than being counted as successful.',
  ],
  [
    'Can I share a status page?',
    'Yes. Choose which monitors appear on a status page and publish it. Visitors see service names, availability and incident history; your monitor URLs and account details stay private.',
  ],
  [
    'How do email alerts work?',
    'Enable email alerts for your website and outage and recovery notifications in your account. AliveRadar emails your account address when a page has a confirmed outage and when it recovers, including the page name and URL.',
  ],
];

export function Home({ user }: { user?: User }) {
  const [add, setAdd] = useState(false);
  const [addWebsite, setAddWebsite] = useState(false);
  const location = useLocation();
  const overview = useQuery({
    queryKey: ['overview', 1],
    queryFn: () => api<Overview>('/overview'),
    enabled: !!user,
    refetchInterval: 15000,
  });
  const monitors = useQuery({
    queryKey: ['monitors', 'home'],
    queryFn: () => api<Paginated<Monitor>>('/monitors?limit=3&sort=name&order=asc'),
    enabled: !!user,
    refetchInterval: 15000,
  });
  useEffect(() => {
    if (location.hash)
      requestAnimationFrame(() =>
        document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }),
      );
  }, [location.hash]);
  const data = user ? overview.data : undefined;
  const featured = user ? monitors.data?.items[0] : undefined;
  const down = !!data?.down;
  return (
    <>
      <section className="website-hero">
        <div className="hero-copy">
          <div className="hero-eyebrow">
            <span className="live-dot" /> EVERY PAGE, ON YOUR RADAR.
          </div>
          <h1>
            Your website.
            <br />
            On our{' '}
            <span className="hero-highlight">
              radar.
              <svg viewBox="0 0 330 18" aria-hidden="true">
                <path d="M4 12C84 2 189 2 324 10" />
              </svg>
            </span>
          </h1>
          <p>
            AliveRadar keeps watch over your website, page by page. See what’s online, find the
            exact page that needs attention, and get an email when it goes down or comes back.
          </p>
          <div className="hero-actions">
            {user ? (
              <button className="button primary hero-primary" onClick={() => setAddWebsite(true)}>
                <Plus size={18} /> Add your website <ArrowUpRight size={18} />
              </button>
            ) : (
              <Link
                className="button primary hero-primary"
                to={authPath('/login', addWebsiteTarget)}
              >
                Start monitoring <ArrowUpRight size={18} />
              </Link>
            )}
            <a className="hero-secondary" href="#how-it-works">
              See how it works <ArrowDown size={15} />
            </a>
          </div>
          <div className="hero-reassurance">
            <span>
              <Check size={14} /> Checks while you’re away
            </span>
            <span>
              <Check size={14} /> Every page tracked independently
            </span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="visual-orbit orbit-one" />
          <div className="visual-orbit orbit-two" />
          <span className="visual-satellite satellite-globe">
            <Globe2 size={25} />
          </span>
          <span className="visual-satellite satellite-bell">
            <BellRing size={23} />
          </span>
          <div className="website-status-card">
            <div className="status-card-top">
              <span>
                <LogoMark className="status-card-logo" /> ALIVERADAR
              </span>
              <span className="status-card-window">
                <i />
                <i />
                <i />
              </span>
            </div>
            <div className="status-card-body">
              <div className={`status-card-symbol ${down ? 'needs-attention' : ''}`}>
                <LogoMark className="status-symbol-logo" />
              </div>
              <span className="status-card-kicker">
                {user ? 'YOUR LATEST OBSERVATIONS' : 'A CLEARER VIEW STARTS HERE'}
              </span>
              <h2>
                {!user || !data?.total ? (
                  <>
                    Every page.
                    <br />
                    On your radar.
                  </>
                ) : down ? (
                  'Let’s take a closer look.'
                ) : data.pending ? (
                  'Getting a first look.'
                ) : data.up ? (
                  <>
                    Looking good.
                    <br />
                    We’re keeping watch.
                  </>
                ) : (
                  'Paused, until you’re ready.'
                )}
              </h2>
              <p>
                {user && data
                  ? `${data.up} online · ${data.down} need attention · ${data.paused} paused`
                  : 'Page health, website status and alerts, together.'}
              </p>
              <div className="hero-history">
                {featured ? (
                  <UptimeBar daily={featured.analytics?.daily} paused={!featured.isActive} />
                ) : (
                  <div className="preview-history" aria-label="Illustrative history preview">
                    {Array.from({ length: 30 }, (_, index) => (
                      <i key={index} />
                    ))}
                  </div>
                )}
                <div>
                  <span>
                    {featured
                      ? 'Observed history · 30 days'
                      : 'An illustration of your future history'}
                  </span>
                  <span>{featured ? percent(featured.analytics?.uptime) : 'Preview'}</span>
                </div>
              </div>
              <div className="status-card-bottom">
                <span>
                  <span
                    className={`live-dot ${user && !data?.workerHealthy ? 'inactive-dot' : ''}`}
                  />
                  {user
                    ? data
                      ? data.workerHealthy
                        ? 'Monitoring is running'
                        : 'Monitoring is offline'
                      : 'Connecting to monitoring'
                    : 'Ready for your first website'}
                </span>
                <ArrowUpRight size={16} />
              </div>
            </div>
          </div>
          <div className="visual-caption">
            <span>
              <ShieldCheck size={17} />
            </span>
            <div>
              <strong>{featured ? featured.name : 'One less thing on your mind'}</strong>
              <p>
                {featured
                  ? `Last checked ${relative(featured.lastCheckedAt)}`
                  : 'AliveRadar keeps watch while you keep building.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="website-capabilities">
        <span>GOOD TO KNOW, AT A GLANCE</span>
        <div>
          <Globe2 size={18} /> Multiple page monitoring
        </div>
        <div>
          <Timer size={18} /> Response times
        </div>
        <div>
          <BellRing size={18} /> Outage alerts
        </div>
        <div>
          <Radio size={18} /> Public status
        </div>
      </div>

      {user && data?.websites && <WebsiteOverview websites={data.websites} />}
      <section id="live-status" className="website-section live-section">
        <div className="website-section-heading">
          <div>
            <span className="section-eyebrow">THE HERE AND NOW</span>
            <h2>{user ? 'Your corner of the internet.' : 'A home for your website’s health.'}</h2>
            <p>
              {user
                ? 'Real observations. A little more certainty.'
                : 'Sign in to AliveRadar to follow each page, your website’s overall status and every incident.'}
            </p>
          </div>
          {user && (
            <Link className="text-link" to="/monitors">
              All monitors <ArrowUpRight size={16} />
            </Link>
          )}
        </div>
        {!user ? (
          <div className="website-start-panel">
            <span className="start-icon">
              <Globe2 size={36} />
            </span>
            <div>
              <h3>Meet your first monitor</h3>
              <p>
                Add your website to AliveRadar and choose the pages you want to watch. Your history
                starts with the first real check.
              </p>
            </div>
            <Link className="button primary" to={authPath('/login', addWebsiteTarget)}>
              Add your website <ArrowRight size={17} />
            </Link>
          </div>
        ) : overview.isPending || monitors.isPending ? (
          <LoadingSkeleton />
        ) : overview.error || monitors.error ? (
          <ErrorState
            error={(overview.error ?? monitors.error)!}
            onRetry={() => {
              void overview.refetch();
              void monitors.refetch();
            }}
          />
        ) : !data?.total ? (
          <div className="website-start-panel">
            <span className="start-icon">
              <Globe2 size={36} />
            </span>
            <div>
              <h3>Meet your first monitor</h3>
              <p>Add a website. We’ll start keeping a record of how it’s doing.</p>
            </div>
            <button className="button primary" onClick={() => setAdd(true)}>
              Add monitor <Plus size={17} />
            </button>
          </div>
        ) : (
          <>
            <div className="website-live-grid">
              {monitors.data?.items.map((monitor) => (
                <Link to={`/monitors/${monitor.id}`} className="website-live-card" key={monitor.id}>
                  <div className="live-card-top">
                    <span className="live-card-icon">
                      <Globe2 size={21} />
                    </span>
                    <StatusBadge status={monitor.currentStatus} />
                  </div>
                  <h3>{monitor.name}</h3>
                  <p>{new URL(monitor.url).hostname}</p>
                  <UptimeBar daily={monitor.analytics?.daily} paused={!monitor.isActive} />
                  <div className="live-card-stats">
                    <span>
                      <strong>{percent(monitor.analytics?.uptime)}</strong>observed uptime
                    </span>
                    <span>
                      <strong>{milliseconds(monitor.latestCheck?.responseTimeMs)}</strong>latest
                      response
                    </span>
                  </div>
                  <div className="live-card-footer">
                    <span>{relative(monitor.lastCheckedAt)}</span>
                    <ArrowUpRight size={18} />
                  </div>
                </Link>
              ))}
            </div>
            <div className="website-observation-note">
              <CircleDot size={13} />
              Live observations update every 15 seconds. History reflects recorded checks.
              {user.isDemo && <span className="demo-label">Demo workspace</span>}
            </div>
          </>
        )}
      </section>

      <section id="how-it-works" className="website-section how-section">
        <div className="website-section-heading">
          <div>
            <span className="section-eyebrow">LESS SETUP. MORE PEACE OF MIND.</span>
            <h2>Set it up. Get on with your day.</h2>
          </div>
          <p>
            Simple to start.
            <br />
            Easy to come back to.
          </p>
        </div>
        <div className="website-steps">
          {[
            {
              icon: Globe2,
              title: 'Add your website',
              text: 'Add your website and its URLs. Name each page, from your homepage to checkout, so you know exactly what needs attention.',
            },
            {
              icon: Radar,
              title: 'Let AliveRadar keep watch',
              text: 'Every page is checked independently in the background. Follow response times, recorded uptime and your website’s overall status.',
            },
            {
              icon: BellRing,
              title: 'Know when things change',
              text: 'Find the failed page by name. Enable outage and recovery emails, and publish a status page to keep your visitors informed.',
            },
          ].map(({ icon: Icon, title, text }, index) => (
            <article key={title}>
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

      <section className="website-feature">
        <div className="feature-copy">
          <span className="section-eyebrow">CLARITY GOES BOTH WAYS</span>
          <h2>
            Keep your visitors
            <br />
            in the picture.
          </h2>
          <p>
            Publish a status page with AliveRadar so visitors know where things stand. Share
            availability and incident history for the pages and services you choose.
          </p>
          <ul>
            <li>
              <Check size={16} /> Choose what goes public
            </li>
            <li>
              <Check size={16} /> Keep private URLs private
            </li>
            <li>
              <Check size={16} /> Let the history speak for itself
            </li>
          </ul>
          <Link
            className="button secondary"
            to={user ? '/status-pages' : '/overview#public-status'}
          >
            Explore status pages <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="feature-art" aria-label="Status page illustration">
          <div className="feature-art-heading">
            <span className="feature-art-mark">
              <Zap size={20} />
            </span>
            <span>Your website status</span>
            <span className="example-label">ILLUSTRATION</span>
          </div>
          <div className="feature-art-summary">
            <ShieldCheck size={24} />
            <strong>
              A clear picture.
              <br />
              For everyone.
            </strong>
          </div>
          {['Website', 'API', 'Help center'].map((label) => (
            <div className="feature-art-row" key={label}>
              <span>{label}</span>
              <div className="feature-art-bars">
                {Array.from({ length: 18 }, (_, index) => (
                  <i key={index} />
                ))}
              </div>
            </div>
          ))}
          <span className="feature-art-footnote">
            Your published page uses actual monitor observations.
          </span>
        </div>
      </section>

      <section id="questions" className="website-section faq-section">
        <div>
          <span className="section-eyebrow">A FEW THINGS YOU MIGHT ASK</span>
          <h2>
            Good questions.
            <br />
            Clear answers.
          </h2>
          <p>Getting to know AliveRadar.</p>
        </div>
        <div className="website-faq">
          {questions.map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <ChevronDown size={19} />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="website-closing">
        <div>
          <span className="section-eyebrow">YOUR NEXT SMALL STEP</span>
          <h2>
            Keep every page
            <br />
            on your radar.
          </h2>
        </div>
        {user ? (
          <button className="button primary" onClick={() => setAddWebsite(true)}>
            Add your website <ArrowUpRight size={19} />
          </button>
        ) : (
          <Link className="button primary" to={authPath('/login', addWebsiteTarget)}>
            Start monitoring <ArrowUpRight size={19} />
          </Link>
        )}
      </section>
      {user && <AddMonitorDialog open={add} onOpenChange={setAdd} />}
      {user && <AddWebsiteDialog open={addWebsite} onOpenChange={setAddWebsite} />}
    </>
  );
}

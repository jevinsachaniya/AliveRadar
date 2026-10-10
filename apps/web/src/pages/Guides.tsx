import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import './blog.css';

type Guide = {
  slug: string;
  category: string;
  readTime: string;
  title: string;
  excerpt: string;
  intro: string;
  sections: { heading: string; paragraphs: string[]; bullets?: string[] }[];
};

export const guides: Guide[] = [
  {
    slug: 'how-to-check-if-a-website-is-down',
    category: 'UPTIME BASICS',
    readTime: '6 MIN READ',
    title: 'How to Check If a Website Is Down',
    excerpt:
      'A practical way to confirm an outage, identify the affected page, and decide what to check next.',
    intro:
      'A page that fails to load can be a real outage, a browser problem, a login requirement, or a temporary network issue. The fastest response is to collect a few clear observations before changing anything.',
    sections: [
      {
        heading: 'Start with the exact URL that matters',
        paragraphs: [
          'Check the exact page that a visitor uses, not only the homepage. A homepage can be available while a sign-in route, checkout, dashboard, or contact form is failing. Copy the complete URL and note the time you first saw the problem.',
          'Open the page in a private browser window or another browser. This helps rule out a stale session, browser extension, or cached page. If the page requires a login, make sure the monitor is configured for a response it can actually receive.',
        ],
        bullets: [
          'Record the page URL and the visible error message.',
          'Note whether the problem affects one page or several important pages.',
          'Check whether visitors can still reach the homepage and other key routes.',
        ],
      },
      {
        heading: 'Read the response instead of guessing',
        paragraphs: [
          'An HTTP status code is useful evidence. A 500-range response means the request reached a server or intermediary, but that server could not complete the request as expected. A timeout means the check did not receive a completed response within its configured limit. DNS, TLS, and connection failures point to different parts of the delivery path.',
          'The code alone does not prove the root cause. Use it to choose the next place to look: application logs for 500 errors, proxy and upstream health for 502 or 504, provider status for 503, DNS records for resolution failures, and certificate details for TLS failures.',
        ],
      },
      {
        heading: 'Use repeated checks as outage evidence',
        paragraphs: [
          'One failed request can be temporary. Repeated observations make it easier to distinguish a short network blip from an incident worth investigating. AliveRadar records the HTTP status, error category, response time, and timestamp for each page so you can see whether the same pattern continues.',
          'When a failure is confirmed, compare the last successful check with the failed checks. This gives your team a useful time window for logs, deployments, database metrics, and provider events.',
        ],
      },
      {
        heading: 'A short outage-check checklist',
        paragraphs: [
          'Keep the response calm and specific. Confirm the affected route first, then work from the observed error toward the service that may be involved.',
        ],
        bullets: [
          'Confirm the exact failing URL and the latest recorded response.',
          'Review the monitor’s recent checks and incident timeline.',
          'Check recent deployments, provider status, and application or proxy logs.',
          'Publish a status update if visitors need to know about the interruption.',
          'Confirm recovery with a successful check before closing the incident.',
        ],
      },
    ],
  },
  {
    slug: 'what-is-website-uptime-monitoring',
    category: 'UPTIME BASICS',
    readTime: '5 MIN READ',
    title: 'What Is Website Uptime Monitoring?',
    excerpt:
      'Learn what uptime monitoring observes, why page-level checks matter, and how teams use the results.',
    intro:
      'Website uptime monitoring checks whether a URL responds as expected over time. It gives teams an observed record of availability instead of relying on a visitor to report a problem first.',
    sections: [
      {
        heading: 'What an uptime check observes',
        paragraphs: [
          'At a scheduled interval, a monitor requests a URL and records whether the response matched the expected result. For HTTP and HTTPS pages, useful observations include the returned status code, response time, timestamp, and any safe error category such as timeout, DNS, TLS, or connection failure.',
          'Uptime is then calculated from successful observed checks in a reporting window. It is not a claim that a page was continuously available between checks. Missing and paused periods should remain unknown rather than being counted as successful.',
        ],
      },
      {
        heading: 'Why monitor individual pages',
        paragraphs: [
          'Visitors do not experience a website as one URL. They use a homepage, login page, checkout, account area, contact form, and many other routes. A single homepage monitor can stay green while a revenue-critical or support-critical page is unavailable.',
          'Page-level monitoring lets you name each important route, track it independently, and see the specific page that needs attention. It also lets a website show an overall status such as UP, DEGRADED, or DOWN based on its active pages.',
        ],
      },
      {
        heading: 'What happens when a page fails',
        paragraphs: [
          'A sensible monitor waits for the configured number of consecutive failures before opening an incident. This reduces noise from one-off failures. Once an outage is confirmed, teams can receive an email alert and review the recorded checks to understand what the monitor actually observed.',
          'Recovery matters too. A successful response after an outage should be recorded so that the team knows when the page returned and can communicate that update to visitors.',
        ],
      },
      {
        heading: 'A practical monitoring setup',
        paragraphs: [
          'Start with the pages that would cause the most harm if they stopped working. Add more routes as your product grows, and choose realistic expected status codes and timeouts for each URL.',
        ],
        bullets: [
          'Homepage or landing page',
          'Sign-in and account access',
          'Checkout, booking, or payment path',
          'Contact, support, and lead-capture routes',
          'Public API or customer-facing service pages',
        ],
      },
    ],
  },
  {
    slug: 'how-to-monitor-website-response-time',
    category: 'PERFORMANCE',
    readTime: '6 MIN READ',
    title: 'How to Monitor Website Response Time',
    excerpt:
      'Use response-time observations to spot slow pages early and investigate changes with useful context.',
    intro:
      'A page can be available and still feel slow. Response-time monitoring records how long a monitored request takes, helping teams notice regressions before a slow page becomes an outage or a support problem.',
    sections: [
      {
        heading: 'Establish a normal range first',
        paragraphs: [
          'Response time naturally changes with traffic, cache state, location, and external dependencies. A single number is less useful than a pattern. Review recorded checks over a day or week to understand a normal range for each important URL.',
          'Monitor different pages separately because they do different work. A lightweight homepage, a database-backed dashboard, and a checkout route should not be judged by the same expectation.',
        ],
      },
      {
        heading: 'Watch for changes, not only absolute numbers',
        paragraphs: [
          'A sudden jump from a familiar range is often more actionable than a universal target. Compare the latest response time with recent minimum, average, and maximum values. Look for repeated spikes rather than reacting to one slow observation.',
          'When a spike appears, line it up with deployment times, traffic changes, database activity, cache misses, queue depth, or an upstream provider event. The monitor provides a timestamped clue; service telemetry provides the deeper explanation.',
        ],
      },
      {
        heading: 'Use timeouts carefully',
        paragraphs: [
          'A timeout is not just a slow response. It means the monitoring request did not finish before the configured limit. Set the limit high enough for the real behavior of the page, but low enough that a stuck service is reported quickly.',
          'Do not solve a performance regression by only raising the timeout. First identify why the page is slow, then adjust the monitor only if the original threshold was unrealistic for the expected user experience.',
        ],
      },
      {
        heading: 'Turn a slow-page signal into action',
        paragraphs: [
          'Use the response-time history to guide a focused investigation. Start with the route that is slow, then inspect the application and the dependencies that route uses.',
        ],
        bullets: [
          'Compare the slow period with recent deployments and configuration changes.',
          'Inspect server, database, cache, queue, and upstream dependency metrics.',
          'Check whether the problem affects one route or every monitored page.',
          'Confirm improvement with new observed checks after the fix.',
        ],
      },
    ],
  },
  {
    slug: 'how-to-get-alerts-when-your-website-goes-down',
    category: 'ALERTING',
    readTime: '5 MIN READ',
    title: 'How to Get Alerts When Your Website Goes Down',
    excerpt:
      'Set up useful downtime and recovery alerts without creating unnecessary notification noise.',
    intro:
      'An alert is useful when it reaches the right person with enough context to act. The goal is not to send an email for every unusual request; it is to notify your team when a meaningful page failure has been confirmed.',
    sections: [
      {
        heading: 'Choose the pages that deserve an alert',
        paragraphs: [
          'Start with routes that affect visitors, revenue, or support. A checkout failure may need an immediate response even when the homepage is healthy. A private admin route may need a different priority or no public status update at all.',
          'Give every monitor a clear name. An alert that says “Checkout page” or “Customer sign-in” is easier to act on than an alert that only contains a long URL.',
        ],
      },
      {
        heading: 'Confirm failures before notifying people',
        paragraphs: [
          'A consecutive-failure threshold helps prevent noisy alerts from temporary packet loss or a one-off remote error. Choose a threshold that balances speed and confidence for the importance of the page and its monitoring interval.',
          'The alert should include the affected page, URL, first observed failure time, current error evidence, and a link to the incident history. This gives the recipient a starting point without claiming a cause that has not been verified.',
        ],
      },
      {
        heading: 'Send a recovery alert too',
        paragraphs: [
          'Recovery messages close the loop. They tell the team that a successful check was observed after the outage and provide a useful time for post-incident review. A recovery alert does not prove every visitor is fixed, but it confirms the monitor can again receive the expected response.',
          'If you publish a status page, update it with clear language during an incident and after recovery. This gives visitors a reliable place to check instead of asking support for every update.',
        ],
      },
      {
        heading: 'Keep alerts actionable',
        paragraphs: [
          'Review your alert settings after a few incidents. Too many notifications make real issues easier to miss; too few monitored pages leave important failures invisible.',
        ],
        bullets: [
          'Enable alerts for active, visitor-facing monitors.',
          'Use a realistic consecutive-failure threshold.',
          'Keep outage and recovery alerts enabled for important pages.',
          'Review incident evidence before declaring a root cause.',
          'Use a public status page when customers need an update.',
        ],
      },
    ],
  },
];

export function GuideArticle() {
  const { slug } = useParams();
  const guide = guides.find((item) => item.slug === slug);
  if (!guide) return null;
  return (
    <article className="blog-page blog-article" aria-labelledby="article-title">
      <Link className="blog-back-link" to="/blog">
        <ArrowLeft size={17} /> Back to journal
      </Link>
      <header className="blog-article-header">
        <p className="blog-eyebrow">
          {guide.category} / {guide.readTime}
        </p>
        <h1 id="article-title">{guide.title}</h1>
        <p>{guide.intro}</p>
      </header>
      <section className="blog-article-content" aria-label={`${guide.title} guide`}>
        {guide.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.bullets && (
              <ul>
                {section.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </section>
      <footer className="blog-article-footer">
        <Link to="/overview">
          Explore AliveRadar monitoring <ArrowUpRight size={17} />
        </Link>
        <Link to="/blog">
          More practical guides <ArrowUpRight size={17} />
        </Link>
      </footer>
    </article>
  );
}

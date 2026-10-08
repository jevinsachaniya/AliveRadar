import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import './about-contact.css';
import { updateSeo } from '../seo';

const cards = [
  [
    'Page-level visibility',
    'See the exact URL that needs attention, instead of guessing from one overall website result.',
  ],
  [
    'Clear website health',
    'AliveRadar combines page results into a simple UP, DEGRADED or DOWN website status.',
  ],
  [
    'Useful notifications',
    'Receive focused outage and recovery emails when your monitored pages change state.',
  ],
];

export function About() {
  useEffect(() => updateSeo('/about'), []);

  return (
    <div className="about-page">
      <section className="website-hero about-hero">
        <p className="website-eyebrow">ABOUT ALIVERADAR</p>
        <h1>Every page deserves to stay on your radar.</h1>
        <p className="website-hero-copy">
          AliveRadar helps teams watch the URLs that matter most. It makes page availability clear,
          so you can spot a problem, understand its impact, and respond with confidence.
        </p>
        <div className="website-hero-actions">
          <Link className="website-primary-action" to="/register">
            Create an account
          </Link>
          <Link className="website-secondary-action" to="/overview">
            Explore features
          </Link>
        </div>
      </section>

      <section className="website-section" aria-labelledby="why-aliveradar">
        <div className="website-section-heading">
          <p className="website-eyebrow">OUR PURPOSE</p>
          <h2 id="why-aliveradar">Uptime information should be easy to act on.</h2>
          <p>
            A homepage can be online while a checkout, sign-in, campaign, or support page has
            failed. AliveRadar is built around the pages your visitors actually use.
          </p>
        </div>
        <div className="website-feature-grid">
          {cards.map(([title, description], index) => (
            <article className="website-feature-card" key={title}>
              <span className="website-step-number">0{index + 1}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="website-callout" aria-labelledby="about-contact">
        <div>
          <p className="website-eyebrow">LET&apos;S TALK</p>
          <h2 id="about-contact">Have a question about AliveRadar?</h2>
          <p>We would be glad to hear what you need to monitor.</p>
        </div>
        <Link className="website-primary-action" to="/contact">
          Contact us
        </Link>
      </section>
    </div>
  );
}

import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import './about-contact.css';
import { updateSeo } from '../seo';

const email = 'aliveradar@gmail.com';

export function Contact() {
  useEffect(() => updateSeo('/contact'), []);

  return (
    <div className="contact-page">
      <section className="website-hero contact-hero">
        <p className="website-eyebrow">CONTACT ALIVERADAR</p>
        <h1>Let&apos;s keep your important pages visible.</h1>
        <p className="website-hero-copy">
          Need help with AliveRadar, have feedback, or want to share an idea? Send us an email and
          we will get back to you.
        </p>
      </section>

      <section className="contact-card" aria-labelledby="email-us">
        <div className="contact-icon" aria-hidden="true">
          @
        </div>
        <div>
          <p className="website-eyebrow">EMAIL US</p>
          <h2 id="email-us">Start a conversation</h2>
          <p>For product questions, feedback, and support, write to the AliveRadar team.</p>
          <a className="contact-email" href={`mailto:${email}`}>
            {email}
          </a>
        </div>
      </section>

      <section className="website-callout" aria-labelledby="contact-monitoring">
        <div>
          <p className="website-eyebrow">READY TO MONITOR?</p>
          <h2 id="contact-monitoring">Add your first website in a few minutes.</h2>
          <p>Track multiple URLs independently and receive alerts when a page needs attention.</p>
        </div>
        <Link className="website-primary-action" to="/register">
          Create an account
        </Link>
      </section>
    </div>
  );
}

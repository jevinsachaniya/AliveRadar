import { ArrowRight, Radar } from 'lucide-react';
import { Link } from 'react-router-dom';

import './blog.css';
import { guides } from './Guides';

export function Blog() {
  return (
    <section className="blog-page" aria-labelledby="blog-title">
      <div className="blog-intro">
        <p className="blog-eyebrow">ALIVERADAR JOURNAL</p>
        <h1 id="blog-title">Useful notes for people who keep websites online.</h1>
        <p>
          Practical guides for checking website availability, tracking response time, handling
          downtime alerts and keeping visitors informed.
        </p>
      </div>

      <div className="blog-topics" aria-label="Topics we will cover">
        <span>UPTIME</span>
        <span>RESPONSE TIME</span>
        <span>STATUS PAGES</span>
        <span>INCIDENTS</span>
      </div>

      {guides.map((guide) => (
        <article
          className="blog-post-card"
          aria-labelledby={`${guide.slug}-title`}
          key={guide.slug}
        >
          <div>
            <p className="blog-eyebrow">
              {guide.category} / {guide.readTime}
            </p>
            <h2 id={`${guide.slug}-title`}>{guide.title}</h2>
            <p>{guide.excerpt}</p>
          </div>
          <Link className="blog-link" to={`/blog/${guide.slug}`}>
            Read guide <ArrowRight size={17} />
          </Link>
        </article>
      ))}

      <article className="blog-post-card" aria-labelledby="devsload-post-title">
        <div>
          <p className="blog-eyebrow">WEBSITE TOOLS / 5 MIN READ</p>
          <h2 id="devsload-post-title">
            DevsLoad.com: simple online tools for everyday digital work
          </h2>
          <p>
            A look at the growing tool collection from DevsLoad, why focused utilities are useful,
            and the small monitoring habit that helps dependable web tools stay available.
          </p>
        </div>
        <Link className="blog-link" to="/blog/devsload-com">
          Read article <ArrowRight size={17} />
        </Link>
      </article>

      <div className="blog-radar-mark" aria-hidden="true">
        <Radar size={32} />
        <span>EVERY PAGE, ON YOUR RADAR.</span>
      </div>
    </section>
  );
}

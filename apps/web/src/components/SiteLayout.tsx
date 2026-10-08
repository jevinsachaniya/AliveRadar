import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Bell, Menu, Moon, Search, Settings, Sun, X } from 'lucide-react';
import { Brand } from './ui';
import type { User } from '../types';
import { addWebsiteTarget, authPath } from '../authNavigation';

const navigation = [
  { to: '/', label: 'Home' },
  { to: '/overview', label: 'Overview' },
  { to: '/websites', label: 'Websites' },
  { to: '/monitors', label: 'Monitors' },
  { to: '/incidents', label: 'Incidents' },
  { to: '/status-pages', label: 'Status pages' },
];

export function SiteHeader({ user }: { user?: User }) {
  const [mobile, setMobile] = useState(false);
  const [dark, setDark] = useState(false);
  const [themeReady, setThemeReady] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const headerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const openSearch = () => {
    setMobile(false);
    navigate('/monitors?focus=search');
  };
  useEffect(() => {
    try {
      setDark(localStorage.getItem('pulse-theme') === 'dark');
    } catch {
      /* Use the default theme if storage is unavailable. */
    }
    setThemeReady(true);
  }, []);
  useEffect(() => {
    if (!themeReady) return;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try {
      localStorage.setItem('pulse-theme', dark ? 'dark' : 'light');
    } catch {
      /* The toggle also works without persistent storage. */
    }
  }, [dark, themeReady]);
  useEffect(() => setMobile(false), [location.pathname]);
  useEffect(() => {
    if (!mobile) return;
    const dismiss = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setMobile(false);
    };
    const wideScreen = window.matchMedia('(min-width: 961px)');
    const resize = () => {
      if (wideScreen.matches) setMobile(false);
    };
    document.addEventListener('pointerdown', dismiss);
    wideScreen.addEventListener('change', resize);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      wideScreen.removeEventListener('change', resize);
    };
  }, [mobile]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && mobile) {
        setMobile(false);
        menuRef.current?.focus();
      }
      if (user && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setMobile(false);
        navigate('/monitors?focus=search');
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [navigate, mobile, user]);
  return (
    <header className="site-header" ref={headerRef}>
      <div className="site-header-inner">
        <Link to="/" className="brand-link" aria-label="AliveRadar home">
          <Brand />
        </Link>
        <nav
          id="site-navigation"
          onClick={() => setMobile(false)}
          aria-label="Main navigation"
          className={`site-navigation ${mobile ? 'is-open' : ''}`}
        >
          {(user
            ? navigation
            : [
                { to: '/', label: 'Home' },
                { to: '/overview', label: 'Overview' },
                { to: '/about', label: 'About' },
                { to: '/contact', label: 'Contact' },
                { to: '/#how-it-works', label: 'How it works' },
                { to: '/#questions', label: 'Questions' },
              ]
          ).map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                isActive &&
                (!to.includes('#') || location.hash === `#${to.split('#')[1]}`) &&
                (to !== '/' || !location.hash)
                  ? 'is-active'
                  : ''
              }
            >
              {label}
            </NavLink>
          ))}
          {user && (
            <>
              <Link className="mobile-utility" to="/monitors?focus=search">
                <Search size={17} /> Search monitors
              </Link>
              <Link className="mobile-utility" to="/notifications">
                <Bell size={17} /> Notifications
              </Link>
              <Link className="mobile-utility" to="/settings">
                <Settings size={17} /> Settings
              </Link>
            </>
          )}
          {!user && (
            <Link className="mobile-utility" to="/login">
              Sign in
            </Link>
          )}
        </nav>
        <div className="site-header-actions">
          {user && (
            <button
              className="icon-button desktop-utility"
              aria-label="Search monitors"
              title="Search monitors (Ctrl/Cmd + K)"
              onClick={openSearch}
            >
              <Search size={18} />
            </button>
          )}
          <button
            className="icon-button theme-toggle"
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          {user ? (
            <>
              <Link
                to="/notifications"
                className="icon-button desktop-utility"
                aria-label="Notification settings"
              >
                <Bell size={18} />
              </Link>
              <Link to="/settings" className="site-account" aria-label="Your account">
                <span className="avatar">
                  {user.name
                    .split(' ')
                    .map((name) => name[0])
                    .slice(0, 2)
                    .join('')}
                </span>
                <span>My account</span>
                <Settings size={14} />
              </Link>
            </>
          ) : (
            <Link to="/login" className="site-signin">
              Sign in <ArrowUpRight size={15} />
            </Link>
          )}
          <button
            className="icon-button site-menu"
            aria-label={mobile ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobile}
            aria-controls="site-navigation"
            ref={menuRef}
            onClick={() => setMobile(!mobile)}
          >
            {mobile ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ user }: { user?: User }) {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <Link to="/" aria-label="AliveRadar home">
            <Brand />
          </Link>
          <p>
            Every page,
            <br />
            on your radar.
          </p>
          <span className="footer-label">STAY ONLINE. STAY INFORMED.</span>
        </div>
        <div className="site-footer-links">
          <span>Explore</span>
          <Link to="/">Home</Link>
          <Link to={user ? '/websites' : '/overview#page-health'}>Website monitoring</Link>
          <Link to={user ? '/incidents' : '/overview#page-history'}>Incident history</Link>
          <Link to={user ? '/status-pages' : '/overview#public-status'}>Status pages</Link>
          <Link to="/about">About AliveRadar</Link>
          <Link to="/contact">Contact us</Link>
        </div>
        <div className="site-footer-links">
          <span>Your account</span>
          <Link to={user ? '/settings' : '/register'}>
            {user ? 'Account settings' : 'Create an account'}
          </Link>
          <Link to={user ? '/notifications' : '/overview#email-alerts'}>Email notifications</Link>
          <Link to="/#how-it-works">How it works</Link>
          <Link to="/#questions">Common questions</Link>
        </div>
        <div className="site-footer-note">
          <span className="footer-label">ONE LESS THING TO WORRY ABOUT</span>
          <h3>
            Your website.
            <br />
            Always on our radar.
          </h3>
          <Link to={user ? addWebsiteTarget : authPath('/login', addWebsiteTarget)}>
            Start watching <ArrowRight size={17} />
          </Link>
        </div>
      </div>
      <div className="site-footer-bottom">
        <span>© {new Date().getFullYear()} AliveRadar</span>
        <span>Uptime reflects observed checks. Times shown in UTC.</span>
        <a href="/api/docs" target="_blank" rel="noreferrer">
          API documentation <ArrowUpRight size={13} />
        </a>
      </div>
    </footer>
  );
}

export function WebsiteFrame({ user, children }: { user?: User; children: ReactNode }) {
  return (
    <div className="website-layout">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <SiteHeader user={user} />
      <main id="main-content" className="main-content website-main">
        {children}
      </main>
      <SiteFooter user={user} />
    </div>
  );
}

export function SiteLayout({ user }: { user?: User }) {
  return (
    <WebsiteFrame user={user}>
      <Outlet />
    </WebsiteFrame>
  );
}

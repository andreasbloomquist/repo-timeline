import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import ReactMarkdown from 'react-markdown'
import './App.css'

// Use relative URLs - works in both dev (with proxy) and production
const API_URL = ''

// Analytics
declare global {
  interface Window { gtag?: (...args: unknown[]) => void }
}

function trackEvent(action: string, params?: Record<string, string | number | boolean>) {
  window.gtag?.('event', action, params)
}

// Types
interface TimelineEvent {
  id: string
  type: 'pr' | 'commit'
  summary: string
  description: string
  date: string
  author: {
    name: string
    avatar: string
  }
  additions: number
  deletions: number
  url: string
  prNumber?: number
  sha?: string
}

interface User {
  login: string
  avatar: string
  name?: string
}

interface Repo {
  id: number
  name: string
  fullName: string
  defaultBranch: string
  private: boolean
}

// Icons
const GitHubIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
  </svg>
)

const ChevronIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
)

const ExternalIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
  </svg>
)

const ArrowUpIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 19V5M5 12l7-7 7 7"/>
  </svg>
)

const ArrowDownIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12l7 7 7-7"/>
  </svg>
)

// Format date
const formatDate = (dateStr: string): string => {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHr / 24)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)
  const diffYears = Math.floor(diffDays / 365)

  if (diffSec < 60) return 'just now'
  if (diffMin === 1) return '1 minute ago'
  if (diffMin < 60) return `${diffMin} minutes ago`
  if (diffHr === 1) return '1 hour ago'
  if (diffHr < 24) return `${diffHr} hours ago`
  if (diffDays === 1) return '1 day ago'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffWeeks === 1) return '1 week ago'
  if (diffDays < 30) return `${diffWeeks} weeks ago`
  if (diffMonths === 1) return '1 month ago'
  if (diffMonths < 12) return `${diffMonths} months ago`
  if (diffYears === 1) return '1 year ago'
  return `${diffYears} years ago`
}

// API functions
async function fetchUser(): Promise<User | null> {
  try {
    const res = await fetch(`${API_URL}/api/user`, { credentials: 'include' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function fetchRepos(): Promise<Repo[]> {
  try {
    const res = await fetch(`${API_URL}/api/repos`, { credentials: 'include' })
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

async function fetchBranches(owner: string, repo: string): Promise<string[]> {
  try {
    const res = await fetch(`${API_URL}/api/repos/${owner}/${repo}/branches`, { credentials: 'include' })
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

async function fetchTimeline(owner: string, repo: string, branch: string): Promise<TimelineEvent[]> {
  try {
    const res = await fetch(`${API_URL}/api/repos/${owner}/${repo}/timeline?branch=${encodeURIComponent(branch)}`, { credentials: 'include' })
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

async function logout(): Promise<void> {
  await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' })
}

async function fetchAISummary(event: TimelineEvent): Promise<string> {
  try {
    const res = await fetch(`${API_URL}/api/summarize`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: event.type,
        title: event.summary,
        description: event.description,
        additions: event.additions,
        deletions: event.deletions
      })
    })
    if (!res.ok) return event.description
    const data = await res.json()
    return data.summary || event.description
  } catch {
    return event.description
  }
}

// Components
function UserMenu({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="user-menu" ref={menuRef}>
      <button className="user-menu-trigger" onClick={() => setOpen(!open)}>
        <img src={user.avatar} alt={user.login} className="user-avatar" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="user-menu-dropdown"
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="user-menu-header">
              <span className="user-menu-name">{user.name || user.login}</span>
              <span className="user-menu-login">{user.login}</span>
            </div>
            <div className="user-menu-divider" />
            <a
              href={`${API_URL}/api/auth/permissions`}
              className="user-menu-item"
              onClick={() => { trackEvent('click_manage_permissions'); setOpen(false) }}
            >
              Manage permissions
            </a>
            <button
              className="user-menu-item"
              onClick={() => { trackEvent('click_sign_out'); onLogout(); setOpen(false) }}
            >
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Header({
  user,
  repos,
  selectedRepo,
  selectedBranch,
  branches,
  aiEnabled,
  onRepoChange,
  onBranchChange,
  onToggleAI,
  onLogout
}: {
  user: User | null
  repos: Repo[]
  selectedRepo: Repo | null
  selectedBranch: string
  branches: string[]
  aiEnabled: boolean
  onRepoChange: (repo: Repo) => void
  onBranchChange: (branch: string) => void
  onToggleAI: () => void
  onLogout: () => void
}) {
  const handleLogin = () => {
    trackEvent('click_login')
    window.location.href = `${API_URL}/api/auth/github`
  }

  return (
    <header className="header">
      <div className="header-left">
        <span className="logo">Timeline</span>
        {user && (
          <div className="ai-toggle" onClick={() => { trackEvent('toggle_ai_summary', { enabled: !aiEnabled }); onToggleAI() }}>
            <div className={`toggle-track ${aiEnabled ? 'on' : 'off'}`}>
              <div className="toggle-thumb" />
            </div>
            <span className="toggle-label">AI Summary</span>
          </div>
        )}
        {user && selectedRepo && (
          <div className="selectors">
            <div className="selector">
              <select
                value={selectedRepo.id}
                onChange={(e) => {
                  const repo = repos.find(r => r.id === Number(e.target.value))
                  if (repo) {
                    trackEvent('select_repo', { repo_name: repo.fullName })
                    onRepoChange(repo)
                  }
                }}
              >
                {repos.map(repo => (
                  <option key={repo.id} value={repo.id}>
                    {repo.private ? '🔒 ' : ''}{repo.name}
                  </option>
                ))}
              </select>
              <ChevronIcon />
            </div>
            <div className="selector">
              <select
                value={selectedBranch}
                onChange={(e) => { trackEvent('select_branch', { branch: e.target.value }); onBranchChange(e.target.value) }}
              >
                {branches.map(branch => (
                  <option key={branch} value={branch}>{branch}</option>
                ))}
              </select>
              <ChevronIcon />
            </div>
          </div>
        )}
      </div>
      <div className="header-right">
        {user ? (
          <UserMenu user={user} onLogout={onLogout} />
        ) : (
          <button className="auth-button" onClick={handleLogin}>
            <GitHubIcon />
            Sign in
          </button>
        )}
      </div>
    </header>
  )
}

function TimelineEventCard({
  event,
  index,
  isExpanded,
  aiEnabled,
  onToggle
}: {
  event: TimelineEvent
  index: number
  isExpanded: boolean
  aiEnabled: boolean
  onToggle: () => void
}) {
  const side = index % 2 === 0 ? 'left' : 'right'
  const cardRef = useRef<HTMLDivElement>(null)
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [showFullMessage, setShowFullMessage] = useState(false)
  const isTruncated = event.description.length > 500

  useEffect(() => {
    if (isExpanded && aiEnabled && !aiSummary && !loadingSummary) {
      setLoadingSummary(true)
      fetchAISummary(event).then(summary => {
        setAiSummary(summary)
        setLoadingSummary(false)
      })
    }
  }, [isExpanded, aiEnabled, event, aiSummary, loadingSummary])

  return (
    <motion.div
      ref={cardRef}
      className={`event ${side} ${isExpanded ? 'expanded' : ''}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      onClick={() => {
        trackEvent(isExpanded ? 'collapse_event' : 'expand_event', {
          event_type: event.type,
          event_id: event.id,
          event_summary: event.summary
        })
        onToggle()
      }}
    >
      <div className="event-dot" />
      <div className="event-content">
        <div className="event-summary">{event.summary}</div>
        <div className="event-date">{formatDate(event.date)}</div>
        <div className="event-meta">
          <span className="event-type">
            {event.type === 'pr' ? `PR #${event.prNumber}` : `${event.sha}`}
          </span>
          <span className="event-lines">
            <span className="stat-add">+{event.additions.toLocaleString()}</span>
            <span className="stat-del">-{event.deletions.toLocaleString()}</span>
          </span>
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              className="event-details"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              onAnimationComplete={() => {
                if (isExpanded && cardRef.current) {
                  const rect = cardRef.current.getBoundingClientRect()
                  const viewportHeight = window.innerHeight
                  if (rect.top < 0 || rect.bottom > viewportHeight) {
                    cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }
                }
              }}
            >
              <div className="event-details-inner">
                <div className="ai-summary-section">
                  <span className="ai-summary-label">AI Summary</span>
                  {!aiEnabled ? (
                    <p className="ai-summary-text disabled">AI summary is disabled. Enable the toggle above to generate summaries.</p>
                  ) : loadingSummary ? (
                    <p className="ai-summary-text loading">Generating summary...</p>
                  ) : (
                    <p className="ai-summary-text">{aiSummary}</p>
                  )}
                </div>

                <div className="commit-message-section">
                  <span className="commit-message-label">
                    {event.type === 'pr' ? 'PR Description' : 'Commit Message'}
                  </span>
                  <div className="commit-message-text">
                    <ReactMarkdown>
                      {isTruncated && !showFullMessage
                        ? event.description.substring(0, 500) + '...'
                        : event.description}
                    </ReactMarkdown>
                    {isTruncated && (
                      <button
                        className="expand-message-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          trackEvent(showFullMessage ? 'collapse_message' : 'expand_message', { event_id: event.id })
                          setShowFullMessage(!showFullMessage)
                        }}
                      >
                        {showFullMessage ? 'Show less' : 'Show full message'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="event-stats">
                  <span className="stat stat-add">+{event.additions.toLocaleString()}</span>
                  <span className="stat stat-del">-{event.deletions.toLocaleString()}</span>
                </div>

                <div className="event-author">
                  <img src={event.author.avatar} alt={event.author.name} className="author-avatar" />
                  <span className="author-name">{event.author.name}</span>
                  <a
                    href={event.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="event-link"
                    onClick={(e) => { e.stopPropagation(); trackEvent('click_view_on_github', { event_type: event.type, event_id: event.id }) }}
                  >
                    View on GitHub
                    <ExternalIcon />
                  </a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

function computeTimeGaps(events: TimelineEvent[]) {
  if (events.length < 2) return events.map(() => 60)

  const timestamps = events.map(e => new Date(e.date).getTime())
  const gaps: number[] = []
  for (let i = 0; i < timestamps.length - 1; i++) {
    gaps.push(Math.abs(timestamps[i] - timestamps[i + 1]))
  }
  // Last event has no gap after it
  gaps.push(0)

  const maxGap = Math.max(...gaps.filter((_, i) => i < gaps.length - 1))
  if (maxGap === 0) return events.map(() => 60)

  const MIN_MARGIN = 40
  const MAX_MARGIN = 240

  return gaps.map((gap, i) => {
    if (i === gaps.length - 1) return 0
    const ratio = gap / maxGap
    return MIN_MARGIN + ratio * (MAX_MARGIN - MIN_MARGIN)
  })
}

function Timeline({ events, loading, aiEnabled }: { events: TimelineEvent[]; loading: boolean; aiEnabled: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const margins = computeTimeGaps(events)

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner" />
        <span className="loading-text">Loading timeline</span>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-title">No major changes</p>
        <p className="empty-subtitle">No commits or PRs with 100+ line changes found</p>
      </div>
    )
  }

  return (
    <div className="timeline-container">
      <div className="timeline-spine" />
      <div className="timeline">
        {events.map((event, index) => (
          <div key={event.id} style={{ marginBottom: margins[index] }}>
            <TimelineEventCard
              event={event}
              index={index}
              isExpanded={expandedId === event.id}
              aiEnabled={aiEnabled}
              onToggle={() => setExpandedId(expandedId === event.id ? null : event.id)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function NavArrows({ show }: { show: boolean }) {
  if (!show) return null

  const scrollUp = () => {
    trackEvent('click_nav_arrow', { direction: 'up' })
    window.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' })
  }

  const scrollDown = () => {
    trackEvent('click_nav_arrow', { direction: 'down' })
    window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' })
  }

  return (
    <div className="nav-arrows">
      <button className="nav-arrow" onClick={scrollUp} aria-label="Scroll up">
        <ArrowUpIcon />
      </button>
      <button className="nav-arrow" onClick={scrollDown} aria-label="Scroll down">
        <ArrowDownIcon />
      </button>
    </div>
  )
}

function LoginScreen() {
  const handleLogin = () => {
    trackEvent('click_login')
    window.location.href = `${API_URL}/api/auth/github`
  }

  const demoEvents = [
    { label: 'Refactor auth flow', type: 'pr', lines: '+342 -89', delay: 0 },
    { label: 'Add dark mode support', type: 'pr', lines: '+1,204 -67', delay: 0.12 },
    { label: 'Fix memory leak in worker', type: 'commit', lines: '+18 -45', delay: 0.24 },
    { label: 'Migrate to Edge Runtime', type: 'pr', lines: '+890 -1,102', delay: 0.36 },
    { label: 'Update API rate limiting', type: 'commit', lines: '+156 -23', delay: 0.48 },
  ]

  return (
    <div className="login-screen">
      <div className="login-hero">
        <motion.div
          className="login-hero-text"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="login-label">Repo Timeline</span>
          <h1 className="login-headline">
            Your commit history,<br />
            <em>in plain English.</em>
          </h1>
          <p className="login-subhead">
            See merged PRs and major commits on a visual timeline with AI&#8209;powered summaries. Built for the era of vibe coding.
          </p>
          <motion.button
            className="login-button"
            onClick={handleLogin}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <GitHubIcon />
            Sign in with GitHub
          </motion.button>
          <p className="login-note">Free &middot; Open source &middot; No data stored</p>
        </motion.div>

        <motion.div
          className="login-demo"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="login-demo-window">
            <div className="login-demo-bar">
              <span className="login-demo-dot" />
              <span className="login-demo-dot" />
              <span className="login-demo-dot" />
            </div>
            <div className="login-demo-content">
              <div className="login-demo-spine" />
              {demoEvents.map((evt, i) => (
                <motion.div
                  key={i}
                  className={`login-demo-event ${i % 2 === 0 ? 'left' : 'right'}`}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.6 + evt.delay, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="login-demo-node" />
                  <div className="login-demo-card">
                    <span className="login-demo-card-type">{evt.type}</span>
                    <span className="login-demo-card-label">{evt.label}</span>
                    <span className="login-demo-card-lines">{evt.lines}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      <section className="login-features" aria-label="Features">
        <motion.div
          className="login-features-grid"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="login-feature">
            <div className="login-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2v20M2 12h20"/><circle cx="12" cy="6" r="2"/><circle cx="12" cy="18" r="2"/></svg>
            </div>
            <h3>Visual Timeline</h3>
            <p>Merged PRs and large commits displayed chronologically on a vertical timeline.</p>
          </div>
          <div className="login-feature">
            <div className="login-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <h3>AI Summaries</h3>
            <p>Each change explained in plain English by Claude, so you understand the &ldquo;why&rdquo; not just the diff.</p>
          </div>
          <div className="login-feature">
            <div className="login-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
            </div>
            <h3>Any Repo, Any Branch</h3>
            <p>Works with public and private repositories. Switch between branches to explore different histories.</p>
          </div>
        </motion.div>
      </section>

      <section className="login-about" aria-label="About Repo Timeline">
        <details>
          <summary>What is Repo Timeline?</summary>
          <p>Repo Timeline is a free developer tool that turns your GitHub commit history into a visual timeline. It shows merged pull requests and commits with over 100 line changes, displayed on a vertical timeline with AI-generated summaries that explain each change in plain English. Built for the era of vibe coding, where AI-assisted development produces rapid, large-scale code changes that are difficult to track through traditional commit logs.</p>
        </details>

        <details>
          <summary>How does it work?</summary>
          <p>Sign in with your GitHub account, select a repository and branch, and Repo Timeline fetches your merged PRs and major commits from the GitHub API. Each change is displayed as a dot on a vertical timeline. Click any dot to expand it and see an AI-powered summary generated by Anthropic Claude that describes what changed and why in plain, non-technical language. You can toggle AI summaries on or off at any time.</p>
        </details>

        <details>
          <summary>Who is it for?</summary>
          <p>Repo Timeline is built for developers, engineering managers, and anyone who needs to understand the history of a codebase without reading diffs. It is especially useful for teams using AI coding assistants like Cursor, GitHub Copilot, or Claude Code, where codebases evolve quickly with large file changes that are hard to follow through conventional git logs.</p>
        </details>

        <details>
          <summary>Key features</summary>
          <ul>
            <li>Visual vertical timeline of merged PRs and major commits</li>
            <li>AI-powered summaries that explain code changes in plain English</li>
            <li>Support for any GitHub repository, public or private</li>
            <li>Branch selection to view changes on any branch</li>
            <li>Line change indicators showing additions and deletions</li>
            <li>Direct links to PRs and commits on GitHub</li>
            <li>Free and open source</li>
          </ul>
        </details>
      </section>
    </div>
  )
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [repos, setRepos] = useState<Repo[]>([])
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null)
  const [branches, setBranches] = useState<string[]>([])
  const [selectedBranch, setSelectedBranch] = useState<string>('')
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingTimeline, setLoadingTimeline] = useState(false)
  const [aiEnabled, setAiEnabled] = useState(true)

  // Check auth status on mount and after OAuth callback
  useEffect(() => {
    const init = async () => {
      setLoading(true)
      const userData = await fetchUser()
      if (userData) {
        setUser(userData)
        const repoData = await fetchRepos()
        setRepos(repoData)
        if (repoData.length > 0) {
          setSelectedRepo(repoData[0])
        }
      }
      setLoading(false)

      // Clear URL params after OAuth
      if (window.location.search.includes('auth=success')) {
        window.history.replaceState({}, '', window.location.pathname)
      }
    }
    init()
  }, [])

  // Fetch branches when repo changes
  useEffect(() => {
    if (!selectedRepo) {
      setBranches([])
      setSelectedBranch('')
      return
    }

    const loadBranches = async () => {
      const [owner, repo] = selectedRepo.fullName.split('/')
      const branchData = await fetchBranches(owner, repo)
      setBranches(branchData)
      if (branchData.includes(selectedRepo.defaultBranch)) {
        setSelectedBranch(selectedRepo.defaultBranch)
      } else if (branchData.length > 0) {
        setSelectedBranch(branchData[0])
      }
    }
    loadBranches()
  }, [selectedRepo])

  // Fetch timeline when branch changes
  useEffect(() => {
    if (!selectedRepo || !selectedBranch) {
      setEvents([])
      return
    }

    const loadTimeline = async () => {
      setLoadingTimeline(true)
      const [owner, repo] = selectedRepo.fullName.split('/')
      const timelineData = await fetchTimeline(owner, repo, selectedBranch)
      setEvents(timelineData)
      setLoadingTimeline(false)
    }
    loadTimeline()
  }, [selectedRepo, selectedBranch])

  const handleLogout = async () => {
    await logout()
    setUser(null)
    setRepos([])
    setSelectedRepo(null)
    setBranches([])
    setSelectedBranch('')
    setEvents([])
  }

  const handleRepoChange = (repo: Repo) => {
    setSelectedRepo(repo)
  }

  if (loading) {
    return (
      <div className="app">
        <Header
          user={null}
          repos={[]}
          selectedRepo={null}
          selectedBranch=""
          branches={[]}
          aiEnabled={aiEnabled}
          onRepoChange={() => {}}
          onBranchChange={() => {}}
          onToggleAI={() => {}}
          onLogout={() => {}}
        />
        <main className="main">
          <div className="loading">
            <div className="loading-spinner" />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      {user && (
        <Header
          user={user}
          repos={repos}
          selectedRepo={selectedRepo}
          selectedBranch={selectedBranch}
          branches={branches}
          aiEnabled={aiEnabled}
          onRepoChange={handleRepoChange}
          onBranchChange={setSelectedBranch}
          onToggleAI={() => setAiEnabled(!aiEnabled)}
          onLogout={handleLogout}
        />
      )}

      <main className="main">
        {user ? (
          <Timeline events={events} loading={loadingTimeline} aiEnabled={aiEnabled} />
        ) : (
          <LoginScreen />
        )}
      </main>

      <NavArrows show={!!user && events.length > 0 && !loadingTimeline} />
      <a href="/privacy.html" className="privacy-link">Privacy</a>
    </div>
  )
}

export default App

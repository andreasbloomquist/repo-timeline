import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import './App.css'

// Use relative URLs - works in both dev (with proxy) and production
const API_URL = ''

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
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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
function Header({
  user,
  repos,
  selectedRepo,
  selectedBranch,
  branches,
  onRepoChange,
  onBranchChange,
  onLogout
}: {
  user: User | null
  repos: Repo[]
  selectedRepo: Repo | null
  selectedBranch: string
  branches: string[]
  onRepoChange: (repo: Repo) => void
  onBranchChange: (branch: string) => void
  onLogout: () => void
}) {
  const handleLogin = () => {
    window.location.href = `${API_URL}/api/auth/github`
  }

  return (
    <header className="header">
      <div className="header-left">
        <span className="logo">Timeline</span>
        {user && selectedRepo && (
          <div className="selectors">
            <div className="selector">
              <select
                value={selectedRepo.id}
                onChange={(e) => {
                  const repo = repos.find(r => r.id === Number(e.target.value))
                  if (repo) onRepoChange(repo)
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
                onChange={(e) => onBranchChange(e.target.value)}
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
          <div className="user-info">
            <img src={user.avatar} alt={user.login} className="user-avatar" />
            <span className="user-name">{user.login}</span>
            <a
              href={`${API_URL}/api/auth/permissions`}
              className="manage-perms"
              title="Grant access to additional GitHub organizations"
            >
              Manage permissions
            </a>
            <button className="sign-out" onClick={onLogout}>Sign out</button>
          </div>
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
  onToggle
}: {
  event: TimelineEvent
  index: number
  isExpanded: boolean
  onToggle: () => void
}) {
  const side = index % 2 === 0 ? 'left' : 'right'
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)

  useEffect(() => {
    if (isExpanded && !aiSummary && !loadingSummary) {
      setLoadingSummary(true)
      fetchAISummary(event).then(summary => {
        setAiSummary(summary)
        setLoadingSummary(false)
      })
    }
  }, [isExpanded, event, aiSummary, loadingSummary])

  return (
    <motion.div
      className={`event ${side} ${isExpanded ? 'expanded' : ''}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      onClick={onToggle}
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
            >
              <div className="event-details-inner">
                <div className="ai-summary-section">
                  <span className="ai-summary-label">AI Summary</span>
                  {loadingSummary ? (
                    <p className="ai-summary-text loading">Generating summary...</p>
                  ) : (
                    <p className="ai-summary-text">{aiSummary}</p>
                  )}
                </div>

                <div className="commit-message-section">
                  <span className="commit-message-label">
                    {event.type === 'pr' ? 'PR Description' : 'Commit Message'}
                  </span>
                  <p className="commit-message-text">
                    {event.description.length > 500
                      ? event.description.substring(0, 500) + '...'
                      : event.description}
                  </p>
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
                    onClick={(e) => e.stopPropagation()}
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

function Timeline({ events, loading }: { events: TimelineEvent[]; loading: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
          <TimelineEventCard
            key={event.id}
            event={event}
            index={index}
            isExpanded={expandedId === event.id}
            onToggle={() => setExpandedId(expandedId === event.id ? null : event.id)}
          />
        ))}
      </div>
    </div>
  )
}

function NavArrows({ show }: { show: boolean }) {
  if (!show) return null

  const scrollUp = () => {
    window.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' })
  }

  const scrollDown = () => {
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
    window.location.href = `${API_URL}/api/auth/github`
  }

  return (
    <div className="login-screen">
      <div className="login-content">
        <p className="login-title">Repository Timeline</p>
        <button className="login-button" onClick={handleLogin}>
          <GitHubIcon />
          Sign in with GitHub
        </button>
        <p className="login-hint">
          Connect your GitHub account to visualize the history of your repositories.
        </p>
      </div>
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
          onRepoChange={() => {}}
          onBranchChange={() => {}}
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
      <Header
        user={user}
        repos={repos}
        selectedRepo={selectedRepo}
        selectedBranch={selectedBranch}
        branches={branches}
        onRepoChange={handleRepoChange}
        onBranchChange={setSelectedBranch}
        onLogout={handleLogout}
      />

      <main className="main">
        {user ? (
          <Timeline events={events} loading={loadingTimeline} />
        ) : (
          <LoginScreen />
        )}
      </main>

      <NavArrows show={!!user && events.length > 0 && !loadingTimeline} />
    </div>
  )
}

export default App

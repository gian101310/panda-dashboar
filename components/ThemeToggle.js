import { useTheme } from '../lib/theme';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      style={{
        display:     'flex',
        alignItems:  'center',
        gap:         8,
        background:  'var(--bg-card)',
        border:      '1px solid var(--border)',
        borderRadius: 20,
        padding:     '5px 12px',
        cursor:      'pointer',
        color:       'var(--text-secondary)',
        fontFamily:  "'Share Tech Mono', monospace",
        fontSize:    11,
        letterSpacing: 2,
        transition:  'all 0.2s ease',
        whiteSpace:  'nowrap',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--accent)';
        e.currentTarget.style.color = 'var(--accent)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.color = 'var(--text-secondary)';
      }}
    >
      {/* Toggle Track */}
      <div style={{
        position:     'relative',
        width:        36,
        height:       18,
        borderRadius: 9,
        background:   isDark ? '#1a2540' : 'var(--accent-dim)',
        border:       '1px solid var(--border)',
        transition:   'background 0.3s',
        flexShrink:   0,
      }}>
        {/* Knob */}
        <div style={{
          position:     'absolute',
          top:          2,
          left:         isDark ? 2 : 18,
          width:        12,
          height:       12,
          borderRadius: '50%',
          background:   isDark ? 'var(--text-muted)' : 'var(--accent)',
          transition:   'left 0.25s ease, background 0.3s',
          boxShadow:    isDark ? 'none' : '0 0 6px var(--accent-glow)',
        }} />
      </div>
      {isDark ? '🌙 DARK' : '☀️ LIGHT'}
    </button>
  );
}

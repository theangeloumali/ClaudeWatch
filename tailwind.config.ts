import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: 'rgb(14, 14, 16)',
          raised: 'rgb(24, 24, 28)',
          hover: 'rgb(32, 32, 38)'
        },
        accent: {
          DEFAULT: '#7C5CFC',
          hover: '#6B4FE0',
          subtle: 'rgba(124, 92, 252, 0.15)',
          muted: 'rgba(124, 92, 252, 0.12)',
          ring: 'rgba(124, 92, 252, 0.4)'
        },
        status: {
          active: '#30D158',
          idle: '#FFD60A',
          exited: '#FF453A',
          finished: '#64D2FF'
        },
        border: {
          DEFAULT: 'rgba(255, 255, 255, 0.08)',
          hover: 'rgba(255, 255, 255, 0.15)',
          strong: 'rgba(255, 255, 255, 0.12)'
        },
        text: {
          primary: '#F5F5F7',
          secondary: '#A1A1A6',
          tertiary: '#636366'
        }
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Text',
          'system-ui',
          'Segoe UI',
          'sans-serif'
        ],
        mono: ['SF Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      },
      fontSize: {
        stat: ['2rem', { lineHeight: '1', fontWeight: '700' }],
        heading: ['0.8125rem', { lineHeight: '1.4', fontWeight: '600' }],
        body: ['0.8125rem', { lineHeight: '1.5', fontWeight: '400' }],
        caption: ['0.6875rem', { lineHeight: '1.4', letterSpacing: '0.02em' }],
        'mono-sm': ['0.75rem', { lineHeight: '1.4', fontWeight: '500' }]
      },
      borderRadius: {
        card: '10px'
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' }
        }
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out both',
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite'
      }
    }
  },
  plugins: []
}

export default config

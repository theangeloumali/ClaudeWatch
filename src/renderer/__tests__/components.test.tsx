import { afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Header } from '../components/Header'
import { mockApi } from './api-mock'

describe('Header', () => {
  it('offers every page, Accounts and Models included', () => {
    render(<Header currentView="dashboard" onViewChange={() => {}} />)
    const pages = screen.getAllByRole('button').map((button) => button.textContent)
    expect(pages).toEqual(['Dashboard', 'Accounts', 'History', 'Models', 'Settings'])
  })

  it('highlights the current view', () => {
    render(<Header currentView="dashboard" onViewChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByRole('button', { name: 'History' })).not.toHaveAttribute('aria-current')
  })

  describe('window buttons', () => {
    const renderOn = (platform: NodeJS.Platform): void => {
      window.api = mockApi({ platform })
      render(<Header currentView="dashboard" onViewChange={() => {}} />)
    }
    afterEach(() => {
      Reflect.deleteProperty(window, 'api')
    })

    it('leaves room for the traffic lights on the left on macOS', () => {
      renderOn('darwin')
      expect(screen.getByTestId('traffic-light-space')).toHaveClass('w-[78px]')
      expect(screen.queryByTestId('caption-button-space')).toBeNull()
    })

    it('leaves room for the caption buttons on the right on Windows', () => {
      renderOn('win32')
      expect(screen.queryByTestId('traffic-light-space')).toBeNull()
      const captionSpace = screen.getByTestId('caption-button-space')
      expect(captionSpace).toHaveClass('w-[138px]')
      expect(captionSpace).toHaveAttribute('aria-hidden', 'true')
      expect(screen.getByRole('banner').lastElementChild).toBe(captionSpace)
    })
  })

  it('calls onViewChange when a page is chosen', () => {
    const onViewChange = vi.fn()
    render(<Header currentView="dashboard" onViewChange={onViewChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(onViewChange).toHaveBeenCalledWith('settings')
  })
})

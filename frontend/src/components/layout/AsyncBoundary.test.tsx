import { lazy } from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AsyncBoundary } from '@/components/layout/AsyncBoundary'

function BrokenPage(): never {
  throw new Error('chunk failed to load')
}

describe('AsyncBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a loading status while a lazy page is pending', () => {
    const Never = lazy(() => new Promise<{ default: () => null }>(() => {}))
    render(
      <MemoryRouter>
        <AsyncBoundary>
          <Never />
        </AsyncBoundary>
      </MemoryRouter>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Loading page')
  })

  it('offers a retry instead of a blank screen when a page throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <MemoryRouter>
        <AsyncBoundary>
          <BrokenPage />
        </AsyncBoundary>
      </MemoryRouter>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('This page didn’t load')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the studio' })).toHaveAttribute('href', '/studio')
  })
})

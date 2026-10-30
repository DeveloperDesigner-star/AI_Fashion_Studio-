import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FittingRoomControls } from '@/components/fitting/FittingRoomControls'
import type { RigAnimationId, ViewId } from '@/lib/fittingRoom'

function setup(overrides: Partial<Parameters<typeof FittingRoomControls>[0]> = {}) {
  const handlers = {
    onAnimation: vi.fn<(animation: RigAnimationId) => void>(),
    onSpeed: vi.fn<(speed: number) => void>(),
    onTogglePause: vi.fn(),
    onToggleAutoRotate: vi.fn(),
    onView: vi.fn<(view: ViewId) => void>(),
    onZoom: vi.fn<(direction: 'in' | 'out') => void>(),
    onReset: vi.fn(),
    onToggleFullscreen: vi.fn(),
  }
  render(
    <FittingRoomControls
      animation="idle"
      speed={1}
      paused={false}
      autoRotate={false}
      view="front"
      fullscreen={false}
      onAnimation={handlers.onAnimation}
      onSpeed={handlers.onSpeed}
      onTogglePause={handlers.onTogglePause}
      onToggleAutoRotate={handlers.onToggleAutoRotate}
      onView={handlers.onView}
      onZoom={handlers.onZoom}
      onReset={handlers.onReset}
      onToggleFullscreen={handlers.onToggleFullscreen}
      {...overrides}
    />,
  )
  return handlers
}

describe('fitting room controls', () => {
  it('exposes an accessible toolbar and every animation control', () => {
    setup()
    expect(screen.getByRole('toolbar', { name: '3D fitting room controls' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Idle' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Walk' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Turn' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Pause animation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turntable' })).toBeInTheDocument()
    expect((screen.getByLabelText('Animation speed') as HTMLInputElement).value).toBe('1')
  })

  it('switches clips and unpauses through the parent handlers', () => {
    const handlers = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Walk' }))
    expect(handlers.onAnimation).toHaveBeenCalledWith('walk')
    fireEvent.click(screen.getByRole('button', { name: 'Turn' }))
    expect(handlers.onAnimation).toHaveBeenCalledWith('turn')
    fireEvent.click(screen.getByRole('button', { name: 'Pause animation' }))
    expect(handlers.onTogglePause).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Turntable' }))
    expect(handlers.onToggleAutoRotate).toHaveBeenCalled()
  })

  it('shows the paused and spinning states', () => {
    setup({ paused: true, autoRotate: true, animation: 'turn' })
    expect(screen.getByRole('button', { name: 'Play animation' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Turntable' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Turn' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('changes speed with the slider', () => {
    const handlers = setup()
    fireEvent.change(screen.getByLabelText('Animation speed'), { target: { value: '0.7' } })
    expect(handlers.onSpeed).toHaveBeenCalledWith(0.7)
  })

  it('drives front, three-quarter, side, back, reset and zoom', () => {
    const handlers = setup()
    for (const [label, view] of [
      ['Front view', 'front'],
      ['3/4 view', 'three-quarter'],
      ['Side view', 'side'],
      ['Back view', 'back'],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: label }))
      expect(handlers.onView).toHaveBeenCalledWith(view)
    }
    fireEvent.click(screen.getByRole('button', { name: 'Reset camera' }))
    expect(handlers.onReset).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(handlers.onZoom).toHaveBeenCalledWith('in')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(handlers.onZoom).toHaveBeenCalledWith('out')
  })

  it('toggles full screen and reports the free camera', () => {
    const handlers = setup({ view: 'free', fullscreen: true })
    expect(screen.getByRole('button', { name: 'Exit full screen' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Exit full screen' }))
    expect(handlers.onToggleFullscreen).toHaveBeenCalled()
    expect(screen.getByText(/Free angle/)).toBeInTheDocument()
  })

  it('shows the drag, zoom and pan guidance on both layouts', () => {
    setup({ compact: true })
    expect(screen.getAllByText(/Drag to rotate/).length).toBeGreaterThan(0)
    expect(screen.getByTestId('fitting-controls')).toBeInTheDocument()
  })
})

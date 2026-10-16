import { Component, createRef, type ReactNode } from 'react'

interface SceneErrorBoundaryProps {
  onError: (error: unknown) => void
  children: ReactNode
}

// P8: GPU switches and sleep/wake lose the context and give it back, and three re-initialises a
// restored one by itself, so the List view waits this long for the restore.
export const CONTEXT_GRACE_MS = 4000

// R3F rethrows WebGL context failures during render, and a context can be lost for good; both
// turn into the List view fallback.
export class SceneErrorBoundary extends Component<SceneErrorBoundaryProps, { hasFailed: boolean }> {
  state = { hasFailed: false }
  private readonly wrapper = createRef<HTMLDivElement>()
  private graceTimer: ReturnType<typeof setTimeout> | undefined

  static getDerivedStateFromError(): { hasFailed: boolean } {
    return { hasFailed: true }
  }

  componentDidMount(): void {
    // Context events do not bubble; a capture listener on an ancestor still sees them.
    this.wrapper.current?.addEventListener('webglcontextlost', this.onContextLost, true)
    this.wrapper.current?.addEventListener('webglcontextrestored', this.onContextRestored, true)
  }

  componentWillUnmount(): void {
    clearTimeout(this.graceTimer)
    this.wrapper.current?.removeEventListener('webglcontextlost', this.onContextLost, true)
    this.wrapper.current?.removeEventListener('webglcontextrestored', this.onContextRestored, true)
  }

  componentDidCatch(error: unknown): void {
    this.props.onError(error)
  }

  private readonly onContextLost = (): void => {
    clearTimeout(this.graceTimer)
    this.graceTimer = setTimeout(() => {
      this.setState({ hasFailed: true })
      this.props.onError(new Error('The WebGL context was lost and never restored'))
    }, CONTEXT_GRACE_MS)
  }

  private readonly onContextRestored = (): void => {
    clearTimeout(this.graceTimer)
    // On demand, so three and R3F stay in the lazy scene chunk; the restored canvas needs a frame.
    void import('@react-three/fiber').then(({ invalidate }) => invalidate())
  }

  render(): ReactNode {
    return (
      <div ref={this.wrapper} className="contents">
        {this.state.hasFailed ? null : this.props.children}
      </div>
    )
  }
}

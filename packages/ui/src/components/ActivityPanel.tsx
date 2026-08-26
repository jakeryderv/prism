import { type Component, createSignal, For, onCleanup } from 'solid-js'
import { useWorkspace } from '../context'
import { relativeTime } from '../store/activity'

export const ActivityPanel: Component = () => {
  const ws = useWorkspace()
  const [now, setNow] = createSignal(Date.now())
  const timer = setInterval(() => setNow(Date.now()), 5_000)
  onCleanup(() => clearInterval(timer))
  return (
    <aside class="prism-activity" aria-label="Activity">
      <div class="prism-panel-title">
        Activity
        <label class="prism-follow">
          <input
            type="checkbox"
            checked={ws.follow()}
            onChange={(e) => ws.setFollow(e.currentTarget.checked)}
          />
          follow
        </label>
      </div>
      <ul class="prism-activity-list">
        <For each={ws.activity().events} fallback={<li class="prism-empty">No activity yet.</li>}>
          {(ev) => (
            <li>
              <button
                type="button"
                class="prism-activity-row"
                disabled={ev.kind === 'deleted'}
                onClick={() => ws.openPath(ev.path)}
                title={ev.path}
              >
                <span class={`prism-badge prism-badge-${ev.kind}`}>{ev.kind}</span>
                <span class="prism-activity-path">{ev.path}</span>
                <span class="prism-activity-time">{relativeTime(ev.timestamp, now())}</span>
              </button>
            </li>
          )}
        </For>
      </ul>
    </aside>
  )
}

/**
 * Visibility-aware central scheduler.
 *
 * All background polling/refresh loops should be registered here so they pause
 * automatically when the document is hidden (tab switch, OS lock screen, Tauri
 * window minimised) and resume — running immediately if overdue — when
 * visibility is restored.
 *
 * Tauri integration (deferred): during migration, call
 * `scheduler.registerTauriEvents(listen)` with `@tauri-apps/api/event`'s
 * `listen` so the scheduler also responds to native window focus events.
 */

type TaskId = string;

interface Task {
	id: TaskId;
	callback: () => void | Promise<void>;
	intervalMs: number;
	lastRun: number;
	handle: ReturnType<typeof setInterval> | null;
	useIdle: boolean;
	idleHandle: ReturnType<typeof setTimeout> | null;
}

class Scheduler {
	private tasks = new Map<TaskId, Task>();
	private visible = true;

	constructor() {
		if (typeof document !== 'undefined') {
			document.addEventListener('visibilitychange', this.handleVisibilityChange);
		}
	}

	/**
	 * Register a visibility-aware interval. Replaces any existing task with the
	 * same `id`. The callback runs on the normal event loop.
	 */
	schedule(id: TaskId, callback: () => void | Promise<void>, intervalMs: number): void {
		this.cancel(id);
		const task: Task = {
			id,
			callback,
			intervalMs,
			lastRun: 0,
			handle: null,
			useIdle: false,
			idleHandle: null
		};
		this.tasks.set(id, task);
		if (this.visible) {
			this.startInterval(task);
		}
	}

	/**
	 * Register a task that runs via `requestIdleCallback` (with `setTimeout`
	 * fallback). Ideal for non-critical analytics refreshes that should yield
	 * to UI frames and avoid waking a low-power CPU.
	 *
	 * @param targetIntervalMs - Minimum time between runs. Actual timing is
	 *   at least this long because idle scheduling adds additional delay.
	 */
	scheduleIdle(
		id: TaskId,
		callback: () => void | Promise<void>,
		targetIntervalMs: number
	): void {
		this.cancel(id);
		const task: Task = {
			id,
			callback,
			intervalMs: targetIntervalMs,
			lastRun: 0,
			handle: null,
			useIdle: true,
			idleHandle: null
		};
		this.tasks.set(id, task);
		if (this.visible) {
			this.scheduleNextIdle(task);
		}
	}

	/** Remove a registered task and clear any pending timers. */
	cancel(id: TaskId): void {
		const task = this.tasks.get(id);
		if (!task) return;
		this.clearTask(task);
		this.tasks.delete(id);
	}

	/**
	 * Tauri integration hook — call during migration with
	 * `@tauri-apps/api/event`'s `listen` function:
	 * ```ts
	 * import { listen } from '@tauri-apps/api/event';
	 * scheduler.registerTauriEvents((event, handler) => listen(event, handler));
	 * ```
	 * Falls back gracefully to `document.visibilitychange` when not called.
	 */
	registerTauriEvents(listen: (event: string, handler: () => void) => void): void {
		listen('tauri://focus', () => this.onVisible());
		listen('tauri://blur', () => this.onHidden());
	}

	private handleVisibilityChange = (): void => {
		if (document.visibilityState === 'hidden') {
			this.onHidden();
		} else {
			this.onVisible();
		}
	};

	private onHidden(): void {
		this.visible = false;
		for (const task of this.tasks.values()) {
			this.clearTask(task);
		}
	}

	private onVisible(): void {
		this.visible = true;
		const now = Date.now();
		for (const task of this.tasks.values()) {
			const overdue = task.lastRun === 0 || now - task.lastRun >= task.intervalMs;
			if (overdue) {
				this.runTask(task);
			}
			if (task.useIdle) {
				this.scheduleNextIdle(task);
			} else {
				this.startInterval(task);
			}
		}
	}

	private startInterval(task: Task): void {
		if (task.handle !== null) return;
		task.handle = setInterval(() => this.runTask(task), task.intervalMs);
	}

	private scheduleNextIdle(task: Task): void {
		if (task.idleHandle !== null) return;
		const elapsed = Date.now() - task.lastRun;
		const delay = task.lastRun === 0 ? 0 : Math.max(0, task.intervalMs - elapsed);

		task.idleHandle = setTimeout(() => {
			task.idleHandle = null;
			if (!this.visible || !this.tasks.has(task.id)) return;

			if (typeof requestIdleCallback !== 'undefined') {
				requestIdleCallback(
					() => {
						if (this.visible && this.tasks.has(task.id)) {
							this.runTask(task);
							this.scheduleNextIdle(task);
						}
					},
					{ timeout: task.intervalMs }
				);
			} else {
				this.runTask(task);
				this.scheduleNextIdle(task);
			}
		}, delay);
	}

	private runTask(task: Task): void {
		task.lastRun = Date.now();
		try {
			const result = task.callback();
			if (result instanceof Promise) {
				result.catch((err) =>
					console.error(`[scheduler] Task "${task.id}" failed:`, err)
				);
			}
		} catch (err) {
			console.error(`[scheduler] Task "${task.id}" failed:`, err);
		}
	}

	private clearTask(task: Task): void {
		if (task.handle !== null) {
			clearInterval(task.handle);
			task.handle = null;
		}
		if (task.idleHandle !== null) {
			clearTimeout(task.idleHandle);
			task.idleHandle = null;
		}
	}
}

export const scheduler = new Scheduler();

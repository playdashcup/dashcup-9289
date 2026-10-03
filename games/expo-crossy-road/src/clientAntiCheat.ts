/**
 * Best-effort client telemetry for ChickenDash. This is intentionally a local,
 * low-cost signal only; the server must continue to validate every run itself.
 */
export const CLIENT_SIGNAL_WEIGHTS = {
  input_burst: 24,
  score_velocity: 28,
  short_run_high_score: 24,
  movement_jump: 30,
  invalid_state_transition: 20,
  state_integrity: 30,
  focus_change: 2,
  devtools_shortcut: 3,
  rapid_reset: 12,
} as const;

export type ClientSignal = keyof typeof CLIENT_SIGNAL_WEIGHTS;

const SCORE_VELOCITY_LIMIT = 14;
const INPUTS_PER_SECOND_LIMIT = 16;
const INPUT_BURST_MIN_GAP_MS = 40;
const MAX_RECORDED_INPUTS = 2_000;

const ALLOWED_GAME_TRANSITIONS: Record<string, readonly string[]> = {
  none: ['playing'],
  playing: ['paused', 'gameOver'],
  paused: ['playing', 'none'],
  gameOver: ['playing', 'none'],
};

export class ChickenDashRunMonitor {
  private startedAt = 0;
  private signals = new Set<ClientSignal>();
  private recentInputTimes: number[] = [];
  private recentScores: { at: number; score: number }[] = [];
  private lastInputAt = -1;
  private lastScore = 0;
  private inputCount = 0;
  private focusChanges = 0;

  start(now = performance.now()) {
    this.startedAt = now;
    this.signals.clear();
    this.recentInputTimes = [];
    this.recentScores = [];
    this.lastInputAt = -1;
    this.lastScore = 0;
    this.inputCount = 0;
    this.focusChanges = 0;
  }

  flag(signal: ClientSignal) {
    this.signals.add(signal);
  }

  noteInput(at: number) {
    if (!Number.isFinite(at) || at < 0 || at > 180_000 || this.inputCount >= MAX_RECORDED_INPUTS) return;
    this.inputCount += 1;
    if (this.lastInputAt >= 0 && at < this.lastInputAt) this.flag('invalid_state_transition');
    if (this.lastInputAt >= 0 && at - this.lastInputAt < INPUT_BURST_MIN_GAP_MS) this.flag('input_burst');
    this.lastInputAt = at;
    this.recentInputTimes.push(at);
    while (this.recentInputTimes.length && at - this.recentInputTimes[0] >= 1_000) this.recentInputTimes.shift();
    if (this.recentInputTimes.length > INPUTS_PER_SECOND_LIMIT) this.flag('input_burst');
  }

  noteScore(score: number, now = performance.now()) {
    if (!Number.isSafeInteger(score) || score < this.lastScore) {
      this.flag('state_integrity');
      return;
    }
    const elapsed = now - this.startedAt;
    const scoreDelta = score - this.lastScore;
    if (scoreDelta > 2) this.flag('score_velocity');
    this.lastScore = score;
    this.recentScores.push({ at: now, score });
    while (this.recentScores.length > 1 && now - this.recentScores[0].at > 2_000) this.recentScores.shift();
    const first = this.recentScores[0];
    const span = now - first.at;
    if (span >= 500 && (score - first.score) * 1_000 / span > SCORE_VELOCITY_LIMIT) this.flag('score_velocity');
    if (elapsed >= 0 && elapsed < 1_500 && score >= 10) this.flag('short_run_high_score');
  }

  noteMovement(previous: { x: number; z: number } | null, target: { x: number; z: number }, direction: string) {
    if (!previous || !Number.isFinite(target.x) || !Number.isFinite(target.z)) return;
    const expectedZ = direction === 'SWIPE_UP' ? 1 : direction === 'SWIPE_DOWN' ? -1 : 0;
    const deltaZ = target.z - previous.z;
    // Logs move laterally between inputs, so only check the grid-aligned row axis.
    if (Math.abs(deltaZ - expectedZ) > 0.25) this.flag('movement_jump');
  }

  noteStateTransition(from: string, to: string) {
    if (from !== to && !ALLOWED_GAME_TRANSITIONS[from]?.includes(to)) this.flag('invalid_state_transition');
  }

  noteStateIntegrity(engine: any) {
    const hero = engine?._hero;
    const position = hero?.position;
    if (typeof engine?.moveWithDirection !== 'function'
      || typeof engine?.onGameEnded !== 'function'
      || !position
      || !Number.isFinite(position.x)
      || !Number.isFinite(position.y)
      || !Number.isFinite(position.z)
      || typeof hero?.isAlive !== 'boolean'
      || typeof hero?.moving !== 'boolean') {
      this.flag('state_integrity');
    }
  }

  noteFocusChange() {
    this.focusChanges = Math.min(100, this.focusChanges + 1);
    this.flag('focus_change');
  }

  summary(durationMs: number) {
    if (durationMs < 1_000 && this.lastScore >= 8) this.flag('short_run_high_score');
    if (durationMs > 0 && this.lastScore * 1_000 / durationMs > SCORE_VELOCITY_LIMIT) this.flag('score_velocity');
    const flags = [...this.signals];
    return {
      suspicionScore: Math.min(100, flags.reduce((sum, flag) => sum + CLIENT_SIGNAL_WEIGHTS[flag], 0)),
      flags,
      inputCount: this.inputCount,
      focusChanges: this.focusChanges,
    };
  }
}

export function isDevtoolsShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'shiftKey' | 'metaKey' | 'altKey'>) {
  const key = event.key.toLowerCase();
  return key === 'f12'
    || ((event.ctrlKey || event.metaKey) && event.shiftKey && ['i', 'j', 'c'].includes(key))
    || (event.metaKey && event.altKey && ['i', 'j', 'c'].includes(key));
}

// React 18's act() only recognizes an environment as test-managed when this flag is set —
// without it, legitimately act()-wrapped async state updates still log a spurious warning.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

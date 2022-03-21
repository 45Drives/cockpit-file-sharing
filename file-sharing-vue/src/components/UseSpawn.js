import { reactive, watch } from 'vue';

if (import.meta.env.DEV && typeof cockpit === 'undefined') {
	window.cockpit = {
		spawn: () => {
			return new Promise((resolve, reject) => resolve(""));
		},
		file: (path, opts) => {
			return {
				read: () => {
					return new Promise((resolve, reject) => resolve(opts?.syntax?.parse("") ?? ""));
				},
				replace: () => {
					return new Promise((resolve, reject) => resolve());
				},
				modify: () => {
					return new Promise((resolve, reject) => resolve());
				},
				close: () => { }
			}
		}
	}
}

/**
 * @typedef {Object} SpawnState
 * @property {boolean} loading - Whether or not the process is still running
 * @property {number} status - Exit code of the process
 * @property {string} stdout - Anything printed to stdout
 * @property {string} stderr - Anything printed to stderr
 * @property {Object} proc - The object returned from cockpit.spawn()
 * @property {function} promise - Returns a promise that resolves when the process finishes
 */

/** Wrapper for using cockpit.spawn()
 * 
 * @param {string[]} argv - Argument vector to execute
 * @param {Object} opts - cockpit.spawn() options
 * @param {string} opts.superuser - 'try' or 'require' for sudo
 * @param {string} opts.host
 * @param {string} opts.directory
 * @param {boolean} opts.binary
 * @param {'out'|'err'} stderr - where to pipe stderr of proc
 * @returns {SpawnState} state - the process state object
 */
export default function useSpawn(argv = [], opts = {}, stderr = 'out') {
	const state = reactive({
		loading: true,
		status: 0,
		stdout: '',
		stderr: '',
		proc: null,
		promise: () => {
			return new Promise((resolve, reject) => {
				watch(state, () => {
					if (!state.loading) {
						if (state.status !== 0)
							reject({ ...state });
						else
							resolve({ ...state });
					}
				});
			})
		}
	});

	if (!opts.superuser) opts.superuser = 'require';
	opts.err = stderr === 'out' ? 'out' : 'message';

	state.loading = true;
	state.status = 0;
	state.stdout = '';
	state.stderr = '';

	state.proc = cockpit.spawn(argv, opts);
	state.proc
		.then((_stdout, _stderr) => {
			state.stdout = _stdout;
			state.stderr = _stderr;
		})
		.catch((ex, _stderr) => {
			state.stderr = _stderr ?? ex.message;
			state.status = ex.exit_status ?? -1;
		})
		.finally(() => {
			state.loading = false;
		});

	return state;
}

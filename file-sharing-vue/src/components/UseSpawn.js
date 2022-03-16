import { reactive, watch } from 'vue';

/**
 * 
 * @param {string[]} argv
 * @param {Object} opts
 * @param {string} opts.superuser
 * @param {string} opts.host
 * @param {string} opts.directory
 * @param {boolean} opts.binary
 * @param {boolean} opts.promise
 * @param {'out'|'err'} stderr
 * @returns 
 */
export default function useSpawn(argv = [], opts = {}, stderr = 'out') {
	const state = reactive({
		loading: false,
		status: 0,
		stdout: '',
		stderr: '',
	});

	const usePromise = Boolean(opts.promise);

	if (!opts.superuser) opts.superuser = 'require';
	opts.err = stderr === 'out' ? 'out' : 'message';

	async function execute() {
		state.loading = true;
		state.status = 0;
		state.stdout = '';
		state.stderr = '';

		cockpit.spawn(argv, opts)
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
	}

	execute();

	if (usePromise) {
		return new Promise((resolve, reject) => {
			watch(state, () => {
				if (!state.loading) {
					if (state.status !== 0)
						reject({ ...state });
					else
						resolve({ ...state });
				}
			});
		});
	} else {
		return state;
	}
}

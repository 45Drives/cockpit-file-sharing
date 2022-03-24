/* Copyright (C) 2022 Dawnson DellaValle <ddellavalle@45drives.com>
 * Copyright (C) 2022 Josh Boudreau      <jboudreau@45drives.com>
 * 
 * This file is part of Cockpit File Sharing.
 * 
 * Cockpit File Sharing is free software: you can redistribute it and/or modify it under the terms
 * of the GNU General Public License as published by the Free Software Foundation, either version 3
 * of the License, or (at your option) any later version.
 * 
 * Cockpit File Sharing is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License along with Cockpit File Sharing.
 * If not, see <https://www.gnu.org/licenses/>. 
 */

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
		},
		transport: {
			uri: (path) => "ws://localhost:9090/cockpit/" + path,
			csrf_token: "token",
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
export default function useSpawn(argv = [], opts = {}, stderr = 'message') {
	const state = reactive({
		loading: true,
		status: 0,
		stdout: '',
		stderr: '',
		argv: [],
		proc: null,
		promise: () => {
			return new Promise((resolve, reject) => {
				watch(state, () => {
					if (!state.loading) {
						if (state.status === 0)
							resolve({ ...state });
						else
							reject({ ...state });
					}
				}, { lazy: false });
			})
		}
	});

	if (!opts.superuser) opts.superuser = 'require';
	if (!opts.err) opts.err = stderr;

	state.loading = true;
	state.status = 0;
	state.stdout = '';
	state.stderr = '';
	state.argv = [...argv];

	state.proc = cockpit.spawn(argv, opts);
	state.proc
		.then((_stdout, _stderr) => {
			state.stdout = _stdout;
			state.stderr = _stderr;
		})
		.catch((ex, _stderr) => {
			state.stderr = ex.message ?? _stderr;
			state.status = ex.exit_status ?? -1;
		})
		.finally(() => {
			state.loading = false;
		});

	return state;
}

import { ref, onBeforeMount, onUnmounted, watch } from 'vue';
import { useConfig } from '../components/Config.vue';
import { useSpawn, errorString } from '@45drives/cockpit-helpers';

const spawnOpts = {
	superuser: 'try',
};

/**
 * Get bash script for json ouput of users or groups
 * 
 * @param {"passwd" | "group"} db - getent database to query
 * @param {boolean} isDomain - if true, pull from domain users, else local users
 * @param {boolean} includeSystemAccounts - keep users/groups with uid/gid between 0 and 1000
 * @returns {string} bash script
 */
const getentScript = (db, isDomain, includeSystemAccounts) => {
	const [nameKey, idKey, wbinfoFlag] = {
		'passwd': ['user', 'uid', '-u'],
		'group': ['group', 'gid', '-g']
	}[db];
	const getent = isDomain ? `wbinfo ${wbinfoFlag} | xargs -d'\n' -r getent` : `getent -s files`;
	const printFilter = includeSystemAccounts ? '' : '$3 >= 1000 || $3 == 0';
	return `set -o pipefail; ${getent} ${db} | awk -F: '
		BEGIN { printf "[" }
		${printFilter} {
			printf sep;
			printf "{";
			printf "\\"${nameKey}\\":\\"%s\\",",$1;
			printf "\\"${idKey}\\":%d,",$3;
			printf "\\"domain\\":${isDomain.toString()},";
			printf "\\"pretty\\":\\"%s${isDomain ? ' (domain)' : ''}\\"",$1;
			printf "}";
			sep = ",";
		}
		END { printf "]" }
		'`;
};

const getent = (db, includeSystemAccounts) => {
	return Promise.all([
		useSpawn(['bash', '-c', getentScript(db, false, includeSystemAccounts)], spawnOpts).promise()
			.then(({ stdout }) => {
				return JSON.parse(stdout);
			}),
		useSpawn(['bash', '-c', getentScript(db, true, includeSystemAccounts)], spawnOpts).promise()
			.catch(state => {
				console.warn(`Error getting users/groups from AD/domain:`, errorString(state));
				return state;
			})
			.then(({ stdout }) => JSON.parse(stdout)),
	]).then(nested => nested.flat());
};

/**
 * @typedef User
 * @property {string} name - system name of user
 * @property {number} uid - user id
 * @property {boolean} domain - if true, user is from AD
 * @property {string} pretty - 
 */

export default function useUserGroupLists() {
	const users = ref([]);
	const groups = ref([]);
	const processingUsersList = ref(false);
	const processingGroupsList = ref(false);
	const config = useConfig();

	const cockpitWatchHandles = [];

	async function aquireUserList() {
		processingUsersList.value = true;
		try {
			users.value = await getent('passwd', config.includeSystemAccounts ?? false);
		} catch (state) {
			console.error('Failed to get user list:', errorString(state));
		} finally {
			processingUsersList.value = false;
		}
	}

	async function aquireGroupList() {
		processingGroupsList.value = true;
		try {
			groups.value = await getent('group', config.includeSystemAccounts ?? false);
		} catch (state) {
			console.error('Failed to get group list:', errorString(state));
		} finally {
			processingGroupsList.value = false;
		}
	}

	onBeforeMount(() => {
		// cockpit.file.watch callbacks are always called once when initialized
		cockpitWatchHandles.push(
			cockpit.file('/etc/passwd', { superuser: 'try' }).watch(() => aquireUserList(), { read: false }),
			cockpit.file('/etc/group', { superuser: 'try' }).watch(() => aquireGroupList(), { read: false })
		);
		watch(() => config.includeSystemAccounts, () => {
			aquireUserList();
			aquireGroupList();
		});
	});

	onUnmounted(() => {
		cockpitWatchHandles.forEach(handle => handle?.remove?.());
	});

	return {
		users,
		groups,
		processingUsersList,
		processingGroupsList,
	};
}

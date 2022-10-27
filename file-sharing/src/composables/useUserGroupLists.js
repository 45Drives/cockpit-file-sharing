import { ref, onBeforeMount, onUnmounted } from 'vue';
import { useSpawn, errorString } from '@45drives/cockpit-helpers';

const spawnOpts = {
	superuser: 'try',
};

// /**
//  * @param {String} type - 'group' or 'user'
//  * @param {boolean} domain 
//  * @returns 
//  */
// const parseRecord = (type, domain) => {
// 	const nameKey = type;
// 	const idKey = type === 'group' ? 'gid' : 'uid';
// 	const prettySuffix = domain ? ' (domain)' : '';

// 	return (record) => {
// 		if (!record)
// 			return null;
// 		const fields = record.split(':');
// 		const name = fields[0];
// 		const id = fields[2];
// 		if (id >= 1000 || id === '0') // include root
// 			return { [nameKey]: name, [idKey]: id, domain, pretty: name + prettySuffix };
// 		return null;
// 	};
// };

// const getent = async (db) => {
// 	const [name, wbinfoFlag] = db === 'passwd' ? ['user', '-u'] : ['group', '-g'];
// 	const localParseFunctor = parseRecord(name, false);
// 	const domainParseFunctor = parseRecord(name, true);
// 	return await Promise.all([
// 		useSpawn(['getent', '-s', 'files', db], spawnOpts).promise()
// 			.then(({ stdout: getentDb }) =>
// 				getentDb.trim()
// 					.split('\n')
// 					.map(localParseFunctor)
// 			),
// 		useSpawn(['bash', '-c', `wbinfo ${wbinfoFlag} | xargs -r getent ${db}`], spawnOpts).promise()
// 			.catch(state => {
// 				console.warn(`Error getting list of ${name}s from AD/domain:`, errorString(state));
// 				return state;
// 			})
// 			.then(({ stdout: getentDb }) =>
// 				getentDb.trim()
// 					.split('\n')
// 					.map(domainParseFunctor)
// 			)
// 	])
// 		.then(nestedEntries =>
// 			nestedEntries.flat().filter(entry => entry !== null).sort((a, b) => a.pretty.localeCompare(b.pretty))
// 		);
// };

const getentScript = (db, isDomain) => {
	const [nameKey, idKey, wbinfoFlag] = {
		'passwd': ['user', 'uid', '-u'],
		'group': ['group', 'gid', '-g']
	}[db];
	const getent = isDomain ? `wbinfo ${wbinfoFlag} | xargs -r getent` : `getent -s files`;
	return `set -o pipefail; ${getent} ${db} | awk -F: '
		BEGIN { printf "[" }
		$3 >= 1000 || $3 == 0 {
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

const getent = (db) => {
	return Promise.all([
		useSpawn(['bash', '-c', getentScript(db, false)], spawnOpts).promise()
			.then(({ stdout }) => {
				return JSON.parse(stdout);
			}),
		useSpawn(['bash', '-c', getentScript(db, true)], spawnOpts).promise()
			.catch(state => {
				console.warn(`Error getting users/groups from AD/domain:`, errorString(state));
				return state;
			})
			.then(({ stdout }) => JSON.parse(stdout)),
	]).then(nested => nested.flat());
};

/**
 * get list of user objects from system and domain if joined
 * 
 * @returns {Promise<Object[]>}
 */
function getUsers() {
	return getent('passwd');
}

/**
 * get list of group objects from system and domain if joined
 * 
 * @returns {Promise<Object[]>}
 */
function getGroups() {
	return getent('group');
}

export default function useUserGroupLists() {
	const users = ref([]);
	const groups = ref([]);
	const processingUsersList = ref(false);
	const processingGroupsList = ref(false);

	const cockpitWatchHandles = [];

	async function aquireUserList() {
		processingUsersList.value = true;
		try {
			users.value = await getUsers();
		} catch (state) {
			console.error('Failed to get user list:', errorString(state));
		} finally {
			processingUsersList.value = false;
		}
	}

	async function aquireGroupList() {
		processingGroupsList.value = true;
		try {
			groups.value = await getGroups();
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

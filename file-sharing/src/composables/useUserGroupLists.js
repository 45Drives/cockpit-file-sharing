import { ref, onBeforeMount, onUnmounted } from 'vue';
import { useSpawn, errorString } from '@45drives/cockpit-helpers';

const spawnOpts = {
	superuser: 'try',
}

/**
 * @param {String} type - 'group' or 'user'
 * @param {boolean} domain 
 * @returns 
 */
const parseRecord = (type, domain) => (record) => {
	if (!record)
		return null;
	let nameKey = type;
	let idKey = type === 'group' ? 'gid' : 'uid';

	const fields = record.split(':');
	const name = fields[0];
	const id = fields[2];
	if (id >= 1000 || id === '0') // include root
		return { [nameKey]: name, [idKey]: id, domain, pretty: name + (domain ? ' (domain)' : '') };
	return null;
};

const getent = async (db) => {
	const [name, wbinfoFlag] = db === 'passwd' ? ['user', '-u'] : ['group', '-g'];
	const procs = [];
	procs.push(
		useSpawn(['getent', '-s', 'files', db], spawnOpts).promise()
			.then(({ stdout: getentDb }) =>
				getentDb.trim()
					.split('\n')
					.map(parseRecord(name, false))
			)
	);
	await useSpawn(['wbinfo', wbinfoFlag], spawnOpts).promise()
		.then(({ stdout }) => {
			const domainItemNames = stdout.trim().split('\n');
			// limit number of queries per execution of getent to avoid
			// sending too much data and causing cockpit ws to drop connection
			const partitionSize = 1000;
			for (let i = 0; i < domainItemNames.length; i += partitionSize) {
				procs.push(
					useSpawn(['getent', db, ...domainItemNames.slice(i, i + partitionSize)], spawnOpts).promise()
						.catch(state => {
							console.error('getent error while getting domain entries:', state);
							return state;
						})
						.then(({ stdout: getentDb }) =>
							getentDb.trim()
								.split('\n')
								.map(parseRecord(name, true))
						)
				);
			}
		})
		.catch(e => console.warn(`Error getting list of ${name}s from domain. wbinfo:`, errorString(e)));
	return await Promise.all(procs)
		.then(nestedEntries =>
			nestedEntries.flat().filter(entry => entry !== null).sort((a, b) => a.pretty.localeCompare(b.pretty))
		);
}

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
		)
	});

	onUnmounted(() => {
		cockpitWatchHandles.forEach(handle => handle?.remove?.())
	});

	return {
		users,
		groups,
		processingUsersList,
		processingGroupsList,
	}
}

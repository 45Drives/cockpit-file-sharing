<template>
	<div class="card-header">
		<h3 class="text-lg leading-6 font-medium">Users</h3>
	</div>
	<div class="card-body">
		<div
			class="flex flex-row items-baseline justify-between mobile:flex-col mobile:items-start mobile:space-y-3"
		>
			<div class="flex flex-row items-baseline space-x-3">
				<label for="user-select" class="block text-sm font-medium">User</label>
				<select
					id="user-select"
					name="user-select"
					class="mt-1 block pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-0 focus:border-gray-500 sm:text-sm rounded-md dark:bg-neutral-800"
					v-model="user"
					@change="switchUser"
				>
					<option
						v-for="(userItr, index) in users"
						:selected="userItr === user"
						:value="userItr"
					>{{ userItr }}</option>
				</select>
			</div>
			<div class="flex flex-row space-x-3">
				<button
					class="btn btn-primary"
					@click="showSetPassword = !showSetPassword; sambaPassword1 = sambaPassword2 = ''"
				>{{ showSetPassword ? 'Cancel' : 'Set Samba Password' }}</button>
				<button @click="removeSambaPassword" class="btn btn-danger">Remove Samba Password</button>
			</div>
		</div>
		<div v-if="showSetPassword" class="space-y-5 pt-5">
			<div>
				<label
					for="samba-password1"
					class="block text-sm font-medium"
				>New Samba Password for {{ user }}</label>
				<div class="mt-1">
					<input
						type="password"
						name="samba-password1"
						id="samba-password1"
						class="shadow-sm focus:border-gray-500 focus:ring-0 focus:outline-none block w-full sm:text-sm border-gray-300 dark:border-gray-700 dark:bg-neutral-800 rounded-md"
						v-model="sambaPassword1"
					/>
				</div>
			</div>
			<div>
				<label
					for="samba-password2"
					class="block text-sm font-medium"
				>Repeat New Samba Password</label>
				<div class="mt-1">
					<input
						type="password"
						name="samba-password2"
						id="samba-password2"
						class="shadow-sm focus:border-gray-500 focus:ring-0 focus:outline-none block w-full sm:text-sm border-gray-300 dark:border-gray-700 dark:bg-neutral-800 rounded-md"
						v-model="sambaPassword2"
					/>
				</div>
			</div>
			<div class="flex flex-row space-x-3">
				<button class="btn btn-primary" @click="showSetPassword = false">Cancel</button>
				<button class="btn btn-green" @click="setSambaPassword">Apply</button>
			</div>
		</div>
		<div class="mt-8 flex flex-col">
			<div class="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
				<div class="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
					<div class="overflow-hidden shadow ring-1 ring-black ring-opacity-5 dark:ring-gray-700 md:rounded-lg">
						<table class="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
							<thead class="bg-neutral-50 dark:bg-neutral-800">
								<tr>
									<th
										scope="col"
										class="py-3.5 pl-4 pr-3 text-left text-sm font-semibold sm:pl-6 lg:pl-8"
									>{{ user }}'s Groups</th>
									<th
										scope="col"
										class="sr-only py-3.5 pl-4 pr-3 text-left text-sm font-semibold sm:pl-6 lg:pl-8"
									>Remove</th>
									<div class="relative">
										<PlusIcon
											@click="addGroup"
											class="w-5 h-5 absolute right-3 top-3.5 cursor-pointer text-gray-500"
										/>
									</div>
								</tr>
							</thead>
							<tbody class="dark:bg-neutral-800">
								<tr
									v-for="(group, index) in userGroups"
									:class="index % 2 === 0 ? undefined : 'bg-neutral-50 dark:bg-neutral-700'"
								>
									<td
										class="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium sm:pl-6 lg:pl-8"
									>{{ group }}</td>
									<td
										class="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6 lg:pr-8"
									>
										<a
											@click="removeGroup(group)"
											class="uppercase text-red-600 hover:text-red-900 cursor-pointer"
										>
											Remove
											<span class="sr-only">, {{ group }}</span>
										</a>
									</td>
								</tr>
								<tr v-if="userGroups.length === 0">
									<td
										colspan="4"
										class="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-500 sm:pl-6 lg:pl-8"
									>No groups. Click "+" to add one.</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script>
import { PlusIcon } from "@heroicons/vue/solid";

let groupsAnalog = {
	'root': ['root'],
	'test': ['test', 'sudo'],
	'jdoe': ['samba', 'sudo', 'dialout']
}

export default {
	props: {
		users: Array[String],
		groups: Array[String]
	},
	data() {
		return {
			user: "",
			userGroups: ['test'],
			showSetPassword: false,
			sambaPassword1: "",
			sambaPassword2: "",
		}
	},
	async created() {
		this.user = await this.getLoggedInUser();
		await this.updateUserGroups();
	},
	methods: {
		async getLoggedInUser() {
			return 'root';
		},
		async switchUser() {
			this.sambaPassword1 = this.sambaPassword2 = "";
			this.showSetPassword = false;
			await this.updateUserGroups();
		},
		async updateUserGroups() {
			this.userGroups = groupsAnalog[this.user].sort();
		},
		async addGroup() {
			let group = prompt("New group");
			if (group) {
				try {
					console.log(['usermod', '-aG', group, this.user]);
					this.userGroups = [...this.userGroups, group].sort();
				} catch (err) {
					alert(err);
				}
			}
		},
		async removeGroup(group) {
			if (confirm(`Remove ${this.user} from ${group} group?`))
				try {
					console.log(['gpasswd', '-d', group, this.user]);
					this.userGroups = this.userGroups.filter(a => a !== group);
				} catch (err) {
					alert(err);
				}
		},
		async setSambaPassword() {
			console.log(['smbpasswd', '-s', '-a', this.user]);
			console.log(`${this.sambaPassword1}\n${this.sambaPassword2}\n`);
		},
		async removeSambaPassword() {
			if (confirm(`Remove Samba Password for ${this.user}?`)) {
				console.log(['smbpasswd', '-x', this.user]);
			}
		}
	},
	components: {
		PlusIcon
	}
}
</script>

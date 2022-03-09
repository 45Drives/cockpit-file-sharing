<template>
	<div class="samba-share-management">
		<div class="header">
			<h2>Share Management</h2>
			<div>
				<button @click="showAddShare = !showAddShare">{{ showAddShare ? 'Cancel' : 'Add Share' }}</button>
			</div>
		</div>
		<div>
			<SambaShareEditor v-if="showAddShare" @apply-share="addShare" />
		</div>
		<div class="list">
			<SambaShare
				v-for="(share, index) in shares"
				:share="share"
				@delete-share="deleteShare"
				@update-share="updateShare"
			/>
		</div>
	</div>
</template>

<script>
import SambaShare from "./SambaShare.vue";
import SambaShareEditor from "./SambaShareEditor.vue";
import { generateConfDiff } from "../functions";
export default {
	data() {
		return {
			shares: this.initialShares,
			showAddShare: false,
		};
	},
	props: {
		initialShares: Array[Object]
	},
	components: { SambaShare, SambaShareEditor },
	methods: {
		async deleteShare(share) {
			if (!confirm("Are you sure?"))
				return;
			try {
				// run net conf commands
				console.log(['net', 'conf', 'delshare', share.name]);
				this.shares = this.shares.filter((a) => a !== share);
			} catch (err) {
				alert(err);
			}
		},
		async addShare(share) {
			try {
				// run net conf commands
				console.log(['net', 'conf', 'addshare', share.name, share.path]);
				await this.applyShareChanges(null, share);
				this.shares = [...this.shares, share];
			} catch (err) {
				alert(err);
			}
			this.showAddShare = false;
		},
		async updateShare(share, newShare) {
			try {
				// run net conf commands
				await this.applyShareChanges(share, newShare);
				Object.assign(share, newShare);
			} catch (err) {
				alert(err);
			}
		},
		async applyShareChanges(share, newShare) {
			let add, remove;
			({ add, remove } = generateConfDiff(share, newShare));
			add.forEach((args) => {
				console.log(['net', 'conf', 'setparm', newShare.name, ...args]);
			});
			remove.forEach((args) => {
				console.log(['net', 'conf', 'delparm', newShare.name, ...args]);
			});
		},
	}
}
</script>

<style scoped>
.samba-share-management {
	display: flex;
	flex-direction: column;
	padding: 5px;
	background-color: white;
	border: 1px solid lightgrey;
	border-radius: 5px;
}

.header {
	display: flex;
	flex-direction: row;
	justify-content: space-between;
	align-items: baseline;
	padding: 0 10px 0 10px;
}

.header > div > button {
	background-color: white;
	color: green;
	border-color: green;
}

.header > div > button:hover {
	background-color: lightgreen;
}

.list {
	background-color: white;
	display: flex;
	flex-direction: column;
	overflow: auto;
}
</style>

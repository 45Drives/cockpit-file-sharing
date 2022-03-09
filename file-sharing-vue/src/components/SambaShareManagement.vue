<template>
	<div class="samba-share-management">
		<div class="header">
			<h2>Share Management</h2>
			<button @click="showAddShare = !showAddShare">{{ showAddShare ? 'Cancel' : 'Add Share' }}</button>
		</div>
		<div>
			<SambaShareEditor v-if="showAddShare" @apply-share="addShare"/>
		</div>
		<div class="list">
			<SambaShare v-for="(share, index) in shares" :share="share" @delete-share="deleteShare" @update-share="updateShare"/>
		</div>
	</div>
</template>

<script>
import SambaShare from "./SambaShare.vue";
import SambaShareEditor from "./SambaShareEditor.vue";
export default {
    data() {
        return {
            shares: [],
			showAddShare: false,
        };
    },
    created() {
        this.shares = [
            {
                name: "test1",
				description: "Test 1",
				path: "/test/1",
				windowsAcls: "no",
				validUsers: "root @wheel",
				guestOk: "no",
				readOnly: "no",
				browsable: "yes",
				advancedSettings: ""
            },
			{
                name: "test2",
				description: "Test 2",
				path: "/test/2",
				windowsAcls: "no",
				validUsers: "",
				guestOk: "no",
				readOnly: "no",
				browsable: "yes",
				advancedSettings: ""
            },
			{
                name: "test3",
				description: "Test 3",
				path: "/test/3",
				windowsAcls: "no",
				validUsers: "",
				guestOk: "no",
				readOnly: "no",
				browsable: "yes",
				advancedSettings: ""
            },
        ];
		this.shares.sort((a, b) => a.name.localeCompare(b.name));
    },
    components: { SambaShare, SambaShareEditor },
	methods: {
		deleteShare(share) {
			if(!confirm("Are you sure?"))
				return;
			// run net conf commands
			this.shares = this.shares.filter((a) => a !== share);
		},
		async addShare(share) {
			// run net conf commands
			await this.applyShareChanges(null, share);
			this.shares = [...this.shares, share];
			this.showAddShare = false;
		},
		async updateShare(share, newShare) {
			// run net conf commands
			await this.applyShareChanges(share, newShare);
			Object.assign(share, newShare);
		},
		async applyShareChanges(share, newShare) {
			this.generateShareConfDiff(share, newShare).forEach((args) => {
				console.log("net conf setparm " + args.map((arg) => arg !== "" && arg.indexOf(' ') === -1 ? arg : `"${arg}"`).join(" "));
			});
		},
		generateShareConfDiff(share, newShare) {
			let confDiff = [];
			Object.keys(newShare).filter((key) => key !== 'name').forEach((key) => {
				if (share === null || newShare[key] !== share[key]) {
					confDiff.push([newShare.name, key.replace(/([A-Z])/g, " $1").toLowerCase(), newShare[key]]);
				}
			})
			return confDiff;
		}
	}
}
</script>

<style>
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

button {
	font-weight: bold;
	border: 1px solid;
	border-radius: 5px;
	margin: 2px;
	display: inline-block;
	width: 100px;
	padding: 5px;
	background-color: white;
	color: rgb(79, 79, 255);
	border-color: rgb(79, 79, 255);
	box-sizing: border-box;
}

button:hover {
	cursor: pointer;
	border-width: 2px;
	margin-top: 1px;
	margin-bottom: 1px;
	background-color: rgb(210, 210, 255);
}

.header > button {
	background-color: white;
	color: green;
	border-color: green;
}

.header > button:hover {
	background-color: lightgreen;
}

.list {
	background-color: white;
	display: flex;
	flex-direction: column;
	overflow: auto;
}

.clickable:hover {
	cursor: pointer;
}
</style>

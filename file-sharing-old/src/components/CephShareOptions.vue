<template>
    <div>
        <!--  -->
        <div
            v-if="isCeph && cephNotRemounted && share !== null"
            class="feedback-group"
        >
            <ExclamationIcon class="size-icon icon-warning" />
            <span class="text-feedback text-warning">Ceph filesystem not remounted at share.</span>
            <button
                class="text-feedback text-warning underline"
                @click="remountCeph()"
                :disabled="cephOptions.fixMountRunning"
            >Fix now</button>
            <InfoTip>
                When creating a Ceph share, a new filesystem mount point is created on top of the share directory.
                This is needed for Windows to properly report quotas through Samba.
            </InfoTip>
            <LoadingSpinner
                v-if="cephOptions.fixMountRunning"
                class="ml-2 size-icon"
            />
        </div>
        <!--  -->
        <div
            v-if="isCeph && cephNotRemounted && share === null"
            class="flex flex-row items-center"
        >
            <LabelledSwitch
                v-model="cephOptions.enableRemount"
                class="grow sm:grow-0"
            >
                <span class="inline-flex items-center">
                    <span>Enable Ceph remount</span>
                    <InfoTip>
                        When creating a Ceph share, a new filesystem mount point is created on top of the share
                        directory.
                        This is needed for Windows to properly report quotas through Samba.
                    </InfoTip>
                </span>
            </LabelledSwitch>
        </div>
        <!--  -->
        <div v-if="isCeph">
            <label class="block text-label">Ceph Quota</label>
            <div class="relative rounded-md shadow-sm inline">
                <input
                    type="number"
                    class="pr-12 input-textlike w-full sm:w-auto"
                    placeholder="0.00"
                    v-model="cephOptions.quotaValue"
                />
                <div class="absolute inset-y-0 right-0 flex items-center">
                    <label class="sr-only">Unit</label>
                    <select
                        class="input-textlike border-transparent bg-transparent"
                        v-model="cephOptions.quotaMultiplier"
                    >
                        <option :value="1024 ** 2">MiB</option>
                        <option :value="1024 ** 3">GiB</option>
                        <option :value="1024 ** 4">TiB</option>
                    </select>
                </div>
            </div>
            <div
                class="feedback-group"
                v-if="feedback.cephQuota"
            >
                <ExclamationCircleIcon class="size-icon icon-error" />
                <span class="text-feedback text-error">{{ feedback.cephQuota }}</span>
            </div>
        </div>
        <!--  -->
        <div v-if="isCeph">
            <label class="block text-label">Ceph Layout Pool</label>
            <select
                class="input-textlike disabled:cursor-not-allowed w-full sm:w-auto"
                v-model="cephOptions.layoutPool"
                :disabled="share !== null"
            >
                <option value>Select a Pool</option>
                <option
                    v-for="(pool, index) in cephLayoutPools"
                    :value="pool"
                >{{ pool }}</option>
            </select>
        </div>
        <!--  -->
        <ModalPopup
            :showModal="cephOptions.showMountOptionsModal"
            headerText="Ceph Remount Options"
            cancelText="Do not remount"
            @apply="cephOptions.mountOptionsApplyCallback"
            @cancel="cephOptions.mountOptionsCancelCallback"
        >
            <div class="block">Could not automatically determine options for remounting Ceph at share point. Enter
                options below.</div>
            <input
                type="text"
                class="w-full input-textlike"
                v-model="cephOptions.mountOptions"
            />
        </ModalPopup>
    </div>
</template>

<script setup>
import ModalPopup from './ModalPopup.vue';
import LoadingSpinner from './LoadingSpinner.vue';
import LabelledSwitch from './LabelledSwitch.vue';
import InfoTip from './InfoTip.vue';
import { ExclamationCircleIcon, ExclamationIcon } from '@heroicons/vue/solid';
import { ref, reactive, watch, inject } from 'vue';
import { canonicalPath, errorStringHTML, systemdUnitEscape, useSpawn } from '@45drives/cockpit-helpers';
import { notificationsInjectionKey } from '../keys';
import { splitQuotedDelim } from '../functions';

const props = defineProps({
    share: {
        type: Object,
        required: true,
    },
    tmpShare: {
        type: Object,
        required: true,
    },
    pathExists: {
        type: Boolean,
        required: true,
    },
    shares: {
        type: Array[Object],
        required: true,
    },
    cephLayoutPools: {
        type: Array[String],
        required: true,
    },
    gatewayHosts: {
        type: Array[String],
        required: true,
    },
    vipProvider: {
        type: String,
        required: true,
    },
});

const notifications = inject(notificationsInjectionKey);

const isCeph = ref(false);

const cephNotRemounted = ref(false);

const feedback = reactive({});

const cephOptions = reactive({
    quotaValue: 0,
    quotaMultiplier: 0,
    layoutPool: '',
    enableRemount: true,
    fixMountRunning: false,
    showMountOptionsModal: false,
    mountOptions: 'name=nfs,secretfile=/etc/ceph/nfs.secret,_netdev',
    mountOptionsAsk: () => {
        return new Promise((resolve, reject) => {
            const respond = (handle, response) => {
                cephOptions.showMountOptionsModal = false;
                handle(response);
            };
            cephOptions.mountOptionsApplyCallback = () => respond(resolve, cephOptions.mountOptions);
            cephOptions.mountOptionsCancelCallback = () => respond(reject);
            cephOptions.showMountOptionsModal = true;
        });
    },
    mountOptionsApplyCallback: () => { },
    mountOptionsCancelCallback: () => { },
});

const checkIfCeph = async () => {
    if (!props.tmpShare.path) return;

    try {
        const cephXattr = await useSpawn(['getfattr', '-n', 'ceph.dir.rctime', props.tmpShare.path], { superuser: 'try' }).promise();

        if (cephXattr.stdout !== '') {
            isCeph.value = true;
        } else {
            isCeph.value = false;
        }
    } catch (state) {
        console.log(state);
        isCeph.value = false;
    }
};

const getCephQuota = async () => {
    try {
        const quotaBytes = Number(
            (
                await useSpawn(
                    [
                        'getfattr',
                        '-n',
                        'ceph.quota.max_bytes',
                        '--only-values',
                        '--absolute-names',
                        props.tmpShare.path,
                    ],
                    { superuser: 'try' }
                ).promise()
            ).stdout
        );
        if (quotaBytes !== 0) {
            const base = 1024;
            let exp = Math.floor(Math.log(quotaBytes) / Math.log(base));
            exp = Math.min(Math.max(exp, 2), 4); // limit to MiB - TiB
            cephOptions.quotaMultiplier = base ** exp;
            cephOptions.quotaValue = quotaBytes / cephOptions.quotaMultiplier;
            return;
        }
    } catch (err) { /* ignore */ }
    cephOptions.quotaValue = 0;
    cephOptions.quotaMultiplier = 1024 ** 3; // default to GiB
};

const getCephLayoutPool = async () => {
    try {
        cephOptions.layoutPool = (
            await useSpawn(
                [
                    'getfattr',
                    '-n',
                    'ceph.dir.layout.pool',
                    '--only-values',
                    '--absolute-names',
                    props.tmpShare.path,
                ],
                { superuser: 'try' }
            ).promise()
        ).stdout;
    } catch (err) {
        cephOptions.layoutPool = "";
    }
};

const setCephQuota = async () => {
    try {
        const quotaBytes = Math.ceil(cephOptions.quotaValue * cephOptions.quotaMultiplier);
        if (quotaBytes) {
            // set quota
            await useSpawn(
                ['setfattr', '-n', 'ceph.quota.max_bytes', '-v', quotaBytes.toString(), props.tmpShare.path],
                { superuser: 'try' }
            ).promise();
        } else {
            // remove quota
            try {
                await useSpawn(
                    ['setfattr', '-x', 'ceph.quota.max_bytes', props.tmpShare.path],
                    { superuser: 'try' }
                ).promise();
            } catch { /* ignore failure if xattr DNE */ }
        }
        getCephQuota();
    } catch (state) {
        notifications.value.constructNotification("Failed to set Ceph quota", errorStringHTML(state), 'error');
    }
};

const setCephLayoutPool = async () => {
    try {
        if (cephOptions.layoutPool) {
            await useSpawn(
                ['setfattr', '-n', 'ceph.dir.layout.pool', '-v', cephOptions.layoutPool, props.tmpShare.path],
                { superuser: 'try' }
            ).promise();
        }
        getCephLayoutPool();
    } catch (state) {
        notifications.value.constructNotification("Failed to set Ceph layout pool", errorStringHTML(state), 'error');
    }
};

const checkCephRemount = async () => {
    try {
        cephNotRemounted.value =
            !(new RegExp(`^${canonicalPath(props.tmpShare.path)}$`, 'mg'))
                .test(
                    (await useSpawn(['df', '--output=target'], { superuser: 'try' }).promise()).stdout
                );
    } catch (state) {
        notifications.value.constructNotification("Failed to determine if Ceph was remounted", errorStringHTML(state), 'error');
        cephNotRemounted.value = true;
    }
};

const getCephMountOpts = async (mainFsMount) => {
    try {
        /**
            * @type {string[]}
            */
        const fstabRecords = (await cockpit.file('/etc/fstab', { superuser: 'try' }).read())
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && line[0] !== '#');
        for (const record of fstabRecords) {
            const [_fsSource, mountPoint, fsType, options, _dump, _pass] = splitQuotedDelim(record, '\t ');
            if (fsType === 'ceph' && mountPoint === mainFsMount) {
                cephOptions.value = options;
                return options;
            }
        }
        throw new Error(`No matches in fstab with type==ceph and mountpoint==${mainFsMount}`);
    } catch (error) {
        notifications.value.constructNotification("Failed to determine Ceph mount options", error.message, 'warning');
        try {
            return (await cephOptions.mountOptionsAsk());
        } catch {
            throw new Error("Cancelled by user");
        }
    }
};

const remountCeph = async () => {
    cephOptions.fixMountRunning = true;
    try {
        const sharePath = canonicalPath(props.tmpShare.path);
        const unitName = systemdUnitEscape(props.tmpShare.path, true);
        const systemdMountFile =
            `/etc/systemd/system/${unitName}.mount`;
        const df = (await useSpawn(['df', '--output=source,target', sharePath], { superuser: 'try' }).promise()).stdout.split('\n')[1];
        let mainFsSrc, mainFsTgt, remainder;
        [mainFsSrc, mainFsTgt, ...remainder] = splitQuotedDelim(df, '\t ');
        if (canonicalPath(mainFsTgt) === canonicalPath(sharePath))
            return;
        const fsLeaf = sharePath.slice(mainFsTgt.length);
        const newFsSrc = canonicalPath(mainFsSrc + fsLeaf);
        const systemdMountContents =
            `[Unit]
DefaultDependencies=no
After=remote-fs-pre.target
After=network.target
Wants=network.target
After=network-online.target
Wants=network-online.target
Conflicts=umount.target
Before=umount.target
Before=${props.vipProvider}.service
Description=share remount created by cockpit-file-sharing

[Mount]
What=${newFsSrc}
Where=${props.tmpShare.path}
LazyUnmount=true
Type=ceph
Options=${await getCephMountOpts(mainFsTgt)}

[Install]
WantedBy=remote-fs.target
`;

        if (props.gatewayHosts?.length) {
            for (const host of props.gatewayHosts) {
                await cockpit.file(systemdMountFile, { superuser: 'try', host }).replace(systemdMountContents);
                await useSpawn(['systemctl', 'enable', '--now', systemdMountFile], { superuser: 'try', host }).promise();
            }
        } else {
            await cockpit.file(systemdMountFile, { superuser: 'try' }).replace(systemdMountContents);
            await useSpawn(['systemctl', 'enable', '--now', systemdMountFile], { superuser: 'try' }).promise();
        }
        notifications.value.constructNotification("Success", "Successfully set up Ceph remount for share", 'success');
    } catch (state) {
        notifications.value.constructNotification("Failed to set up Ceph systemd mount for share", errorStringHTML(state), 'error');
    } finally {
        cephOptions.fixMountRunning = false;
        checkCephRemount();
    }
};

const applyCeph = async (force = false) => {
    if (!isCeph.value)
        return;
    const procs = [];
    procs.push(setCephQuota());
    if (force || props.share === null) { // only run if creating new share
        procs.push(setCephLayoutPool());
        if (cephNotRemounted.value && cephOptions.enableRemount)
            procs.push(remountCeph());
    }
    await Promise.all(procs);
};

const removeCephMount = async () => {
    const isRemount = async (systemdMountFile, host) => {
        const opts = { superuser: 'try' };
        if (host)
            opts.host = host;
        const mountContent = await cockpit.file(systemdMountFile, opts).read();
        if (!mountContent)
            return false; // assuming mount unit file DNE, so not remount
        if (/share remount created by cockpit-file-sharing$/mg.test(mountContent))
            return true; // remount generated by cockpit-file-sharing
        return false; // not generated by cockpit-file-sharing
    };
    try {
        const systemdMountUnit = `${systemdUnitEscape(props.tmpShare.path, true)}.mount`;
        const systemdMountFile = `/etc/systemd/system/${systemdMountUnit}`;
        if (props.gatewayHosts?.length) {
            for (const host of props.gatewayHosts) {
                if (!(await isRemount(systemdMountFile, host)))
                    continue;
                await useSpawn(['systemctl', 'disable', '--now', systemdMountUnit], { superuser: 'try', host }).promise();
                await cockpit.file(systemdMountFile, { superuser: 'try', host }).replace(null);
            }
        } else {
            if (!(await isRemount(systemdMountFile)))
                return;
            await useSpawn(['systemctl', 'disable', '--now', systemdMountUnit], { superuser: 'try' }).promise();
            await cockpit.file(systemdMountFile, { superuser: 'try' }).replace(null);
        }
    } catch (state) {
        notifications.value.constructNotification("Failed to remove Ceph systemd mount for share", errorStringHTML(state), 'error');
    }
};

watch([() => props.tmpShare.path, () => props.pathExists], async () => {
    if (!props.pathExists) return;

    await checkIfCeph();

    if (isCeph.value) {
        getCephQuota();
        getCephLayoutPool();
        checkCephRemount();
    }
});

watch(() => cephOptions.quotaValue, () => {
    if (isCeph.value) {
        if (!/^\d+(?:\.\d*)?$/.test(cephOptions.quotaValue)) {
            feedback.cephQuota = "Invalid number format.";
            result = false;
        } else {
            feedback.cephQuota = "";
        }
    }
});

defineExpose({
    isCeph,
    options: cephOptions,
    applyCeph,
    removeCephMount,
    cephNotRemounted,
});

</script>
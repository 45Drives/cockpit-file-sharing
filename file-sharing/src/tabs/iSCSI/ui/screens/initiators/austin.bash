#!/bin/bash
#
#
#   iSCSILogicalUnit OCF RA. Exports and manages iSCSI Logical Units.
#
#   (c) 2013 LINBIT, Lars Ellenberg
#   (c) 2009-2010 Florian Haas, Dejan Muhamedagic,
#       and Linux-HA contributors
#
#
# This program is free software; you can redistribute it and/or modify
# it under the terms of version 2 of the GNU General Public License as
# published by the Free Software Foundation.
#
# This program is distributed in the hope that it would be useful, but
# WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
#
# Further, this software is distributed without any warranty that it is
# free of the rightful claim of any third person regarding infringement
# or the like.  Any license provided herein, whether implied or
# otherwise, applies only to this software file.  Patent licenses, if
# any, provided herein do not apply to combinations of this program with
# other software, or any other product whatsoever.
#
# You should have received a copy of the GNU General Public License
# along with this program; if not, write the Free Software Foundation,
# Inc., 59 Temple Place - Suite 330, Boston MA 02111-1307, USA.
#

#######################################################################
# Initialization:
: ${OCF_FUNCTIONS_DIR=${OCF_ROOT}/lib/heartbeat}
. ${OCF_FUNCTIONS_DIR}/ocf-shellfuncs

# Defaults
# Set a default implementation based on software installed
if have_binary ietadm; then
	OCF_RESKEY_implementation_default="iet"
elif have_binary tgtadm; then
	OCF_RESKEY_implementation_default="tgt"
elif have_binary lio_node; then
	OCF_RESKEY_implementation_default="lio"
elif have_binary targetcli; then
	OCF_RESKEY_implementation_default="lio-t"
elif have_binary scstadmin; then
	OCF_RESKEY_implementation_default="scst"
fi
: ${OCF_RESKEY_implementation=${OCF_RESKEY_implementation_default}}

# Use a default SCSI ID and SCSI SN that is unique across the cluster,
# and persistent in the event of resource migration.
# SCSI IDs are limited to 24 bytes, but only 16 bytes are known to be
# supported by all iSCSI implementations this RA cares about. Thus,
# for a default, use the first 16 characters of
# $OCF_RESOURCE_INSTANCE.
OCF_RESKEY_scsi_id_default="${OCF_RESOURCE_INSTANCE:0:16}"
: ${OCF_RESKEY_scsi_id=${OCF_RESKEY_scsi_id_default}}
# To have a reasonably unique default SCSI SN, use the first 8 bytes
# of an MD5 hash of of $OCF_RESOURCE_INSTANCE
sn=`echo -n "${OCF_RESOURCE_INSTANCE}" | md5sum | sed -e 's/ .*//'`
OCF_RESKEY_scsi_sn_default=${sn:0:8}
: ${OCF_RESKEY_scsi_sn=${OCF_RESKEY_scsi_sn_default}}
OCF_RESKEY_allowed_initiators_default=""
: ${OCF_RESKEY_allowed_initiators=${OCF_RESKEY_allowed_initiators_default}}
# set 0 as a default value for lio iblock device number
OCF_RESKEY_lio_iblock_default=0
OCF_RESKEY_lio_iblock=${OCF_RESKEY_lio_iblock:-$OCF_RESKEY_lio_iblock_default}
# Set LIO-T backend default as 'block'
OCF_RESKEY_liot_bstype_default="block"
: ${OCF_RESKEY_liot_bstype=${OCF_RESKEY_liot_bstype_default}}

## tgt specifics
# tgt has "backing store type" and "backing store open flags",
# as well as device-type.
#
# suggestions how to make this generic accross all supported implementations?
# how should they be named, how should they be mapped to implementation specifics?
# # Conversation: Due to the phase out of most implementations other than lio-t
# # I have decided to use specific implementation of tgt_bstype like key for
# # lio-t.
#
# OCF_RESKEY_tgt_bstype
# OCF_RESKEY_tgt_bsoflags
# OCF_RESKEY_tgt_bsopts
# OCF_RESKEY_tgt_device_type

# targetcli: iSCSITarget and iSCSILogicalUnit must use the same lockfile
TARGETLOCKFILE=${HA_RSCTMP}/targetcli.lock
#######################################################################

meta_data() {
	cat <<END
<?xml version="1.0"?>
<!DOCTYPE resource-agent SYSTEM "ra-api-1.dtd">
<resource-agent name="iSCSILogicalUnit" version="0.9">
<version>1.0</version>

<longdesc lang="en">
Manages iSCSI Logical Unit. An iSCSI Logical unit is a subdivision of
an SCSI Target, exported via a daemon that speaks the iSCSI protocol.
</longdesc>
<shortdesc lang="en">Manages iSCSI Logical Units (LUs)</shortdesc>

<parameters>
<parameter name="implementation" required="0" unique="0">
<longdesc lang="en">
The iSCSI target daemon implementation. Must be one of "iet", "tgt",
"lio", "lio-t", or "scst".  If unspecified, an implementation is selected based on the
availability of management utilities, with "iet" being tried first,
then "tgt", then "lio", then "lio-t", then "scst".
</longdesc>
<shortdesc lang="en">iSCSI target daemon implementation</shortdesc>
<content type="string" default="${OCF_RESKEY_implementation_default}"/>
</parameter>

<parameter name="target_iqn" required="1" unique="0">
<longdesc lang="en">
The iSCSI Qualified Name (IQN) that this Logical Unit belongs to.
</longdesc>
<shortdesc lang="en">iSCSI target IQN</shortdesc>
<content type="string" />
</parameter>

<parameter name="lun" required="1" unique="0">
<longdesc lang="en">
The Logical Unit number (LUN) exposed to initiators.
</longdesc>
<shortdesc lang="en">Logical Unit number (LUN)</shortdesc>
<content type="integer" />
</parameter>

<parameter name="path" required="1" unique="0">
<longdesc lang="en">
The path to the block device exposed. Some implementations allow this
to be a regular file, too.
</longdesc>
<shortdesc lang="en">Block device (or file) path</shortdesc>
<content type="string" />
</parameter>

<parameter name="scsi_id" required="0" unique="1">
<longdesc lang="en">
The SCSI ID to be configured for this Logical Unit. The default
is the resource name, truncated to 24 bytes.
</longdesc>
<shortdesc lang="en">SCSI ID</shortdesc>
<content type="string" default="${OCF_RESKEY_scsi_id_default}"/>
</parameter>

<parameter name="scsi_sn" required="0" unique="1">
<longdesc lang="en">
The SCSI serial number to be configured for this Logical Unit.
The default is a hash of the resource name, truncated to 8 bytes,
meaning 26 hex characters.
If you are using XenServer with multipath as iSCSI client, you
MUST make sure this value is set, or else XenServer multipath will
not be able to access the LUN
</longdesc>
<shortdesc lang="en">SCSI serial number</shortdesc>
<content type="string" default="${OCF_RESKEY_scsi_sn_default}"/>
</parameter>

<parameter name="emulate_tpu" required="0" unique="0">
<longdesc lang="en">
The SCSI UNMAP command to be configured for this Logical Unit.
Setting this integer to 1 will enable TPU IOCTL emulation.
</longdesc>
<shortdesc lang="en">SCSI UNMAP (for TRIM / DISCARD)</shortdesc>
<content type="integer" />
</parameter>

<parameter name="emulate_3pc" required="0" unique="0">
<longdesc lang="en">
The SCSI EXTENDED COPY command to be configured for this Logical Unit.
Setting this integer to 1 will enable 3PC IOCTL emulation.
</longdesc>
<shortdesc lang="en">SCSI extended write</shortdesc>
<content type="integer" />
</parameter>

<parameter name="emulate_caw" required="0" unique="0">
<longdesc lang="en">
The SCSI Compare and Write command to be configured for this Logical Unit.
Setting this integer to 1 will enable CAW IOCTL emulation.
</longdesc>
<shortdesc lang="en">SCSI compare and write</shortdesc>
<content type="integer" />
</parameter>

<parameter name="vendor_id" required="0" unique="0">
<longdesc lang="en">
The SCSI vendor ID to be configured for this Logical Unit.
</longdesc>
<shortdesc lang="en">SCSI vendor ID</shortdesc>
<content type="string" />
</parameter>

<parameter name="product_id" required="0" unique="0">
<longdesc lang="en">
The SCSI product ID to be configured for this Logical Unit.
</longdesc>
<shortdesc lang="en">SCSI product ID</shortdesc>
<content type="string" />
</parameter>

<parameter name="tgt_bstype" required="0" unique="0">
<longdesc lang="en">
TGT specific backing store type. If you want to use aio,
make sure your tgtadm is built against libaio.
See tgtadm(8).
</longdesc>
<shortdesc lang="en">TGT backing store type</shortdesc>
<content type="string" />
</parameter>

<parameter name="tgt_bsoflags" required="0" unique="0">
<longdesc lang="en">
TGT specific backing store open flags (direct|sync).
See tgtadm(8).
</longdesc>
<shortdesc lang="en">TGT backing store open flags</shortdesc>
<content type="string" />
</parameter>

<parameter name="tgt_bsopts" required="0" unique="0">
<longdesc lang="en">
TGT specific backing store options.
See tgtadm(8).
</longdesc>
<shortdesc lang="en">TGT backing store options</shortdesc>
<content type="string" />
</parameter>

<parameter name="tgt_device_type" required="0" unique="0">
<longdesc lang="en">
TGT specific device type.
See tgtadm(8).
</longdesc>
<shortdesc lang="en">TGT device type</shortdesc>
<content type="string" />
</parameter>

<parameter name="additional_parameters" required="0" unique="0">
<longdesc lang="en">
Additional LU parameters. A space-separated list of "name=value" pairs
which will be passed through to the iSCSI daemon's management
interface. The supported parameters are implementation
dependent. Neither the name nor the value may contain whitespace.
</longdesc>
<shortdesc lang="en">List of iSCSI LU parameters</shortdesc>
<content type="string" />
</parameter>

<parameter name="allowed_initiators" required="0" unique="0">
<longdesc lang="en">
Allowed initiators. A space-separated list of initiators allowed to
connect to this lun. Initiators may be listed in any syntax
the target implementation allows. If this parameter is empty or
not set, access to this lun will not be allowed from any initiator,
if target is not in demo mode.

This parameter is only necessary when using LIO.
</longdesc>
<shortdesc lang="en">List of iSCSI initiators allowed to connect
to this lun.</shortdesc>
<content type="string" default="${OCF_RESKEY_allowed_initiators_default}"/>
</parameter>

<parameter name="lio_iblock" required="0" unique="0">
<longdesc lang="en">
LIO iblock device name, a number starting from 0.

Using distinct values here avoids a warning in LIO "LEGACY: SHARED HBA";
and it is necessary when using multiple LUNs started at the same time
(eg. on node failover) to prevent a race condition in tcm_core on mkdir()
in /sys/kernel/config/target/core/.
</longdesc>
<shortdesc lang="en">LIO iblock device number</shortdesc>
<content type="integer" default="${OCF_RESKEY_lio_iblock_default}"/>
</parameter>

<parameter name="liot_bstype" required="0" unique="0">
<longdesc lang="en">
LIO-T specific backing store type. If you want to use aio,
set this to 'block'. If you want to use async IO, set this to 'fileio'.
Async I/O works also with block devices, however - you need to understand
the consequences. See targetcli(8). If using file backend, you need to create this file in
advance.
If you want to use SCSI Passthrough, set this to 'pscsi'.
Do not use PSCSI unless you know exactly how it will be used. 
</longdesc>
<shortdesc lang="en">LIO-T backing store type</shortdesc>
<content type="string" default="${OCF_RESKEY_liot_bstype_default}"/>
</parameter>

</parameters>

<actions>
<action name="start"         timeout="10s" />
<action name="stop"          timeout="10s" />
<action name="status"        timeout="10s" interval="10s" depth="0" />
<action name="monitor"       timeout="10s" interval="10s" depth="0" />
<action name="meta-data"     timeout="5s" />
<action name="validate-all"  timeout="10s" />
</actions>
</resource-agent>
END
}

#######################################################################

iSCSILogicalUnit_usage() {
	cat <<END
usage: $0 {start|stop|status|monitor|validate-all|meta-data}

Expects to have a fully populated OCF RA-compliant environment set.
END
}

iSCSILogicalUnit_start() {
	iSCSILogicalUnit_monitor
	if [ $? =  $OCF_SUCCESS ]; then
		return $OCF_SUCCESS
	fi

	local params

	case $OCF_RESKEY_implementation in
	iet)
		params="Path=${OCF_RESKEY_path}"
		# use blockio if path points to a block device, fileio
		# otherwise.
		if [ -b "${OCF_RESKEY_path}" ]; then
			params="${params} Type=blockio"
		else
			params="${params} Type=fileio"
		fi
		# in IET, we have to set LU parameters on creation
		if [ -n "${OCF_RESKEY_scsi_id}" ]; then
			params="${params} ScsiId=${OCF_RESKEY_scsi_id}"
		fi
		if [ -n "${OCF_RESKEY_scsi_sn}" ]; then
			params="${params} ScsiSN=${OCF_RESKEY_scsi_sn}"
		fi
		params="${params} ${OCF_RESKEY_additional_parameters}"
		ocf_run ietadm --op new \
			--tid=${TID} \
			--lun=${OCF_RESKEY_lun} \
			--params ${params// /,} || exit $OCF_ERR_GENERIC
		;;
	tgt)
		# tgt requires that we create the LU first, then set LU
		# parameters
		params=""
		local var
		local envar
		for var in scsi_id scsi_sn vendor_id product_id; do
			envar="OCF_RESKEY_${var}"
			if [ -n "${!envar}" ]; then
				params="${params} ${var}=${!envar}"
			fi
		done
		params="${params} ${OCF_RESKEY_additional_parameters}"

		# cleanup: tgt (as of tgtadm version 1.0.24) does not like an explicit "bsoflags=direct"
		# when used with "bstype=aio" (which always uses O_DIRECT)
		[[ $OCF_RESKEY_tgt_bstype/$OCF_RESKEY_tgt_bsoflags = "aio/direct" ]] && OCF_RESKEY_tgt_bsoflags=""

		tgt_args=""
		[[ $OCF_RESKEY_tgt_bstype ]]	&& tgt_args="$tgt_args --bstype=$OCF_RESKEY_tgt_bstype"
		[[ $OCF_RESKEY_tgt_bsoflags ]]	&& tgt_args="$tgt_args --bsoflags=$OCF_RESKEY_tgt_bsoflags"
		[[ $OCF_RESKEY_tgt_bsopts ]]	&& tgt_args="$tgt_args --bsopts=$OCF_RESKEY_tgt_bsopts"
		[[ $OCF_RESKEY_tgt_device_type ]]	&& tgt_args="$tgt_args --device-type=$OCF_RESKEY_tgt_device_type"

		ocf_run tgtadm --lld iscsi --op new --mode logicalunit \
			--tid=${TID} \
			--lun=${OCF_RESKEY_lun} \
			$tgt_args \
			--backing-store ${OCF_RESKEY_path} || exit $OCF_ERR_GENERIC
		if [ -z "$params" ]; then
			return $OCF_SUCCESS
		else
			ocf_run tgtadm --lld iscsi --op update --mode logicalunit \
				--tid=${TID} \
				--lun=${OCF_RESKEY_lun} \
				--params ${params// /,} || exit $OCF_ERR_GENERIC
		fi
		;;
	lio)
		# For lio, we first have to create a target device, then
		# add it to the Target Portal Group as an LU.

		block_configfs_path="/sys/kernel/config/target/core/iblock_${OCF_RESKEY_lio_iblock}/${OCF_RESOURCE_INSTANCE}/udev_path"
		if [ ! -e "${block_configfs_path}" ]; then
			ocf_run tcm_node --createdev=iblock_${OCF_RESKEY_lio_iblock}/${OCF_RESOURCE_INSTANCE} \
				${OCF_RESKEY_path} || exit $OCF_ERR_GENERIC
		elif [ -e "$block_configfs_path" ] && [ $(cat "$block_configfs_path") != "${OCF_RESKEY_path}" ]; then
			ocf_exit_reason "Existing iblock_${OCF_RESKEY_lio_iblock}/${OCF_RESOURCE_INSTANCE} has incorrect path: $(cat "$block_configfs_path") != ${OCF_RESKEY_path}"
			exit $OCF_ERR_GENERIC
		else
			ocf_log info "iscsi iblock already exists: ${block_configfs_path}"
		fi

		if [ -n "${OCF_RESKEY_scsi_sn}" ]; then
			ocf_run tcm_node --setunitserial=iblock_${OCF_RESKEY_lio_iblock}/${OCF_RESOURCE_INSTANCE} \
				${OCF_RESKEY_scsi_sn} || exit $OCF_ERR_GENERIC
		fi

		lun_configfs_path="/sys/kernel/config/target/iscsi/${OCF_RESKEY_target_iqn}/tpgt_1/lun/lun_${OCF_RESKEY_lun}/${OCF_RESOURCE_INSTANCE}/udev_path"
		if [ ! -e "${lun_configfs_path}" ]; then
			ocf_run lio_node --addlun=${OCF_RESKEY_target_iqn} 1 ${OCF_RESKEY_lun} \
				${OCF_RESOURCE_INSTANCE} iblock_${OCF_RESKEY_lio_iblock}/${OCF_RESOURCE_INSTANCE} || exit $OCF_ERR_GENERIC
		else
			ocf_log info "iscsi lun already exists: ${lun_configfs_path}"
		fi

		if [ -n "${OCF_RESKEY_allowed_initiators}" ]; then
			for initiator in ${OCF_RESKEY_allowed_initiators}; do
				acl_configfs_path="/sys/kernel/config/target/iscsi/${OCF_RESKEY_target_iqn}/tpgt_1/acls/${initiator}/lun_${OCF_RESKEY_lun}"
				if [ ! -e "${acl_configfs_path}" ]; then
					ocf_run lio_node --addlunacl=${OCF_RESKEY_target_iqn} 1 \
					${initiator} ${OCF_RESKEY_lun} ${OCF_RESKEY_lun} || exit $OCF_ERR_GENERIC
				else
					ocf_log info "iscsi acl already exists: ${acl_configfs_path}"
				fi
			done
		fi
		;;
	lio-t)
		ocf_take_lock $TARGETLOCKFILE
		ocf_release_lock_on_exit $TARGETLOCKFILE
		iblock_attrib_path="/sys/kernel/config/target/core/iblock_*/${OCF_RESOURCE_INSTANCE}/attrib"
		# For lio, we first have to create a target device, then
		# add it to the Target Portal Group as an LU.
		# Handle differently 'block', 'fileio' and 'pscsi'
		if [ "${OCF_RESKEY_liot_bstype}" = "block" ]
		then
			ocf_run targetcli /backstores/${OCF_RESKEY_liot_bstype} create name=${OCF_RESOURCE_INSTANCE} dev=${OCF_RESKEY_path} $(test -n "$OCF_RESKEY_scsi_sn" && echo "wwn=${OCF_RESKEY_scsi_sn}") || exit $OCF_ERR_GENERIC
		elif [ "${OCF_RESKEY_liot_bstype}" = "fileio" ]
		then
			ocf_run targetcli /backstores/${OCF_RESKEY_liot_bstype} create ${OCF_RESOURCE_INSTANCE} ${OCF_RESKEY_path} $(test -n "$OCF_RESKEY_scsi_sn" && echo "wwn=${OCF_RESKEY_scsi_sn}") || exit $OCF_ERR_GENERIC
		elif [ "${OCF_RESKEY_liot_bstype}" = "pscsi" ]
		then
			# pscsi don't use custom wwn because it's SCSI passthrough so scsi_generic device will report it's own wwn
			# so lets ignore provided serial in $OCF_RESKEY_scsi_sn
			ocf_run targetcli /backstores/${OCF_RESKEY_liot_bstype} create ${OCF_RESOURCE_INSTANCE} ${OCF_RESKEY_path} || exit $OCF_ERR_GENERIC
		fi
		if [ -n "${OCF_RESKEY_scsi_sn}" ]; then
			echo ${OCF_RESKEY_scsi_sn} > /sys/kernel/config/target/core/iblock_*/${OCF_RESOURCE_INSTANCE}/wwn/vpd_unit_serial
		fi
		if [ -n "${OCF_RESKEY_product_id}" ]; then
			echo "${OCF_RESKEY_product_id}" > /sys/kernel/config/target/core/iblock_*/${OCF_RESOURCE_INSTANCE}/wwn/product_id
		fi

		ocf_run targetcli /iscsi/${OCF_RESKEY_target_iqn}/tpg1/luns create /backstores/${OCF_RESKEY_liot_bstype}/${OCF_RESOURCE_INSTANCE} ${OCF_RESKEY_lun} || exit $OCF_ERR_GENERIC

		if $(ip a | grep -q inet6); then
			# Solving the 0.0.0.0 conversion to IPv6 when using specific portal addresses
			if $(ocf_run -q targetcli /iscsi/${OCF_RESKEY_target_iqn}/tpg1/portals | grep -q 0.0.0.0)
			then
				ocf_run -q targetcli /iscsi/${OCF_RESKEY_target_iqn}/tpg1/portals delete 0.0.0.0 3260
				ocf_run -q targetcli /iscsi/${OCF_RESKEY_target_iqn}/tpg1/portals create ::0
			fi
		fi

		if [ -n "${OCF_RESKEY_allowed_initiators}" ]; then
			for initiator in ${OCF_RESKEY_allowed_initiators}; do
				if [ -d "/sys/kernel/config/target/iscsi/${OCF_RESKEY_target_iqn}/tpgt_1/acls" ]  ;then
					if ! [ -d "/sys/kernel/config/target/iscsi/${OCF_RESKEY_target_iqn}/tpgt_1/acls/${initiator}" ];then
						ocf_run targetcli /iscsi/${OCF_RESKEY_target_iqn}/tpg1/acls create ${initiator} add_mapped_luns=False || exit $OCF_ERR_GENERIC
						ocf_run targetcli /iscsi/${OCF_RESKEY_target_iqn}/tpg1/acls/${initiator} create ${OCF_RESKEY_lun} ${OCF_RESKEY_lun} || exit $OCF_ERR_GENERIC
					fi  
				fi
			done
		fi

		if [ -n "${OCF_RESKEY_emulate_tpu}" ]; then
			echo ${OCF_RESKEY_emulate_tpu} > ${iblock_attrib_path}/emulate_tpu || exit $OCF_ERR_GENERIC
		fi
		if [ -n "${OCF_RESKEY_emulate_3pc}" ]; then
			echo ${OCF_RESKEY_emulate_3pc} > ${iblock_attrib_path}/emulate_3pc || exit $OCF_ERR_GENERIC
		fi
		if [ -n "${OCF_RESKEY_emulate_caw}" ]; then
			echo ${OCF_RESKEY_emulate_caw} > ${iblock_attrib_path}/emulate_caw || exit $OCF_ERR_GENERIC
		fi
		;;
	scst)
		ocf_run scstadmin -open_dev "${OCF_RESOURCE_INSTANCE}" -handler vdisk_blockio -attributes "filename=${OCF_RESKEY_path},nv_cache=0,write_through=1"
		if [ -n "${OCF_RESKEY_scsi_sn}" ]; then
			ocf_run scstadmin -set_dev_attr "${OCF_RESOURCE_INSTANCE}" -attributes "usn=${OCF_RESKEY_scsi_sn}" -force -noprompt
		fi
		if [ -n "${OCF_RESKEY_vendor_id}" ]; then
			ocf_run scstadmin -set_dev_attr "${OCF_RESOURCE_INSTANCE}" -attributes "t10_vend_id=${OCF_RESKEY_vendor_id}" -force -noprompt
		fi
		if [ -n "${OCF_RESKEY_product_id}" ]; then
			ocf_run scstadmin -set_dev_attr "${OCF_RESOURCE_INSTANCE}" -attributes "t10_dev_id=${OCF_RESKEY_product_id}" -force -noprompt
		fi
		if [ -d "/sys/kernel/scst_tgt/targets/iscsi/${OCF_RESKEY_target_iqn}/ini_groups/allowed/" ]; then
			# if an initiator group exists for the target, add the new LUN to it.
			ocf_run scstadmin -add_lun ${OCF_RESKEY_lun} -driver iscsi -target "${OCF_RESKEY_target_iqn}" -device "${OCF_RESOURCE_INSTANCE}" -group allowed -force -noprompt

		fi
		if [ ! -d "/sys/kernel/scst_tgt/targets/iscsi/${OCF_RESKEY_target_iqn}/ini_groups/allowed/" ]; then

		ocf_run scstadmin -add_lun ${OCF_RESKEY_lun} -driver iscsi -target "${OCF_RESKEY_target_iqn}" -device "${OCF_RESOURCE_INSTANCE}" $group_arg -force -noprompt
		fi
		;;
	esac

	# Force the monitor operation to pass before start is considered a success.
	iSCSILogicalUnit_monitor
}

iSCSILogicalUnit_stop() {
	iSCSILogicalUnit_monitor
	if [ $? -eq $OCF_NOT_RUNNING ]; then
		return $OCF_SUCCESS
	fi

	case $OCF_RESKEY_implementation in

	iet)
	# IET allows us to remove LUs while they are in use
	ocf_run ietadm --op delete \
		--tid=${TID} \
		--lun=${OCF_RESKEY_lun} || exit $OCF_ERR_GENERIC
		;;
	tgt)
		# tgt will fail to remove an LU while it is in use,
		# but at the same time does not allow us to
		# selectively shut down a connection that is using a
		# specific LU. Thus, we need to loop here until tgtd
		# decides that the LU is no longer in use, or we get
		# timed out by the LRM.
		while ! ocf_run -warn tgtadm --lld iscsi --op delete --mode logicalunit \
			--tid ${TID} \
			--lun=${OCF_RESKEY_lun}; do
			sleep 1
		done
		;;
	lio)

		acls_configfs_path="/sys/kernel/config/target/iscsi/${OCF_RESKEY_target_iqn}/tpgt_1/acls"
		for initiatorpath in ${acls_configfs_path}/*; do
			initiator=$(basename "${initiatorpath}")
			if [ -e "${initiatorpath}/lun_${OCF_RESKEY_lun}" ]; then
				ocf_log info "deleting acl at ${initiatorpath}/lun_${OCF_RESKEY_lun}"
				ocf_run lio_node --dellunacl=${OCF_RESKEY_target_iqn} 1 \
					${initiator} ${OCF_RESKEY_lun} || exit $OCF_ERR_GENERIC
			fi
		done
		lun_configfs_path="/sys/kernel/config/target/iscsi/${OCF_RESKEY_target_iqn}/tpgt_1/lun/lun_${OCF_RESKEY_lun}/"
		if [ -e "${lun_configfs_path}" ]; then
			ocf_run lio_node --dellun=${OCF_RESKEY_target_iqn} 1 ${OCF_RESKEY_lun} || exit $OCF_ERR_GENERIC
		fi
		block_configfs_path="/sys/kernel/config/target/core/iblock_${OCF_RESKEY_lio_iblock}/${OCF_RESOURCE_INSTANCE}/udev_path"
		if [ -e "${block_configfs_path}" ]; then
			ocf_run tcm_node --freedev=iblock_${OCF_RESKEY_lio_iblock}/${OCF_RESOURCE_INSTANCE} || exit $OCF_ERR_GENERIC
		fi
		;;
	lio-t)
		ocf_take_lock $TARGETLOCKFILE
		ocf_release_lock_on_exit $TARGETLOCKFILE
		# "targetcli delete" will fail if the LUN is already
		# gone. Log a warning and still push ahead.
		ocf_run -warn targetcli /iscsi/${OCF_RESKEY_target_iqn}/tpg1/luns delete ${OCF_RESKEY_lun}
		if [ -n "${OCF_RESKEY_allowed_initiators}" ]; then
			for initiator in ${OCF_RESKEY_allowed_initiators}; do
				if targetcli /iscsi/${OCF_RESKEY_target_iqn}/tpg1/acls/${initiator} status | grep "Mapped LUNs: 0" >/dev/null ; then
					ocf_run -warn targetcli /iscsi/${OCF_RESKEY_target_iqn}/tpg1/acls/ delete ${initiator}
				fi
			done
		fi

		# If we've proceeded down to here and we're unable to
		# delete the backstore, then something is seriously
		# wrong and we need to fail the stop operation
		# (potentially causing fencing)
		ocf_run targetcli /backstores/${OCF_RESKEY_liot_bstype} delete ${OCF_RESOURCE_INSTANCE} || exit $OCF_ERR_GENERIC
		;;
	scst)
		ocf_run -warn scstadmin -rem_lun ${OCF_RESKEY_lun} -driver iscsi -target "${OCF_RESKEY_target_iqn}" -force -noprompt
		ocf_run scstadmin -close_dev "${OCF_RESOURCE_INSTANCE}" -handler vdisk_blockio -force -noprompt
		;;
	esac

	return $OCF_SUCCESS
}

iSCSILogicalUnit_monitor() {
	if [ x"${OCF_RESKEY_tgt_bstype}" != x"rbd" ]; then
		# If our backing device (or file) doesn't even exist, we're not running
		[ -e ${OCF_RESKEY_path} ] || return $OCF_NOT_RUNNING
	fi

	case $OCF_RESKEY_implementation in
	iet)
		# Figure out and set the target ID
		TID=`sed -ne "s/tid:\([[:digit:]]\+\) name:${OCF_RESKEY_target_iqn}$/\1/p" < /proc/net/iet/volume`
		if [ -z "${TID}" ]; then
			# Our target is not configured, thus we're not
			# running.
			return $OCF_NOT_RUNNING
		fi
		# FIXME: this looks for a matching LUN and path, but does
		# not actually test for the correct target ID.
		grep -E -q "[[:space:]]+lun:${OCF_RESKEY_lun}.*path:${OCF_RESKEY_path}$" /proc/net/iet/volume && return $OCF_SUCCESS
		;;
	tgt)
		# Figure out and set the target ID
		TID=`tgtadm --lld iscsi --op show --mode target \
			| sed -ne "s/^Target \([[:digit:]]\+\): ${OCF_RESKEY_target_iqn}$/\1/p"`
		if [ -z "$TID" ]; then
			# Our target is not configured, thus we're not
			# running.
			return $OCF_NOT_RUNNING
		fi
		# This only looks for the backing store, but does not test
		# for the correct target ID and LUN.
		tgtadm --lld iscsi --op show --mode target \
			| grep -E -q "[[:space:]]+Backing store.*: ${OCF_RESKEY_path}$" && return $OCF_SUCCESS
		;;
	lio)
		configfs_path="/sys/kernel/config/target/iscsi/${OCF_RESKEY_target_iqn}/tpgt_1/lun/lun_${OCF_RESKEY_lun}/${OCF_RESOURCE_INSTANCE}/udev_path"
		[ -e ${configfs_path} ] && [ `cat ${configfs_path}` = "${OCF_RESKEY_path}" ] && return $OCF_SUCCESS

		# if we aren't activated, is a block device still left over?
		block_configfs_path="/sys/kernel/config/target/core/iblock_${OCF_RESKEY_lio_iblock}/${OCF_RESOURCE_INSTANCE}/udev_path"
		[ -e ${block_configfs_path} ] && ocf_log warn "existing block without an active lun: ${block_configfs_path}"
		[ -e ${block_configfs_path} ] && return $OCF_ERR_GENERIC

		;;
	lio-t)
		configfs_path="/sys/kernel/config/target/iscsi/${OCF_RESKEY_target_iqn}/tpgt_1/lun/lun_${OCF_RESKEY_lun}/*/udev_path"
		[ -e ${configfs_path} ] && [ `cat ${configfs_path}` = "${OCF_RESKEY_path}" ] && return $OCF_SUCCESS

		# if we aren't activated, is a block device still left over?
		block_configfs_path="/sys/kernel/config/target/core/iblock_*/${OCF_RESOURCE_INSTANCE}/udev_path"
		[ -e ${block_configfs_path} ] && ocf_log warn "existing block without an active lun: ${block_configfs_path}"
		[ -e ${block_configfs_path} ] && return $OCF_ERR_GENERIC
		;;
	scst)
		[ -d /sys/kernel/scst_tgt/devices/${OCF_RESOURCE_INSTANCE} ] || return $OCF_NOT_RUNNING
		[ $(cat /sys/kernel/scst_tgt/devices/${OCF_RESOURCE_INSTANCE}/active) -eq 1 ] || return $OCF_NOT_RUNNING
		[ $(head -n1 /sys/kernel/scst_tgt/devices/${OCF_RESOURCE_INSTANCE}/filename) = "${OCF_RESKEY_path}" ] || return $OCF_NOT_RUNNING
		if [ -d "/sys/kernel/scst_tgt/targets/iscsi/${OCF_RESKEY_target_iqn}/luns/${OCF_RESKEY_lun}" ] || \
  		   [ -d "/sys/kernel/scst_tgt/targets/iscsi/${OCF_RESKEY_target_iqn}/ini_groups/allowed/luns/${OCF_RESKEY_lun}" ]; then
		    return $OCF_SUCCESS
		fi
		;;
	esac

	return $OCF_NOT_RUNNING
}

iSCSILogicalUnit_validate() {
	# Do we have all required variables?
	for var in target_iqn lun path; do
	param="OCF_RESKEY_${var}"
	if [ -z "${!param}" ]; then
		ocf_exit_reason "Missing resource parameter \"$var\"!"
		exit $OCF_ERR_CONFIGURED
	fi
	done

	# Is the configured implementation supported?
	case "$OCF_RESKEY_implementation" in
	"iet"|"tgt"|"lio"|"lio-t"|"scst")
		;;
	"")
		# The user didn't specify an implementation, and we were
		# unable to determine one from installed binaries (in
		# other words: no binaries for any supported
		# implementation could be found)
		ocf_exit_reason "Undefined iSCSI target implementation"
		exit $OCF_ERR_INSTALLED
		;;
	*)
		ocf_exit_reason "Unsupported iSCSI target implementation \"$OCF_RESKEY_implementation\"!"
		exit $OCF_ERR_CONFIGURED
		;;
	esac

	# Do we have a valid LUN?
	case $OCF_RESKEY_implementation in
	iet)
		# IET allows LUN 0 and up
		[ $OCF_RESKEY_lun -ge 0 ]
		case $? in
		0)
			# OK
			;;
		1)
			ocf_log err "Invalid LUN $OCF_RESKEY_lun (must be a non-negative integer)."
			exit $OCF_ERR_CONFIGURED
			;;
		*)
			ocf_log err "Invalid LUN $OCF_RESKEY_lun (must be an integer)."
			exit $OCF_ERR_CONFIGURED
			;;
		esac
		;;
	tgt)
		# tgt reserves LUN 0 for its own purposes
		[ $OCF_RESKEY_lun -ge 1 ]
		case $? in
		0)
				# OK
			;;
		1)
			ocf_log err "Invalid LUN $OCF_RESKEY_lun (must be greater than 0)."
			exit $OCF_ERR_CONFIGURED
			;;
		*)
			ocf_log err "Invalid LUN $OCF_RESKEY_lun (must be an integer)."
			exit $OCF_ERR_CONFIGURED
			;;
		esac
		;;
	esac

	# Do we have any configuration parameters that the current
	# implementation does not support?
	local unsupported_params
	local var
	local envar
	case $OCF_RESKEY_implementation in
	iet)
		# IET does not support setting the vendor and product ID
		# (it always uses "IET" and "VIRTUAL-DISK")
		unsupported_params="vendor_id product_id allowed_initiators lio_iblock tgt_bstype tgt_bsoflags tgt_bsopts tgt_device_type emulate_tpu emulate_3pc emulate_caw liot_bstype"
		;;
	tgt)
		unsupported_params="allowed_initiators lio_iblock emulate_tpu emulate_3pc emulate_caw liot_bstype"
		;;
	lio)
		unsupported_params="scsi_id vendor_id product_id tgt_bstype tgt_bsoflags tgt_bsopts tgt_device_type emulate_tpu emulate_3pc emulate_caw liot_bstype"
		;;
	lio-t)
		unsupported_params="scsi_id vendor_id tgt_bstype tgt_bsoflags tgt_bsopts tgt_device_type lio_iblock"
		;;
	scst)
		unsupported_params="scsi_id emulate_tpu emulate_3pc emulate_caw"
		;;
	esac

	for var in ${unsupported_params}; do
		envar=OCF_RESKEY_${var}
		defvar=OCF_RESKEY_${var}_default
		if [ -n "${!envar}" ]; then
			if [[ "${!envar}" != "${!defvar}" ]]; then
				case "$__OCF_ACTION" in
				start|validate-all)
					ocf_log warn "Configuration parameter \"${var}\"" \
						"is not supported by the iSCSI implementation" \
						"and will be ignored." ;;
				esac
			fi
		fi
	done

	if ! ocf_is_probe; then
	# Do we have all required binaries?
	case $OCF_RESKEY_implementation in
	iet)
		check_binary ietadm
		;;
	tgt)
		check_binary tgtadm
		;;
	lio)
		check_binary tcm_node
		check_binary lio_node
		;;
	lio-t)
		check_binary targetcli
		;;
	scst)
		check_binary scstadmin
		;;
	esac

	# Is the required kernel functionality available?
	case $OCF_RESKEY_implementation in
	iet)
		[ -d /proc/net/iet ]
		if [ $? -ne 0 ]; then
			ocf_log err "/proc/net/iet does not exist or is not a directory -- check if required modules are loaded."
			exit $OCF_ERR_INSTALLED
		fi
		;;
	tgt)
		# tgt is userland only
		;;
	scst)
		if [ ! -d /sys/kernel/scst_tgt ]; then
			ocf_log err "/sys/kernel/scst_tgt does not exist or is not a directory -- check if required modules are loaded."
			exit $OCF_ERR_INSTALLED
		fi
		;;
	esac
	fi

	return $OCF_SUCCESS
}

case $1 in
meta-data)
	meta_data
	exit $OCF_SUCCESS
	;;
usage|help)
	iSCSILogicalUnit_usage
	exit $OCF_SUCCESS
	;;
esac

# Everything except usage and meta-data must pass the validate test
iSCSILogicalUnit_validate

case $__OCF_ACTION in
start)		iSCSILogicalUnit_start;;
stop)		iSCSILogicalUnit_stop;;
monitor|status)	iSCSILogicalUnit_monitor;;
reload)		ocf_log err "Reloading..."
			iSCSILogicalUnit_start
		;;
validate-all)	;;
*)		iSCSILogicalUnit_usage
		exit $OCF_ERR_UNIMPLEMENTED
		;;
esac

rc=$?
ocf_log debug "${OCF_RESOURCE_INSTANCE} $__OCF_ACTION : $rc"
exit $rc

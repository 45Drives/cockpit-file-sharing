## Cockpit File Sharing 4.6.0-0rc1

* Ensure NFS service continues running after removing Ceph remount
* Add systemd service monitoring and management for NFS and Samba
* Samba: Fix net command option injection from advanced options
* Improve Ceph option handling
* NFS: Ensure exports files are in sync across PCS cluster nodes with option to merge when out-of-sync